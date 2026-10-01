// config/property/termsAndConditions.js
//
// Single source of truth for the auction Terms & Conditions. Served to the
// frontend via GET /api/v1/product/terms[/:slug] and rendered to PDF for the
// seller auction-closed email (utils/termsPdfExport.js).

// ============================================================
// Common (state-neutral) bullet disclaimers — apply to every property
// ============================================================
const bulletDisclaimers = [
  "By placing a bid in this auction, the bidder acknowledges and agrees to the following terms and conditions.",
  "The auction winner must complete payment, either in cash or through financing, within 30 days of the seller’s approval confirmation. Failure to do so will result in forfeiture of the Earnest Money Deposit.",
  "Sales are on an 'as is', 'where is' basis with no representation as to status of title or condition of the property. In order to obtain the most up-to-date status of a particular property, interested parties must attend the REO sale at the time, date and place scheduled. It is recommended that any person who intends to bid at a REO auction should consult with an attorney and conduct a title search.",
  "Property may be subject to leasehold interests or other rights or claims of various tenants or other occupants, and Buyer may be subject to the United States Service Members Civil Relief Act, or other federal, state or local law, as applicable.",
  "No physical access/ability to conduct inspections prior to purchase. Buyer assumes all risk.",
  "All pictures, details, or descriptions provided are for informational purposes only and may not represent the true and current condition of the property.",
  "Bank-owned properties that are listed on Vihara's platform and purchased in auctions are \"Subject to Seller Acceptance.\" The buyer and seller both must sign the purchase agreement for the bid to be considered as an accepted bid.",
  "The Buyer is not permitted to act as their own broker in a transaction and receive a broker commission, whether the purchase is made individually or through partial or full ownership of an entity.",
  "Winning Bidders are required to submit an Earnest Money Deposit equal to 5% of the Total Purchase Price or $2,500, whichever amount is higher, within 2 business days of executing the Purchase and Sale Agreement.",
  "Title fees generally range from $500 to $1,500, depending on the purchase price, while escrow fees typically fall between $850 and $1,375. These amounts may vary based on the property's location, and all such fees will be paid as outlined in the applicable purchase sale agreement.",
  "Any outstanding HOA/COA assessments will be paid in accordance with the applicable purchase sale agreement.",
  "The property is being sold as-is, where-is.",
  "Until the seller's reserve price is reached, Vihara may place counter bids on behalf of the seller. This practice provides both buyers and sellers with greater flexibility in arriving at a mutually acceptable price. Once the reserve price has been met, no further counter bids will be made.",
  "This is a foreclosure so we never have disclosures. Under our management there are no known flooding incidents. It is critical that you state No disclosures."
];

