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
            
            @media (max-width: 480px) {
                .container {
                    padding: 30px 20px;
                }
                
                h1 {
                    font-size: 24px;
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

module.exports = getSuccessPage;