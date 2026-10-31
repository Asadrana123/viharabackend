// services/studio/cutStorage.js
//
// Video cuts for the Studio's player, in a private DigitalOcean Spaces bucket. The keys stay here:
// the Creative OS gets a short-lived link to upload one file, and a signed-in person's page gets a
// short-lived link to watch it. Nothing in the bucket is public.
//
// Env: SPACES_KEY, SPACES_SECRET, SPACES_REGION (e.g. nyc3), SPACES_BUCKET.

const { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const SHA256 = /^[a-f0-9]{64}$/;
const FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,100}\.mp4$/;
const MAX_BYTES = 500 * 1e6;
const UPLOAD_SECONDS = 15 * 60;
const VIEW_SECONDS = 2 * 60 * 60;

let cached;

function storage(env = process.env) {
  if (!env.SPACES_KEY || !env.SPACES_SECRET || !env.SPACES_REGION || !env.SPACES_BUCKET) return null;
  if (!cached || cached.env !== env) {
    const client = new S3Client({
      endpoint: `https://${env.SPACES_REGION}.digitaloceanspaces.com`,
      // Spaces signs with this fixed region name; the endpoint picks the real one.
      region: "us-east-1",
      credentials: { accessKeyId: env.SPACES_KEY, secretAccessKey: env.SPACES_SECRET },
      // Spaces does not take the checksums newer SDKs add to a signed upload by default.
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
    cached = { env, client, bucket: env.SPACES_BUCKET };
  }
  return cached;
}

/** Checks what the Creative OS says about a cut, and returns the fields stored. */
function cleanCut(coreId, cut) {
  const sha256 = String(cut?.sha256 ?? "");
  const name = String(cut?.name ?? "");
  const bytes = Number(cut?.bytes);
  if (!SHA256.test(sha256)) throw new Error("A cut needs its SHA-256.");
  if (!FILE_NAME.test(name)) throw new Error("A cut is an .mp4 with a plain file name.");
  if (!Number.isInteger(bytes) || bytes < 1 || bytes > MAX_BYTES) throw new Error(`A cut is 1 byte to ${MAX_BYTES / 1e6} MB.`);
  // Named by content, so a new cut never replaces the file behind a link already handed out.
  return { key: `cuts/${coreId}/${sha256}.mp4`, name, sha256, bytes };
}

async function uploadUrl(key, env = process.env) {
  const s = storage(env);
  if (!s) return null;
  return getSignedUrl(s.client, new PutObjectCommand({ Bucket: s.bucket, Key: key, ContentType: "video/mp4" }), { expiresIn: UPLOAD_SECONDS });
}

async function viewUrl(key, env = process.env) {
  const s = storage(env);
  if (!s || !key) return null;
  return getSignedUrl(s.client, new GetObjectCommand({ Bucket: s.bucket, Key: key }), { expiresIn: VIEW_SECONDS });
}

/** The uploaded file's size, or null when it is not there. */
async function storedBytes(key, env = process.env) {
  const s = storage(env);
  if (!s) return null;
  try {
    const head = await s.client.send(new HeadObjectCommand({ Bucket: s.bucket, Key: key }));
    return head.ContentLength ?? null;
  } catch (e) {
    if (e?.$metadata?.httpStatusCode === 404) return null;
    throw e;
  }
}

module.exports = { storage, cleanCut, uploadUrl, viewUrl, storedBytes };
