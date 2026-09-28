// services/marketing/openaiCreativeProvider.js
//
// Draws one planned ad image with OpenAI GPT Image (gpt-image-2.5-*).
//
// With input images (property photo, designer references) it calls
// POST /images/edits (multipart, image[] files). With no input images it
// calls POST /images/generations. OpenAI returns the image as base64, which
// is handed back as a data URI; creativeImageService uploads it to Cloudinary
// and places the real logo on it.
//
// Follows the provider contract in bflCreativeProvider.js:
//   name, model(), isConfigured(), generate(spec) -> { source }

const axios = require("axios");
const { CREATIVE_CONFIG, IMAGE_PROVIDERS } = require("../../config/marketing/creativeConfig");
const { buildCreativePrompt, collectInputImages } = require("./creativePrompts");

const settings = CREATIVE_CONFIG.providers[IMAGE_PROVIDERS.OPENAI];

// Input image types OpenAI accepts, with the file extension to send.
const SUPPORTED_INPUT_TYPES = Object.freeze({
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/webp": "webp",
});

const OUTPUT_MIME = Object.freeze({
    png: "image/png",
    jpeg: "image/jpeg",
    webp: "image/webp",
});

// ---------------------------------------------------------------------------
// HTTP client (created on first use so the server starts without the key)
// ---------------------------------------------------------------------------
let client = null;
function getClient() {
    if (client) return client;

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY environment variable is not set");

    client = axios.create({
        baseURL: settings.baseUrl,
        timeout: settings.requestTimeoutMs,
        headers: { Authorization: `Bearer ${apiKey}` },
    });
    return client;
}

/** OpenAI puts the reason in error.response.data.error.message. */
function toReadableError(error) {
    const message = error?.response?.data?.error?.message || error?.message || "Image generation failed";
    return new Error(`OpenAI: ${message}`);
}

// ---------------------------------------------------------------------------
// Input images
// ---------------------------------------------------------------------------
/**
 * Download one input image as a file for the multipart request.
 * Uses the bare axios export so the OpenAI key is never sent to Cloudinary
 * or Zillow.
 */
async function downloadInputImage(url, index) {
    let response;
    try {
        response = await axios.get(url, { responseType: "arraybuffer", timeout: settings.downloadTimeoutMs });
    } catch (error) {
        throw new Error(`Could not download input image ${index + 1}: ${error?.message || "download failed"}`);
    }

    const type = String(response.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
    const ext = SUPPORTED_INPUT_TYPES[type];
    if (!ext) {
        throw new Error(`Input image ${index + 1} has an unsupported type (${type || "unknown"}). Use PNG, JPEG or WebP.`);
    }

    return {
        blob: new Blob([response.data], { type: type === "image/jpg" ? "image/jpeg" : type }),
        filename: `input-${index + 1}.${ext}`,
    };
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------
const sizeOf = (spec) => `${spec.size.generate.width}x${spec.size.generate.height}`;

async function requestEdit(spec, prompt, inputs) {
    const files = await Promise.all(inputs.map((img, i) => downloadInputImage(img.url, i)));

    const form = new FormData();
    form.append("model", settings.model);
    form.append("prompt", prompt);
    form.append("size", sizeOf(spec));
    form.append("quality", settings.quality);
    form.append("output_format", settings.outputFormat);
    form.append("n", "1");
    // Same order as the prompt's "Image 1, Image 2 ..." descriptions.
    files.forEach((file) => form.append("image[]", file.blob, file.filename));

    try {
        const { data } = await getClient().post("/images/edits", form);
        return data;
    } catch (error) {
        throw toReadableError(error);
    }
}

async function requestGeneration(spec, prompt) {
    try {
        const { data } = await getClient().post("/images/generations", {
            model: settings.model,
            prompt,
            size: sizeOf(spec),
            quality: settings.quality,
            output_format: settings.outputFormat,
            n: 1,
        });
        return data;
    } catch (error) {
        throw toReadableError(error);
    }
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------
module.exports = {
    name: IMAGE_PROVIDERS.OPENAI,

    model: () => settings.model,

    isConfigured: () => Boolean(process.env.OPENAI_API_KEY),

    /**
     * @param {object} spec  creativePlanner spec
     * @returns {Promise<{ source: string }>} base64 data URI of the image
     */
    async generate(spec) {
        const inputs = collectInputImages(spec, settings.maxInputImages);
        const prompt = buildCreativePrompt(spec, inputs, settings.promptStyle);

        const data = inputs.length
            ? await requestEdit(spec, prompt, inputs)
            : await requestGeneration(spec, prompt);

        const b64 = data?.data?.[0]?.b64_json;
        if (!b64) throw new Error("OpenAI: no image was returned");

        const mime = OUTPUT_MIME[settings.outputFormat] || "image/png";
        return { source: `data:${mime};base64,${b64}` };
    },
};
