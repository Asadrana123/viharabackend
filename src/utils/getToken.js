// This utility function sends a JWT token in response and cookies

const sendToken = (user, statusCode, res) => {
    // Generate JWT token
    const token = user.getJWTToken();

    // Set a default cookie expiration if environment variable isn't set
    const cookieExpire = process.env.cookie_expire || 30; // Default to 30 days if not set

    // Ensure we have a valid number for expiration
    const expirationDays = parseInt(cookieExpire, 10) || 30;

    // Calculate expiration date - properly handling the date creation
    const expires = new Date(Date.now() + expirationDays * 24 * 60 * 60 * 1000);

    // Options for cookies with proper error handling
    const options = {
        expires: expires,
        httpOnly: true,                                    // ← Prevents XSS
        secure: process.env.NODE_ENV === 'production',    // ← HTTPS only in prod
        sameSite: 'strict'
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