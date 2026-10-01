// controller/sendify/sendifyStatsController.js
const catchAsyncError = require("../../middleware/catchAsyncError");
const SendifyMessage = require("../../model/sendify/sendifyMessageModel");
const SendifyLine = require("../../model/sendify/sendifyLineModel");
const SendifyLineUsage = require("../../model/sendify/sendifyLineUsageModel");
const capacity = require("../../services/sendify/sendifyCapacityService");

/** GET /api/v1/sendify/stats/overview — today's sent/delivered/failed/inbound/opt-outs, plus per-line utilization. */
const getStatsOverview = catchAsyncError(async (req, res) => {
  const day = capacity.dayKey();
  const startOfDay = new Date(day + "T00:00:00");

  const [sentToday, deliveredToday, failedToday, inboundToday, optOutsToday, lines] = await Promise.all([
    SendifyMessage.countDocuments({ direction: "out", sentAt: { $gte: startOfDay } }),
    SendifyMessage.countDocuments({ direction: "out", deliveredAt: { $gte: startOfDay } }),
    SendifyMessage.countDocuments({ direction: "out", status: "failed", updatedAt: { $gte: startOfDay } }),
    SendifyMessage.countDocuments({ direction: "in", receivedAt: { $gte: startOfDay } }),
    require("../../model/sendify/sendifyContactModel").countDocuments({ "optOut.at": { $gte: startOfDay } }),
    SendifyLine.find({ status: { $ne: "retired" } }),
  ]);

  const usageRows = await SendifyLineUsage.find({ lineId: { $in: lines.map((l) => l._id) }, day });
  const usageByLine = new Map(usageRows.map((u) => [String(u.lineId), u]));

  const lineUtilization = lines.map((line) => {
    const usage = usageByLine.get(String(line._id));
    const cap = capacity.effectiveDailyCap(line);
    return {
      lineId: line._id,
      name: line.name,
      status: line.status,
      assigned: usage?.assigned || 0,
      cap,
      utilizationPct: cap > 0 ? Math.round(((usage?.assigned || 0) / cap) * 100) : 0,
    };
  });

  return res.status(200).json({
    success: true,
    day,
    sentToday,
    deliveredToday,
    failedToday,
    inboundToday,
    optOutsToday,
    lineUtilization,
  });
});

module.exports = { getStatsOverview };
