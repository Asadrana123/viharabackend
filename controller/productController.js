const productModel = require("../model/productModel");
const catchAsyncError = require("../middleware/catchAsyncError");
const Errorhandler = require("../utils/errorhandler");
exports.createProduct = catchAsyncError(
    async (req, res) => {
        const product = await productModel.create(req.body);
        return res.json({ success: true, addedProduct: product });
    }
)
exports.getAllProducts = catchAsyncError(
    async (req, res) => {
        const allProducts = await productModel.find({});

        // Sort so California/San Francisco properties come first
        const sortedProducts = allProducts.sort((a, b) => {
            const cityA = (a.city || '').toLowerCase();
            const stateA = (a.state || '').toLowerCase();
            const cityB = (b.city || '').toLowerCase();
            const stateB = (b.state || '').toLowerCase();

            const isASanFranciscoOrCA = cityA.includes('san francisco') || stateA.includes('california') || stateA === 'ca';
            const isBSanFranciscoOrCA = cityB.includes('san francisco') || stateB.includes('california') || stateB === 'ca';

            if (isASanFranciscoOrCA && !isBSanFranciscoOrCA) return -1;
            if (!isASanFranciscoOrCA && isBSanFranciscoOrCA) return 1;

            return 0; // Keep original order for same priority
        });

        return res.json({ success: true, allProducts: sortedProducts });
    }
);