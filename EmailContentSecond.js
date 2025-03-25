module.exports = function(user) {
  const logo = `
    <div style="text-align: center; margin-top: 20px;">
      <img src="https://res.cloudinary.com/my1chatapp/image/upload/v1742399258/vihara-logo-b_jgiv7c.png" alt="Vihara Logo" style="width: 150px; height: auto;" />
    </div>`;

  const unsubscribe = `
    <p style="font-size: 12px; color: #888; text-align: center;">
      <a href="https://viharabackend.onrender.com/api/unsubscribe?email=${user["Email"]}" style="color: #888;">Click here to unsubscribe</a>.
    </p>`;

  return [
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
        Trisha Soin<br>
        <a href="https://www.vihara.ai" target="_blank">vihara.ai</a></p>
        ${logo}
        ${unsubscribe}`
    },
    {
      subject: "Why Distressed Property Auctions Work for You",
      body: `
        <p>Hi ${user?.["First Name"] || "Valued Partner"},</p>
        <p>Did you know distressed property auctions can generate higher returns in a shorter time?</p>
        <p>Our platform connects serious buyers with exclusive properties, ensuring a competitive and efficient process.</p>
        <p>Let's discuss how this can benefit your portfolio. <a href="https://calendly.com/trisha-vihara/30min" target="_blank">Book a quick call</a>.</p>
        <p>Best,<br>
        Trisha Soin</p>
        ${logo}
        ${unsubscribe}`
    },
    {
      subject: "RE:Exclusive: 2025 Distressed Real Estate Trends for Lenders",
      body: `
        <p>Hi ${user?.["First Name"] || "Valued Partner"},</p>
        <p>The real estate market is shifting fast, and distressed assets are becoming a major investment opportunity.</p>
        <h3>📊 Key Market Trends:</h3>
        <ul>
          <li>✅ <b>Foreclosures Are Up</b> – A 25% increase in 2025 compared to last year.</li>
          <li>✅ <b>Distressed Sales Boom</b> – 15% of all real estate transactions now involve distressed properties.</li>
          <li>✅ <b>Shifting Buyer Demand</b> – 30% of foreclosed homes are in suburban & rural areas due to remote work shifts.</li>
        </ul>
        <p>Vihara helps institutions analyze distressed properties and optimize asset recovery.</p>
        <p>Would you like to see how we help institutions like yours? <a href="https://calendly.com/trisha-vihara/30min" target="_blank">Schedule a call</a>.</p>
        <p>Best,<br>
        Trisha Gupta<br>
        <a href="https://vihara.ai">Vihara.ai</a></p>
        ${logo}
        ${unsubscribe}`
    },
    {
      subject: "3 Essential Insights on the Distressed Property Market for Banks",
      body: `
        <p>Dear ${user?.["First Name"] || "Valued Partner"},</p>
        <h3>🔹 Increased Default Rates</h3>
        <p>Default rates are rising, meaning more distressed properties are entering the market.</p>
        <h3>🔹 Higher Recovery Values Through Auctions</h3>
        <p>Studies show that auctioning distressed properties can yield higher recovery rates.</p>
        <h3>🔹 Regulatory Pressure on Property Disposal</h3>
        <p>Regulatory requirements for non-performing loans are tightening.</p>
        <p>Let's discuss how Vihara can help. <a href="https://calendly.com/trisha-vihara/30min" target="_blank">Schedule a quick chat</a>.</p>
        <p>Best,<br>
        Trisha Gupta<br>
        <a href="https://vihara.ai">Vihara.ai</a></p>
        ${logo}
        ${unsubscribe}`
    },
    {
      subject: "Maximize Returns: Data-Driven Distressed Property Auctions",
      body: `
        <p>Hi ${user?.["First Name"] || "Valued Partner"},</p>
        <p>Did you know data-driven auction strategies can help institutions like yours achieve better recovery rates?</p>
        <p>Our AI-powered platform helps predict market trends, identify high-value properties, and attract serious buyers for a competitive bidding process.</p>
        <p>Let's discuss how our solutions can help. <a href="https://calendly.com/trisha-vihara/30min" target="_blank">Schedule a call</a>.</p>
        <p>Best,<br>
        Trisha Gupta<br>
        <a href="https://vihara.ai">Vihara.ai</a></p>
        ${logo}
        ${unsubscribe}`
    },
    {
      subject: "How Banks Are Leveraging Auctions for Higher Asset Recovery",
      body: `
        <p>Hi ${user?.["First Name"] || "Valued Partner"},</p>
        <p>Many financial institutions are now using auction strategies to increase recovery rates on distressed properties.</p>
        <p>By leveraging competitive bidding and real-time market insights, banks are able to maximize property value while minimizing holding costs.</p>
        <h3>🔹 Key Benefits of Auctioning Distressed Properties:</h3>
        <ul>
          <li>✅ Faster turnaround time—properties can be sold in days, not months.</li>
          <li>✅ Competitive bidding drives up final sale prices.</li>
          <li>✅ Reduced legal and maintenance costs for held assets.</li>
        </ul>
        <p>Would you like to learn how Vihara can help your institution optimize asset recovery? <a href="https://calendly.com/trisha-vihara/30min" target="_blank">Let's chat.</a></p>
        <p>Best,<br>
        Trisha Gupta<br>
        <a href="https://vihara.ai" target="_blank">Vihara.ai</a></p>
        ${logo}
        ${unsubscribe}`
    },
    {
      subject: "Distressed Property Auction Insights You Shouldn't Miss",
      body: `
        <p>Hi ${user?.["First Name"] || "Valued Partner"},</p>
        <p>Are you staying updated on the latest trends in distressed property auctions? Let's discuss how Vihara can help.</p>
        <p><a href="https://calendly.com/trisha-vihara/30min" target="_blank">Schedule a call</a> today.</p>
        <p>Best,<br>Trisha Gupta</p>
        ${logo}
        ${unsubscribe}`
    },
    {
      subject: "Distressed Property Auction Insights You Shouldn't Miss",
      body: `
        <p>Hi ${user?.["First Name"] || "Valued Partner"},</p>
        <p>Are you staying updated on the latest trends in distressed property auctions? Market conditions are shifting, and financial institutions that adapt quickly are seeing stronger returns.</p>
        <h3>🔹 What's Changing in 2025?</h3>
        <ul>
          <li>📈 Increased investor interest in foreclosure properties.</li>
          <li>🏡 More suburban and rural properties entering distressed markets.</li>
          <li>⚖️ New regulatory policies impacting non-performing loan management.</li>
        </ul>
        <p>Vihara provides real-time auction insights and a seamless platform to help banks optimize asset liquidation.</p>
        <p><a href="https://calendly.com/trisha-vihara/30min" target="_blank">Schedule a call</a> today to explore how your institution can stay ahead of market changes.</p>
        <p>Best,<br>
        Trisha Gupta<br>
        <a href="https://vihara.ai" target="_blank">Vihara.ai</a></p>
         ${logo}
        ${unsubscribe}`
    }
  ];
};
