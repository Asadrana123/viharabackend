// scripts/gaOAuthLogin.js
//
// One-time login that gets a refresh token for the daily GA4 report.
// Prints the token in this terminal only. It writes nothing to disk and posts nothing.
//
// Usage:
//   GA_OAUTH_CLIENT_ID=... GA_OAUTH_CLIENT_SECRET=... node src/scripts/gaOAuthLogin.js
// (or put both in .env first; this script loads it)
//
// Open the printed link in a browser signed in as the Google user that has access to the GA4 property
// (info@vihara.ai), approve the read-only access, and copy the token into GA_OAUTH_REFRESH_TOKEN.
// Treat the token like a password: .env and Render only, never chat, git or Slack.

require("dotenv").config();
const http = require("http");
const { OAuth2Client } = require("google-auth-library");

const SCOPE = "https://www.googleapis.com/auth/analytics.readonly";
const PORT = 53682;
const REDIRECT_URI = `http://127.0.0.1:${PORT}`;

async function main() {
    const { GA_OAUTH_CLIENT_ID, GA_OAUTH_CLIENT_SECRET } = process.env;
    if (!GA_OAUTH_CLIENT_ID || !GA_OAUTH_CLIENT_SECRET) {
        console.error("Set GA_OAUTH_CLIENT_ID and GA_OAUTH_CLIENT_SECRET first (see .env).");
        process.exit(1);
    }
    const oauth = new OAuth2Client(GA_OAUTH_CLIENT_ID, GA_OAUTH_CLIENT_SECRET, REDIRECT_URI);
    const url = oauth.generateAuthUrl({
        access_type: "offline", // needed to get a refresh token
        prompt: "consent", // forces a refresh token even if this client was approved before
        scope: [SCOPE],
    });

    const code = await new Promise((resolve, reject) => {
        const server = http.createServer((req, res) => {
            const params = new URL(req.url, REDIRECT_URI).searchParams;
            const error = params.get("error");
            const got = params.get("code");
            res.setHeader("Content-Type", "text/plain");
            res.end(got ? "Done. You can close this tab and go back to the terminal." : "No code received. Check the terminal.");
            server.close();
            if (got) resolve(got);
            else reject(new Error(error ? `Login failed: ${error}` : "Login failed: no code in the redirect"));
        });
        server.on("error", reject);
        server.listen(PORT, "127.0.0.1", () => {
            console.log("Open this link in a browser signed in as the GA4 user:\n");
            console.log(url + "\n");
            console.log(`Waiting for the login on ${REDIRECT_URI} ...`);
        });
    });

    const { tokens } = await oauth.getToken(code);
    if (!tokens.refresh_token) {
        console.error("Google did not return a refresh token. Remove this app at https://myaccount.google.com/permissions and run again.");
        process.exit(1);
    }
    console.log("\nSuccess. Put this in .env (and later Render):\n");
    console.log(`GA_OAUTH_REFRESH_TOKEN=${tokens.refresh_token}\n`);
}

main().catch((e) => {
    console.error(e.message);
    process.exit(1);
});
