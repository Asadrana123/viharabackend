const Replicate = require("replicate");
const cloudinary = require("cloudinary").v2;
const { REPLICATE_CONFIG } = require("../config/renovationConstants");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

class ReplicateService {
  constructor() {
    const apiToken = process.env.REPLICATE_API_TOKEN;
    if (!apiToken) {
      throw new Error("REPLICATE_API_TOKEN environment variable is not set");
    }
    this.client = new Replicate({ auth: apiToken });
  }

  /**
   * Generate exterior renovation image
   * Takes real property photo and transforms it realistically
   * @param {String} imageUrl - Cloudinary URL of original property exterior photo
   * @param {String} prompt - Detailed renovation prompt
   * @param {String} negativePrompt - What to avoid in the output
   * @returns {Object} { imageUrl, description }
   */
  async generateRenovationImage(imageUrl, prompt, negativePrompt) {
    try {
      const output = await this.client.run(
        REPLICATE_CONFIG.model,
        {
          input: {
            image: imageUrl,
            prompt: prompt,
            negative_prompt: negativePrompt,
            prompt_strength: REPLICATE_CONFIG.promptStrength,
            num_inference_steps: REPLICATE_CONFIG.numInferenceSteps,
            guidance_scale: REPLICATE_CONFIG.guidanceScale
          }
        }
      );

      // output is an array of image URLs from Replicate
      if (!output || output.length === 0) {
        throw new Error("No image generated from Replicate");
      }
      const generatedImageUrl = output.url().toString();

      // Upload generated image to Cloudinary for permanent storage
      const uploadResponse = await cloudinary.uploader.upload(generatedImageUrl, {
        folder: "renovations",
        resource_type: "image"
      });

      return {
        success: true,
        imageUrl: uploadResponse.secure_url,
        description: this.buildDescription(prompt),
        model: REPLICATE_CONFIG.model
      };
    } catch (error) {
      console.error("Replicate/Cloudinary Error:", error);
      throw error;
    }
  }

  /**
   * Build a clean description from the prompt
   * Used in RenovationResults to show visualization details
   */
  buildDescription(prompt) {
    return `AI-generated exterior renovation visualization. ${prompt
      .replace(/photorealistic|high quality|8k|realistic/gi, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 200)}`;
  }

  /**
   * Validate Replicate API connectivity
   */
  async validateConnection() {
    try {
      const models = await this.client.models.list();
      return !!models;
    } catch (error) {
      console.error("Error validating Replicate connection:", error);
      return false;
    }
  }
}

module.exports = new ReplicateService();