// ============================================================
// Common (state-neutral) legal sections — apply to every property
// ============================================================
const COMMON_SECTIONS = [
  {
    heading: "Platform Role — RL Auction Inc. dba Vihara Is a Technology Vendor Only",
    paragraphs: [
      "This property is listed on an online auction marketplace operated exclusively by RL Auction Inc. dba Vihara (\"Vihara,\" \"the Platform,\" or \"the Company\"), a technology services company. Vihara operates solely as an online auction technology platform and marketplace facilitator. Vihara is not, and shall not be construed to be, a real estate broker, real estate agent, real estate salesperson, lender, mortgagee, title company, escrow company, property manager, appraiser, inspector, advisor, fiduciary, or representative of either the Buyer or the Seller in any transaction conducted through its platform.",
      "Vihara does not own, finance, inspect, or manage any property listed on its platform. Vihara does not represent the condition, value, legality, habitability, or suitability of any property for any purpose. All property listings, descriptions, images, and associated information are provided solely by the Seller or their designated representatives and are not verified, endorsed, or warranted by Vihara.",
      "RL Auction Inc. dba Vihara expressly disclaims all liability: legal, civil, financial, regulatory, contractual, equitable, tax-related, environmental, or otherwise — of any nature or kind, whether direct, indirect, incidental, consequential, punitive, or special, arising out of or in connection with: (a) any property listed on its platform; (b) any auction conducted through its platform; (c) any transaction, agreement, or dispute between a Buyer and Seller; (d) the accuracy or completeness of any listing information; (e) the condition of any property; (f) any failure of a transaction to close; or (g) the conduct, acts, or omissions of any Buyer, Seller, broker, agent, lender, escrow holder, title company, or any other third party involved in a transaction.",
      "To the fullest extent permitted by applicable law, including any applicable state Deceptive Trade Practices or consumer-protection statute, to the extent applicable and waivable, and all applicable federal statutes, no claim, action, cause of action, or proceeding of any kind may be brought against RL Auction Inc. dba Vihara arising out of or related to any auction or transaction facilitated through this platform. Use of this platform constitutes the user's irrevocable acknowledgment of Vihara's role as a technology vendor and acceptance of this complete limitation of liability."
    ]
  },
  {
    heading: "Buyer's Premium",
    paragraphs: [
      "A 5% Buyer's Premium will be charged by Vihara on all completed purchases. This fee will be added on top of the winning bid and is the sole responsibility of the Buyer. The total purchase price will therefore equal the winning bid amount plus the 5% Buyer's Premium."
    ]
  },
  {
    heading: "Subject to Seller Acceptance",
    paragraphs: [
      "This property is bank-owned (REO) and is offered \"Subject to Seller Acceptance.\" No bid — including a winning or highest bid — shall constitute a binding, accepted offer to purchase the property unless and until both the Buyer and the Seller have executed a fully signed Purchase and Sale Agreement. The auction process is a solicitation of offers only. Vihara has no authority to accept offers on behalf of the Seller and bears no liability for any Seller's failure or refusal to accept any bid."
    ]
  },
  {
    heading: "Reserve Price & Seller Counter-Bidding",
    paragraphs: [
      "Except for Properties designated as \"Absolute Auction\" or \"Minimum Bid Auction,\" the Seller may establish a confidential minimum selling price (\"Reserve Price\"). The starting bid is not the Reserve Price and does not constitute an offer or guarantee of sale.",
      "To the fullest extent permitted by law, Vihara, as authorized by the Seller, may place counter bids on the Seller’s behalf up to the Reserve Price. Such bids do not constitute a sale or obligate the Seller to sell the Property and will be disclosed as required by applicable law.",
      "The Seller may, in its sole discretion, accept or reject any bid below or above the Reserve Price. No sale is binding unless and until the required Purchase Documents are executed by the Seller and Buyer.",
      "Vihara reserves the right, to the fullest extent permitted by law, to reject or invalidate bids, withdraw a Property, or cancel, suspend, or terminate an Auction Event."
    ]
  },
  {
    heading: "Earnest Money Deposit (EMD)",
    paragraphs: [
      "Winning Bidders are required to submit an Earnest Money Deposit (EMD) equal to 5% of the Total Purchase Price, or $2,500, whichever amount is greater. The EMD must be submitted in accordance with the timing and method specified in the post-auction instructions. Failure to timely submit the required EMD may result in forfeiture of the winning bid status and may subject the Buyer to additional remedies as set forth in the Purchase and Sale Agreement. Vihara is not a party to the escrow, is not responsible for holding any EMD funds, and bears no liability in connection with the receipt, application, forfeiture, or return of any EMD."
    ]
  },
  {
    heading: "EMD Default & Penalty",
    paragraphs: [
      "Failure to submit the required Earnest Money Deposit (EMD) within 2 business days of executing the Purchase and Sale Agreement will constitute an immediate Buyer default.",
      "The winning bid will be automatically cancelled, and any EMD already paid may be forfeited. The Buyer may also be liable for any loss, damages, costs, fees, and expenses incurred by the Seller and/or Vihara as a result of the default, to the fullest extent permitted by the Purchase and Sale Agreement and applicable law.",
      "Vihara reserves the right to suspend or permanently terminate the Buyer’s account and bidding privileges. The Seller may also pursue any additional remedies available under the Purchase and Sale Agreement or applicable law."
    ]
  },
  {
    heading: "Broker Commission Restriction",
    paragraphs: [
      "The Buyer is strictly prohibited from acting as their own real estate broker — whether individually or through any entity in which the Buyer holds partial or full ownership — for the purpose of receiving a broker commission, referral fee, or any similar compensation in connection with the purchase of any property through this platform. This restriction applies regardless of whether the Buyer holds a valid real estate license. Any attempted self-dealing in violation of this restriction voids the Buyer's right to participate in the transaction and may result in bid cancellation."
    ]
  },
  {
    heading: "Deed Type",
    paragraphs: [
      "The Buyer will receive a Special Warranty Deed or its jurisdictional equivalent. A Special Warranty Deed warrants title only against claims arising through or under the Seller and does not warrant against claims or encumbrances arising prior to the Seller's ownership. The Seller makes no warranties of any kind beyond those expressly contained in the Special Warranty Deed. Buyers are strongly encouraged to purchase owner's title insurance at their own expense. Vihara makes no representations regarding title and assumes no liability in connection with title defects, encumbrances, liens, or claims of any nature."
    ]
  },
  {
    heading: "Title & Escrow Fees",
    paragraphs: [
      "Title and escrow fees are estimates only and are not guaranteed by Vihara. Estimated ranges are as follows: Title Fees: Generally $500 – $1,500, depending on the purchase price. Escrow Fees: Generally $850 – $1,375. Actual fees may vary based on the property's location, purchase price, the title and escrow companies utilized, and any other factors specific to the transaction. All fees will be allocated and paid as specified in the executed Purchase and Sale Agreement. Vihara is not a title or escrow company, bears no responsibility for fee accuracy, and assumes no liability in connection with title or escrow services."
    ]
  },
  {
    heading: "HOA / COA Assessments",
    paragraphs: [
      "Any outstanding Homeowners Association (HOA) or Condominium Owners Association (COA) assessments, dues, fines, special assessments, or transfer fees shall be addressed in accordance with the terms of the applicable Purchase and Sale Agreement. Buyers are solely responsible for independently verifying the existence, current status, and amount of any HOA/COA obligations prior to placing a bid. Vihara makes no representations regarding HOA/COA status and assumes no liability in connection with any HOA/COA matters."
    ]
  },
  {
    heading: "As-Is, Where-Is Sale",
    paragraphs: [
      "This property is sold strictly \"AS-IS, WHERE-IS,\" with all faults, defects, and conditions, known and unknown, disclosed and undisclosed. Neither the Seller nor Vihara makes any representations or warranties of any kind, express or implied, including but not limited to: warranties of habitability, fitness for a particular purpose, merchantability, or condition; the accuracy of square footage, lot size, boundaries, or zoning; compliance with local building codes or ordinances; the existence or non-existence of environmental hazards; or any other condition affecting the property.",
      "Buyers are solely and entirely responsible for conducting all independent inspections, investigations, and due diligence prior to placing a bid. Access for inspections may be limited or unavailable. Buyers may not rely on any information provided by Vihara or the Seller as a substitute for independent investigation. To the extent any statutory disclosure obligations apply under the law of the state in which the property is located, the \"as-is\" nature of this sale does not relieve the Seller of any obligation to disclose known material defects affecting the value or desirability of the property to the extent required by applicable law; however, such obligations rest solely with the Seller and not with Vihara."
    ]
  },
  {
    heading: "General Release and Indemnification of RL Auction Inc. dba Vihara",
    paragraphs: [
      "By registering for, accessing, or participating in any auction on Vihara's platform, each Buyer and Seller, to the fullest extent permitted by applicable law:",
      "(a) Releases RL Auction Inc. dba Vihara, and its officers, directors, members, employees, agents, affiliates, successors, and assigns (collectively, \"Vihara Parties\") from any and all claims, demands, causes of action, losses, damages, liabilities, costs, and expenses of any kind or nature whatsoever, whether known or unknown, arising out of or in connection with any property listing, auction, bid, transaction, or use of the platform;",
      "(b) Waives any right to assert claims against the Vihara Parties under any theory of liability, including negligence, strict liability, breach of contract, breach of implied warranty, fraud, misrepresentation, or any statutory theory, to the maximum extent permitted by law; and",
      "(c) Agrees to indemnify, defend, and hold harmless the Vihara Parties from and against any and all third-party claims, losses, liabilities, damages, and expenses (including reasonable attorneys' fees) arising out of or relating to the indemnifying party's participation in any auction or transaction through the platform, violation of these terms, or breach of any applicable law.",
      "This waiver expressly includes unknown claims. To the extent applicable under the law of any jurisdiction, each party hereby waives any statute, rule, or common law doctrine — including provisions analogous to California Civil Code §1542 — that would otherwise limit a general release to claims that were unknown or unsuspected as of the date of execution."
    ]
  }
];

