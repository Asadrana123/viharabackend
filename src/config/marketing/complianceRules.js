// config/marketing/complianceRules.js
//
// Every PRD compliance rule as data. complianceChecker.js turns these into
// regexes and runs them on every generated or edited line. No AI.
//
//   terms        - whole words / phrases (spaces also match hyphens)
//   patterns     - raw regex sources for things terms can't express
//   buyerTypes   - only enforced for these buyer types (omit = all)
//   onlyWhenFinancingUnconfirmed - only enforced while financingTermsConfirmed is false
//   placeholder  - what [NEEDS INPUT: ...] says when this rule can't be fixed
//                  (a hard stop). Omit to use the line's own label.
//
// The "only verified dollar amounts" rule needs the brief's numbers, so it
// lives in complianceChecker.js as UNVERIFIED_DOLLAR_RULE.

const { BUYER_TYPES } = require("./marketingConstants");

const HOME_BUYER_TYPES = [BUYER_TYPES.OWNER_OCCUPANT, BUYER_TYPES.RETAIL];

const COMPLIANCE_RULES = Object.freeze([
    {
        id: "no-percentages",
        label: "No percentages",
        message: "Use dollar figures only. Percentage claims are not allowed.",
        patterns: ["\\d+(?:\\.\\d+)?\\s*%", "\\bper\\s?cent(?:age)?s?\\b"],
    },
    {
        id: "fair-housing",
        label: "Fair Housing",
        message: "Group-preference language is not allowed (Meta Housing Special Ad Category).",
        terms: [
            "perfect for families", "ideal for families", "great for families", "family friendly",
            "family home", "families", "kids", "children", "child", "great for kids",
            "young professionals", "young couple", "couples", "singles", "bachelor", "bachelor pad",
            "newlyweds", "retirees", "retirement", "seniors", "senior living", "empty nesters",
            "adults only", "no children", "elderly", "students",
            "christian", "church", "churches", "synagogue", "mosque",
            "exclusive neighborhood", "exclusive community", "safe neighborhood", "safe area",
            "crime free", "ethnic", "handicapped", "able bodied", "his and hers",
        ],
    },
    {
        id: "no-guaranteed-returns",
        label: "No guaranteed returns",
        message: "Guaranteed-return and appreciation claims are not allowed.",
        terms: [
            "guaranteed", "guarantee", "guarantees", "risk free", "no risk", "can't lose",
            "cannot lose", "sure thing", "sure bet", "double your money", "instant equity",
            "guaranteed return", "guaranteed profit", "appreciation", "will appreciate",
        ],
        patterns: ["\\bwill\\s+(?:increase|rise|grow|go\\s+up)\\s+in\\s+value\\b", "\\bvalue\\s+will\\s+(?:rise|increase|grow|go\\s+up)\\b"],
    },
    {
        id: "no-investment-framing",
        label: "No investment framing for home buyers",
        message: "Investment, rent or yield language is not allowed in home-buyer copy.",
        buyerTypes: HOME_BUYER_TYPES,
        terms: [
            "roi", "return on investment", "cash flow", "cash flowing", "rental income",
            "rent yield", "rental yield", "yield", "cap rate", "investment property",
            "investor", "investors", "investment", "flip", "flipping", "flipper", "rental", "landlord",
        ],
    },
    {
        id: "no-auction-jargon",
        label: "No auction jargon for home buyers",
        message: "Words like bid, REO, foreclosure or distressed are not allowed in home-buyer copy.",
        buyerTypes: HOME_BUYER_TYPES,
        terms: ["reo", "distressed", "trustee sale", "short sale", "bank owned"],
        patterns: ["\\bbid(?:s|ding|der|ders)?\\b", "\\bforeclos\\w*"],
    },
    {
        id: "no-unconfirmed-financing",
        label: "No financing claims (terms not confirmed)",
        message: "Financing, contingency and closing claims need confirmed auction terms.",
        buyerTypes: HOME_BUYER_TYPES,
        onlyWhenFinancingUnconfirmed: true,
        placeholder: "confirmed financing terms",
        terms: [
            "mortgage", "mortgages", "financing", "financeable", "finance", "financed", "loan", "loans",
            "lender", "lenders", "fha", "va loan", "conventional loan", "down payment",
            "pre approved", "preapproved", "pre approval", "contingency", "contingencies",
            "closing costs", "close of escrow", "escrow", "earnest money",
        ],
    },
    {
        id: "no-em-dash",
        label: "No em dashes",
        message: "House style: no em dashes.",
        patterns: ["\\u2014"],
    },
]);

module.exports = { COMPLIANCE_RULES };
