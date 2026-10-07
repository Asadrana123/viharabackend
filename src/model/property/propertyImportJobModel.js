// model/property/propertyImportJobModel.js
//
// One document per market data link an admin queued in the Property Importer.
// The import worker (services/property/propertyImportQueueService) picks them
// up one at a time, oldest first, with a randomized pause between scrapes so
// the source never sees a burst. A finished job holds the built DRAFT — nothing is
// created in productModel until the admin reviews it and clicks "Create all".
// The admin removes a job once its draft is created or no longer wanted.
const mongoose = require("mongoose");

const IMPORT_JOB_STATUSES = [
    "queued",     // waiting for the worker
    "processing", // worker is scraping / uploading photos / writing the description
    "done",       // draft is ready for the admin to review
    "failed",     // scrape or parse failed — see `error`; the admin can retry
];

const propertyImportJobSchema = new mongoose.Schema(
    {
        url: { type: String, required: true, trim: true }, // normalized market data homedetails URL
        status: { type: String, enum: IMPORT_JOB_STATUSES, default: "queued", index: true },
        folderRoot: { type: String, default: null },        // optional Cloudinary root override
        queuedAt: { type: Date, default: Date.now },        // queue order (reset on retry)

        draft: { type: mongoose.Schema.Types.Mixed, default: null },
        warnings: { type: [String], default: [] },
        imageResults: { type: mongoose.Schema.Types.Mixed, default: null },
        error: { type: String, default: "" },

        attempts: { type: Number, default: 0 },
        startedAt: { type: Date, default: null },
        finishedAt: { type: Date, default: null },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "userModel", default: null },
    },
    { timestamps: true }
);

propertyImportJobSchema.index({ status: 1, queuedAt: 1 });

module.exports = mongoose.model("PropertyImportJob", propertyImportJobSchema);
module.exports.IMPORT_JOB_STATUSES = IMPORT_JOB_STATUSES;
