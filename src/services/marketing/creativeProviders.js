// services/marketing/creativeProviders.js
//
// The one place that decides which image provider draws the ads.
// The active provider is CREATIVE_CONFIG.provider (env MARKETING_IMAGE_PROVIDER).
//
// Switch providers by setting MARKETING_IMAGE_PROVIDER to "bfl" or "openai".
// To add another provider: create a file following the contract in
// bflCreativeProvider.js (name, model(), isConfigured(), generate(spec)) and
// register it below. Nothing else in the engine changes.

const Errorhandler = require("../../utils/errorhandler");
const { CREATIVE_CONFIG, IMAGE_PROVIDERS } = require("../../config/marketing/creativeConfig");
const bflCreativeProvider = require("./bflCreativeProvider");
const openaiCreativeProvider = require("./openaiCreativeProvider");

const PROVIDERS = Object.freeze({
    [IMAGE_PROVIDERS.BFL]: bflCreativeProvider,
    [IMAGE_PROVIDERS.OPENAI]: openaiCreativeProvider,
});

/** The active provider. Throws a readable 500 when it is unknown or has no API key. */
function getCreativeProvider() {
    const provider = PROVIDERS[CREATIVE_CONFIG.provider];
    if (!provider) {
        throw new Errorhandler(`Image provider "${CREATIVE_CONFIG.provider}" is not set up on the server`, 500);
    }
    if (!provider.isConfigured()) {
        throw new Errorhandler(`Image provider "${provider.name}" has no API key on the server`, 500);
    }
    return provider;
}

module.exports = { getCreativeProvider };
