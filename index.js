// index.js
require('dotenv').config();
const express = require('express');
const session = require("express-session");
const passport = require("passport");
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const mongoose = require('mongoose');
const cors = require("cors");
const app = express();
const PORT = process.env.PORT || 8000;
const errorMiddleware = require("./middleware/error");
const userRoutes = require("./routes/userRoutes");
const adminRoutes = require("./routes/adminRoutes");
const productRoutes = require("./routes/productRoutes");
const savePropertyRoutes = require("./routes/savePropertyRoutes");
const contactRoutes = require("./routes/contactRoutes");
const sellPropertyRoutes = require("./routes/sellPropertyRoutes");
const saveSearchRoutes = require("./routes/savedSearch");
const auctionRegistrationRoutes=require("./routes/auctionRegistrationRoutes")
const authRoutes = require("./routes/auth")
const biddingRoutes=require("./routes/biddingRoutes")
const unsubscribedEmails=require("./model/unsubscribeModel")
const ebookRoutes = require("./routes/eBookRoutes");
const demographicRoutes = require("./routes/demoGraphicRoutes");
const userPreferencesRoutes = require("./routes/userPreferencesRoutes"); // Add this line
const http = require('http');
const initSocketServer = require('./socketServer');
const server = http.createServer(app);
const io = initSocketServer(server);
app.use(cookieParser());
require('./passport'); // This executes the setup code
// Connect to MongoDB
console.log(PORT);
app.use(session({ secret: process.env.secret, resave: false, saveUninitialized: true }));
// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());
app.use(cors());
app.use(bodyParser.json());
mongoose.connect(process.env.DB_URI)
  .then(() => console.log('MongoDB Connected'))
  .catch(err => console.log(err));

