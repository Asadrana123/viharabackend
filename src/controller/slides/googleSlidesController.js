// controller/slides/googleSlidesController.js
//
// Connect / disconnect the Google account the Slides agent uses.
// Flow: admin panel calls GET /connect → gets Google's URL → admin signs in →
// Google sends them to GET /callback → we save the token and send them back
// to the admin panel's Slides Agent tab.
const jwt = require("jsonwebtoken");
const catchAsyncError = require("../../middleware/catchAsyncError");
const ErrorHandler = require("../../utils/errorhandler");
const googleAuth = require("../../services/slides/googleAuthService");

const STATE_PURPOSE = "google-slides-connect";

const adminName = (user) =>
  [user?.name, user?.last_name].filter(Boolean).join(" ") || user?.email || "Admin";

// Where the admin lands after Google. `result` is shown on the page.
const backToAdmin = (res, result) =>
  res.redirect(`${process.env.CLIENT_URL}/admin/dashboard?tab=slidesAgent&google=${result}`);

exports.getStatus = catchAsyncError(async (req, res) => {
  res.status(200).json({ success: true, ...(await googleAuth.getConnectionStatus()) });
});

// Returns the Google sign-in URL. The admin's id travels in a signed, short-lived
// `state`, because the callback comes from Google and has no admin cookie check.
exports.connect = catchAsyncError(async (req, res, next) => {
  // A GET, so isAuthenticated's read-only rule doesn't catch it — but it ends in a write.
  if (req.user.isQaAccount) return next(new ErrorHandler("QA agent admin accounts are read-only", 403));
  const state = jwt.sign(
    { purpose: STATE_PURPOSE, id: String(req.user._id), name: adminName(req.user) },
    process.env.secret,
    { expiresIn: "30m" }
  );
  try {
    res.status(200).json({ success: true, url: googleAuth.getAuthUrl(state) });
  } catch (e) {
    return next(new ErrorHandler(e.message, 500));
  }
});

exports.callback = async (req, res) => {
  const { code, state, error } = req.query;
  if (error) return backToAdmin(res, "denied"); // admin pressed Cancel on Google's page

  let admin;
  try {
    admin = jwt.verify(state, process.env.secret);
    if (admin.purpose !== STATE_PURPOSE) throw new Error("wrong state");
  } catch {
    return backToAdmin(res, "expired");
  }

  try {
    await googleAuth.saveConnectionFromCode(code, admin);
    backToAdmin(res, "connected");
  } catch (e) {
    console.error("Google Slides connect failed:", e.message);
    backToAdmin(res, "failed");
  }
};

exports.disconnect = catchAsyncError(async (req, res) => {
  await googleAuth.disconnect();
  res.status(200).json({ success: true, connected: false });
});
