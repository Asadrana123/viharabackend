const express = require('express');
const router = express.Router();
const unsubscribedEmails = require("../model/unsubscribeModel");
const getSuccessPage = require("../htmlPages/successPage");
const getAlreadyUnsubscribedPage = require("../htmlPages/alreadyUnsubscribedPage");
const getErrorPage = require("../htmlPages/errorPage");

router.get("/unsubscribe", async (req, res) => {
    const { email } = req.query;
    
    if (!email) {
        return res.status(400).send(getErrorPage("Invalid request: Email parameter is required."));
    }
    
    try {
        const existingEntry = await unsubscribedEmails.findOne({ email });
        if (existingEntry) {
            return res.send(getAlreadyUnsubscribedPage(email));
        }
        
        // Save email to database
        await unsubscribedEmails.create({ email });
        console.log(`Unsubscribed: ${email}`);
        
        res.send(getSuccessPage(email));
    } catch (error) {
        console.error("Error unsubscribing:", error);
        res.status(500).send(getErrorPage("Server error. Please try again later."));
    }
});

module.exports = router;