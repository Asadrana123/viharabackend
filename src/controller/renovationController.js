const RenovationCostService = require("../services/renovationCostService");
const ReplicateService = require("../services/replicateService");
const ReplicatePromptBuilder = require("../services/replicatePromptBuilder");
const RenovationRequest = require("../model/renovationRequestModel");
const Product = require("../model/productModel");

/**
 * Generate renovation visualization images
 * POST /api/property-renovation/generate-renovation-images
 */
exports.generateRenovationImages = async (req, res) => {
  try {
    const { propertyId, renovationData } = req.body;
    const userId = req.user._id;

    // Validate required fields
    if (!propertyId || !renovationData) {
      return res.status(400).json({
        success: false,
        error: "Property ID and renovation data are required"
      });
    }

    // Fetch property from database
    const property = await Product.findById(propertyId);
    if (!property) {
      return res.status(404).json({
        success: false,
        error: "Property not found"
      });
    }

    // Guard: property must have an image
    if (!property.image) {
      return res.status(400).json({
        success: false,
        error: "This property does not have an exterior image. Please upload a property image before using the renovation visualizer."
      });
    }

    // Validate input data
    const validation = RenovationCostService.validateInputs(
      {
        state: property.state,
        city: property.city,
        squareFootage: property.squareFootage
      },
      renovationData
    );

    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        error: validation.error
      });
    }

    // Calculate renovation cost (now itemized for exterior)
    const costAnalysis = RenovationCostService.calculateRenovationCost(
      {
        state: property.state,
        city: property.city,
        squareFootage: property.squareFootage,
        lotSize: property.lotSize
      },
      renovationData
    );

    // Build Replicate prompt
    const { prompt, negativePrompt } = ReplicatePromptBuilder.buildPrompts(
      {
        city: property.city,
        state: property.state,
        yearBuilt: property.yearBuilt,
        propertyType: property.propertyType
      },
      renovationData,
      costAnalysis
    );

    // Create renovation request record (status: pending)
    const renovationRequest = new RenovationRequest({
      userId,
      propertyId,
      renovationData,
      costAnalysis,
      status: "pending"
    });

    await renovationRequest.save();

    // Start image generation in background (don't wait)
    generateRenovationImagesAsync(
      renovationRequest._id,
      property.image,
      prompt,
      negativePrompt
    );

    // Return immediate response with cost analysis
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

/**
 * Get renovation request status and results
 * GET /api/property-renovation/renovation-request/:requestId
 */
exports.getRenovationRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const userId = req.user._id;

    const renovationRequest = await RenovationRequest.findById(requestId);

    if (!renovationRequest) {
      return res.status(404).json({
        success: false,
        error: "Renovation request not found"
      });
    }

    // Verify user owns this request
    if (renovationRequest.userId.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        error: "Unauthorized access"
      });
    }

    const responseData = {
      success: true,
      requestId: renovationRequest._id,
      status: renovationRequest.status,
      costAnalysis: renovationRequest.costAnalysis,
      message: getStatusMessage(renovationRequest.status)
    };

    // Include images if completed
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
 * Background function — generates image via Replicate without blocking response
 */
async function generateRenovationImagesAsync(requestId, propertyImage, prompt, negativePrompt) {
  try {
    // Update status to processing
    await RenovationRequest.findByIdAndUpdate(requestId, { status: "processing" });

    // Call Replicate to transform property image
    const result = await ReplicateService.generateRenovationImage(
      propertyImage,
      prompt,
      negativePrompt
    );

    // Save results
    await RenovationRequest.findByIdAndUpdate(requestId, {
      status: "completed",
      imageUrls: {
        before: propertyImage,
        after: result.imageUrl
      },
      description: result.description
    });

    console.log(`✓ Renovation visualization generated for request: ${requestId}`);
  } catch (error) {
    console.error(`✗ Error generating renovation images for request ${requestId}:`, error);

    await RenovationRequest.findByIdAndUpdate(requestId, {
      status: "failed"
    }).catch(err => console.error("Error updating failed status:", err));
  }
}

/**
 * Status messages
 */
function getStatusMessage(status) {
  const messages = {
    pending: "Generating your renovation visualization...",
    processing: "Transforming your property image...",
    completed: "Your renovation visualization is ready!",
    failed: "Failed to generate renovation visualization. Please try again."
  };
  return messages[status] || "Processing...";
}