// Define routes
app.get("/", (req, res) => {
  res.status(200).send("Server is running!");
});
app.use('/api/v1/user', userRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/product', productRoutes);
app.use("/api/v1/saveProperty", savePropertyRoutes);
app.use('/api/v1/demographics',demographicRoutes);
app.use("/api/saveContact", contactRoutes);
app.use("/api/sellProperty", sellPropertyRoutes);
app.use("/auth", authRoutes);
app.use("/api/user/save-searches",saveSearchRoutes);
app.use('/api/auction-registration',auctionRegistrationRoutes);
app.use('/api/bidding',biddingRoutes);
app.use("/api/ebook", ebookRoutes);
app.use("/api/v1/user", userPreferencesRoutes); // Add this line
app.get("/api/unsubscribe", async (req, res) => {
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

function getSuccessPage(email) {
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Successfully Unsubscribed</title>
        <style>
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }
            
            body {
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 20px;
            }
            
            .container {
                background: white;
                padding: 40px;
                border-radius: 20px;
                box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
                text-align: center;
                max-width: 500px;
                width: 100%;
                animation: slideUp 0.6s ease-out;
            }
            
            @keyframes slideUp {
                from {
                    opacity: 0;
                    transform: translateY(30px);
                }
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }
            
            .success-icon {
                width: 80px;
                height: 80px;
                background: linear-gradient(135deg, #4CAF50, #45a049);
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                margin: 0 auto 30px;
                animation: checkmark 0.8s ease-in-out 0.3s both;
            }
            
            @keyframes checkmark {
                0% {
                    transform: scale(0);
                }
                50% {
                    transform: scale(1.2);
                }
                100% {
                    transform: scale(1);
                }
            }
            
            .checkmark {
                width: 30px;
                height: 30px;
                color: white;
                font-size: 24px;
                font-weight: bold;
            }
            
            h1 {
                color: #333;
                font-size: 28px;
                margin-bottom: 15px;
                font-weight: 600;
            }
            
            .email {
                color: #666;
                font-size: 16px;
                margin-bottom: 25px;
                background: #f8f9fa;
                padding: 10px 15px;
                border-radius: 8px;
                word-break: break-word;
            }
            
            .message {
                color: #555;
                font-size: 16px;
                line-height: 1.6;
                margin-bottom: 30px;
            }
            
            .actions {
                display: flex;
                gap: 15px;
                justify-content: center;
                flex-wrap: wrap;
            }
            
            .btn {
                padding: 12px 24px;
                text-decoration: none;
                border-radius: 8px;
                font-weight: 500;
                transition: all 0.3s ease;
                border: none;
                cursor: pointer;
                font-size: 14px;
            }
            
            .btn-primary {
                background: linear-gradient(135deg, #667eea, #764ba2);
                color: white;
            }
            
            .btn-primary:hover {
                transform: translateY(-2px);
                box-shadow: 0 8px 20px rgba(102, 126, 234, 0.3);
            }
            
            .btn-secondary {
                background: transparent;
                color: #667eea;
                border: 2px solid #667eea;
            }
            
            .btn-secondary:hover {
                background: #667eea;
                color: white;
            }
            
            @media (max-width: 480px) {
                .container {
                    padding: 30px 20px;
                }
                
                h1 {
                    font-size: 24px;
                }
                
                .actions {
                    flex-direction: column;
                }
                
                .btn {
                    width: 100%;
                }
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="success-icon">
                <div class="checkmark">✓</div>
            </div>
            
            <h1>You're All Set!</h1>
            
            <div class="email">${email}</div>
            
            <div class="message">
                You have been successfully unsubscribed from our mailing list. 
                You won't receive any more emails from us.
                <br><br>
                We're sorry to see you go, but we respect your choice.
            </div>
        </div>
    </body>
    </html>
    `;
}

function getAlreadyUnsubscribedPage(email) {
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Already Unsubscribed</title>
        <style>
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }
            
            body {
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                background: linear-gradient(135deg, #ffeaa7 0%, #fab1a0 100%);
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 20px;
            }
            
            .container {
                background: white;
                padding: 40px;
                border-radius: 20px;
                box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
                text-align: center;
                max-width: 500px;
                width: 100%;
                animation: slideUp 0.6s ease-out;
            }
            
            @keyframes slideUp {
                from {
                    opacity: 0;
                    transform: translateY(30px);
                }
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }
            
            .info-icon {
                width: 80px;
                height: 80px;
                background: linear-gradient(135deg, #f39c12, #e67e22);
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                margin: 0 auto 30px;
                color: white;
                font-size: 32px;
                font-weight: bold;
            }
            
            h1 {
                color: #333;
                font-size: 28px;
                margin-bottom: 15px;
                font-weight: 600;
            }
            
            .email {
                color: #666;
                font-size: 16px;
                margin-bottom: 25px;
                background: #f8f9fa;
                padding: 10px 15px;
                border-radius: 8px;
                word-break: break-word;
            }
            
            .message {
                color: #555;
                font-size: 16px;
                line-height: 1.6;
                margin-bottom: 30px;
            }
            
            .actions {
                display: flex;
                gap: 15px;
                justify-content: center;
                flex-wrap: wrap;
            }
            
            .btn {
                padding: 12px 24px;
                text-decoration: none;
                border-radius: 8px;
                font-weight: 500;
                transition: all 0.3s ease;
                border: none;
                cursor: pointer;
                font-size: 14px;
            }
            
            .btn-primary {
                background: linear-gradient(135deg, #f39c12, #e67e22);
                color: white;
            }
            
            .btn-primary:hover {
                transform: translateY(-2px);
                box-shadow: 0 8px 20px rgba(243, 156, 18, 0.3);
            }
            
            .btn-secondary {
                background: transparent;
                color: #f39c12;
                border: 2px solid #f39c12;
            }
            
            .btn-secondary:hover {
                background: #f39c12;
                color: white;
            }
            
            @media (max-width: 480px) {
                .container {
                    padding: 30px 20px;
                }
                
                h1 {
                    font-size: 24px;
                }
                
                .actions {
                    flex-direction: column;
                }
                
                .btn {
                    width: 100%;
                }
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="info-icon">ℹ</div>
            
            <h1>Already Unsubscribed</h1>
            
            <div class="email">${email}</div>
            
            <div class="message">
                This email address has already been unsubscribed from our mailing list.
                <br><br>
            </div>
            
            <div class="actions">
                <a href="/" class="btn btn-primary">Return to Homepage</a>
            </div>
        </div>
    </body>
    </html>
    `;
}

function getErrorPage(message) {
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Error - Unsubscribe</title>
        <style>
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }
            
            body {
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                background: linear-gradient(135deg, #e17055 0%, #d63031 100%);
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 20px;
            }
            
            .container {
                background: white;
                padding: 40px;
                border-radius: 20px;
                box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
                text-align: center;
                max-width: 500px;
                width: 100%;
                animation: slideUp 0.6s ease-out;
            }
            
            @keyframes slideUp {
                from {
                    opacity: 0;
                    transform: translateY(30px);
                }
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }
            
            .error-icon {
                width: 80px;
                height: 80px;
                background: linear-gradient(135deg, #e74c3c, #c0392b);
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                margin: 0 auto 30px;
                color: white;
                font-size: 32px;
                font-weight: bold;
            }
            
            h1 {
                color: #333;
                font-size: 28px;
                margin-bottom: 25px;
                font-weight: 600;
            }
            
            .message {
                color: #555;
                font-size: 16px;
                line-height: 1.6;
                margin-bottom: 30px;
            }
            
            .actions {
                display: flex;
                gap: 15px;
                justify-content: center;
                flex-wrap: wrap;
            }
            
            .btn {
                padding: 12px 24px;
                text-decoration: none;
                border-radius: 8px;
                font-weight: 500;
                transition: all 0.3s ease;
                border: none;
                cursor: pointer;
                font-size: 14px;
            }
            
            .btn-primary {
                background: linear-gradient(135deg, #e74c3c, #c0392b);
                color: white;
            }
            
            .btn-primary:hover {
                transform: translateY(-2px);
                box-shadow: 0 8px 20px rgba(231, 76, 60, 0.3);
            }
            
            .btn-secondary {
                background: transparent;
                color: #e74c3c;
                border: 2px solid #e74c3c;
            }
            
            .btn-secondary:hover {
                background: #e74c3c;
                color: white;
            }
            
            @media (max-width: 480px) {
                .container {
                    padding: 30px 20px;
                }
                
                h1 {
                    font-size: 24px;
                }
                
                .actions {
                    flex-direction: column;
                }
                
                .btn {
                    width: 100%;
                }
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="error-icon">⚠</div>
            
            <h1>Oops! Something went wrong</h1>
            
            <div class="message">
                ${message}
                <br><br>
                Please try again or contact our support team if the problem persists.
            </div>
            
            <div class="actions">
                <a href="javascript:history.back()" class="btn btn-primary">Try Again</a>
                <a href="mailto:support@yourcompany.com" class="btn btn-secondary">Contact Support</a>
            </div>
        </div>
    </body>
    </html>
    `;
}
app.use(errorMiddleware);
// Start the server
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});