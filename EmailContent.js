const content = (user) => [
  {
    subject: "Distressed Property Auctions Pilot",
    body: `
      <p>Hi ${user?.["First Name"] || "Valued Partner"},</p>
  
      <p>I hope this email finds you well.</p>
  
      <p>I'm Trisha, the Head of Asset Management at Vihara. We specialize in auctioning distressed properties, helping institutions like yours maximize returns efficiently.</p>
  
      <p>I'd love to connect and explore how we can run a pilot auction tailored to your needs. Do you have 15-30 minutes this week for a quick chat?
       <a href="https://calendly.com/trisha-vihara/30min" target="_blank">Click here to schedule a time that works for you</a>.</p>
  
      <p>Looking forward to your thoughts.</p>
  
      <p>Best,<br>
      Trisha Soin, MPH, BSN<br>
      <a href="https://www.vihara.ai" target="_blank">vihara.ai</a></p>
  
      <p style="font-size: 12px; color: #888; text-align: center;">
        <a href="https://viharabackend.onrender.com/api/unsubscribe?email=${
              user["Email"]
            }" style="color: #888;">Click here to unsubscribe</a>.
      </p>`
    },
  {
    subject: "Exclusive: 2025 Distressed Real Estate Trends for Lenders",
    body: `<p>Hi ${user?.["First Name"] || "Valued Partner"},</p>

        <p>The real estate market is shifting fast, and distressed assets are becoming a major investment opportunity. As a ${
          user?.["Company"] || "your organization"
        }, staying ahead of the foreclosure and loan recovery trends can help you unlock new revenue streams and better serve borrowers.</p>

        <h3>📊 Key Market Trends:</h3>
        <ul>
          <li>✅ <b>Foreclosures Are Up</b> – A 25% increase in 2025 compared to last year.</li>
          <li>✅ <b>Distressed Sales Boom</b> – 15% of all real estate transactions now involve distressed properties.</li>
          <li>✅ <b>Shifting Buyer Demand</b> – 30% of foreclosed homes are in suburban & rural areas due to remote work shifts.</li>
        </ul>

        <h3>🚀 How ${
          user?.["Company"] || "your organization"
        } Can Capitalize on This Market</h3>
        <p>Vihara helps financial institutions analyze distressed properties, connect with serious investors, and optimize asset recovery through AI-driven insights.</p>

        <p>Would you like to see how we help institutions like yours navigate this growing sector?</p>

        <p>🔗 <a href="https://calendly.com/vinayakgupta-1604/30min?month=2025-02">[Schedule a Quick 15-Minute Call]</a></p>

        <p>Looking forward to connecting.</p>
        <p>Best,</p>
        <p>Trisha<br>
        <a href="https://vihara.ai">Vihara.ai</a></p>
        <p style="font-size: 12px; color: #888; text-align: center;">
          <a href="https://viharabackend.onrender.com/api/unsubscribe?email=${
            user["Email"]
          }" style="color: #888;">Click here to unsubscribe</a>.
        </p>`
  },
  {
    subject: "3 Essential Insights on the Distressed Property Market for Banks",
    body: `<p>Dear ${user?.["First Name"] || "Valued Partner"},</p>

        <p>I hope this email finds you well! I wanted to share three key insights about the current distressed property market that could benefit your institution’s asset management strategy:</p>

        <h3>🔹 Increased Default Rates</h3>
        <p>As the economic climate remains uncertain, default rates are rising, meaning more distressed properties are entering the market, creating a need for efficient liquidation strategies.</p>

        <h3>🔹 Higher Recovery Values Through Auctions</h3>
        <p>Studies show that auctioning distressed properties can yield higher recovery rates compared to traditional sales methods, making it a lucrative option for banks and credit unions looking to maximize asset recovery.</p>

        <h3>🔹 Regulatory Pressure on Property Disposal</h3>
        <p>Regulatory requirements for holding non-performing loans and properties are tightening. Auctioning distressed assets provides a compliant and timely solution to avoid penalties and costly delays.</p>

        <p>I'd love to connect and explore how Vihara can help you effectively manage and liquidate distressed properties.</p>

        <p>Thanks,</p>

        <p>Best,<br>
        Trisha<br>
        <a href="https://vihara.ai">Vihara.ai</a></p>
        <p style="font-size: 12px; color: #888; text-align: center;">
          <a href="https://viharabackend.onrender.com/api/unsubscribe?email=${
            user["Email"]
          }" style="color: #888;">Click here to unsubscribe</a>.
        </p>`
  },
  {
    subject:
      "3 Surprising Facts About Distressed Properties You Might Not Know",
    body: `<p>Hey ${user?.["First Name"] || "Valued Partner"},</p>

        <p>I wanted to share a few unexpected but important facts about the distressed property market that could make a real difference for your institution:</p>

        <h3>🏦 Foreclosures Can Be Profitable</h3>
        <p>Believe it or not, banks that auction distressed properties can sometimes recover more than they’d expect—especially when the bidding gets competitive! It’s not just about moving assets; it’s about getting top dollar.</p>

        <h3>📈 Investor Interest is Through the Roof</h3>
        <p>The market is flooded with eager investors looking for foreclosure and distressed properties. Auctioning these assets creates a vibrant, competitive environment that drives higher bids—and faster sales.</p>

        <h3>⏳ Properties Can Sell in a Day</h3>
        <p>One of the biggest perks of auctioning distressed real estate is the speed. Some properties are sold in a matter of hours, freeing up capital and reducing your holding costs.</p>

        <p>At <b>Vihara</b>, we’ve got the tools and expertise to help you tap into these opportunities quickly and efficiently. We would love to chat with you and learn more!</p>

        <p>Best,</p>
        <p>Trisha<br>
        <a href="https://vihara.ai">Vihara.ai</a></p>
         <p style="font-size: 12px; color: #888; text-align: center;">
          <a href="https://viharabackend.onrender.com/api/unsubscribe?email=${
            user["Email"]
          }" style="color: #888;">Click here to unsubscribe</a>.
        </p>`,
  },
  {
    subject: "3 Eye-Opening Facts About Distressed Properties You Should Know",
    body: `<p>Hey ${user?.["First Name"] || "Valued Partner"},</p>

        <p>I wanted to share a few surprising insights about distressed property auctions that could help your institution navigate and profit from the market more effectively:</p>
      
        <h3>💰 Holding Costs Add Up Fast</h3>
        <p>Every unsold distressed property ties up capital and increases maintenance, insurance, and tax expenses. The quicker you sell, the more you save.</p>
      
        <h3>📊 Auctions Drive Higher Returns</h3>
        <p>Competitive bidding creates urgency and can often push final sale prices beyond expectations, maximizing your recovery.</p>
      
        <h3>⏳ Traditional Sales Take Too Long</h3>
        <p>Standard real estate sales can drag on for months, but auctions can move properties in days—sometimes even hours.</p>
      
        <p>At <b>Vihara</b>, we simplify distressed property auctions, helping banks and credit unions liquidate assets efficiently while maximizing returns. Let’s connect and see how we can help!</p>
      
        <p>Thanks so much!</p>
        <p>Trisha<br>
        <a href="https://vihara.ai">Vihara.ai</a></p>
        <p style="font-size: 12px; color: #888; text-align: center;">
          <a href="https://viharabackend.onrender.com/api/unsubscribe?email=${
            user["Email"]
          }" style="color: #888;">Click here to unsubscribe</a>.
        </p>
      `,
  },
  {
    subject: "3 Must-Know Facts About Distressed Property Auctions",
    body: ` <p>Hey ${user?.["First Name"] || "Valued Partner"},</p>
    <p>I wanted to share a few key insights about distressed property auctions that could help your institution streamline asset liquidation and improve returns:</p>
    <ul>
      <li><b>Non-Performing Loans Don’t Have to Be a Burden</b> – Offloading distressed properties through auctions helps recover capital quickly, reducing risk and improving balance sheets.</li>
      <li><b>Buyers Are Willing to Pay More Than You Think</b> – With strong investor demand, competitive auctions often drive up sale prices beyond initial expectations.</li>
      <li><b>Speed Matters</b> – The longer a distressed property sits, the higher the costs. Auctions can turn assets into cash in record time, minimizing losses and maximizing efficiency.</li>
    </ul>
    <p>At <b>Vihara</b>, we make distressed property auctions seamless and profitable for banks and credit unions. Let’s connect—I’d love to hear your thoughts.</p>
    <p>Best,<br>
    Trisha<br>
    <a href="https://vihara.ai">Vihara.ai</a></p>
    <p style="font-size: 12px; color: #888; text-align: center;">
          <a href="https://viharabackend.onrender.com/api/unsubscribe?email=${
            user["Email"]
          }" style="color: #888;">Click here to unsubscribe</a>.
        </p>
      `,
  },
  {
    subject: "3 New Insights About Distressed Properties You May Not Know",
    body: `
        <p>Hi ${user?.["First Name"] || "Valued Partner"},</p>
    
        <p>I wanted to share a few fresh insights about the distressed property market that could be valuable for your institution:</p>
    
        <ul>
          <li><b>Rising Interest Rates Are Creating More Defaults</b> – As borrowing costs increase, more homeowners are struggling with mortgage payments, leading to a growing inventory of distressed properties. This presents both challenges and opportunities for banks.</li>
          <li><b>Direct Sales Often Undervalue Assets</b> – Traditional methods like direct sales or bulk REO transactions often result in lower recovery rates. Auctions bring in a competitive buyer pool, ensuring properties sell closer to their actual value.</li>
          <li><b>The Average Foreclosure Takes Over 900 Days</b> – Holding onto distressed properties for too long increases legal, tax, and maintenance costs. Accelerating the sale process through auctions helps free up capital and reduce long-term liabilities.</li>
        </ul>
    
        <p>At <b>Vihara</b>, we specialize in helping banks and credit unions offload distressed assets efficiently through high-performance auctions. We would love to chat and learn more about your distressed property portfolio.</p>
    
        <p>Best,<br>
        Trisha<br>
        <a href="https://vihara.ai" target="_blank">Vihara.ai</a></p>
        <p style="font-size: 12px; color: #888; text-align: center;">
          <a href="https://viharabackend.onrender.com/api/unsubscribe?email=${
            user["Email"]
          }" style="color: #888;">Click here to unsubscribe</a>.
        </p>
      `,
  },
  {
    subject: "3 New Insights About Distressed Properties You May Not Know",
    body: `
        <p>Hi ${user?.["First Name"] || "Valued Partner"},</p>
    
        <p>I wanted to share a few fresh insights about the distressed property market that could be valuable for your institution:</p>
    
        <ul>
          <li><b>Rising Interest Rates Are Creating More Defaults</b> – As borrowing costs increase, more homeowners are struggling with mortgage payments, leading to a growing inventory of distressed properties. This presents both challenges and opportunities for banks.</li>
          <li><b>Direct Sales Often Undervalue Assets</b> – Traditional methods like direct sales or bulk REO transactions often result in lower recovery rates. Auctions bring in a competitive buyer pool, ensuring properties sell closer to their actual value.</li>
          <li><b>The Average Foreclosure Takes Over 900 Days</b> – Holding onto distressed properties for too long increases legal, tax, and maintenance costs. Accelerating the sale process through auctions helps free up capital and reduce long-term liabilities.</li>
        </ul>
    
        <p>At <b>Vihara</b>, we specialize in helping banks and credit unions offload distressed assets efficiently through high-performance auctions. We would love to chat and learn more about your distressed property portfolio.</p>
    
        <p>Best,<br>
        Trisha<br>
        <a href="https://vihara.ai" target="_blank">Vihara.ai</a></p>
  
        <p style="font-size: 12px; color: #888; text-align: center;">
          <a href="https://viharabackend.onrender.com/api/unsubscribe?email=${
            user["Email"]
          }" style="color: #888;">Click here to unsubscribe</a>.
        </p>
      `,
  },
  {
    subject: "3 Key Trends Reshaping the Distressed Property Market",
    body: `
        <p>Hi ${user?.["First Name"] || "Valued Partner"},</p>
    
        <p>I wanted to share three important trends in the distressed property market that could impact how your institution handles foreclosures:</p>
    
        <ul style="list-style-type: none; padding-left: 0;">
          <li><b>Foreclosures Are Rising in Unexpected Areas</b> – While major cities have seen steady rates, smaller towns and suburban markets are experiencing a surge, creating new liquidation opportunities.</li>
          <li><b>Institutional Buyers Are Driving Demand</b> – Hedge funds, private equity firms, and large-scale investors are increasingly targeting foreclosure properties, intensifying competition at auctions.</li>
          <li><b>REO Portfolios Are Shrinking Too Slowly</b> – Many banks are holding onto distressed assets longer than expected, increasing carrying costs and compliance risks. Fast-turnaround auctions can help clear inventory efficiently.</li>
        </ul>
    
        <p>At <b>Vihara</b>, we connect banks and credit unions with serious buyers through a seamless auction process, ensuring faster and more profitable asset liquidation. Let’s discuss how we can support your foreclosure strategy.</p>
    
        <p>Best,<br>
        Trisha<br>
        <a href="https://vihara.ai" target="_blank">Vihara.ai</a></p>
    
        <p style="margin-top: 20px; text-align: center;">
          <a href="https://viharabackend.onrender.com/api/unsubscribe?email=${
            user?.email
          }" 
             style="display: inline-block; padding: 10px 20px; font-size: 14px; color: #fff; background-color: #d9534f; text-decoration: none; border-radius: 5px;">
             Unsubscribe
          </a>
        </p>
      `,
  },
  {
    subject: "New Insights on Distressed Properties You Should Know",
    body: `
    <p>Hi ${user?.["First Name"] || "Valued Partner"},</p>

    <p>I wanted to share a few fresh insights about the distressed property market that could impact your institution’s approach to asset liquidation:</p>

    <ul>
      <li><b>Zombie Foreclosures Are Making a Comeback</b> – Thousands of abandoned, unfinished foreclosure processes are sitting on bank books, creating liabilities and compliance risks. Auctions can help clear these assets quickly.</li>
      <li><b>Distressed Commercial Properties Are Rising</b> – It’s not just homes—office buildings, retail spaces, and multifamily units are seeing increased foreclosure rates, creating new challenges and opportunities for liquidation.</li>
      <li><b>Consumer Awareness is Changing the Market</b> – More buyers are actively searching for foreclosure deals, leading to increased demand and better auction outcomes for banks that move quickly.</li>
    </ul>

    <p>At <b>Vihara</b>, we help banks and credit unions efficiently auction distressed properties while maximizing recovery. Let’s connect and explore how we can help.</p>

    <p>Best,<br>
    Trisha<br>
    <a href="https://vihara.ai" target="_blank">Vihara.ai</a></p>

    <p style="margin-top: 20px; text-align: center;">
      <a href="https://viharabackend.onrender.com/api/unsubscribe?email=${
        user?.email
      }" 
         style="display: inline-block; padding: 10px 20px; font-size: 14px; color: #fff; background-color: #d9534f; text-decoration: none; border-radius: 5px;">
         Unsubscribe
      </a>
    </p>
  `,
  },
  {
    subject: "3 Distressed Property Trends Banks Can’t Ignore",
    body: `
    <p>Dear ${user?.["First Name"] || "Valued Partner"},</p>

    <p>I wanted to share three new insights about the distressed property market that could impact your institution’s asset management strategy:</p>

    <ul>
      <li><b>More Homeowners Are Walking Away</b> – With declining equity in certain markets, some borrowers are abandoning their homes before foreclosure even begins, leaving banks with unexpected liabilities.</li>
      <li><b>Short Sales Are Losing Favor</b> – While short sales were once a popular exit strategy, many sellers are now opting to let properties go into foreclosure, increasing auction inventory.</li>
      <li><b>Regulations Are Tightening on Vacant Properties</b> – Cities are cracking down on unmaintained foreclosures, imposing fines and legal pressures that make quick liquidation more urgent than ever.</li>
    </ul>

    <p>At <b>Vihara</b>, we help banks and credit unions auction distressed properties efficiently, ensuring compliance and maximizing returns. The Vihara team would love to chat to explore how we can help your bank!</p>

    <p>Thanks,<br>
    Trisha<br>
    <a href="https://vihara.ai" target="_blank">Vihara.ai</a></p>

    <p style="font-size: 12px; color: #888; text-align: center;">
          <a href="https://viharabackend.onrender.com/api/unsubscribe?email=${
            user["Email"]
          }" style="color: #888;">Click here to unsubscribe</a>.
        </p>
  `,
  },
  {
    "subject": "3 Emerging Trends in Distressed Property Auctions",
    "body": `
      <p>Hey ${user?.["First Name"] || "Valued Partner"},</p>
  
      <p>I wanted to share three fresh insights about the distressed property market that could impact your institution’s approach to liquidating assets:</p>
  
      <ul>
        <li><b>Pre-Foreclosures Are Surging</b> – A growing number of homeowners are defaulting before reaching full foreclosure, creating early opportunities for banks to act before assets become liabilities.</li>
        <li><b>Banks Are Shifting Toward Digital Auctions</b> – Traditional sales take too long. More financial institutions are turning to online auction platforms to move distressed properties faster and more efficiently.</li>
        <li><b>Due Diligence is More Critical Than Ever</b> – Investors are becoming more selective, demanding detailed property data before bidding. Well-structured auctions with full transparency attract stronger buyers and better prices.</li>
      </ul>
  
      <p>At <b>Vihara</b>, we streamline the auction process for banks and credit unions, ensuring fast, high-return sales.</p>
  
      <p>Best,<br>
      Vinayak<br>
      <a href="https://vihara.ai" target="_blank">Vihara.ai</a></p>
  
      <p style="font-size: 12px; color: #888; text-align: center;">
          <a href="https://viharabackend.onrender.com/api/unsubscribe?email=${
            user["Email"]
          }" style="color: #888;">Click here to unsubscribe</a>.
        </p>
    `
  },
  {
  subject: "Distressed Property Auctions Pilot",
  body: `
    <p>Hi ${user?.["First Name"] || "Valued Partner"},</p>

    <p>I hope this email finds you well.</p>

    <p>I'm Trisha, the Head of Asset Management at Vihara. We specialize in auctioning distressed properties, helping institutions like yours maximize returns efficiently.</p>

    <p>I'd love to connect and explore how we can run a pilot auction tailored to your needs. Do you have 15-30 minutes this week for a quick chat?
     <a href="https://calendly.com/trisha-vihara/30min" target="_blank">Click here to schedule a time that works for you</a>.</p>

    <p>Looking forward to your thoughts.</p>

    <p>Best,<br>
    Trisha Soin, MPH, BSN<br>
    <a href="https://www.vihara.ai" target="_blank">https://www.vihara.ai</a></p>

    <p style="font-size: 12px; color: #888; text-align: center;">
      <a href="https://viharabackend.onrender.com/api/unsubscribe?email=${
            user["Email"]
          }" style="color: #888;">Click here to unsubscribe</a>.
    </p>`
  }
  
];

module.exports = content;
