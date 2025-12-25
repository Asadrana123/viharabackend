const RenovationCostService = require("../services/renovationCostService");
const GeminiPromptBuilder = require("../services/geminiPromptBuilder");
const GeminiService = require("../services/geminiService");
const RenovationRequest = require("../model/renovationRequestModel");
const Product = require("../model/productModel");

/**
 * Generate renovation visualization images
 * POST /api/property/generate-renovation-images
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

    // Calculate renovation cost
    const costAnalysis = RenovationCostService.calculateRenovationCost(
      {
        state: property.state,
        city: property.city,
        squareFootage: property.squareFootage
      },
      renovationData
    );

    // Build Gemini prompts
    const { systemPrompt, userPrompt } = GeminiPromptBuilder.buildPrompts(
      {
        street: property.street,
        city: property.city,
        state: property.state,
        beds: property.beds,
        baths: property.baths,
        squareFootage: property.squareFootage,
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
    generateRenovationImagesAsync(renovationRequest._id, systemPrompt, userPrompt, property.image);

    // Return immediate response with cost analysis
    return res.status(200).json({
      success: true,
      requestId: renovationRequest._id,
      status: "pending",
      message: "Renovation visualization is being generated. Please wait...",
      costAnalysis: {
        finalCost: costAnalysis.finalCost,
        costRange: costAnalysis.costRange,
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
 * GET /api/property/renovation-request/:requestId
 */
exports.getRenovationRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const userId = req.user._id;

    // Fetch renovation request
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

    // Build response based on status
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
 * Background function to generate images asynchronously
 * This runs without blocking the API response
 */
async function generateRenovationImagesAsync(requestId, systemPrompt, userPrompt, propertyImage) {
  try {
    // Update status to processing
    await RenovationRequest.findByIdAndUpdate(requestId, { status: "processing" });

    // Call Gemini to generate image
    const geminiResult = await GeminiService.generateRenovationImage(
      systemPrompt,
      userPrompt,
      propertyImage
    );

    // Save results to database
    const updateData = {
      status: "completed",
      imageUrls: {
        before: propertyImage,
        after: propertyImage // In real scenario, this would be the generated image URL from cloud storage
      },
      description: geminiResult.description
    };

    await RenovationRequest.findByIdAndUpdate(requestId, updateData);

    console.log(`✓ Renovation visualization generated successfully for request: ${requestId}`);
  } catch (error) {
    console.error(`✗ Error generating renovation images for request ${requestId}:`, error);

    // Update status to failed
    await RenovationRequest.findByIdAndUpdate(requestId, {
      status: "failed"
    }).catch(err => console.error("Error updating failed status:", err));
  }
}

/**
 * Helper function to get user-friendly status message
 */
function getStatusMessage(status) {
  const messages = {
    pending: "Generating your renovation visualization...",
    processing: "Processing images with Gemini...",
    completed: "Your renovation visualization is ready!",
    failed: "Failed to generate renovation visualization. Please try again."
  };
  return messages[status] || "Processing...";
}
