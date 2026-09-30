const mongoose = require("mongoose");
const { TEMPLATE_STATUS, TEMPLATE_STATUS_VALUES } = require("../../config/marketing/templateConfig");

// Ad template library (upload once, use for any property).
//
// Each document is ONE VERSION of a template. Editing a template creates a new
// version document in the same family and marks the old one isLatest: false,
// so images made with an older version always keep pointing at the exact HTML
// that produced them. Only status, isLatest and defaultForSlots change in place.

const assetSchema = new mongoose.Schema(
    {
        // Used in the HTML as {{asset.NAME}}.
        name: { type: String, required: true },
        url: { type: String, required: true },
        publicId: { type: String, default: "" },
    },
    { _id: false }
);

// A property-photo spot in the design ({{photo.N}}) and the designer's name
// for it ("Living room"), shown to the admin when picking photos.
const photoSlotSchema = new mongoose.Schema(
    {
        index: { type: Number, required: true, min: 1 },
        label: { type: String, default: "" },
    },
    { _id: false }
);

const marketingTemplateSchema = new mongoose.Schema(
    {
        // All versions of one template share the first version's _id.
        familyId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            index: true,
        },
        version: {
            type: Number,
            required: true,
            min: 1,
        },
        isLatest: {
            type: Boolean,
            default: true,
            index: true,
        },
        status: {
            type: String,
            enum: TEMPLATE_STATUS_VALUES,
            default: TEMPLATE_STATUS.ACTIVE,
        },
        name: {
            type: String,
            required: true,
            trim: true,
        },
        description: {
            type: String,
            default: "",
            trim: true,
        },
        // HTML per format. tall ("9:16") is optional; without it the 9:16
        // images use the built-in template.
        html: {
            square: { type: String, required: true },
            tall: { type: String, default: "" },
        },
        // Slot kinds this template is meant for ("staticA", "carousel:card1" ...).
        // Empty = every slot.
        slots: {
            type: [String],
            default: [],
        },
        // Derived from the HTML by the validator.
        usesBackground: { type: Boolean, default: false },
        usesPhoto: { type: Boolean, default: false },
        // How many property photos the design shows (highest {{photo.N}}).
        photoCount: { type: Number, default: 0 },
        photoSlots: { type: [photoSlotSchema], default: [] },
        assets: {
            type: [assetSchema],
            default: [],
        },
        // Library thumbnails rendered with sample text when the version is saved.
        previewImages: {
            square: { type: String, default: "" },
            tall: { type: String, default: "" },
        },
        // Slot kinds that use this template when the admin doesn't pick one.
        // Only set on the latest active version; one template per slot.
        defaultForSlots: {
            type: [String],
            default: [],
        },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "userModel",
            required: true,
        },
        archivedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "userModel",
            default: null,
        },
        archivedAt: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: true,
    }
);

marketingTemplateSchema.index({ familyId: 1, version: 1 }, { unique: true });
marketingTemplateSchema.index({ isLatest: 1, status: 1, defaultForSlots: 1 });

// A version's content never changes after it is created.
const MUTABLE_PATHS = new Set(["status", "isLatest", "defaultForSlots", "archivedBy", "archivedAt", "updatedAt"]);

marketingTemplateSchema.pre("save", function (next) {
    if (this.isNew) return next();
    const changed = this.modifiedPaths({ includeChildren: false }).filter((p) => !MUTABLE_PATHS.has(p));
    if (changed.length) {
        return next(new Error("Template versions can't be changed. Save the edit as a new version."));
    }
    next();
});

module.exports = mongoose.model("marketingTemplate", marketingTemplateSchema);
