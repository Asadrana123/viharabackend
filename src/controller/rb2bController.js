// controller/rb2bController.js
const catchAsyncError = require("../middleware/catchAsyncError");
const RB2BVisitor = require("../model/rb2bVisitorModel");

/**
 * RB2B's Webhook payload is a fixed set of space-keyed fields. Map it into our
 * camelCase schema shape. Unknown/extra fields are ignored.
 */
const mapPayload = (b = {}) => ({
  linkedinUrl: (b["LinkedIn URL"] || "").trim(),
  firstName: (b["First Name"] || "").trim(),
  lastName: (b["Last Name"] || "").trim(),
  title: (b["Title"] || "").trim(),
  businessEmail: (b["Business Email"] || "").trim().toLowerCase(),
  companyName: (b["Company Name"] || "").trim(),
  website: (b["Website"] || "").trim(),
  industry: (b["Industry"] || "").trim(),
  employeeCount: (b["Employee Count"] || "").trim(),
  estimatedRevenue: (b["Estimate Revenue"] || "").trim(),
  city: (b["City"] || "").trim(),
  state: (b["State"] || "").trim(),
  zipcode: (b["Zipcode"] || "").trim(),
  referrer: (b["Referrer"] || "").trim(),
  capturedUrl: (b["Captured URL"] || "").trim(),
  tags: (b["Tags"] || "").trim(),
});

/**
 * RB2B's "Seen At" example is a malformed ISO string, so guard the parse and
 * fall back to now on anything unparseable.
 */
const safeDate = (v) => {
  if (!v) return new Date();
  const d = new Date(v);
  return isNaN(d.getTime()) ? new Date() : d;
};

/**
 * POST /api/v1/rb2b/ingest/:token   (public — secured by URL token, no JWT)
 * RB2B fires this on every identified visitor. We ack immediately and persist
 * in the background so RB2B never retries on our processing time.
 */
const ingestVisitor = catchAsyncError(async (req, res) => {
  if (req.params.token !== process.env.RB2B_WEBHOOK_TOKEN) {
    return res.status(401).json({ success: false, message: "Invalid webhook token" });
  }

  // Ack first — never block the webhook on DB work.
  res.status(200).json({ success: true });

  (async () => {
    try {
      const data = mapPayload(req.body);
      const seenAt = safeDate(req.body["Seen At"]);
      const pageEntry = {
        url: data.capturedUrl,
        referrer: data.referrer,
        tags: data.tags,
        seenAt,
      };

      // Dedupe: LinkedIn URL first, then business email. Neither → new row.
      const orFilters = [];
      if (data.linkedinUrl) orFilters.push({ linkedinUrl: data.linkedinUrl });
      if (data.businessEmail) orFilters.push({ businessEmail: data.businessEmail });

      const existing = orFilters.length
        ? await RB2BVisitor.findOne({ $or: orFilters })
        : null;

      if (existing) {
        existing.visitCount += 1;
        existing.lastSeenAt = seenAt;
        // Refresh latest-visit context + any fields RB2B newly enriched.
        existing.referrer = data.referrer || existing.referrer;
        existing.capturedUrl = data.capturedUrl || existing.capturedUrl;
        existing.tags = data.tags || existing.tags;
        existing.title = data.title || existing.title;
        existing.companyName = data.companyName || existing.companyName;
        existing.industry = data.industry || existing.industry;
        existing.capturedPages.push(pageEntry);
        existing.raw = req.body;
        await existing.save();
      } else {
        await RB2BVisitor.create({
          ...data,
          firstSeenAt: seenAt,
          lastSeenAt: seenAt,
          visitCount: 1,
          capturedPages: [pageEntry],
          raw: req.body,
        });
      }
    } catch (e) {
      console.error("[rb2b-ingest] persist failed:", e.message);
    }
  })();
});

/**
 * GET /api/v1/rb2b?page=&limit=   (admin)
 * Paginated list for the admin RB2B Visitors tab.
 */
const getAllVisitors = catchAsyncError(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
  const skip = (page - 1) * limit;

  const [visitors, total] = await Promise.all([
    RB2BVisitor.find().sort({ lastSeenAt: -1, createdAt: -1 }).skip(skip).limit(limit).lean(),
    RB2BVisitor.countDocuments(),
  ]);

  res.status(200).json({
    success: true,
    visitors,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

module.exports = { ingestVisitor, getAllVisitors };