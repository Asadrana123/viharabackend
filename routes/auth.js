// Importing the Router functionality from the express library
const router = require("express").Router(); 

// Importing the passport library for authentication
// Passport is an authentication middleware for Node.js.
// It is used to authenticate users using various strategies (e.g., Google, Facebook, local, etc.).
// It simplifies the process of authentication by providing a consistent API for different authentication methods.
const passport = require("passport");

// Importing a utility function to send emails
const sendEmail = require("../utils/sendEmail");

// Route to handle successful login
router.get("/login/success", (req, res) => {
  // Check if the user is authenticated (req.user exists)
  if (req.user) {
    // If authenticated, send a success response with user details
    res.status(200).json({
      error: false, // No error
      message: "Successfully Logged In", // Success message
      user: req.user, // User details
    });
  } else {
    // If not authenticated, send an error response
    res.status(403).json({
      error: true, // Indicates an error
      message: "Not Authorized", // Error message
    });
  }
});

// Route to handle login failure
router.get("/login/failed", (req, res) => {
  // Send a response indicating login failure
  res.status(401).json({
    error: true, // Indicates an error
    message: "Log in failure", // Error message
  });
});

// Route to initiate Google authentication
router.get(
  "/google",
  passport.authenticate("google", {
    // Define the scope of access - requesting profile and email from Google
    scope: ["profile", "email"],
  })
  // passport.authenticate() initiates the Google OAuth flow.
  // It redirects the user to Google's login page to authenticate their identity.
);

// Route to handle the callback after Google has authenticated the user
router.get(
  "/google/callback",
  passport.authenticate("google", { failureRedirect: "/login" }), 
   // At this point, Passport has already attached the user object to `req`
  // If authentication fails, redirect to the login page
  (req, res) => {
    // Log the request object for debugging (optional)
    console.log(req);

    // Send a welcome email to the authenticated user
    sendEmail(req.user.email, req.user.name);

    // Redirect the user to the frontend with their token included in the URL
    res.redirect(
      `https://www.vihara.ai/auth/success?token=${(token = req.user.remmember_token)}`
    );
  }
);

// Route to handle user logout
router.get("/logout", (req, res) => {
  // Use req.logout() to log out the user
  req.logout((err) => {
    if (err) {
      // If there is an error during logout, pass it to the error handler
      return next(err);
    }
    // After logout, redirect the user to the client application URL
    res.redirect(process.env.CLIENT_URL);
  });
});

// Export the router to be used in other parts of the application
module.exports = router;
