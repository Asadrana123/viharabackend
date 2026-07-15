const productModel = require("../model/productModel");
const catchAsyncError = require("../middleware/catchAsyncError");
const Errorhandler = require("../utils/errorhandler");
exports.getProductById = catchAsyncError(async (req, res, next) => {
    const product = await productModel.findById(req.params.id);
    console.log(product);
    if (!product) {
        return next(new Errorhandler("Property not found", 404));
    }
    return res.json({ success: true, product });
});
exports.createProduct = catchAsyncError(
    async (req, res) => {
        const product = await productModel.create(req.body);
        return res.json({ success: true, addedProduct: product });
    }
)
// exports.getAllProducts = catchAsyncError(
//     async (req, res) => {
//         const allProducts = await productModel.find({});

//         // Sort so California/San Francisco properties come first
//         const sortedProducts = allProducts.sort((a, b) => {
//             const cityA = (a.city || '').toLowerCase();
//             const stateA = (a.state || '').toLowerCase();
//             const cityB = (b.city || '').toLowerCase();
//             const stateB = (b.state || '').toLowerCase();

//             const isASanFranciscoOrCA = cityA.includes('san francisco') || stateA.includes('california') || stateA === 'ca';
//             const isBSanFranciscoOrCA = cityB.includes('san francisco') || stateB.includes('california') || stateB === 'ca';

//             if (isASanFranciscoOrCA && !isBSanFranciscoOrCA) return -1;
//             if (!isASanFranciscoOrCA && isBSanFranciscoOrCA) return 1;

//             return 0; // Keep original order for same priority
//         });

//         return res.json({ success: true, allProducts: sortedProducts });
//     }
// );

// exports.getAllProducts = catchAsyncError(
//     async (req, res) => {
//         const targetProductId = '695236a4acad197a54f80e95';
//         const allProducts = await productModel.find({ _id: { $ne: targetProductId } });
//         return res.json({ success: true, allProducts });
//     }
// );

exports.getAllProducts = catchAsyncError(
    async (req, res) => {
        const targetIds = [
            '695236a4acad197a54f80e95',
            '69cf9ec217e006f5c4437c62'
        ];

        const userEmail = req.user?.email || null;

        // Always fetch the two public production properties
        const publicProducts = await productModel.find({
            _id: { $in: targetIds },
            isTestProperty: { $ne: true }
        });

        // If authenticated, also fetch any test properties whitelisted for this email
        let testProducts = [];
        if (userEmail) {
            testProducts = await productModel.find({
                isTestProperty: true,
                allowedTestUsers: userEmail
            });
        }

        const allProducts = [...publicProducts, ...testProducts];

        return res.json({
            success: true,
            count: allProducts.length,
            allProducts
        });
    }
);