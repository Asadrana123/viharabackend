// services/marketing/marketingEngineService.js
//
// Run lifecycle for the Property Marketing Engine: suggest buyer type, start a
// run, list/get runs, edit a line, approve a run. The heavy work happens in
// runProcessor.js, started in the background so the HTTP request returns fast
// and the admin tab polls for progress.

const mongoose = require("mongoose");
const Errorhandler = require("../../utils/errorhandler");
const productModel = require("../../model/property/productModel");
const MarketingRun = require("../../model/marketing/marketingRunModel");
const { suggestBuyerType } = require("./buyerTypeService");
const { getPersonasForBuyerType } = require("./matrixService");
const { checkLine, contextFromBrief, toStoredFlags } = require("./complianceChecker");
const { processRun } = require("./runProcessor");
const {
    BUYER_TYPE_VALUES,
    RUN_STATUS,
    RUN_STALE_AFTER_MS,
    LINE_SOURCES,
} = require("../../config/marketing/marketingConstants");

const MAX_LINE_CHARS = 5000;
const VERSION_CREATE_RETRIES = 3;

const RUN_SUMMARY_FIELDS = "version status buyerType progress error createdBy approvedBy approvedAt createdAt updatedAt";

function assertObjectId(id, label) {
    if (!mongoose.isValidObjectId(id)) throw new Errorhandler(`Invalid ${label}`, 400);
}

async function findRunOrThrow(runId) {
    assertObjectId(runId, "run id");
    const run = await MarketingRun.findById(runId);
    if (!run) throw new Errorhandler("Marketing run not found", 404);
    return run;
}

// Only a finished, unapproved run can be edited or approved.
function assertRunIsReady(run, action) {
    if (run.status === RUN_STATUS.READY) return;
    if (run.status === RUN_STATUS.APPROVED) {
        throw new Errorhandler(`This run is approved and can't be ${action}. Start a new run to make changes.`, 400);
    }
    if (run.status === RUN_STATUS.RUNNING) {
        throw new Errorhandler("This run is still in progress", 409);
    }
    throw new Errorhandler(`A failed run can't be ${action}. Start a new run.`, 400);
}

// ---------------------------------------------------------------------------
// Buyer type suggestion
// ---------------------------------------------------------------------------
async function getBuyerTypeSuggestion(propertyId) {
    assertObjectId(propertyId, "property id");
    const property = await productModel
        .findById(propertyId)
        .select("productName assetType occupancyStatus propertyType rehabEstimate rentEstimate startBid investmentData.valuation.ViharaValue buyerType financingTermsConfirmed")
        .lean();
    if (!property) throw new Errorhandler("Property not found", 404);

    return {
        property: {
            _id: property._id,
            productName: property.productName,
            buyerType: property.buyerType || null,
            financingTermsConfirmed: property.financingTermsConfirmed === true,
        },
        ...suggestBuyerType(property),
    };
}

// ---------------------------------------------------------------------------
// Start a run
// ---------------------------------------------------------------------------
async function failStaleRuns(propertyId) {
    await MarketingRun.updateMany(
        {
            property: propertyId,
            status: RUN_STATUS.RUNNING,
            updatedAt: { $lt: new Date(Date.now() - RUN_STALE_AFTER_MS) },
        },
        { $set: { status: RUN_STATUS.FAILED, error: "The run was interrupted. Start a new run.", "progress.stage": "failed" } }
    );
}

// Next version number; retries if two runs race for the same number.
async function createRunDocument({ propertyId, buyerType, userId }) {
    for (let attempt = 1; attempt <= VERSION_CREATE_RETRIES; attempt++) {
        const last = await MarketingRun.findOne({ property: propertyId }).sort({ version: -1 }).select("version").lean();
        try {
            return await MarketingRun.create({
                property: propertyId,
                version: (last?.version || 0) + 1,
                buyerType,
                createdBy: userId,
            });
        } catch (error) {
            if (error?.code !== 11000 || attempt === VERSION_CREATE_RETRIES) throw error;
        }
    }
    return null;
}

async function startRun({ propertyId, buyerType, userId }) {
    assertObjectId(propertyId, "property id");

    if (!BUYER_TYPE_VALUES.includes(buyerType)) {
        throw new Errorhandler(`buyerType must be one of: ${BUYER_TYPE_VALUES.join(", ")}`, 400);
    }
    if (!getPersonasForBuyerType(buyerType).length) {
        throw new Errorhandler(`Buyer groups for "${buyerType}" are not defined yet, so this property can't be run.`, 400);
    }

    const exists = await productModel.exists({ _id: propertyId });
    if (!exists) throw new Errorhandler("Property not found", 404);

    // The admin's confirmed buyer type is saved on the property.
    await productModel.updateOne(
        { _id: propertyId },
        { $set: { buyerType, updatedAt: new Date() } },
        { runValidators: true }
    );

    await failStaleRuns(propertyId);
    const inProgress = await MarketingRun.exists({ property: propertyId, status: RUN_STATUS.RUNNING });
    if (inProgress) throw new Errorhandler("A run is already in progress for this property", 409);

    const run = await createRunDocument({ propertyId, buyerType, userId });

    // Background processing; processRun never throws.
    setImmediate(() => processRun(run._id));

    return run.toObject();
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------
async function listRuns(propertyId) {
    assertObjectId(propertyId, "property id");
    return MarketingRun.find({ property: propertyId })
        .sort({ version: -1 })
        .select(RUN_SUMMARY_FIELDS)
        .populate("createdBy", "name email")
        .populate("approvedBy", "name email")
        .lean();
}

async function getRun(runId) {
    assertObjectId(runId, "run id");
    const run = await MarketingRun.findById(runId)
        .populate("property", "productName street city state slug")
        .populate("createdBy", "name email")
        .populate("approvedBy", "name email")
        .lean();
    if (!run) throw new Errorhandler("Marketing run not found", 404);
    return run;
}

// ---------------------------------------------------------------------------
// Edit a line (always saves; compliance problems become visible warnings)
// ---------------------------------------------------------------------------
async function editLine({ runId, lineId, text, userId }) {
    const run = await findRunOrThrow(runId);
    assertRunIsReady(run, "edited");

    assertObjectId(lineId, "line id");
    const line = run.lines.id(lineId);
    if (!line) throw new Errorhandler("Line not found", 404);

    const value = typeof text === "string" ? text.trim() : "";
    if (!value) throw new Errorhandler("Text is required", 400);
    if (value.length > MAX_LINE_CHARS) throw new Errorhandler(`Text must be ${MAX_LINE_CHARS} characters or fewer`, 400);

    line.text = value;
    line.source = LINE_SOURCES.MANUAL;
    line.placeholderReason = "";
    line.flags = toStoredFlags(checkLine(value, contextFromBrief(run.brief)));
    line.editedBy = userId;
    line.editedAt = new Date();

    await run.save();
    return line.toObject();
}

// ---------------------------------------------------------------------------
// Approve
// ---------------------------------------------------------------------------
async function approveRun({ runId, userId }) {
    const run = await findRunOrThrow(runId);
    assertRunIsReady(run, "approved");

    run.status = RUN_STATUS.APPROVED;
    run.approvedBy = userId;
    run.approvedAt = new Date();
    await run.save();

    return getRun(run._id);
}

module.exports = {
    getBuyerTypeSuggestion,
    startRun,
    listRuns,
    getRun,
    editLine,
    approveRun,
};
