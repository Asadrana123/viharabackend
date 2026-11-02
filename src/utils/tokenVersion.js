// utils/tokenVersion.js
//
// Each user / realtor has a tokenVersion that goes into their login token as
// "tv". Changing or resetting the password bumps it, so every older token (other
// devices, or a stolen one) stops working. Accounts and tokens from before this
// existed both count as 0, so nobody is signed out when it ships.

const tokenVersionMatches = (decoded, account) =>
  (decoded?.tv || 0) === (account?.tokenVersion || 0);

module.exports = { tokenVersionMatches };
