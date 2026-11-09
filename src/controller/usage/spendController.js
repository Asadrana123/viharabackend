// controller/usage/spendController.js - the admin page's AI Spend tab, and the Creative OS's push
const catchAsyncError = require("../../middleware/catchAsyncError");
const ErrorHandler = require("../../utils/errorhandler");
const { spendReport } = require("../../services/usage/spendReport");
const { cleanPush, storePush } = require("../../services/usage/spendSync");

/** GET /api/v1/admin-spend?range=7d|30d|90d|month|lastMonth&from&to&feature&tz  (admins) */
const getSpend = catchAsyncError(async (req, res, next) => {
  let report;
  try {
    report = await spendReport(req.query);
  } catch (e) {
    if (/start date/.test(e.message)) return next(new ErrorHandler(e.message, 400));
    throw e;
  }
  res.status(200).json({ success: true, data: report });
});

/** POST /api/v1/admin-spend/sync  { items, balances }  (the Creative OS, with STUDIO_SYNC_KEY) */
const syncSpend = catchAsyncError(async (req, res, next) => {
  let push;
  try {
    push = cleanPush(req.body);
  } catch (e) {
    return next(new ErrorHandler(e.message, 400));
  }
  const result = await storePush(push);
  res.status(200).json({ success: true, ...result });
});

module.exports = { getSpend, syncSpend };
