const RenovationCostService = require("../services/renovationCostService");
const ReplicateService = require("../services/replicateService");
const ReplicatePromptBuilder = require("../services/replicatePromptBuilder");
const RenovationRequest = require("../model/renovationRequestModel");
const RenovationContractorService = require("../services/renovationContractorService");
const Product = require("../model/productModel");

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
    const userId = req.user._id;

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

    const validation = RenovationCostService.validateInputs(
      { state: property.state, city: property.city, squareFootage: property.squareFootage },
      renovationData
    );

    if (!validation.isValid) {
      return res.status(400).json({ success: false, error: validation.error });
    }

    // Now async — Gemini first, fallback to constants
    const costAnalysis = await RenovationCostService.calculateRenovationCost(
      {
        state: property.state,
        city: property.city,
        squareFootage: property.squareFootage,
        lotSize: property.lotSize
      },
      renovationData
    );

    const { prompt, negativePrompt } = ReplicatePromptBuilder.buildPrompts(
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
        finalCost: costAnalysis.finalCost,
        costRange: costAnalysis.costRange,
        lineItems: costAnalysis.lineItems,
        contingency: costAnalysis.contingency,
        breakdown: costAnalysis.breakdown,
        marketContext: costAnalysis.marketContext,
        roiEstimate: costAnalysis.roiEstimate
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
    const userId = req.user._id;

    const renovationRequest = await RenovationRequest.findById(requestId);

    if (!renovationRequest) {
      return res.status(404).json({ success: false, error: "Renovation request not found" });
    }

    if (renovationRequest.userId.toString() !== userId.toString()) {
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

async function generateRenovationImagesAsync(requestId, propertyImage, prompt, negativePrompt) {
  try {
    await RenovationRequest.findByIdAndUpdate(requestId, { status: "processing" });

    const result = await ReplicateService.generateRenovationImage(propertyImage, prompt, negativePrompt);

    await RenovationRequest.findByIdAndUpdate(requestId, {
      status: "completed",
      imageUrls: { before: propertyImage, after: result.imageUrl },
      description: result.description
    });

    console.log(`✓ Renovation visualization generated for request: ${requestId}`);
  } catch (error) {
    console.error(`✗ Error generating renovation images for request ${requestId}:`, error);
    await RenovationRequest.findByIdAndUpdate(requestId, { status: "failed" })
      .catch(err => console.error("Error updating failed status:", err));
  }
}

function getStatusMessage(status) {
  const messages = {
    pending: "Generating your renovation visualization...",
    processing: "Transforming your property image...",
    completed: "Your renovation visualization is ready!",
    failed: "Failed to generate renovation visualization. Please try again."
  };
  return messages[status] || "Processing...";
}
