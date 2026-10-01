// utils/secretBox.js
//
// AES-256-GCM encrypt/decrypt for line credentials (sendifyLineModel.credentials).
// Lines get added through the admin UI, not env vars, so there's no static
// config file to keep secrets out of — this is what keeps them out of Mongo
// in plaintext instead. Key comes from SENDIFY_SECRETS_KEY (32 bytes, base64
// or hex — see deriveKey below for the exact format expected).
const crypto = require("crypto");

const ALGO = "aes-256-gcm";
const IV_LENGTH = 12; // GCM's recommended IV length

function deriveKey() {
  const raw = process.env.SENDIFY_SECRETS_KEY;
  if (!raw) {
    throw new Error("SENDIFY_SECRETS_KEY is not set — cannot encrypt/decrypt Sendify line credentials");
  }
  // Accept either a 64-char hex string or a base64 string that decodes to 32 bytes.
  let key;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    key = Buffer.from(raw, "hex");
  } else {
    key = Buffer.from(raw, "base64");
  }
  if (key.length !== 32) {
    throw new Error("SENDIFY_SECRETS_KEY must decode to exactly 32 bytes (64 hex chars, or base64 of 32 bytes)");
  }
  return key;
}

/**
 * @param {object} plainObject - arbitrary JSON-serializable credentials, e.g. { username, password, webhookSigningKey }
 * @returns {{ iv: string, tag: string, ciphertext: string }} all base64, ready to store on sendifyLineModel.credentials
 */
function encryptCredentials(plainObject) {
  const key = deriveKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const plaintext = Buffer.from(JSON.stringify(plainObject), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}

/**
 * @param {{ iv: string, tag: string, ciphertext: string }} encrypted
 * @returns {object} the original plain credentials object
 */
function decryptCredentials(encrypted) {
  if (!encrypted || !encrypted.iv || !encrypted.tag || !encrypted.ciphertext) {
    throw new Error("decryptCredentials: missing iv/tag/ciphertext");
  }
  const key = deriveKey();
  const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(encrypted.iv, "base64"));
  decipher.setAuthTag(Buffer.from(encrypted.tag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, "base64")),
    decipher.final(),
  ]);
  return JSON.parse(plaintext.toString("utf8"));
}

module.exports = { encryptCredentials, decryptCredentials };
