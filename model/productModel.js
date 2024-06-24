const mongoose = require("mongoose");
const productSchema = new mongoose.Schema({
    productName:{type:String,required:true},
    referenceNumber: { type: String, required: true },
    categories: { type: String, required: true },
    auctionStartDate: { type: Date, required: true },
    auctionStartTime: { type: String, required: true },
    auctionEndDate: { type: Date, required: true },
    auctionEndTime: { type: String, required: true },
    basePrice: { type: Number, required: true },
    reservePrice: { type: Number, required: true },
    minIncrement: { type: Number, required: true },
    EMD: { type: Number, required: true },
    Commission: { type: Number, required: true },
    startBid: { type: Number, required: true },
    ownershipStatus: { type: String, required: true },
    propertyType: { type: String, required: true },
    HOT: { type: String, required: true },
    OnlineorInPerson:{type:String,required:true},
    Street:{type:String,required:true},
    City:{type:String,required:true},
    Country:{type:String,required:true},
    ZipCode:{type:Number,required:true},
    State:{type:String,required:true},
    yearBuilt: { type: Number, required: true },
    manufacturer: { type: String, required: true },
    userProducts: { type: Number, required: true },
    floor: { type: Number, required: true },
    totalFloor: { type: Number, required: true },
    totalArea: { type: Number, required: true },
    bedroom: { type: Number, required: true },
    bathroom: { type: Number, required: true },
    squareFootage:{type:Number,required:true},
    lotSize:{type:Number,required:true},
    monthlyHodDues:{type:Number,required:true},
    trusteeSaleNumber:{type:Number,required:true},
    Apn:{type:Number,required:true},
    eventId:{type:Number,required:true},
    alternateEmails: [String],
    productImage:{type:String,required:true},
    productImages:  [
        {
            url: {
                type: String,
                required: true
            }
        }
    ],
})
productSchema.pre('save', async function (next) {
    this.updated_at = Date.now();
    next();
})
module.exports = mongoose.model("productModel", productSchema);