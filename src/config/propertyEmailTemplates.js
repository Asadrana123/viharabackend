// config/propertyEmailTemplates.js
//
// Brevo transactional templates for the backend property email sequence
// (see "Vihara Property Email System: Logic and Developer Spec", section 5).
// Marketing edits the wording in Brevo; the IDs and fields never change.
//
// Phase 1 only sends the instant emails (E1, R1, R2, PT1). The rest are listed
// so the scheduler (phase 2) and pre-market/matching (phase 3) use the same map.
// EA1, D0 and RV1 have no template yet (null = never sent).
//
// E1 and R1 point at marketing's Oct 26 rebuilds (FOR-ASAD-emails.md): 246
// replaces 198, 263 ("You're registered", no verification step) replaces 210.
// They are INACTIVE in Brevo until launch day; activate them before deploying.

const PROPERTY_EMAIL_TEMPLATES = {
  EA1: null,
  D0: null,
  RV1: null,
  E1: 246,
  E2: 219,
  E3: 220,
  E4: 221,
  D1: 207,
  R1: 263,
  R2: 211,
  V1: 213,
  C1: 222,
  C2: 214,
  C3: 215,
  C4: 216,
  W1: 217,
  L1: 218,
  X1: 205,
  WD1: 212,
  PT1: 208,
};

module.exports = { PROPERTY_EMAIL_TEMPLATES };
