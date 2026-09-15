const productModel = require("../../model/property/productModel");
const catchAsyncError = require("../../middleware/catchAsyncError");
const Errorhandler = require("../../utils/errorhandler");
const { resolvePropertyTimezone, utcToWallClock } = require("../../utils/resolveTimezone");

// Admin — bulk-create from uploaded JSON. Each file may be one object or an array;
// the frontend flattens them into a single array before sending.
exports.createProductsBulk = catchAsyncError(async (req, res, next) => {
    let items = req.body;
    if (!Array.isArray(items)) items = [items];   // accept a single object too
    if (items.length === 0) {
        return next(new Errorhandler("No property data provided", 400));
    }

    const created = [];
    const failed = [];

    // .create() per item so the pre-save hook runs (slug generation).
    for (let i = 0; i < items.length; i++) {
        try {
            const doc = await productModel.create(items[i]);
            created.push({ _id: doc._id, slug: doc.slug, productName: doc.productName });
        } catch (err) {
            failed.push({ index: i, error: err.message });
        }
    }

    return res.status(created.length ? 201 : 400).json({
        success: created.length > 0,
        createdCount: created.length,
        failedCount: failed.length,
        created,
        failed
    });
});


exports.getProductById = catchAsyncError(async (req, res, next) => {
    const product = await productModel.findById(req.params.id);
    if (!product) {
        return next(new Errorhandler("Property not found", 404));
    }
    // Resolved IANA zone so the frontend can render the auction banner in the
    // property's local time. Computed on read; nothing stored.
    const auctionTimezone = resolvePropertyTimezone(product);
    return res.json({ success: true, product: { ...product.toObject(), auctionTimezone } });
});

exports.createProduct = catchAsyncError(async (req, res) => {
    const product = await productModel.create(req.body);
    return res.json({ success: true, addedProduct: product });
});

// Public auctions page — only properties the admin flagged as visible.
exports.getAllProducts = catchAsyncError(async (req, res) => {
    const userEmail = req.user?.email || null;

    const publicProducts = await productModel.find({
        showOnAuctions: true,
        isTestProperty: { $ne: true }
    });

    // Authenticated users also get test properties whitelisted for their email
    let testProducts = [];
    if (userEmail) {
        testProducts = await productModel.find({
            isTestProperty: true,
            allowedTestUsers: userEmail
        });
    }

    const allProducts = [...publicProducts, ...testProducts];
    return res.json({ success: true, count: allProducts.length, allProducts });
});

// Public — resolve a property by its slug (used by detail + landing pages).
exports.getProductBySlug = catchAsyncError(async (req, res, next) => {
    const product = await productModel.findOne({ slug: req.params.slug });
    if (!product) {
        return next(new Errorhandler("Property not found", 404));
    }
    // Resolved IANA zone so the frontend can render the auction banner in the
    // property's local time. Computed on read; nothing stored.
    const auctionTimezone = resolvePropertyTimezone(product);
    return res.json({ success: true, product: { ...product.toObject(), auctionTimezone } });
});

// Admin — every property, unfiltered, for the Manage Listings tab.
// Each property is returned with its resolved timezone plus the auction
// start/end already expressed as wall-clock in that zone, so the admin edits
// local time directly. These are computed on the way out — nothing is stored.
exports.getAllProductsAdmin = catchAsyncError(async (req, res) => {
    const products = await productModel
        .find({})
        .select('productName street city state zipCode slug image showOnAuctions isLandingPage auctionEventLabel brevoListId isTestProperty status availableAreas startBid auctionStartDate auctionEndDate')
        .sort({ createdAt: -1 })
        .lean();

    const withTz = products.map((p) => {
        const timezone = resolvePropertyTimezone(p);
        return {
            ...p,
            timezone,
            auctionStartLocal: utcToWallClock(p.auctionStartDate, timezone),
            auctionEndLocal: utcToWallClock(p.auctionEndDate, timezone),
        };
    });

    return res.json({ success: true, count: withTz.length, products: withTz });
});