const IMPORTANT_NOTICE = {
  heading: "Important Notice",
  paragraphs: [
    "The information contained in this disclaimer is provided for general informational purposes only and does not constitute legal, tax, financial, or real estate advice. RL Auction Inc. dba Vihara strongly recommends that all prospective Buyers consult with independent legal counsel, a licensed real estate professional, a tax advisor, and/or a title professional before participating in any auction or executing any agreement. All laws and ordinances referenced herein are subject to change. This disclaimer does not supersede any applicable federal, state, or local law."
  ]
};

// ============================================================
// State normalizer — accepts "CA" or "California", returns full name
// ============================================================
const STATE_ABBR_TO_NAME = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri",
  MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio",
  OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont",
  VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
  DC: "District of Columbia"
};

const normalizeState = (state) => {
  if (!state) return "";
  const s = String(state).trim();
  if (s.length === 2) return STATE_ABBR_TO_NAME[s.toUpperCase()] || s;
  return s;
};

// ============================================================
// Per-state compliance sections
// ============================================================

// Texas — full statutory block, parametrized so it is correct for ANY Texas
// property (not just Kingwood). city/county/yearBuilt come from the property.
const texasCompliance = (product = {}) => {
  const city = product.city || "the applicable municipality";
  const county = product.county ? ` (${product.county})` : "";
  const yearBuilt = Number(product.yearBuilt);

  let leadParagraph;
  if (yearBuilt && yearBuilt < 1978) {
    leadParagraph =
      `(f) Lead-Based Paint & Federal Disclosure (42 U.S.C. §4852d): For residential properties built prior to 1978, federal law requires Sellers to disclose the presence of known lead-based paint and lead-based paint hazards and to provide Buyers the opportunity to conduct a risk assessment or inspection. This property was constructed in ${yearBuilt} (prior to 1978) and therefore falls within the scope of this federal disclosure requirement. Buyers remain responsible for independent investigation of any environmental conditions affecting the property. Vihara has no obligation or liability under federal lead disclosure law.`;
  } else if (yearBuilt) {
    leadParagraph =
      `(f) Lead-Based Paint & Federal Disclosure (42 U.S.C. §4852d): For residential properties built prior to 1978, federal law requires Sellers to disclose the presence of known lead-based paint and lead-based paint hazards. This property was constructed in ${yearBuilt} and therefore does not fall within the scope of this federal disclosure requirement; however, Buyers remain responsible for independent investigation of any environmental conditions affecting the property. Vihara has no obligation or liability under federal lead disclosure law.`;
  } else {
    leadParagraph =
      `(f) Lead-Based Paint & Federal Disclosure (42 U.S.C. §4852d): For residential properties built prior to 1978, federal law requires Sellers to disclose the presence of known lead-based paint and lead-based paint hazards and to provide Buyers the opportunity to conduct a risk assessment or inspection. Buyers should independently verify the property's year of construction to determine whether this federal disclosure requirement applies. Vihara has no obligation or liability under federal lead disclosure law.`;
  }

  return {
    heading: "Compliance Notice — Texas Disclosures",
    paragraphs: [
      `This property is located in ${city}, Texas${county}. Buyers are hereby notified of the following applicable local, state, and federal legal frameworks. Vihara makes no representations as to compliance with any of the following and assumes no responsibility or liability therefor. Compliance obligations, where applicable, rest solely with the Seller and/or Buyer as determined by the applicable purchase and sale agreement and governing law.`,
      "(a) Texas Seller's Disclosure Notice — Exemption Applies: Pursuant to Texas Property Code §5.008, sellers of residential real property are generally required to provide a Seller's Disclosure Notice describing the condition of the property. However, §5.008(b) exempts transfers by a trustee, mortgagee, or beneficiary under a deed of trust who has acquired the property through foreclosure or a deed in lieu of foreclosure. Accordingly, as a bank-owned (REO) property acquired through foreclosure, the Seller is exempt from providing the standard Texas Seller's Disclosure Notice. The Seller remains obligated, however, to disclose known material defects affecting the value or desirability of the property to the extent required by applicable law. Buyers are strongly advised to conduct independent due diligence.",
      "(b) Flood Disclosure — Non-Exempt: Notwithstanding any exemption from the standard Seller's Disclosure Notice, Texas Property Code §5.0086 requires the Seller to provide a separate written notice disclosing whether the property is located in a 100-year floodplain, floodway, or flood pool; whether the property has previously flooded; and whether the property is or has been covered by flood insurance. Buyers should independently obtain a flood zone determination, FEMA flood map review, and any applicable elevation certificate prior to bidding.",
      "(c) Property Owners' Association (HOA) Disclosure: This property may be located within a community subject to mandatory membership in one or more property owners' associations governed by the Texas Residential Property Owners Protection Act (Texas Property Code Chapter 209) and related provisions of Texas Property Code §5.012 and §5.013. Buyers are solely responsible for independently verifying the existence, current status, dues, special assessments, resale certificate fees, and any restrictive covenants associated with the applicable HOA(s).",
      "(d) Agency Disclosure: Pursuant to the Texas Real Estate License Act (Texas Occupations Code Chapter 1101) and Texas Real Estate Commission rules, if a licensed real estate broker or sales agent represents the Buyer or Seller in this transaction, the Information About Brokerage Services (IABS) form and applicable agency disclosure must be provided. Vihara is not a licensed real estate broker and does not provide, and is not responsible for providing, any agency disclosure.",
      "(e) Sex Offender Registry: Information regarding registered sex offenders is publicly available through the Texas Department of Public Safety Sex Offender Registry at https://records.txdps.state.tx.us.",
      leadParagraph,
      "(g) Smoke & Carbon Monoxide Detectors: Buyers are advised to independently verify that the property is equipped with smoke detectors and carbon monoxide detectors in compliance with applicable Texas building and fire codes and any local county or municipal requirements. Vihara makes no representation regarding such compliance and assumes no liability in connection therewith.",
      "(h) Fair Housing Act Compliance (42 U.S.C. §3601 et seq.) & Texas Fair Housing Act (Texas Property Code Chapter 301): All auctions and listings on Vihara's platform are conducted in compliance with federal and Texas Fair Housing laws. Vihara does not discriminate on the basis of race, color, national origin, religion, sex, familial status, disability, or any other protected class under applicable federal, state, or local law.",
      "(i) RESPA Compliance (12 U.S.C. §2601 et seq.): Vihara operates as a neutral technology marketplace and does not accept referral fees, kickbacks, or things of value in exchange for steering Buyers or Sellers to any settlement service provider. Vihara is not a settlement service provider under RESPA.",
      "(j) Withholding Requirements: Texas does not impose a state income tax; therefore, no state withholding obligation applies to this transaction. However, the Foreign Investment in Real Property Tax Act (FIRPTA, 26 U.S.C. §1445) may require federal withholding where the Seller is a foreign person. Buyers should consult their tax advisor regarding any applicable withholding obligations. Vihara assumes no liability for withholding obligations.",
      "(k) Municipal Utility District (MUD) Notice: If the property is located within the boundaries of a Municipal Utility District (MUD) or other special utility/improvement district, Texas Water Code §49.452 and related statutes require that Buyers receive written notice disclosing the existence of the district, its tax rate, and outstanding bonded indebtedness prior to closing. Buyers are solely responsible for independently verifying whether the property is located within any such district and obtaining the required notice.",
      "(l) Online Auction — Reserve Bidding Notice: Until the Seller's reserve price has been met, Vihara is authorized to place counter bids on behalf of the Seller. Such counter bids will not result in a sale of the property and will not constitute the winning bid. Once the reserve price has been met, no further counter bids will be placed on the Seller's behalf."
    ]
  };
};

