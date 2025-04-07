// controller/demographicController.js
const catchAsyncError = require("../middleware/catchAsyncError");
const ErrorHandler = require("../utils/errorhandler");
const censusApiService = require("../services/censusApiService");
const fs = require('fs');
const path = require('path');

// Load Counties from JSON file
let countyData = [];
try {
  const countyFilePath = path.join(__dirname, '../data/Counties.json');
  const countyFileContent = fs.readFileSync(countyFilePath, 'utf8');
  countyData = JSON.parse(countyFileContent);
} catch (error) {
  console.error('Error loading county data:', error);
}

// Analyze demographic data based on provided filters
exports.analyzeDemographics = catchAsyncError(
  async (req, res, next) => {
    const { 
      ageRange, 
      sex, 
      location, 
      incomeLevel, 
      transportation, 
      maritalStatus, 
      employmentStatus 
    } = req.body;

    // Validate input (at least one filter should be provided)
    const hasFilters = [
      ageRange, 
      sex, 
      location, 
      incomeLevel, 
      transportation, 
      maritalStatus, 
      employmentStatus
    ].some(filter => filter && filter.length > 0);

    if (!hasFilters) {
      return next(new ErrorHandler("At least one filter must be specified", 400));
    }

    try {
      // Call the Census API service with the filters
      const demographicResults = await censusApiService.analyzeDemographics({
        ageRange, 
        sex, 
        location, 
        incomeLevel, 
        transportation, 
        maritalStatus, 
        employmentStatus
      });
      
      return res.status(200).json(demographicResults);
    } catch (error) {
      console.error("Census API Error:", error);
      return next(new ErrorHandler("Failed to fetch demographic data", 500));
    }
  }
);

// Get available counties (for location dropdown)
exports.getCounties = catchAsyncError(
  async (req, res, next) => {
    try {
      // If county data is already loaded from JSON, use it
      if (countyData.length > 0) {
        const formattedCounties = countyData.map(county => ({
          id: generateCountyId(county.County, county.State),
          name: county.County,
          state: county.State
        }));
        return res.status(200).json({
          success: true,
          counties: formattedCounties
        });
      }
      
      // If not loaded from JSON, fetch from Census API (fallback)
      const counties = await censusApiService.fetchAllCounties();
      
      return res.status(200).json({
        success: true,
        counties
      });
    } catch (error) {
      console.error("Error fetching counties:", error);
      return next(new ErrorHandler("Failed to fetch county data", 500));
    }
  }
);

// Helper function to generate a unique ID for a county
function generateCountyId(countyName, state) {
  return `${countyName.replace(/\s+/g, '_')}_${state}`.toLowerCase();
}

// Get census variables (for reference/documentation)
exports.getCensusVariables = catchAsyncError(
  async (req, res, next) => {
    try {
      const variables = await censusApiService.fetchCensusVariables();
      
      return res.status(200).json({
        success: true,
        variables
      });
    } catch (error) {
      console.error("Error fetching Census variables:", error);
      return next(new ErrorHandler("Failed to fetch Census variable data", 500));
    }
  }
);

// Get states with FIPS codes
exports.getStates = catchAsyncError(
  async (req, res, next) => {
    try {
      const states = await censusApiService.fetchStates();
      
      return res.status(200).json({
        success: true,
        states
      });
    } catch (error) {
      console.error("Error fetching states:", error);
      return next(new ErrorHandler("Failed to fetch state data", 500));
    }
  }
);