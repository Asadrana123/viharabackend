/**
 * ATTOM Data Solutions Service
 * * Flow:
 * 1. findPropertyId - Get internal ATTOM ID via address lookup
 * 2. getPropertyValuation - Get AVM via address (Corrected for provided response structure)
 * 3. getRentalEstimate - Get Rental AVM via address
 * 4. getComparableSales - Get Comps via Property ID
 * 5. getPropertyTaxData - Get Tax/Assessment via address
 */

const axios = require('axios');

const ATTOM_API_KEY = process.env.ATTOM_API_KEY;
const ATTOM_BASE_URL = 'https://api.gateway.attomdata.com/propertyapi/v1.0.0';

// Initialize ATTOM API client
const attomClient = axios.create({
  baseURL: ATTOM_BASE_URL,
  timeout: 30000,
  headers: {
    'Accept': 'application/json',
    'APIKey': ATTOM_API_KEY
  }
});

/**
 * Helper to format address for parameters
 */
const getAddressParams = (street, city, state, zipCode) => ({
  address1: street,
  address2: `${city}, ${state} ${zipCode}`
});

/**
 * Step 1: Find property by address to get property ID
 */
const findPropertyId = async (street, city, state, zipCode) => {
  try {
    const response = await attomClient.get('/property/basicprofile', {
      params: getAddressParams(street, city, state, zipCode)
    });

    const attomId = response.data?.property?.[0]?.identifier?.attomId;

    if (!attomId) {
      console.warn('[ATTOM] Property not found during ID lookup');
      return null;
    }

    return attomId;
  } catch (error) {
    console.error('[ATTOM] findPropertyId Error:', error.message);
    return null;
  }
};

/**
 * Step 2: Get property valuation (AVM)
 * Corrected mapping for the provided SuccessWithResult structure
 */
const getPropertyValuation = async (street, city, state, zipCode) => {
  try {
    const response = await attomClient.get('/attomavm/detail', {
      params: getAddressParams(street, city, state, zipCode)
    });

    const property = response.data?.property?.[0];

    if (!property || response.data?.property?.length === 0) {
      console.warn('[ATTOM] No valuation data available for this property');
      return null;
    }

    const avm = property.avm;

    if (!avm || !avm.amount) {
      console.warn('[ATTOM] AVM data missing');
      return null;
    }

    return {
      estimatedValue: avm.amount.value || 0,
      confidenceScore: avm.amount.scr || 0, // In your response, scr is inside amount
      valueRangeHigh: avm.amount.high || 0,
      valueRangeLow: avm.amount.low || 0,
      valuationDate: avm.eventDate || new Date().toISOString().split('T')[0],
      source: 'ATTOM AVM'
    };
  } catch (error) {
    console.error('[ATTOM] Valuation Error:', error.message);
    return null;
  }
};

/**
 * Step 3: Get rental valuation
 */
/**
 * Step 3: Get rental valuation
 * Corrected to match the actual response structure for rentalAvm
 * * @param {string} street - Property street address
 * @param {string} city - Property city
 * @param {string} state - Property state
 * @param {string} zipCode - Property zip code
 * @returns {Object} Rental data or null
 */
const getRentalEstimate = async (street, city, state, zipCode) => {
  console.log(getAddressParams(street, city, state, zipCode));
  try {
    const response = await attomClient.get('/valuation/rentalavm', {
      params: getAddressParams(street, city, state, zipCode)
    });

    // In this specific response, data is in property[0].rentalAvm (capital 'A')
    const property = response.data?.property?.[0];

    if (!property || response.data?.property?.length === 0) {
      console.warn('[ATTOM] No rental data available for this property');
      return null;
    }

    const rental = property.rentalAvm;

    if (!rental || rental.estimatedRentalValue === undefined) {
      console.warn('[ATTOM] Rental AVM data missing');
      return null;
    }

    const monthlyRent = Math.round(rental.estimatedRentalValue || 0);

    return {
      estimatedMonthlyRent: monthlyRent,
      estimatedAnnualRent: monthlyRent * 12,
      confidenceScore: 0, // Not available in response
      rentRangeHigh: Math.round(rental.estimatedMaxRentalValue || monthlyRent),
      rentRangeLow: Math.round(rental.estimatedMinRentalValue || monthlyRent),
      rentalDate: property.vintage?.lastModified || new Date().toISOString().split('T')[0],
      source: 'ATTOM Rental AVM'
    };
  } catch (error) {
    console.error('[ATTOM] Rental Error:', error.message);
    return null;
  }
};

