// utils/clientIp.js
//
// The visitor's real IP, for rate limits, reCAPTCHA and Meta CAPI.
//
// Render puts Cloudflare in front of the API. Cloudflare sets CF-Connecting-IP
// to the address that connected to it and overwrites any value the visitor
// sends, so it can't be faked. X-Forwarded-For is NOT used: its first entry is
// whatever the visitor typed, so a script could get a fresh rate limit on
// every request by sending a random one.
//
// Without Cloudflare (local dev) this falls back to the socket address. The
// first request logs which source was used, so the Render logs show whether
// the header is arriving.

let loggedSource = false;

const header = (req, name) => {
  const v = req.headers?.[name];
  return String(Array.isArray(v) ? v[0] : v || "").trim();
};

function clientIp(req) {
  let source = "cf-connecting-ip";
  let ip = header(req, "cf-connecting-ip");
  if (!ip) {
    source = "true-client-ip";
    ip = header(req, "true-client-ip");
  }
  if (!ip) {
    source = "socket";
    ip = req.ip || req.socket?.remoteAddress || "";
  }
  if (!loggedSource) {
    loggedSource = true;
    console.log(`[clientIp] visitor IP taken from ${source}`);
  }
  return ip;
}

module.exports = { clientIp };
