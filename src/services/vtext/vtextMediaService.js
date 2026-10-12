// services/vtext/vtextMediaService.js
//
// The images a text can carry (today: the follow-up memes). They live in
// src/assets/vtext/memes and ship with the backend. A message stores only the
// file name (message.media.file); the bytes are read here when the channel sends.
const fs = require("fs");
const path = require("path");

const MEDIA_DIR = path.join(__dirname, "..", "..", "assets", "vtext", "memes");
const MIME_TYPES = { ".jpeg": "image/jpeg", ".jpg": "image/jpeg", ".png": "image/png", ".gif": "image/gif" };

const cache = new Map(); // file name -> { buffer, mimeType }; three small files, so they are kept in memory

/**
 * @param {string} file - a bare file name inside the memes folder, e.g. "meme1.jpeg"
 * @returns {{ name: string, buffer: Buffer, mimeType: string }}
 * @throws if the name is not a plain file name, the type is unsupported, or the file is missing
 */
function loadMedia(file) {
  if (typeof file !== "string" || path.basename(file) !== file) {
    throw new Error(`[vtext media] "${file}" is not a plain file name`);
  }
  const mimeType = MIME_TYPES[path.extname(file).toLowerCase()];
  if (!mimeType) throw new Error(`[vtext media] "${file}" is not a supported image type`);

  if (!cache.has(file)) {
    cache.set(file, { buffer: fs.readFileSync(path.join(MEDIA_DIR, file)), mimeType });
  }
  const { buffer } = cache.get(file);
  return { name: file, buffer, mimeType };
}

module.exports = { loadMedia, MEDIA_DIR };
