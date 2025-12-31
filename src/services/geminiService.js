const { GoogleGenerativeAI } = require("@google/generative-ai");
const cloudinary = require('cloudinary').v2;
const fs = require("fs");
const path = require("path");
// Configure Cloudinary (add this to your constructor or top of file)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

class GeminiService {
  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is not set");
    }
    this.client = new GoogleGenerativeAI(apiKey);
    this.model = "gemini-2.5-flash-image";
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
      const imageData = await this.prepareImageData(imagePath);
      const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;

      const result = await model.generateContent({
        contents: [{
          role: "user",
          parts: [{ text: fullPrompt }, { inlineData: imageData }]
        }],
        generationConfig: {
          responseModalities: ["IMAGE", "TEXT"] // Required to get the image back
        }
      });
      const response = result.response;
      let generatedImageBase64 = null;
      let description = "";

      if (response.candidates && response.candidates[0].content.parts) {
        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData) generatedImageBase64 = part.inlineData.data;
          else if (part.text) description += part.text;
        }
      }

      if (!generatedImageBase64) throw new Error("No image generated.");

      // --- NEW: Upload to Cloudinary ---
      // Gemini returns raw base64; Cloudinary needs a Data URI format
      const dataUri = `data:image/jpeg;base64,${generatedImageBase64}`;

      const uploadResponse = await cloudinary.uploader.upload(dataUri, {
        folder: "renovations",
        resource_type: "image"
      });

      return {
        success: true,
        imageUrl: uploadResponse.secure_url, // Permanent public URL
        description: description || "Renovation complete.",
        model: this.model
      };
    } catch (error) {
      console.error("Gemini/Cloudinary Error:", error);
      throw error;
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
        imageBuffer = Buffer.from(await response.arrayBuffer());

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
