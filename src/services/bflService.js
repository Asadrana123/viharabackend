const axios = require("axios");
const cloudinary = require("cloudinary").v2;
const { BFL_CONFIG } = require("../config/renovationConstants");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

/**
 * Terminal, non-retryable statuses returned by the BFL polling endpoint.
 */
const TERMINAL_FAILURE_STATUSES = {
  "Error":              "Image generation failed",
  "Request Moderated":  "The renovation prompt was rejected by the content filter",
  "Content Moderated":  "The generated image was rejected by the content filter",
  "Task not found":     "Generation task expired or was not found"
};

/**
 * BflService
 *
 * Wraps the Black Forest Labs FLUX.1 Kontext image-editing API.
 *
 * Kontext is an instruction-based *edit* model. Unlike the Replicate SD 1.5
 * pipeline it has no `negative_prompt` and no `prompt_strength` — structure is
 * preserved by the model itself, guided by the preservation clause that
 * BflPromptBuilder embeds in the prompt.
 *
 * The API is asynchronous:
 *   POST /v1/{model}   -> { id, polling_url }
 *   GET  {polling_url} -> { status, result: { sample } }
 *
 * `result.sample` is a short-lived signed URL, so it is copied straight into
 * Cloudinary for permanent storage before being returned.
 *
 * Public surface is intentionally identical to ReplicateService so the two are
 * interchangeable from renovationController.
 */
class BflService {
  constructor() {
    this.client = null;
  }

  /**
   * Lazily build the HTTP client on first use.
   * Deferred so requiring this module does not throw when BFL is not the active
   * provider and BFL_API_KEY is absent.
   */
  getClient() {
    if (this.client) return this.client;

    const apiKey = process.env.BFL_API_KEY;
    if (!apiKey) {
      throw new Error("BFL_API_KEY environment variable is not set");
    }

    this.client = axios.create({
      timeout: BFL_CONFIG.requestTimeoutMs,
      headers: {
        "x-key": apiKey,
        "accept": "application/json",
        "Content-Type": "application/json"
      }
    });

    return this.client;
  }

  /**
   * Generate a renovation visualization from an existing property photo.
   *
   * @param {String} imageUrl - Cloudinary URL of the original property photo
   * @param {String} prompt   - Instruction prompt from BflPromptBuilder
   * @returns {Promise<Object>} { success, imageUrl, description, model }
   */
  async generateRenovationImage(imageUrl, prompt) {
    try {
      const inputImage = await this.fetchImageAsBase64(imageUrl);
      const pollingUrl = await this.submitEditRequest(prompt, inputImage);
      const generatedImageUrl = await this.pollUntilReady(pollingUrl);

      const uploadResponse = await cloudinary.uploader.upload(generatedImageUrl, {
        folder: "renovations",
        resource_type: "image"
      });

      return {
        success: true,
        imageUrl: uploadResponse.secure_url,
        description: this.buildDescription(prompt),
        model: BFL_CONFIG.model
      };
    } catch (error) {
      console.error("BFL/Cloudinary Error:", error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * BFL requires the source image as a raw base64 string (no data URI prefix).
   *
   * Uses the bare axios export rather than the configured client — the source
   * photo lives on Cloudinary and must not receive the BFL `x-key` header.
   */
  async fetchImageAsBase64(imageUrl) {
    const response = await axios.get(imageUrl, {
      responseType: "arraybuffer",
      timeout: BFL_CONFIG.requestTimeoutMs
    });

    return Buffer.from(response.data).toString("base64");
  }

  /**
   * Submit the edit job. Returns the polling URL for this specific task.
   *
   * The polling URL returned in the response body must be used verbatim — it is
   * region-pinned, and reconstructing it from the task id will 404.
   */
  async submitEditRequest(prompt, inputImage) {
    const endpoint = `${BFL_CONFIG.baseUrl}/${BFL_CONFIG.model}`;

    const { data } = await this.getClient().post(endpoint, {
      prompt,
      input_image: inputImage,
      output_format: BFL_CONFIG.outputFormat,
      safety_tolerance: BFL_CONFIG.safetyTolerance,
      prompt_upsampling: BFL_CONFIG.promptUpsampling
    });

    if (!data?.polling_url) {
      throw new Error("BFL did not return a polling URL");
    }

    return data.polling_url;
  }

  /**
   * Poll until the task reaches a terminal state.
   * Resolves with the signed image URL, or throws on failure/timeout.
   */
  async pollUntilReady(pollingUrl) {
    const deadline = Date.now() + BFL_CONFIG.pollTimeoutMs;

    while (Date.now() < deadline) {
      const { data } = await this.getClient().get(pollingUrl);
      const status = data?.status;

      if (status === "Ready") {
        const sampleUrl = data?.result?.sample;
        if (!sampleUrl) {
          throw new Error("BFL returned Ready without an image URL");
        }
        return sampleUrl;
      }

      if (TERMINAL_FAILURE_STATUSES[status]) {
        throw new Error(`BFL: ${TERMINAL_FAILURE_STATUSES[status]}`);
      }

      await this.sleep(BFL_CONFIG.pollIntervalMs);
    }

    throw new Error(`BFL generation timed out after ${BFL_CONFIG.pollTimeoutMs}ms`);
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Build a clean description from the prompt.
   * Used in RenovationResults to show visualization details.
   */
  buildDescription(prompt) {
    return `AI-generated renovation visualization. ${prompt
      .replace(/photorealistic|professional real estate photography|render as/gi, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 200)}`;
  }
}

module.exports = new BflService();