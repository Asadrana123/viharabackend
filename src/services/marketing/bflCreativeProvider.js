// services/marketing/bflCreativeProvider.js
//
// Draws one planned ad image with BFL FLUX.2 (multi-reference edit).
// Reuses services/shared/bflService.js for the HTTP client and polling.
//
// Provider contract (every provider in creativeProviders.js follows it):
//   name            - provider id, stored on each image
//   model()         - model id, stored on each image
//   isConfigured()  - true when its API key is set
//   generate(spec, { promptStyle }?)
//                   - resolves { source } where source is an image URL or a
//                     data URI; the caller uploads it to Cloudinary.

const bflService = require("../shared/bflService");
const { CREATIVE_CONFIG, IMAGE_PROVIDERS } = require("../../config/marketing/creativeConfig");
const { buildCreativePrompt, collectInputImages } = require("./creativePrompts");

const settings = CREATIVE_CONFIG.providers[IMAGE_PROVIDERS.BFL];

// BFL names input images input_image, input_image_2 ... input_image_8.
const inputFieldName = (index) => (index === 0 ? "input_image" : `input_image_${index + 1}`);

function buildRequestBody(spec, promptStyle) {
    const inputs = collectInputImages(spec, settings.maxInputImages);

    const body = {
        prompt: buildCreativePrompt(spec, inputs, promptStyle),
        width: spec.size.generate.width,
        height: spec.size.generate.height,
        output_format: settings.outputFormat,
        safety_tolerance: settings.safetyTolerance,
    };
    inputs.forEach((img, i) => {
        body[inputFieldName(i)] = img.url;
    });

    return body;
}

module.exports = {
    name: IMAGE_PROVIDERS.BFL,

    model: () => settings.model,

    isConfigured: () => Boolean(process.env.BFL_API_KEY),

    /**
     * @param {object} spec  creativePlanner spec
     * @param {object} [options]
     * @param {string} [options.promptStyle]  override (the hybrid provider asks for "background")
     * @returns {Promise<{ source: string }>} short-lived signed URL (~10 minutes)
     */
    async generate(spec, { promptStyle = settings.promptStyle } = {}) {
        const source = await bflService.generateImage(settings.model, buildRequestBody(spec, promptStyle));
        return { source };
    },
};