// Generic — address-interpolated, federal law only (safe for any state that
// does not yet have a vetted state-specific block above).
const genericCompliance = (product = {}) => {
  const city = product.city || "the applicable municipality";
  const state = normalizeState(product.state) || "the applicable state";
  const county = product.county ? ` (${product.county})` : "";
  const yearBuilt = Number(product.yearBuilt);

  const leadParagraph =
    yearBuilt && yearBuilt < 1978
      ? `(c) Lead-Based Paint & Federal Disclosure (42 U.S.C. §4852d): This property was constructed in ${yearBuilt} (prior to 1978). Federal law requires Sellers to disclose known lead-based paint and lead-based paint hazards and to provide Buyers the opportunity to conduct a risk assessment or inspection. Vihara has no obligation or liability under federal lead disclosure law.`
      : yearBuilt
      ? `(c) Lead-Based Paint & Federal Disclosure (42 U.S.C. §4852d): This property was constructed in ${yearBuilt}. For residential properties built prior to 1978, federal law requires Sellers to disclose known lead-based paint and lead-based paint hazards; based on the stated year of construction this requirement does not apply. Buyers remain responsible for independent environmental investigation. Vihara has no obligation or liability under federal lead disclosure law.`
      : `(c) Lead-Based Paint & Federal Disclosure (42 U.S.C. §4852d): For residential properties built prior to 1978, federal law requires Sellers to disclose known lead-based paint and lead-based paint hazards. Buyers should independently verify the property's year of construction to determine whether this requirement applies. Vihara has no obligation or liability under federal lead disclosure law.`;

  return {
    heading: `Compliance Notice — ${state} Disclosures`,
    paragraphs: [
      `This property is located in ${city}, ${state}${county}. Buyers are hereby notified that this transaction is subject to applicable local, state, and federal legal frameworks. Vihara makes no representations as to compliance with any of the following and assumes no responsibility or liability therefor. Compliance obligations, where applicable, rest solely with the Seller and/or Buyer as determined by the applicable purchase and sale agreement and governing law.`,
      `(a) Seller's Disclosure & As-Is Sale: This is a bank-owned (REO) property acquired through foreclosure. State seller's-disclosure requirements vary by jurisdiction, and foreclosure/REO transfers are exempt from the standard seller's disclosure in many states. The Seller remains obligated to disclose known material defects to the extent required by the law of ${state}. Buyers are strongly advised to conduct independent due diligence and to confirm the applicable disclosure obligations with counsel licensed in ${state}.`,
      `(b) Flood & Environmental: Buyers should independently obtain a flood zone determination, FEMA flood map review, and any applicable elevation certificate prior to bidding, and should independently investigate any environmental conditions affecting the property.`,
      leadParagraph,
      `(d) Fair Housing Act Compliance (42 U.S.C. §3601 et seq.): All auctions and listings on Vihara's platform are conducted in compliance with the federal Fair Housing Act and any applicable state and local fair housing laws. Vihara does not discriminate on the basis of race, color, national origin, religion, sex, familial status, disability, or any other protected class under applicable law.`,
      `(e) RESPA Compliance (12 U.S.C. §2601 et seq.): Vihara operates as a neutral technology marketplace and does not accept referral fees, kickbacks, or things of value in exchange for steering Buyers or Sellers to any settlement service provider. Vihara is not a settlement service provider under RESPA.`,
      `(f) FIRPTA (26 U.S.C. §1445): Federal withholding may apply where the Seller is a foreign person. Any applicable state withholding is governed by the law of ${state}. Buyers should consult their tax advisor. Vihara assumes no liability for withholding obligations.`,
      `(g) Sex Offender Registry: Information regarding registered sex offenders is publicly available through the ${state} sex offender registry maintained by state or local law enforcement.`,
      `(h) HOA / Special Districts: The property may be subject to mandatory membership in a property owners' or condominium association and/or located within a special utility, improvement, or tax district. Buyers are solely responsible for independently verifying the existence, status, dues, assessments, and any restrictive covenants or district obligations that apply.`,
      `(i) Agency Disclosure: If a licensed real estate broker or sales agent represents either party, any agency-disclosure form required under the law of ${state} must be provided by that licensee. Vihara is not a licensed real estate broker and is not responsible for providing any agency disclosure.`,
      `(j) State & Local Requirements Vary: Additional state and local disclosure, inspection, detector, and closing requirements may apply and vary by jurisdiction. Buyers are solely responsible for identifying and complying with all such requirements and are strongly advised to consult independent legal counsel licensed in ${state}.`,
      `(k) Online Auction — Reserve Bidding Notice: Until the Seller's reserve price has been met, Vihara is authorized to place counter bids on behalf of the Seller. Such counter bids will not result in a sale and will not constitute the winning bid. Once the reserve price has been met, no further counter bids will be placed on the Seller's behalf.`
    ]
  };
};

