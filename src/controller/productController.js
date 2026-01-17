const productModel = require("../model/productModel");
const catchAsyncError = require("../middleware/catchAsyncError");
const Errorhandler = require("../utils/errorhandler");
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

exports.getAllProducts = catchAsyncError(
    async (req, res) => {
        const targetProductId = '695236a4acad197a54f80e95';

        // Fetch the target product first
        const targetProduct = await productModel.findById(targetProductId);
        
        // Fetch other products (excluding the target one)
        const otherProducts = await productModel.find({ 
            _id: { $ne: targetProductId } 
        }).limit(4);

        // Combine products: target product first, then other products
        let allProducts = [];
        if (targetProduct) {
            allProducts.push(targetProduct);
        }
        allProducts = allProducts.concat(otherProducts);

        // If we don't have enough products, get more
        if (allProducts.length < 5) {
            const additionalProducts = await productModel.find({ 
                _id: { $ne: targetProductId } 
            }).limit(5 - allProducts.length);
            allProducts = allProducts.concat(additionalProducts);
        }

        // Limit to exactly 5 products
        const finalProducts = allProducts.slice(0, 5);

        return res.json({ success: true, allProducts: finalProducts });
    }
);