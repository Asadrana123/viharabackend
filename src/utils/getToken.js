// This utility function sends a JWT token in response and cookies
const getCookieOptions = require("./cookieOptions");
const sendToken = (user, statusCode, res) => {
    // Generate JWT token
    const token = user.getJWTToken();
    const cookieExpire = parseInt(process.env.cookie_expire, 10) || 30;

    const options = {
        ...getCookieOptions(),
        expires: new Date(Date.now() + cookieExpire * 24 * 60 * 60 * 1000),
    };

    // Send response with user info, token and set cookie
    res.status(statusCode).cookie("token", token, options).json({
        success: true,
        user: {
            _id: user._id,
            name: user.name,
            last_name: user.last_name || '',
            email: user.email,
            role: user.role || 'user',
            userType: user.userType,
            businessPhone: user.businessPhone,
            city: user.city,
            state: user.state,
            savedProperties: user.savedProperties
        }
    });
};

module.exports = sendToken;