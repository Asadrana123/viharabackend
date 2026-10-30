const express = require('express');
const router = express.Router();
const unsubscribedEmails = require("../../model/integrations/unsubscribeModel");
const getSuccessPage = require("../../htmlPages/shared/successPage");
const getAlreadyUnsubscribedPage = require("../../htmlPages/integrations/alreadyUnsubscribedPage");
const getErrorPage = require("../../htmlPages/shared/errorPage");
const formRateLimit = require("../../middleware/formRateLimit");

// One-click unsubscribe from the links in older emails (?email=...). Those
// links have no token, so they keep working exactly as sent. The email must be
// a plain address (no database operators like email[$ne]=), and the pages
// escape it.
const EMAIL_RE = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/;

router.get("/unsubscribe", formRateLimit({ name: "unsubscribe", max: 20 }), async (req, res) => {
    // The old links didn't URL-encode the address, so a "+" arrives as a space.
    const email = typeof req.query.email === "string" ? req.query.email.trim().replace(/ /g, "+") : "";
    
    if (!email) {
        return res.status(400).send(getErrorPage("Invalid request: Email parameter is required."));
    }
    if (email.length > 254 || !EMAIL_RE.test(email)) {
        return res.status(400).send(getErrorPage("Invalid request: that doesn't look like an email address."));
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