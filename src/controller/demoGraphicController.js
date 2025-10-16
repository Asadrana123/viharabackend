// controller/demoGraphicController.js
const catchAsyncError = require("../middleware/catchAsyncError");
const ErrorHandler = require("../utils/errorhandler");
const fs = require('fs').promises;
const path = require('path');

// Load users from JSON file
let usersData = [];

// Initial loading of user data
const loadUserData = async () => {
  try {
    const usersFilePath = path.join(__dirname, '../data/dummyUsers.json');
    const usersFileContent = await fs.readFile(usersFilePath, 'utf8');
    usersData = JSON.parse(usersFileContent);
    console.log(`Loaded ${usersData.length} users from data file.`);
  } catch (error) {
    console.error('Error loading user data:', error);
    
    // If file doesn't exist, generate new data
    if (error.code === 'ENOENT') {
      const { generateDummyUsers } = require('../utils/generateDummyData');
      usersData = generateDummyUsers(350);
      
      // Create data directory if it doesn't exist
      try {
        await fs.mkdir(path.join(__dirname, '../data'), { recursive: true });
      } catch (err) {
        if (err.code !== 'EEXIST') throw err;
      }
      
      // Save generated data to file
      await fs.writeFile(
        path.join(__dirname, '../data/dummyUsers.json'), 
        JSON.stringify(usersData, null, 2)
      );
      console.log(`Generated and saved ${usersData.length} new users.`);
    }
  }
};

// Load data on startup
loadUserData();

// Filter users based on demographic criteria
function filterUsers(users, filters) {
  const { 
    ageRange = [], 
    sex = [], 
    location = [], 
    incomeLevel = [], 
    transportation = [], 
    maritalStatus = [], 
    employmentStatus = [] 
  } = filters;

  // Return all users if no filters are applied
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
    return users;
  }

  return users.filter(user => {
    // Age Range filter
    if (ageRange.length > 0 && !ageRange.includes(user.demographic.ageRange)) {
      return false;
    }
    
    // Sex filter
    if (sex.length > 0 && !sex.includes(user.demographic.sex)) {
      return false;
    }
    
    // Location filter
    if (location.length > 0 && !location.includes(user.demographic.location)) {
      return false;
    }
    
    // Income Level filter
    if (incomeLevel.length > 0 && !incomeLevel.includes(user.demographic.incomeLevel)) {
      return false;
    }
    
    // Transportation filter
    if (transportation.length > 0 && !transportation.includes(user.demographic.transportation)) {
      return false;
    }
    
    // Marital Status filter
    if (maritalStatus.length > 0 && !maritalStatus.includes(user.demographic.maritalStatus)) {
      return false;
    }
    
    // Employment Status filter
    if (employmentStatus.length > 0 && !employmentStatus.includes(user.demographic.employmentStatus)) {
      return false;
    }
    
    return true;
  });
}

// Get demographic statistics for the filtered users
function getFilteredStatistics(filteredUsers, totalUsers) {
  // Calculate percentage of users matching the filter criteria
  const percentageMatch = (filteredUsers.length / totalUsers.length * 100).toFixed(1);
  
  // Extract unique locations from filtered users
  const locations = [...new Set(filteredUsers.map(user => user.demographic.location))];
  
  // Count users by location
  const locationCounts = locations.map(location => {
    const count = filteredUsers.filter(user => user.demographic.location === location).length;
    return { location, count };
  }).sort((a, b) => b.count - a.count).slice(0, 5);  // Top 5 locations
  
  return {
    totalUsers: totalUsers.length,
    filteredUsers: filteredUsers.length,
    percentageMatch,
    topLocations: locationCounts
  };
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
      employmentStatus,
      page = 1,
      limit = 10
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

    try {
      // Filter users based on criteria
      const filteredUsers = filterUsers(usersData, {
        ageRange, 
        sex, 
        location, 
        incomeLevel, 
        transportation, 
        maritalStatus, 
        employmentStatus
      });
      
      // Calculate statistics for the filtered users
      const statistics = getFilteredStatistics(filteredUsers, usersData);
      
      // Paginate the results
      const startIndex = (page - 1) * limit;
      const endIndex = page * limit;
      const paginatedUsers = filteredUsers.slice(startIndex, endIndex);
      
      // Prepare pagination metadata
      const pagination = {
        total: filteredUsers.length,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(filteredUsers.length / limit)
      };
      
      return res.status(200).json({
        success: true,
        statistics,
        pagination,
        users: paginatedUsers
      });
    } catch (error) {
      console.error("Demographic Analysis Error:", error);
      return next(new ErrorHandler("Failed to analyze demographic data", 500));
    }
  }
);

// Get all unique counties from the user data
exports.getCounties = catchAsyncError(
  async (req, res, next) => {
    try {
      // Extract unique locations from user data
      const locations = [...new Set(usersData.map(user => user.demographic.location))];
      
      // Format the locations as counties
      const counties = locations.map(location => {
        const [county, state] = location.split(', ');
        return {
          id: `${county.toLowerCase().replace(/\s+/g, '_')}_${state}`,
          name: county,
          state
        };
      });
      
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

// Get all unique states from the user data
exports.getStates = catchAsyncError(
  async (req, res, next) => {
    try {
      // Extract unique states from user data
      const states = [...new Set(usersData.map(user => {
        const [county, state] = user.demographic.location.split(', ');
        return state;
      }))];
      
      // Format the states with FIPS codes (for backwards compatibility)
      const formattedStates = states.map(state => ({
        name: state,
        fips: state, // Using state code as FIPS since we don't need actual FIPS codes anymore
        abbreviation: state
      }));
      
      return res.status(200).json({
        success: true,
        states: formattedStates
      });
    } catch (error) {
      console.error("Error fetching states:", error);
      return next(new ErrorHandler("Failed to fetch state data", 500));
    }
  }
);

// This endpoint is kept for backward compatibility but now returns demographic attributes
exports.getCensusVariables = catchAsyncError(
  async (req, res, next) => {
    try {
      // Extract unique demographic attributes from user data
      const ageRanges = [...new Set(usersData.map(user => user.demographic.ageRange))];
      const sexes = [...new Set(usersData.map(user => user.demographic.sex))];
      const incomes = [...new Set(usersData.map(user => user.demographic.incomeLevel))];
      const transportationModes = [...new Set(usersData.map(user => user.demographic.transportation))];
      const maritalStatuses = [...new Set(usersData.map(user => user.demographic.maritalStatus))];
      const employmentStatuses = [...new Set(usersData.map(user => user.demographic.employmentStatus))];
      
      return res.status(200).json({
        success: true,
        variables: {
          ageRanges,
          sexes,
          incomes,
          transportationModes,
          maritalStatuses,
          employmentStatuses
        }
      });
    } catch (error) {
      console.error("Error fetching demographic variables:", error);
      return next(new ErrorHandler("Failed to fetch demographic variable data", 500));
    }
  }
);