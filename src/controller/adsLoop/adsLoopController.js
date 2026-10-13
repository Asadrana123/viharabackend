// controller/adsLoop/adsLoopController.js
//
// HTTP side of the Meta Ads Loop:
//   - Slack endpoints (events, button clicks, /adsloop). Each request's
//     signature is checked; Slack gets its 200 at once and the work runs after,
//     because Slack retries anything slower than 3 seconds.
//   - /health for an uptime monitor (503 when the heartbeat is stale)
//   - admin endpoints (creatives, results, design rules, library, manual runs)

const catchAsyncError = require("../../middleware/catchAsyncError");
const ErrorHandler = require("../../utils/errorhandler");
const AdCreative = require("../../model/adsLoop/adCreativeModel");
const AdResult = require("../../model/adsLoop/adResultModel");
const { getAdsLoopConfig, missingSettings } = require("../../config/adsLoop/adsLoopConfig");
const { validateAttributes } = require("../../config/adsLoop/attributeTags");
const slack = require("../../services/adsLoop/slackBot");
const handlers = require("../../services/adsLoop/slackHandlers");
const learning = require("../../services/adsLoop/learningStore");
const { startCreative } = require("../../services/adsLoop/creativePipeline");
const { runDailyPull } = require("../../services/adsLoop/dailyPull");
const { runWeeklyAnalysis } = require("../../services/adsLoop/weeklyAnalysis");
const { listAccounts } = require("../../services/adsLoop/zernioClient");
const { getState } = require("../../services/adsLoop/loopState");

const background = (name, fn) =>
    setImmediate(() =>
        Promise.resolve()
            .then(fn)
            .catch((e) => console.error(`[adsLoop] ${name} failed:`, e.message))
    );

function isSignedBySlack(req) {
    return slack.verifySlackSignature({
        rawBody: req.rawBody,
        timestamp: req.get("X-Slack-Request-Timestamp"),
        signature: req.get("X-Slack-Signature"),
    });
}

// ---------------------------------------------------------------------------
// Slack
// ---------------------------------------------------------------------------
const slackEvents = (req, res) => {
    if (!isSignedBySlack(req)) return res.status(401).send("bad signature");
    const body = req.body || {};
    if (body.type === "url_verification") return res.json({ challenge: body.challenge });
    res.status(200).send();
    if (body.type === "event_callback") background("Slack event", () => handlers.handleEvent(body.event));
};

const slackInteractions = (req, res) => {
    if (!isSignedBySlack(req)) return res.status(401).send("bad signature");
    let payload;
    try {
        payload = JSON.parse(req.body?.payload || "{}");
    } catch {
        return res.status(400).send("bad payload");
    }
    res.status(200).send();
    background("Slack click", () => handlers.handleInteraction(payload));
};

const slackCommand = async (req, res) => {
    if (!isSignedBySlack(req)) return res.status(401).send("bad signature");
    try {
        const text = await handlers.handleCommand({
            text: req.body?.text,
            userId: req.body?.user_id,
            runInBackground: (fn) => background("command", fn),
        });
        res.json({ response_type: "ephemeral", text });
    } catch (error) {
        res.json({ response_type: "ephemeral", text: `⚠️ ${error.message}` });
    }
};

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------
const health = catchAsyncError(async (req, res) => {
    const config = getAdsLoopConfig();
    const state = await getState();
    const heartbeatAgeH = state.lastHeartbeatAt ? (Date.now() - new Date(state.lastHeartbeatAt)) / 3600000 : null;
    const stale = config.enabled && heartbeatAgeH !== null && heartbeatAgeH > config.heartbeatMaxAgeHours;
    res.status(stale ? 503 : 200).json({
        ok: !stale,
        enabled: config.enabled,
        killSwitch: state.killSwitch?.on === true,
        lastHeartbeatAt: state.lastHeartbeatAt,
        lastPullAt: state.lastPullAt,
        missingSettings: missingSettings(config).length,
    });
});

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------
const listCreatives = catchAsyncError(async (req, res) => {
    const filter = req.query.status ? { status: req.query.status } : {};
    const creatives = await AdCreative.find(filter)
        .select("-cards.html -css -plan")
        .sort({ createdAt: -1 })
        .limit(Math.min(Number(req.query.limit) || 100, 500))
        .lean();
    res.json({ success: true, creatives });
});

const getCreative = catchAsyncError(async (req, res, next) => {
    const creative = await AdCreative.findOne({ ltId: String(req.params.ltId).toUpperCase() }).lean();
    if (!creative) return next(new ErrorHandler("Creative not found", 404));
    const results = await AdResult.find({ ltId: creative.ltId }).select("-raw").sort({ date: -1 }).limit(120).lean();
    res.json({ success: true, creative, results });
});

const createCreative = catchAsyncError(async (req, res, next) => {
    const { propertyId, parentLtId } = req.body || {};
    if (!propertyId) return next(new ErrorHandler("propertyId is required", 400));
    try {
        const creative = await startCreative({ propertyId, parentLtId: parentLtId || null });
        res.status(201).json({ success: true, creative });
    } catch (error) {
        next(new ErrorHandler(error.message, 400));
    }
});

const designRulesMarkdown = catchAsyncError(async (req, res) => {
    res.type("text/markdown").send(await learning.designRulesMarkdown());
});

const removeDesignRule = catchAsyncError(async (req, res, next) => {
    const rule = await learning.removeRule(req.params.id, String(req.user?._id || ""));
    if (!rule) return next(new ErrorHandler("Rule not found", 404));
    res.json({ success: true, rule });
});

/** Add an outside ad you admire to the library ("reference"; never reused, only learned from). */
const addReferenceExample = catchAsyncError(async (req, res, next) => {
    const { imageUrl, why, attributes } = req.body || {};
    if (!/^https:\/\//.test(imageUrl || "")) return next(new ErrorHandler("imageUrl must be an https URL", 400));
    const { attributes: clean } = validateAttributes(attributes || {});
    const example = await learning.addExample({ label: "reference", imageUrl, why: why || "", attributes: clean, addedBy: String(req.user?._id || "") });
    res.status(201).json({ success: true, example });
});

const runPull = catchAsyncError(async (req, res) => {
    background("manual pull", runDailyPull);
    res.status(202).json({ success: true, message: "Daily pull started" });
});

const runWeekly = catchAsyncError(async (req, res) => {
    background("manual weekly", runWeeklyAnalysis);
    res.status(202).json({ success: true, message: "Weekly list started" });
});

/** Setup helper: shows the Zernio account ids to put in .env. */
const zernioAccounts = catchAsyncError(async (req, res, next) => {
    try {
        const data = await listAccounts();
        const accounts = (data.accounts || data || []).map((a) => ({
            _id: a._id,
            platform: a.platform,
            username: a.username,
            displayName: a.displayName,
            category: a.category,
            adAccounts: a.adAccounts || a.metadata?.adAccounts || undefined,
        }));
        res.json({ success: true, accounts });
    } catch (error) {
        next(new ErrorHandler(error.message, 502));
    }
});

module.exports = {
    slackEvents,
    slackInteractions,
    slackCommand,
    health,
    listCreatives,
    getCreative,
    createCreative,
    designRulesMarkdown,
    removeDesignRule,
    addReferenceExample,
    runPull,
    runWeekly,
    zernioAccounts,
};
