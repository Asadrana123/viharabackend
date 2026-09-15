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

module.exports = getErrorPage;