/**
 * Step 4: Get comparable sales
 * Endpoint: GET /property/v2/salescomparables/propid/{propId}
 * Based on provided documentation screenshots.
 */
const getComparableSales = async (propId) => {
  try {
    console.log(`[ATTOM] Fetching comparables for Property ID: ${propId}`);

    const response = await axios.get(
      `https://api.gateway.attomdata.com/property/v2/salescomparables/propid/${propId}`,
      {
        timeout: 30000,  // ← Add this
        headers: {
          'Accept': 'application/json',
          'APIKey': ATTOM_API_KEY
        }
      }
    );

    // Check for error status in response
    const status = response.data?.RESPONSE_GROUP?.PRODUCT?.STATUS;

    if (status?.['@_Code'] !== '0') {
      console.warn('[ATTOM] Comparables error:', status?.['@_Description']);
      return [];
    }

    // Get subject property data
    const subjectProperty = response.data?.RESPONSE_GROUP?.RESPONSE_DATA?.PROPERTY_INFORMATION_RESPONSE_ext?.SUBJECT_PROPERTY_ext;

    if (!subjectProperty) {
      console.warn('[ATTOM] No comparable sales data available');
      return [];
    }

    // Check if minimum comps met
    const productStatus = subjectProperty?.PROPERTY?.[0]?.PRODUCT_INFO_ext?.STATUS?.['@_Code'];

    if (productStatus === '29') {
      console.warn('[ATTOM] Minimum comparable sales not met');
      return [];
    }

    // Extract comparable properties (adjust based on actual response structure)
    const comparables = subjectProperty?.PROPERTY || [];

    return comparables.map((comp, index) => ({
      id: index,
      address: comp.address || 'N/A',
      salePrice: comp.salePrice || 0,
      saleDate: comp.saleDate || 'N/A',
      beds: comp.beds || 0,
      baths: comp.baths || 0,
      sqft: comp.sqft || 0
    })).slice(0, 10);

  } catch (error) {
    console.error('[ATTOM] Comparables Error:', error.message);
    return [];
  }
};

/**
 * Step 5: Get property tax data
 */
const getPropertyTaxData = async (street, city, state, zipCode) => {
  try {
    const response = await attomClient.get('/assessment/detail', {
      params: getAddressParams(street, city, state, zipCode)
    });

    const property = response.data?.property?.[0];

    if (!property || response.data?.property?.length === 0) {
      console.warn('[ATTOM] No tax data available for this property');
      return null;
    }

    const assessment = property.assessment;
    const tax = assessment?.tax;
    const assessed = assessment?.assessed;

    if (!assessment || !tax || !assessed) {
      console.warn('[ATTOM] Tax/Assessment data missing');
      return null;
    }

    return {
      annualPropertyTax: Math.round(tax.taxamt || 0),
      assessedValue: Math.round(assessed.assdttlvalue || 0),
      assessmentYear: tax.taxyear || new Date().getFullYear(),
      assessedLandValue: Math.round(assessed.assdlandvalue || 0),
      assessedImprovementValue: Math.round(assessed.assdimprvalue || 0),
      taxPerSqft: (tax.taxpersizeunit || 0).toFixed(2),
      source: 'ATTOM Assessment'
    };
  } catch (error) {
    console.error('[ATTOM] Tax Data Error:', error.message);
    return null;
  }
};

/**
 * Main Orchestrator
 */
const getPropertyInvestmentData = async (street, city, state, zipCode) => {
  try {
    console.log('[ATTOM] Starting parallel data fetch...');

    // We still fetch propId first as Comparables requires it for the URL path
    const propId = await findPropertyId(street, city, state, zipCode);

    const [valuation, rental, taxData] = await Promise.all([
      getPropertyValuation(street, city, state, zipCode),
      getRentalEstimate(street, city, state, zipCode),
      getPropertyTaxData(street, city, state, zipCode)
    ]);

    // Comparables fetch only if propId exists
    const comparables = propId ? await getComparableSales(propId) : [];

    return {
      status: 'success',
      propId,
      valuation,
      rental,
      comparables,
      taxData,
      fetchedAt: new Date().toISOString()
    };
  } catch (error) {
    console.error('[ATTOM] Orchestrator Error:', error.message);
    return { status: 'error', message: 'Failed to fetch investment data' };
  }
};

module.exports = {
  findPropertyId,
  getPropertyValuation,
  getRentalEstimate,
  getComparableSales,
  getPropertyTaxData,
  getPropertyInvestmentData
};