// Admin — update only the listing-control fields for one property.
exports.updateListingSettings = catchAsyncError(async (req, res, next) => {
    const { showOnAuctions, isLandingPage, auctionEventLabel, availableAreas, brevoListId } = req.body;

    const product = await productModel.findById(req.params.id);
    if (!product) {
        return next(new Errorhandler("Property not found", 404));
    }

    if (typeof showOnAuctions === 'boolean') product.showOnAuctions = showOnAuctions;
    if (typeof isLandingPage === 'boolean') product.isLandingPage = isLandingPage;
    if (typeof auctionEventLabel === 'string') product.auctionEventLabel = auctionEventLabel;

    // Per-landing-page Brevo list override. Accept a positive integer, or
    // null/"" to clear it (leads then fall back to the shared Property Leads list).
    if (brevoListId !== undefined) {
        if (brevoListId === null || brevoListId === "") {
            product.brevoListId = null;
        } else {
            const n = Number(brevoListId);
            if (!Number.isInteger(n) || n <= 0) {
                return next(new Errorhandler("Invalid brevoListId value", 400));
            }
            product.brevoListId = n;
        }
    }

    // Validate manually — save() below runs with validateBeforeSave: false,
    // so the schema enum won't guard this field.
    if (availableAreas !== undefined) {
        const VALID_AREAS = ['Exterior', 'Kitchen', 'Bathroom', 'Living Room', 'Bedroom'];
        if (!Array.isArray(availableAreas) || availableAreas.some((a) => !VALID_AREAS.includes(a))) {
            return next(new Errorhandler("Invalid availableAreas value", 400));
        }
        product.availableAreas = availableAreas;
    }

    // validateBeforeSave: false — this endpoint only touches the listing fields
    // above; it must not be blocked by unrelated pre-existing data gaps on
    // legacy fields (auctionStartTime, eventID, etc). The pre('save') hook
    // (slug generation) still runs regardless of this flag.
    await product.save({ validateBeforeSave: false });

    return res.json({
        success: true,
        message: "Listing settings updated",
        product: {
            _id: product._id,
            slug: product.slug,
            showOnAuctions: product.showOnAuctions,
            isLandingPage: product.isLandingPage,
            auctionEventLabel: product.auctionEventLabel,
            availableAreas: product.availableAreas,
            brevoListId: product.brevoListId
        }
    });
});


// Admin — update only the BASIC descriptive details of one property (title,
// description, address, classification, specs). Auction terms, images, sellers,
// visibility and status each have their own endpoints and are left untouched.
const BASIC_TEXT_FIELDS = ["productName", "propertyDescription", "street", "city", "county", "state", "zipCode"];
const BASIC_NUMBER_FIELDS = ["beds", "baths", "squareFootage", "lotSize", "yearBuilt", "monthlyHOADues"];
const BASIC_ENUMS = {
    propertyType: { values: ['Single Family', 'Condo, Townhouse, other single unit', 'Multi-family', 'Land'], required: true },
    assetType: { values: ['Reo Bank Owned', 'Foreclosure Homes', 'Short Sale'], required: false },
    occupancyStatus: { values: ['Vacant', 'Occupied', 'Reported Vacant'], required: false },
};

exports.updateProductBasicDetails = catchAsyncError(async (req, res, next) => {
    const product = await productModel.findById(req.params.id);
    if (!product) {
        return next(new Errorhandler("Property not found", 404));
    }

    const b = req.body || {};

    // Text — trim. Title + address are required on the model, so ignore any
    // attempt to blank them; only the description may be cleared.
    BASIC_TEXT_FIELDS.forEach((k) => {
        if (b[k] === undefined) return;
        const val = b[k] === null ? "" : String(b[k]).trim();
        if (val === "" && k !== "propertyDescription") return;
        product[k] = val;
    });

    // Numbers — "" / null clears to null; reject negatives / NaN.
    for (const k of BASIC_NUMBER_FIELDS) {
        if (b[k] === undefined) continue;
        if (b[k] === null || b[k] === "") { product[k] = null; continue; }
        const n = Number(b[k]);
        if (!Number.isFinite(n) || n < 0) {
            return next(new Errorhandler(`Invalid value for ${k}`, 400));
        }
        product[k] = n;
    }

    // Enums — validate against the schema's allowed values. Blank clears an
    // optional enum but never a required one.
    for (const [k, cfg] of Object.entries(BASIC_ENUMS)) {
        if (b[k] === undefined) continue;
        const val = b[k] === null ? "" : String(b[k]).trim();
        if (val === "") {
            if (cfg.required) continue;
            product[k] = null;
            continue;
        }
        if (!cfg.values.includes(val)) {
            return next(new Errorhandler(`Invalid value for ${k}`, 400));
        }
        product[k] = val;
    }

    // validateBeforeSave:false — same rationale as updateListingSettings: this
    // endpoint only touches the basic fields above and must not be blocked by
    // unrelated legacy gaps on required auction fields. The slug hook only
    // regenerates when slug is missing, so editing the address never changes a
    // live URL.
    await product.save({ validateBeforeSave: false });

    return res.json({
        success: true,
        message: "Property details updated",
        product: {
            _id: product._id, slug: product.slug,
            productName: product.productName, propertyDescription: product.propertyDescription,
            street: product.street, city: product.city, county: product.county,
            state: product.state, zipCode: product.zipCode,
            propertyType: product.propertyType, assetType: product.assetType,
            occupancyStatus: product.occupancyStatus,
            beds: product.beds, baths: product.baths, squareFootage: product.squareFootage,
            lotSize: product.lotSize, yearBuilt: product.yearBuilt, monthlyHOADues: product.monthlyHOADues,
        }
    });
});
