const axios = require("axios");

const VAPI_API_KEY = process.env.VAPI_API_KEY;
const VAPI_ASSISTANT_ID = process.env.VAPI_ASSISTANT_ID;
const VAPI_PHONE_NUMBER_ID = process.env.VAPI_PHONE_NUMBER_ID;

// Property details for current campaign
const PROPERTY = {
  address: "1496 Adeline St, Oakland, California 94607",
  type: "3-bedroom 2-bathroom REO Bank Owned Townhome",
  starting_bid: "three hundred thousand dollars",
  estimate: "six hundred sixty five thousand dollars",
  monthly_rent: "three thousand three hundred seventy one dollars",
  listing_url: "vihara.ai/listing/oakland-auction",
};

/**
 * Parse phones from "phone1 | phone2 | phone3" format
 * Returns array of valid E.164 formatted numbers
 */
const parsePhones = (phonesStr) => {
  if (!phonesStr) return [];
  return phonesStr
    .split("|")
    .map((p) => p.trim())
    .filter((p) => p.length > 6)
    .map((p) => {
      const digits = p.replace(/\D/g, "");
      if (digits.length === 10) return `+1${digits}`;
      if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
      return null;
    })
    .filter(Boolean);
};

/**
 * Dispatch a single call via VAPI
 */
const dispatchCall = async (phoneNumber, person, researchSummary) => {
  try {
    const response = await axios.post(
      "https://api.vapi.ai/call",
      {
        assistantId: VAPI_ASSISTANT_ID,
        phoneNumberId: VAPI_PHONE_NUMBER_ID,
        customer: {
          number: phoneNumber,
          name: person.fullName,
        },
        assistantOverrides: {
          variableValues: {
            prospect_name: person.fullName.split(" ")[0],
            prospect_research: researchSummary,
            property_address: PROPERTY.address,
            property_type: PROPERTY.type,
            property_price: PROPERTY.starting_bid,
            estimated_arv: PROPERTY.estimate,
            listing_url: PROPERTY.listing_url,
          },
        },
      },
      {
        headers: {
          Authorization: `Bearer ${VAPI_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log(
      `✅ Call dispatched: ${person.fullName} → ${phoneNumber} | Call ID: ${response.data.id}`
    );
    return { success: true, callId: response.data.id, phone: phoneNumber };
  } catch (err) {
    console.error(
      `❌ Call failed: ${person.fullName} → ${phoneNumber}:`,
      err.response?.data || err.message
    );
    return { success: false, phone: phoneNumber, error: err.message };
  }
};

module.exports = { parsePhones, dispatchCall, PROPERTY };
