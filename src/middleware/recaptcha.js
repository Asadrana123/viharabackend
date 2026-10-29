// middleware/recaptcha.js
//
// Google reCAPTCHA ("I'm not a robot" checkbox) check for public forms.
// The frontend sends the widget's token as a `recaptchaToken` body field (or
// the `x-recaptcha-token` header), and this middleware asks Google whether
// the token is real before the route runs. The body field is removed first,
// so controllers never see it.
//
// The key lives in the Google Cloud project RECAPTCHA_PROJECT_ID (keys made
// there have no legacy secret), so the check is a createAssessment call made
// with a Cloud API key restricted to the reCAPTCHA Enterprise API.
//
// Inert unless RECAPTCHA_API_KEY is set, the same "stays off until
// configured" pattern as middleware/vtextEnabled.js, so the backend can ship
// before the keys exist. Requests carrying the valid QA agent token skip the
// check: the QA worker drives the forms headlessly and cannot tick the box.
const axios = require("axios");
const { hasValidQaAgentToken } = require("./qaAgentAuth");

const clientIp = (req) =>
  String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.ip || "";

let warnedUnconfigured = false;

async function verifyRecaptcha(req, res, next) {
  const bodyToken = req.body?.recaptchaToken;
  if (req.body && "recaptchaToken" in req.body) delete req.body.recaptchaToken;

  const apiKey = process.env.RECAPTCHA_API_KEY;
  if (!apiKey) {
    if (!warnedUnconfigured) {
      console.warn("[recaptcha] RECAPTCHA_API_KEY is not set; captcha checks are off");
      warnedUnconfigured = true;
    }
    return next();
  }
  if (hasValidQaAgentToken(req)) return next();

  const token = String(req.get("x-recaptcha-token") || bodyToken || "");
  if (!token) {
    return res.status(400).json({ success: false, message: "Please tick \"I'm not a robot\" and try again." });
  }

  try {
    const url = `https://recaptchaenterprise.googleapis.com/v1/projects/${encodeURIComponent(process.env.RECAPTCHA_PROJECT_ID || "")}/assessments`;
    const { data } = await axios.post(
      url,
      {
        event: {
          token,
          siteKey: process.env.RECAPTCHA_SITE_KEY,
          userIpAddress: clientIp(req) || undefined,
          userAgent: req.get("user-agent") || undefined,
        },
      },
      { params: { key: apiKey }, timeout: 10000 }
    );
    if (!data?.tokenProperties?.valid) {
      // Expired or already-used tokens land here too (one check per token, valid 2 minutes).
      return res.status(400).json({ success: false, message: "The captcha check failed or expired. Please tick \"I'm not a robot\" again." });
    }
    next();
  } catch (error) {
    console.error("[recaptcha] assessment request failed:", error.response?.data?.error?.message || error.message);
    return res.status(503).json({ success: false, message: "We couldn't check the captcha right now. Please try again in a moment." });
  }
}

module.exports = { verifyRecaptcha };
