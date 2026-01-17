// utils/cookieOptions.js

const getCookieOptions = () => {
  const isProduction = process.env.NODE_ENV === "production";

  return {
    httpOnly: true,
    path: "/",
    // Local: secure=false, sameSite='lax'
    // Production: secure=true, sameSite='none'
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
  };
};

module.exports = getCookieOptions;