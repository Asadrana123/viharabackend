const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require("fs");
const path = require("path");

class GeminiService {
  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is not set");
    }
    this.client = new GoogleGenerativeAI(apiKey);
    this.model = "gemini-2.5-flash";
  }

  /**
   * Generate renovation image using Gemini
   * @param {String} systemPrompt - System context prompt
   * @param {String} userPrompt - User request prompt
   * @param {String} imagePath - Path or URL to original property image
   * @returns {Object} Generated image URL and metadata
   */
  async generateRenovationImage(systemPrompt, userPrompt, imagePath) {
    try {
      const model = this.client.getGenerativeModel({ model: this.model });

      // Prepare image data
      const imageData = await this.prepareImageData(imagePath);

      // Build request content
      const content = [
        {
          role: "user",
          parts: [
            { text: systemPrompt },
            { text: userPrompt },
            {
              inlineData: {
                mimeType: imageData.mimeType,
                data: imageData.data
              }
            }
          ]
        }
      ];

      // Call Gemini API
      const startTime = Date.now();
      const response = await model.generateContent({
        contents: content,
        generationConfig: {
          maxOutputTokens: 2048,
          temperature: 0.7,
          topP: 0.95
        }
      });

      const processingTime = Date.now() - startTime;

      // Extract response
      const result = response.response;
      
      if (!result || !result.text()) {
        throw new Error("No response from Gemini API");
      }

      // Parse response - Gemini returns description/details
      const responseText = result.text();

      return {
        success: true,
        description: responseText,
        processingTimeMs: processingTime,
        tokensUsed: result.usageMetadata?.totalTokenCount || 0,
        model: this.model
      };
    } catch (error) {
      console.error("Error calling Gemini API:", error);
      throw new Error(`Gemini API error: ${error.message}`);
    }
  }

  /**
   * Prepare image data from file path or URL
   * @param {String} imagePath - File path or URL to image
   * @returns {Object} Image data with mime type and base64 content
   */
  async prepareImageData(imagePath) {
    try {
      let imageBuffer;
      let mimeType = "image/jpeg";

      // Check if it's a URL or file path
      if (imagePath.startsWith("http://") || imagePath.startsWith("https://")) {
        // Fetch from URL
        const response = await fetch(imagePath);
        if (!response.ok) {
          throw new Error(`Failed to fetch image from URL: ${response.statusText}`);
        }
        imageBuffer = await response.buffer();
        
        // Detect mime type from content-type header
        const contentType = response.headers.get("content-type");
        if (contentType) {
          mimeType = contentType;
        }
      } else {
        // Read from file system
        if (!fs.existsSync(imagePath)) {
          throw new Error(`Image file not found: ${imagePath}`);
        }
        imageBuffer = fs.readFileSync(imagePath);
        
        // Detect mime type from file extension
        const ext = path.extname(imagePath).toLowerCase();
        const mimeTypes = {
          ".jpg": "image/jpeg",
          ".jpeg": "image/jpeg",
          ".png": "image/png",
          ".gif": "image/gif",
          ".webp": "image/webp"
        };
        mimeType = mimeTypes[ext] || "image/jpeg";
      }

      // Convert to base64
      const base64Data = imageBuffer.toString("base64");

      return {
        mimeType,
        data: base64Data
      };
    } catch (error) {
      console.error("Error preparing image data:", error);
      throw error;
    }
  }

  /**
   * Validate API key connectivity
   * @returns {Boolean} True if API is reachable
   */
  async validateConnection() {
    try {
      const model = this.client.getGenerativeModel({ model: this.model });
      const response = await model.generateContent("test");
      return !!response;
    } catch (error) {
      console.error("Error validating Gemini connection:", error);
      return false;
    }
  }
}

module.exports = new GeminiService();
