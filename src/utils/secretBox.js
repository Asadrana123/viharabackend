// utils/secretBox.js
//
// AES-256-GCM encrypt/decrypt for line credentials (vtextLineModel.credentials)
// and other stored secrets (e.g. the Google Slides token, which passes its own key name).
// Lines get added through the admin UI, not env vars, so there's no static
// config file to keep secrets out of — this is what keeps them out of Mongo
// in plaintext instead. Key comes from VTEXT_SECRETS_KEY (32 bytes, base64
// or hex — see deriveKey below for the exact format expected).
const crypto = require("crypto");

const ALGO = "aes-256-gcm";
const IV_LENGTH = 12; // GCM's recommended IV length

function deriveKey(keyEnv = "VTEXT_SECRETS_KEY") {
  const raw = process.env[keyEnv];
  if (!raw) {
    throw new Error(`${keyEnv} is not set — cannot encrypt/decrypt stored credentials`);
  }
  // Accept either a 64-char hex string or a base64 string that decodes to 32 bytes.
  let key;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    key = Buffer.from(raw, "hex");
  } else {
    key = Buffer.from(raw, "base64");
  }
  if (key.length !== 32) {
    throw new Error(`${keyEnv} must decode to exactly 32 bytes (64 hex chars, or base64 of 32 bytes)`);
  }
  return key;
}

/**
 * @param {object} plainObject - arbitrary JSON-serializable credentials, e.g. { username, password, webhookSigningKey }
 * @param {string} [keyEnv] - env var holding the key; defaults to VTEXT_SECRETS_KEY
 * @returns {{ iv: string, tag: string, ciphertext: string }} all base64, ready to store on vtextLineModel.credentials
 */
function encryptCredentials(plainObject, keyEnv) {
  const key = deriveKey(keyEnv);
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
 * @param {string} [keyEnv] - env var holding the key; defaults to VTEXT_SECRETS_KEY
 * @returns {object} the original plain credentials object
 */
function decryptCredentials(encrypted, keyEnv) {
  if (!encrypted || !encrypted.iv || !encrypted.tag || !encrypted.ciphertext) {
    throw new Error("decryptCredentials: missing iv/tag/ciphertext");
  }
  const key = deriveKey(keyEnv);
  const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(encrypted.iv, "base64"));
  decipher.setAuthTag(Buffer.from(encrypted.tag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, "base64")),
    decipher.final(),
  ]);
  return JSON.parse(plaintext.toString("utf8"));
}

module.exports = { encryptCredentials, decryptCredentials };
