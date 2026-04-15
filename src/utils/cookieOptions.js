// utils/cookieOptions.js

const getCookieOptions = () => {
  const isProduction = process.env.NODE_ENV === "production";

  return {
    httpOnly: true,
    path: "/",
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    ...(isProduction && { domain: ".vihara.ai" }),
  };
};

module.exports = getCookieOptions;