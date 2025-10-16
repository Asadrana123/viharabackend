const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const sellerFormSchema = new Schema({
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    email: { type: String, required: true },
    phoneNumber: { type: String, required: true },
    propertyAddress: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String, required: true },
    zip: { type: String, required: true },
    propertyCondition: { type: String, required: true, enum: ['Move-in ready', 'Required minor repairs', 'Required major repairs'] },
    propertyType: { type: String, required: true, enum: ['Single Family Residence', 'Multi-Unit', 'Land'] },
    numberOfProperties: { type: String, required: true, enum: ['Single Property', 'Portfolio'] },
    propertyMarketHistory: { type: String, required: true, enum: ['New to market', 'Currently or has been listed'] },
    propertyOccupancy: { type: String, required: true, enum: ['Vacant', 'Occupied', 'Occupied with active tenant'] },
    mortgageExist: { type: String, required: true, enum: ['Yes', 'No'] },
    mortgageRange: { type: String },
    minDesiredPrice: { type: Number, required: true },
    maxDesiredPrice: { type: Number, required: true },
    relationshipWithProperty: { type: String, required: true, enum: ['Owner', 'Part Owner', 'Representative of owner', 'Other'] },
    sellingTime: { type: String, required: true, enum: ['Immediately', 'Within a month', 'Within 3 months', 'More than 6 months'] }
});

const SellerForm = mongoose.model('SellerForm', sellerFormSchema);

module.exports = SellerForm;
