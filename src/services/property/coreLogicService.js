const axios = require('axios');

// const CORELOGIC_CLIENT_ID = process.env.CORELOGIC_CONSUMER_KEY;
// const CORELOGIC_CLIENT_SECRET = process.env.CORELOGIC_CONSUMER_SECRET;
const v2Base = 'https://property.corelogicapi.com'; // Standard for Property V2
// Use the exact base URL from your screenshot
// const CORELOGIC_BASE_URL = 'https://property.corelogicapi.com'; 
// const CORELOGIC_AUTH_URL = 'https://api-prod.corelogic.com'; // Standard for OAuth

let cachedToken = null;
let tokenExpiry = 0;

/**
 * Step 1: OAuth2 Authentication
 */
const getAccessToken = async () => {
    const now = Date.now();
    if (cachedToken && now < (tokenExpiry - 60000)) return cachedToken;

    try {
        // 1. Force trim keys to ensure no whitespace characters interfere with Base64
        const consumerKey = process.env.CORELOGIC_CONSUMER_KEY.trim();
        const consumerSecret = process.env.CORELOGIC_CONSUMER_SECRET.trim();

        // 2. Create the Basic Auth string
        const authHeader = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');

        // 3. CoreLogic often prefers grant_type in the URL query for demo keys
        const authUrl = 'https://api-prod.corelogic.com/oauth/token?grant_type=client_credentials';

        const response = await axios({
            method: 'post',
            url: authUrl,
            headers: {
                'Authorization': `Basic ${authHeader}`,
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json'
            },
            // Sending an empty body because grant_type is in the URL
            data: ''
        });

        // Success response should contain { access_token, expires_in, ... }
        cachedToken = response.data.access_token;
        tokenExpiry = now + (parseInt(response.data.expires_in) * 1000);

        console.log('[CoreLogic] Authentication Successful');
        return cachedToken;

    } catch (error) {
        if (error.response) {
            // This will now show the specific 'faultstring' if it fails
            console.error('[CoreLogic Auth Fail]:', error.response.status, error.response.data);
        } else {
            console.error('[CoreLogic Auth Error]:', error.message);
        }
        throw new Error('CoreLogic Authentication Failed');
    }
};

/**
 * Helper to ensure state is a 2-letter code (e.g., 'California' -> 'CA')
 */
const formatState = (state) => {
    const states = {
        'california': 'CA', 'texas': 'TX', 'florida': 'FL', 'new york': 'NY'
        // Add others as needed, or use a library like 'us-state-converter'
    };
    return state.length === 2 ? state.toUpperCase() : (states[state.toLowerCase()] || state);
};

const findClipId = async (street, city, state, zipCode) => {
    try {
        const token = await getAccessToken();
        const stateCode = formatState(state); // Convert 'California' to 'CA'

        console.log(`[CoreLogic] Searching: ${street}, ${city}, ${stateCode} ${zipCode}`);

        const response = await axios.get('https://property.corelogicapi.com/v2/properties/search', {
            params: {
                streetAddress: street,
                city: city,
                state: stateCode, // Must be 2-letter code
                zipCode: zipCode
            },
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json'
            }
        });

        // CoreLogic returns data.properties[] in V2
        const clip = response.data?.items[0]?.clip;

        if (!clip) {
            console.warn('[CoreLogic] No CLIP found in response:', JSON.stringify(response.data));
            return null;
        }

        return clip;
    } catch (error) {
        if (error.response) {
            // This will log the EXACT field CoreLogic is complaining about
            console.error('[CoreLogic Search Fail]:', error.response.status, error.response.data);
        }
        return null;
    }
};
/**
 * Orchestrator (Valuation, Rent, Tax)
 */
const getCoreLogicInvestmentData = async (street, city, state, zipCode) => {
  const clip = await findClipId(street, city, state, zipCode);
  if (!clip) return { status: 'error', message: 'CLIP ID not found' };

  const token = await getAccessToken();
  const headers = { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' };
  const v2Base = 'https://property.corelogicapi.com';

  // Concurrent requests to the specific endpoints confirmed in your dashboard
  const promises = [
    axios.get(`${v2Base}/v2/properties/${clip}/property-detail`, { headers }),
    axios.get(`${v2Base}/v2/avms/ram`, { params: { clip }, headers }),
    axios.get(`${v2Base}/v2/properties/${clip}/tax-assessments/latest`, { headers })
  ];

  const results = await Promise.allSettled(promises);

  // Helper to extract data or return null on failure
  const getData = (index) => results[index].status === 'fulfilled' ? results[index].value.data : null;

  const rawDetail = getData(0);
  const rawRent = getData(1);
  const rawTax = getData(2);

  // Mapping based on your provided JSON structure
  return {
    status: 'success',
    clipId: clip,
    valuation: {
      // Using assessed value as a fallback for property value
      estimatedValue: rawTax?.items?.[0]?.assessedValue?.calculatedTotalValue || 0,
      yearBuilt: rawDetail?.data?.buildings?.buildings?.[0]?.constructionDetails?.yearBuilt || 0,
      totalUnits: rawDetail?.data?.buildings?.allBuildingsSummary?.unitsCount || 1,
      source: 'CoreLogic Property Detail'
    },
    rental: rawRent ? {
      estimatedMonthlyRent: rawRent.data?.estimatedRentalValue || 0,
      rentRangeHigh: rawRent.data?.estimatedMaxRentalValue || 0,
      rentRangeLow: rawRent.data?.estimatedMinRentalValue || 0,
      source: 'CoreLogic RAM'
    } : null,
    taxData: rawTax?.items?.[0] ? {
      annualPropertyTax: Math.round(rawTax.items[0].taxAmount?.totalTaxAmount || 0),
      assessedValue: rawTax.items[0].assessedValue?.calculatedTotalValue || 0,
      assessmentYear: rawTax.items[0].assessedValue?.taxAssessedYear || 2025,
      landValue: rawTax.items[0].assessedValue?.calculatedLandValue || 0,
      improvementValue: rawTax.items[0].assessedValue?.calculatedImprovementValue || 0,
      source: 'CoreLogic Tax Assessment'
    } : null,
    fetchedAt: new Date().toISOString()
  };
};

module.exports = { getCoreLogicInvestmentData, getAccessToken };