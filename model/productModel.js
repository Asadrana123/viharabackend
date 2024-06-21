const mongoose = require("mongoose");
const productSchema = new mongoose.Schema({
    product_name: {
        type: String,
        required: true,
    },
    description: {
        type: String,
        required: true,
    },
    selller_id: {
        type: Number,
        default: 1,
        required: true,
    },
    auction_type: {
        type: String,
        required: true,
    },
    product_type: {
        type: Number,
        required: true,
    },
    start_date: {
        type: Date,
        required:true,
    },
    end_date: {
        type: Date
    },
    start_time:{
        type:String,
        required:true
   },
   end_time:{
      type:String,
      required:true,
   },
    createdAt:{
        type: Date,
        default: Date.now
    },
    updated_at: {
        type: Date,
        default: Date.now
    },
    deleted_at:{
        type:Date
    },
    status:{
        type:Number,
        required:true,
    },
    highest_bid: {
        type: Number,
        required: true
    },
    highest_bid_user: {
        type: Number,
        required: true
    },
    reserve: {
        type: Number,
        default: null
    },
    commission: {
        type: Number,
        default: null
    },
    emd: {
        type: Number,
        default: null
    },
    min_increament: {
        type: Number,
        default: null
    },
    permitted_user: {
        type: [String],
        required: true
    },
    open_status: {
        type: String,
        enum: ['O', 'S'],
        required: true
    }
})
productSchema.pre('save', async function (next) {
    this.updated_at = Date.now();
    next();
})
module.exports = mongoose.model("productModel", productSchema);