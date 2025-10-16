const catchAsyncError = require("../middleware/catchAsyncError");
const Errorhandler = require("../utils/errorhandler");
const contact = require("../model/contactUSModel");
exports.saveContact = catchAsyncError(
    async (req, res) => {
        console.log(req.body);
        try{ 
            const savedContactDetails = await contact.create(req.body);
            return res.status(200).json({ success: true, savedContactDetails });
        }catch(error){
                console.log(error);
                return res.status(500).json({ success: false, error: error.message });
        }
    }
);