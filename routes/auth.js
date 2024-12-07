const router = require("express").Router();
const passport = require("passport");
const sendEmail = require("../utils/sendEmail");
router.get("/login/success", (req, res) => {
  if (req.user) {
    res.status(200).json({
      error: false,
      message: "Successfully Logged In",
      user: req.user,
    });
  } else {
    res.status(403).json({ error: true, message: "Not Authorized" });
  }
});

router.get("/login/failed", (req, res) => {
  res.status(401).json({
    error: true,
    message: "Log in failure",
  });
});

router.get("/google", passport.authenticate("google", { scope: ["profile", "email"] }));

router.get(
  '/google/callback',
  passport.authenticate('google', { failureRedirect: '/login' }),
  (req, res) => {
    console.log(req);
    sendEmail(req.user.email, req.user.name);
    res.redirect(`https://www.vihara.ai/auth/success?token=${token = req.user.remmember_token}`);
  }
);

router.get("/logout", (req, res) => {
  req.logout((err) => {
    if (err) {
      return next(err);
    }
    res.redirect(process.env.CLIENT_URL);
  });
});
module.exports = router;