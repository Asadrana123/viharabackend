const twilio = require('twilio');

// Twilio credentials from environment variables
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioClient = new twilio(accountSid, authToken);

// Controller to send OTP
exports.sendSmSOTP = async (phoneNumber) => {
  const otp=Math.floor(1000 + Math.random() * 9000);
  console.log("in otp controller");
  try {
    const message = await twilioClient.messages.create({
      body: `Your OTP code for Vihara is: ${otp}`, 
      from: '+17856481170',
      to: `+${phoneNumber}`,
    });
     return otp;
  } catch (error) {
      console.log(error);
      res.status(500).send(error);
  }
};


