const mongoose = require("mongoose");
const productSchema = new mongoose.Schema({
    productName: {
        type: String,
        required: true,
      },
      auctionStartDate: {
        type: Date,
        required: true,
      },
      auctionStartTime: {
        type: String, // or use Date if you want to include time details
        required: true,
      },
      auctionEndDate: {
        type: Date,
        required: true,
      },
      auctionEndTime: {
        type: String, // or use Date if you want to include time details
        required: true,
      },
      reservePrice: {
        type: Number,
        required: true,
      },
      minIncrement: {
        type: Number,
        required: true,
      },
      emd: {
        type: Number,
        required: true,
      },
      commission: {
        type: Number, // assuming percentage
        required: true,
      },
      startBid: {
        type: Number,
        required: true,
      },
      propertyDescription: {
        type: String,
        required: true,
      },
      propertyType: {
        type: String,
        required: true,
      },
      street: {
        type: String,
        required: true,
      },
      city: {
        type: String,
        required: true,
      },
      county: {
        type: String,
        required: true,
      },
      state: {
        type: String,
        required: true,
      },
      zipCode: {
        type: String,
        required: true,
      },
      beds: {
        type: Number,
        required: true,
      },
      baths: {
        type: Number,
        required: true,
      },
      squareFootage: {
        type: Number,
        required: true,
      },
      lotSize: {
        type: Number, // assuming it's in acres
        required: true,
      },
      yearBuilt: {
        type: Number,
        required: true,
      },
      monthlyHOADues: {
        type: Number,
        required: true,
      },
      apn: {
        type: String,
        required: true,
      },
      eventID: {
        type: String,
        required: true,
      },
      trusteeSaleNumber: {
        type: String,
        required: true,
      },
      image: {
        type: String, // URL or path to the image file
        required: false,
      },
      otherImages: [
         {
            type: String, // URL or path to the image file
         }
      ],
      onlineOrInPerson: {
        type: String,
        enum: ['Online', 'In Person'],
        required: true,
      },
      bidderEmails:[
        {
            type: String,
        }
      ]
})
productSchema.pre('save', async function (next) {
    this.updated_at = Date.now();
    next();
})
module.exports = mongoose.model("productModel", productSchema);