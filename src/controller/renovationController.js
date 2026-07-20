const RenovationCostService = require("../services/renovationCostService");
const ReplicateService = require("../services/replicateService");
const ReplicatePromptBuilder = require("../services/replicatePromptBuilder");
const RenovationRequest = require("../model/renovationRequestModel");
const RenovationContractorService = require("../services/renovationContractorService");
const Product = require("../model/productModel");
const BflService = require("../services/bflService");
const BflPromptBuilder = require("../services/bflPromptBuilder");

const USE_BFL = process.env.RENOVATION_IMAGE_PROVIDER === "bfl";
const ImageService = USE_BFL ? BflService : ReplicateService;
const PromptBuilder = USE_BFL ? BflPromptBuilder : ReplicatePromptBuilder;
const {
  hasHardcodedCosts,
  buildHardcodedCostAnalysis
} = require("../config/renovationPropertyCosts");

/**
 * Ownership check that tolerates anonymous records.
 *   - record has no userId  -> transient/anonymous, accessible by requestId holder
 *   - record has a userId    -> must be the same logged-in user
 */
function canAccessRecord(record, req) {
  if (!record.userId) return true;
  return !!req.user && record.userId.toString() === req.user._id.toString();
}

exports.getContractors = async (req, res) => {
  try {
    const { propertyId } = req.params;
    const { area } = req.query;

    const property = await Product.findById(propertyId).select('city state');
    if (!property) {
      return res.status(404).json({ success: false, error: "Property not found" });
    }

    const result = await RenovationContractorService.findContractors(
      property.city,
      property.state,
      area || 'General renovation'
    );

    return res.status(200).json({
      success: true,
      contractors: result.contractors,
      isFallback: result.isFallback,
      fallbackNotice: result.fallbackNotice || null
    });
  } catch (error) {
    console.error("Error in getContractors:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

exports.generateRenovationImages = async (req, res) => {
  try {
    const { propertyId, selectedImage, renovationData } = req.body;
    const userId = req.user?._id || null; // anonymous requests allowed

    if (!propertyId || !selectedImage || !renovationData) {
      return res.status(400).json({
        success: false,
        error: "Property ID, selected image, and renovation data are required"
      });
    }

    const property = await Product.findById(propertyId);
    if (!property) {
      return res.status(404).json({ success: false, error: "Property not found" });
    }

    // ── Cost Analysis: hardcoded first, dynamic fallback ──────────────────
    let costAnalysis;

    if (hasHardcodedCosts(propertyId)) {
      costAnalysis = buildHardcodedCostAnalysis(propertyId, renovationData);
      if (!costAnalysis) {
        console.warn(`[Renovation] Hardcoded config missing area "${renovationData.primaryArea}" for property ${propertyId}. Falling back to dynamic.`);
      }
    }

    if (!costAnalysis) {
      const validation = RenovationCostService.validateInputs(
        { state: property.state, city: property.city, squareFootage: property.squareFootage },
        renovationData
      );

      if (!validation.isValid) {
        return res.status(400).json({ success: false, error: validation.error });
      }

      costAnalysis = await RenovationCostService.calculateRenovationCost(
        {
          state: property.state,
          city: property.city,
          squareFootage: property.squareFootage,
          lotSize: property.lotSize
        },
        renovationData
      );
    }
    // ─────────────────────────────────────────────────────────────────────

    const { prompt, negativePrompt } = PromptBuilder.buildPrompts(
      { city: property.city, state: property.state, propertyType: property.propertyType },
      renovationData
    );

    const renovationRequest = new RenovationRequest({
      userId,
      propertyId,
      selectedImage,
      renovationData,
      costAnalysis,
      status: "pending"
    });

    await renovationRequest.save();

    generateRenovationImagesAsync(renovationRequest._id, selectedImage, prompt, negativePrompt);

    return res.status(200).json({
      success: true,
      requestId: renovationRequest._id,
      status: "pending",
      message: "Renovation visualization is being generated. Please wait...",
      costAnalysis: {
        finalCost:     costAnalysis.finalCost,
        costRange:     costAnalysis.costRange,
        lineItems:     costAnalysis.lineItems,
        contingency:   costAnalysis.contingency,
        breakdown:     costAnalysis.breakdown,
        marketContext: costAnalysis.marketContext,
        roiEstimate:   costAnalysis.roiEstimate
      }
    });
  } catch (error) {
    console.error("Error in generateRenovationImages:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to generate renovation images"
    });
  }
};

exports.getRenovationRequest = async (req, res) => {
  try {
    const { requestId } = req.params;

    const renovationRequest = await RenovationRequest.findById(requestId);

    if (!renovationRequest) {
      return res.status(404).json({ success: false, error: "Renovation request not found" });
    }

    if (!canAccessRecord(renovationRequest, req)) {
      return res.status(403).json({ success: false, error: "Unauthorized access" });
    }

    const responseData = {
      success: true,
      requestId: renovationRequest._id,
      status: renovationRequest.status,
      costAnalysis: renovationRequest.costAnalysis,
      message: getStatusMessage(renovationRequest.status)
    };

    if (renovationRequest.status === "completed") {
      responseData.images = {
        before: renovationRequest.imageUrls.before,
        after: renovationRequest.imageUrls.after,
        description: renovationRequest.description
      };
    }

    return res.status(200).json(responseData);
  } catch (error) {
    console.error("Error in getRenovationRequest:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to fetch renovation request"
    });
  }
};

/**
 * POST /api/property-renovation/renovation-request/:requestId/save
 * Logged-in owner -> persist to dashboard.
 * Anonymous       -> no-op success; record stays transient (24h cleanup).
 */
exports.saveRenovation = async (req, res) => {
  try {
    const { requestId } = req.params;

    const renovationRequest = await RenovationRequest.findById(requestId);
    if (!renovationRequest) {
      return res.status(404).json({ success: false, error: "Renovation request not found" });
    }
    if (renovationRequest.status !== "completed") {
      return res.status(400).json({ success: false, error: "Only completed renovations can be saved" });
    }

    // Owned record: enforce ownership, then persist.
    if (renovationRequest.userId) {
      if (!req.user || renovationRequest.userId.toString() !== req.user._id.toString()) {
        return res.status(403).json({ success: false, error: "Unauthorized access" });
      }
      renovationRequest.savedAt = new Date();
      await renovationRequest.save();

      return res.status(200).json({
        success: true,
        requestId: renovationRequest._id,
        savedAt: renovationRequest.savedAt,
        message: "Renovation saved to your dashboard"
      });
    }

    // Anonymous record: nothing to save to. Report success but keep it transient.
    return res.status(200).json({
      success: true,
      requestId: renovationRequest._id,
      savedAt: null,
      message: "Saved for this session"
    });
  } catch (error) {
    console.error("Error in saveRenovation:", error);
    return res.status(500).json({ success: false, error: error.message || "Failed to save renovation" });
  }
};

/**
 * DELETE /api/property-renovation/renovation-request/:requestId
 */
exports.deleteRenovation = async (req, res) => {
  try {
    const { requestId } = req.params;

    const renovationRequest = await RenovationRequest.findById(requestId);
    if (!renovationRequest) {
      return res.status(200).json({ success: true, message: "Renovation already removed" });
    }
    if (!canAccessRecord(renovationRequest, req)) {
      return res.status(403).json({ success: false, error: "Unauthorized access" });
    }

    await RenovationRequest.findByIdAndDelete(requestId);

    return res.status(200).json({ success: true, message: "Renovation discarded" });
  } catch (error) {
    console.error("Error in deleteRenovation:", error);
    return res.status(500).json({ success: false, error: error.message || "Failed to discard renovation" });
  }
};

/**
 * GET /api/property-renovation/saved-renovations
 * Logged-in only (dashboard).
 */
exports.getSavedRenovations = async (req, res) => {
  try {
    const userId = req.user._id;

    const saved = await RenovationRequest.find({
      userId,
      savedAt: { $ne: null },
      status: "completed"
    })
      .sort({ savedAt: -1 })
      .populate("propertyId", "street city state images")
      .lean();

    const renovations = saved.map((r) => ({
      requestId: r._id,
      savedAt: r.savedAt,
      renovationData: r.renovationData,
      costAnalysis: r.costAnalysis,
      images: {
        before: r.imageUrls?.before || null,
        after: r.imageUrls?.after || null,
        description: r.description || ""
      },
      property: r.propertyId
        ? {
            id: r.propertyId._id,
            street: r.propertyId.street,
            city: r.propertyId.city,
            state: r.propertyId.state,
            image: r.propertyId.images?.[0] || null
          }
        : null
    }));

    return res.status(200).json({ success: true, count: renovations.length, renovations });
  } catch (error) {
    console.error("Error in getSavedRenovations:", error);
    return res.status(500).json({ success: false, error: error.message || "Failed to fetch saved renovations" });
  }
};

async function generateRenovationImagesAsync(requestId, propertyImage, prompt, negativePrompt) {
  try {
    await RenovationRequest.findByIdAndUpdate(requestId, { status: "processing" });

    const result = await ImageService.generateRenovationImage(propertyImage, prompt, negativePrompt);

    await RenovationRequest.findByIdAndUpdate(requestId, {
      status: "completed",
      imageUrls: { before: propertyImage, after: result.imageUrl },
      description: result.description
    });

   console.log(`✓ Renovation visualization generated for request: ${requestId} (model: ${result.model})`);
  } catch (error) {
    console.error(`✗ Error generating renovation images for request ${requestId}:`, error);
    await RenovationRequest.findByIdAndUpdate(requestId, { status: "failed" })
      .catch(err => console.error("Error updating failed status:", err));
  }
}

function getStatusMessage(status) {
  const messages = {
    pending:    "Generating your renovation visualization...",
    processing: "Transforming your property image...",
    completed:  "Your renovation visualization is ready!",
    failed:     "Failed to generate renovation visualization. Please try again."
  };
  return messages[status] || "Processing...";
}