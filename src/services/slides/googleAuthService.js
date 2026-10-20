// services/slides/googleAuthService.js
//
// Google sign-in for the Slides agent. One Vihara Google account is connected
// from the admin panel; every deck is made with it.
//
// Env:
//   GOOGLE_SLIDES_CLIENT_ID / GOOGLE_SLIDES_CLIENT_SECRET — OAuth client
//     ("Web application") from Google Cloud project vihara-slides-agent
//   GOOGLE_SLIDES_REDIRECT_URI — e.g. http://localhost:5000/api/v1/google-slides/callback
//     (must match "Authorized redirect URIs" on that client exactly)
//   GOOGLE_SLIDES_TOKEN_KEY — encrypts the stored refresh token (32 bytes, hex or base64; see utils/secretBox)
const { OAuth2Client } = require("google-auth-library");
const Connection = require("../../model/integrations/googleSlidesConnectionModel");
const { encryptCredentials, decryptCredentials } = require("../../utils/secretBox");

const TOKEN_KEY_ENV = "GOOGLE_SLIDES_TOKEN_KEY";

const SCOPES = [
  "openid",
  "email",
  // Create and edit decks
  "https://www.googleapis.com/auth/presentations",
  // Copy the Vihara template and save new decks in Drive
  "https://www.googleapis.com/auth/drive",
];

function newClient() {
  const { GOOGLE_SLIDES_CLIENT_ID, GOOGLE_SLIDES_CLIENT_SECRET, GOOGLE_SLIDES_REDIRECT_URI } = process.env;
  if (!GOOGLE_SLIDES_CLIENT_ID || !GOOGLE_SLIDES_CLIENT_SECRET || !GOOGLE_SLIDES_REDIRECT_URI) {
    throw new Error("Google Slides is not set up: GOOGLE_SLIDES_CLIENT_ID, GOOGLE_SLIDES_CLIENT_SECRET and GOOGLE_SLIDES_REDIRECT_URI are required");
  }
  return new OAuth2Client({
    clientId: GOOGLE_SLIDES_CLIENT_ID,
    clientSecret: GOOGLE_SLIDES_CLIENT_SECRET,
    redirectUri: GOOGLE_SLIDES_REDIRECT_URI,
  });
}

// The Google page the admin is sent to. `state` comes back on the callback.
function getAuthUrl(state) {
  return newClient().generateAuthUrl({
    access_type: "offline", // gives a refresh token, so decks can be made later without signing in again
    prompt: "consent", // always return a refresh token, even on a reconnect
    scope: SCOPES,
    state,
  });
}

// Turns the code from Google's callback into a saved connection.
async function saveConnectionFromCode(code, admin) {
  const client = newClient();
  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) throw new Error("Google did not return a refresh token. Please try connecting again.");

  const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: process.env.GOOGLE_SLIDES_CLIENT_ID });
  const googleEmail = ticket.getPayload()?.email || "";

  return Connection.findOneAndUpdate(
    { key: "default" },
    {
      $set: {
        googleEmail,
        scopes: (tokens.scope || "").split(" ").filter(Boolean),
        refreshToken: encryptCredentials({ refreshToken: tokens.refresh_token }, TOKEN_KEY_ENV),
        connectedById: admin.id,
        connectedByName: admin.name,
      },
    },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  );
}

// An OAuth client signed in as the connected account, for the Slides/Drive
// calls. Access tokens are refreshed automatically. Null when not connected.
async function getAuthorizedClient() {
  const saved = await Connection.findOne({ key: "default" });
  if (!saved) return null;
  const client = newClient();
  client.setCredentials({ refresh_token: decryptCredentials(saved.refreshToken, TOKEN_KEY_ENV).refreshToken });
  return client;
}

async function getConnectionStatus() {
  const saved = await Connection.findOne({ key: "default" }).select("googleEmail connectedByName updatedAt");
  if (!saved) return { connected: false };
  return {
    connected: true,
    googleEmail: saved.googleEmail,
    connectedByName: saved.connectedByName,
    connectedAt: saved.updatedAt,
  };
}

// Removes the connection and tells Google to cancel the token.
async function disconnect() {
  const saved = await Connection.findOne({ key: "default" });
  if (!saved) return;
  try {
    await newClient().revokeToken(decryptCredentials(saved.refreshToken, TOKEN_KEY_ENV).refreshToken);
  } catch (e) {
    // Already revoked or expired on Google's side; removing it here is what matters.
    console.warn("Google Slides: token revoke failed:", e.message);
  }
  await Connection.deleteOne({ key: "default" });
}

module.exports = { getAuthUrl, saveConnectionFromCode, getAuthorizedClient, getConnectionStatus, disconnect };
