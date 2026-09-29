// services/marketing/hybridCreativeProvider.js
//
// Hybrid ad images:
//   1. Pick the template: the one the admin chose, else the slot's default
//      template, else the built-in design (templateService.resolveTemplate).
//   2. When the template shows an AI background and the property has a photo,
//      the AI (OpenAI or BFL, see creativeConfig) draws a text-free hero
//      background from the real photo (prompt style "background").
//   3. The template is filled with the exact text and images, and Puppeteer
//      screenshots it at the final Meta size.
// Cloudinary then adds the real logo, as for every provider.
//
// No property photo = no AI call, so no house is ever invented.
//
// Follows the provider contract in bflCreativeProvider.js, and also returns
// which template (and version) made the image.

const {
    CREATIVE_CONFIG,
    IMAGE_PROVIDERS,
    PROMPT_STYLES,
} = require("../../config/marketing/creativeConfig");
const { BUILTIN_TEMPLATE } = require("../../config/marketing/templateConfig");
const bflCreativeProvider = require("./bflCreativeProvider");
const openaiCreativeProvider = require("./openaiCreativeProvider");
const { buildAdHtml } = require("./creativeTemplates");
const { buildTemplateDocument, imageUrlsOf } = require("./templateRenderer");
const { resolveTemplate } = require("./templateService");
const { renderHtmlToPng } = require("./htmlRenderer");

const settings = CREATIVE_CONFIG.providers[IMAGE_PROVIDERS.HYBRID];

const BACKGROUND_PROVIDERS = Object.freeze({
    [IMAGE_PROVIDERS.OPENAI]: openaiCreativeProvider,
    [IMAGE_PROVIDERS.BFL]: bflCreativeProvider,
});

const BUILTIN_REF = Object.freeze({
    id: BUILTIN_TEMPLATE.id,
    familyId: BUILTIN_TEMPLATE.id,
    version: 1,
    name: BUILTIN_TEMPLATE.name,
});

function backgroundProvider() {
    const provider = BACKGROUND_PROVIDERS[settings.backgroundProvider];
    if (!provider) throw new Error(`Unknown background provider "${settings.backgroundProvider}"`);
    return provider;
}

/** AI hero background from the real photo; null when the property has no photo. */
async function aiBackground(spec) {
    if (!spec.photoUrl) return null;
    // Background only: the real photo, no designer references (they contain
    // text the AI could copy).
    const { source } = await backgroundProvider().generate(
        { ...spec, referenceUrls: [] },
        { promptStyle: PROMPT_STYLES.BACKGROUND }
    );
    return source;
}

const toDataUri = (png) => `data:image/png;base64,${png.toString("base64")}`;

async function renderBuiltIn(spec) {
    const background = await aiBackground(spec);
    const png = await renderHtmlToPng(buildAdHtml(spec, background), spec.size.final, {
        allowedUrls: imageUrlsOf({ background }),
    });
    return { source: toDataUri(png), template: BUILTIN_REF };
}

async function renderUploaded(spec, template, html) {
    const images = {
        background: template.usesBackground ? await aiBackground(spec) : null,
        photo: spec.photoUrl || null,
        assets: Object.fromEntries((template.assets || []).map((a) => [a.name, a.url])),
    };

    const doc = buildTemplateDocument(html, { texts: spec.texts, images, size: spec.size.final });
    const png = await renderHtmlToPng(doc, spec.size.final, { allowedUrls: imageUrlsOf(images) });

    return {
        source: toDataUri(png),
        template: {
            id: String(template._id),
            familyId: String(template.familyId),
            version: template.version,
            name: template.name,
        },
    };
}

module.exports = {
    name: IMAGE_PROVIDERS.HYBRID,

    model: () => `html+${backgroundProvider().model()}`,

    isConfigured: () => Boolean(BACKGROUND_PROVIDERS[settings.backgroundProvider]?.isConfigured()),

    /**
     * @param {object} spec  creativePlanner spec (+ templateId chosen by the admin, if any)
     * @returns {Promise<{ source: string, template: object }>} PNG data URI + template used
     */
    async generate(spec) {
        const resolved = await resolveTemplate({
            templateId: spec.templateId || null,
            slotKind: spec.kind,
            format: spec.format,
        });
        return resolved.builtIn ? renderBuiltIn(spec) : renderUploaded(spec, resolved.template, resolved.html);
    },
};