// Map of vetted state-specific blocks. Add new states here as you get vetted
// text (e.g. California: californiaCompliance). Anything not listed falls back
// to genericCompliance automatically.
const STATE_COMPLIANCE = {
  Texas: texasCompliance
};

// Optional: fully bespoke per-property override, keyed by property slug.
// Leave empty unless a single property needs custom text.
const PROPERTY_COMPLIANCE_BY_SLUG = {
  // "1703-brookside-pine-ln-kingwood": (product) => ({ heading: "...", paragraphs: ["..."] })
};

// ============================================================
// Resolver — call this with the property to get its disclaimers
// ============================================================
const getPropertyDisclaimers = (product = {}) => {
  const state = normalizeState(product?.state);
  const slug = product?.slug;

  let compliance;
  if (slug && PROPERTY_COMPLIANCE_BY_SLUG[slug]) {
    compliance = PROPERTY_COMPLIANCE_BY_SLUG[slug](product);
  } else if (STATE_COMPLIANCE[state]) {
    compliance = STATE_COMPLIANCE[state](product);
  } else {
    compliance = genericCompliance(product);
  }

  return {
    bulletDisclaimers,
    legalSections: [...COMMON_SECTIONS, compliance, IMPORTANT_NOTICE]
  };
};

// State-neutral default (no property-specific compliance section), used by the
// live auction room's terms modal.
const legalSections = [...COMMON_SECTIONS, IMPORTANT_NOTICE];

module.exports = {
  bulletDisclaimers,
  legalSections,
  getPropertyDisclaimers
};
