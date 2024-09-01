const GoogleStrategy = require("passport-google-oauth20").Strategy;
const passport = require("passport");
const User =require("./model/userModel");
passport.use(
	new GoogleStrategy(
		{
			clientID: process.env.CLIENT_ID,
			clientSecret: process.env.CLIENT_SECRET,
			callbackURL: "/auth/google/callback",
			scope: ["profile", "email"],
		},
		async function (accessToken, refreshToken, profile, done) {
            try {
                // Extract the necessary information from the profile
                const { name, emails } = profile;

                // Check if the user already exists in the database
                let user = await User.findOne({ email: emails[0].value });

                if (user) {
                    // If the user already exists, update the user's profile data if necessary
                    user.name = name.givenName;
                    user.last_name = name.familyName;
                    user.email_verified_at = Date.now(); // Assuming that the email is verified if they are authenticated with Google
                } else {
                    // If the user doesn't exist, create a new user
                    user = new User({
                        name: name.givenName,
                        last_name: name.familyName,
                        email: emails[0].value,
                        email_verified_at: Date.now(), // Google verified email
                        password: null, // Not applicable for Google-authenticated users
                    });
                }

                // Generate a JWT token for the user
                const token = user.getJWTToken();

                // Generate a remember_token
                user.remmember_token = token;
                // Save the user with the updated remember_token
                await user.save();

                // Include the token and remember_token in the user object or in the done callback's additional data
                done(null,user);
            } catch (err) {
                done(err, null);
            }
        }
	)
);

passport.serializeUser((user, done) => {
	done(null, user);
});

passport.deserializeUser((user, done) => {
	done(null, user);
});