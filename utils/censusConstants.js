// utils/censusConstants.js

/**
 * Census API variable mappings for demographic categories
 */
const CENSUS_VARIABLES = {
    // Total Population
    TOTAL_POPULATION: 'S0101_C01_001E',
    
    // Age Groups
    AGE: {
      UNDER_5: 'S0101_C01_002E',
      FIVE_TO_9: 'S0101_C01_003E',
      TEN_TO_14: 'S0101_C01_004E',
      FIFTEEN_TO_17: 'S0101_C01_005E',
      EIGHTEEN_TO_24: 'S0101_C01_006E',
      TWENTYFIVE_TO_34: 'S0101_C01_007E',
      THIRTYFIVE_TO_44: 'S0101_C01_008E',
      FORTYFIVE_TO_54: 'S0101_C01_009E',
      FIFTYFIVE_TO_64: 'S0101_C01_010E',
      SIXTYFIVE_TO_74: 'S0101_C01_011E',
      SEVENTYFIVE_TO_84: 'S0101_C01_012E',
      EIGHTYFIVE_AND_OVER: 'S0101_C01_013E'
    },
    
    // Sex
    SEX: {
      MALE_TOTAL: 'S0101_C03_001E',
      FEMALE_TOTAL: 'S0101_C05_001E'
    },
    
    // Household Income
    INCOME: {
      LESS_THAN_10K: 'S1901_C01_002E',
      TEN_TO_15K: 'S1901_C01_003E',
      FIFTEEN_TO_25K: 'S1901_C01_004E',
      TWENTYFIVE_TO_35K: 'S1901_C01_005E',
      THIRTYFIVE_TO_50K: 'S1901_C01_006E',
      FIFTY_TO_75K: 'S1901_C01_007E',
      SEVENTYFIVE_TO_100K: 'S1901_C01_008E',
      HUNDRED_TO_150K: 'S1901_C01_009E',
      ONEFIFTY_TO_200K: 'S1901_C01_010E',
      ABOVE_200K: 'S1901_C01_011E',
      MEDIAN_INCOME: 'S1901_C01_012E'
    },
    
    // Transportation to Work
    TRANSPORTATION: {
      CAR_ALONE: 'S0801_C01_002E',
      CARPOOL: 'S0801_C01_003E',
      PUBLIC_TRANSIT: 'S0801_C01_004E',
      WALKED: 'S0801_C01_005E',
      OTHER_TRANSPORT: 'S0801_C01_006E',
      WORKED_AT_HOME: 'S0801_C01_007E'
    },
    
    // Marital Status
    MARITAL_STATUS: {
      NEVER_MARRIED: 'S1201_C01_002E',
      MARRIED: 'S1201_C01_004E',
      SEPARATED: 'S1201_C01_007E',
      WIDOWED: 'S1201_C01_008E',
      DIVORCED: 'S1201_C01_009E'
    },
    
    // Employment Status
    EMPLOYMENT: {
      EMPLOYED: 'S2301_C01_001E',
      UNEMPLOYED: 'S2301_C04_001E',
      NOT_IN_LABOR_FORCE: 'S2301_C05_001E'
    }
  };
  
  /**
   * Maps frontend filter options to Census API variables
   */
  const FILTER_TO_VARIABLE_MAP = {
    ageRange: {
      '18-24': CENSUS_VARIABLES.AGE.EIGHTEEN_TO_24,
      '25-34': CENSUS_VARIABLES.AGE.TWENTYFIVE_TO_34,
      '35-44': CENSUS_VARIABLES.AGE.THIRTYFIVE_TO_44,
      '45-54': CENSUS_VARIABLES.AGE.FORTYFIVE_TO_54,
      '55-64': CENSUS_VARIABLES.AGE.FIFTYFIVE_TO_64,
      '65+': [
        CENSUS_VARIABLES.AGE.SIXTYFIVE_TO_74,
        CENSUS_VARIABLES.AGE.SEVENTYFIVE_TO_84,
        CENSUS_VARIABLES.AGE.EIGHTYFIVE_AND_OVER
      ]
    },
    
    sex: {
      'Male': CENSUS_VARIABLES.SEX.MALE_TOTAL,
      'Female': CENSUS_VARIABLES.SEX.FEMALE_TOTAL
    },
    
    incomeLevel: {
      '100K-500K': [
        CENSUS_VARIABLES.INCOME.HUNDRED_TO_150K,
        CENSUS_VARIABLES.INCOME.ONEFIFTY_TO_200K,
        CENSUS_VARIABLES.INCOME.ABOVE_200K
      ],
      '500K-1M': CENSUS_VARIABLES.INCOME.ABOVE_200K,
      '1M-5M': CENSUS_VARIABLES.INCOME.ABOVE_200K,
      '5M+': CENSUS_VARIABLES.INCOME.ABOVE_200K
    },
    
    transportation: {
      'Car': CENSUS_VARIABLES.TRANSPORTATION.CAR_ALONE,
      'Truck': CENSUS_VARIABLES.TRANSPORTATION.CAR_ALONE, // Approximation
      'Van': CENSUS_VARIABLES.TRANSPORTATION.CAR_ALONE, // Approximation
      'Public Transit': CENSUS_VARIABLES.TRANSPORTATION.PUBLIC_TRANSIT,
      'Walk/Bike': [
        CENSUS_VARIABLES.TRANSPORTATION.WALKED,
        CENSUS_VARIABLES.TRANSPORTATION.OTHER_TRANSPORT
      ],
      'Work from Home': CENSUS_VARIABLES.TRANSPORTATION.WORKED_AT_HOME
    },
    
    maritalStatus: {
      'Married': CENSUS_VARIABLES.MARITAL_STATUS.MARRIED,
      'Single': CENSUS_VARIABLES.MARITAL_STATUS.NEVER_MARRIED,
      'Divorced': CENSUS_VARIABLES.MARITAL_STATUS.DIVORCED,
      'Widowed': CENSUS_VARIABLES.MARITAL_STATUS.WIDOWED,
      'Separated': CENSUS_VARIABLES.MARITAL_STATUS.SEPARATED
    },
    
    employmentStatus: {
      'Employed': CENSUS_VARIABLES.EMPLOYMENT.EMPLOYED,
      'Self-employed': CENSUS_VARIABLES.EMPLOYMENT.EMPLOYED, // Approximation
      'Unemployed': CENSUS_VARIABLES.EMPLOYMENT.UNEMPLOYED,
      'Retired': CENSUS_VARIABLES.EMPLOYMENT.NOT_IN_LABOR_FORCE, // Approximation
      'Student': CENSUS_VARIABLES.EMPLOYMENT.NOT_IN_LABOR_FORCE // Approximation
    }
  };
  
  module.exports = {
    CENSUS_VARIABLES,
    FILTER_TO_VARIABLE_MAP
  };