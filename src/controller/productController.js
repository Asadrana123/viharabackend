const productModel = require("../model/productModel");
const catchAsyncError = require("../middleware/catchAsyncError");
const Errorhandler = require("../utils/errorhandler");

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
    return res.json({ success: true, product });
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
    return res.json({ success: true, product });
});

// Admin — every property, unfiltered, for the Manage Listings tab.
exports.getAllProductsAdmin = catchAsyncError(async (req, res) => {
    const products = await productModel
        .find({})
        .select('productName street city state slug image showOnAuctions isLandingPage auctionEventLabel isTestProperty status')
        .sort({ createdAt: -1 });
    return res.json({ success: true, count: products.length, products });
});

// Admin — update only the listing-control fields for one property.
exports.updateListingSettings = catchAsyncError(async (req, res, next) => {
    const { showOnAuctions, isLandingPage, auctionEventLabel } = req.body;

    const product = await productModel.findById(req.params.id);
    if (!product) {
        return next(new Errorhandler("Property not found", 404));
    }

    if (typeof showOnAuctions === 'boolean') product.showOnAuctions = showOnAuctions;
    if (typeof isLandingPage === 'boolean') product.isLandingPage = isLandingPage;
    if (typeof auctionEventLabel === 'string') product.auctionEventLabel = auctionEventLabel;

    // validateBeforeSave: false — this endpoint only touches the 3 listing fields
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
            auctionEventLabel: product.auctionEventLabel
        }
    });
});