module.exports = function (user) {
  const logo =
    `<div style="text-align: center; margin-top: 20px;">
        <img src="https://res.cloudinary.com/my1chatapp/image/upload/v1742399258/vihara-logo-b_jgiv7c.png" alt="Vihara Logo" style="width: 150px; height: auto;" />
      </div>`;

  const unsubscribe =
    `<p style="font-size: 12px; color: #888; text-align: center;">
        <a href="https://viharabackend-pcwn.onrender.com/api/unsubscribe?email=${user["Email"]}" style="color: #888;">Click here to unsubscribe</a>.
      </p>`;

  return [
    {
      subject: "Remote work just killed another market segment. Are you hedged?",
      body:
        `<p style="display: none;">Urban office sales are down. Buyer confidence follows.</p>
         <p>Hi ${user?.["First Name"] || "Valued Partner"},</p>
         <p>Remote work isn’t going anywhere.</p>
         <p>Vacancy rates are surging, and urban office portfolios are bleeding value.</p>
         <p>The spillover to REO is coming.</p>
         <ul>
           <li>Inventory will spike</li>
           <li>Buy-side liquidity? Not guaranteed</li>
         </ul>
         <p>We help sellers stay liquid before the system gets choked.</p>
         <p>Zero listing fees. Vetted buyers only.</p>
         <p>Let’s test one deal together.</p>
         <p>– Trisha</p>
         ${logo}
         ${unsubscribe}`
    },
    {
      subject: "Inflation, layoffs, and one clean REO shot.",
      body:
        `<p style="display: none;">You don’t get a second chance in this environment.</p>
         <p>Hi ${user?.["First Name"] || "Valued Partner"},</p>
         <p>Inflation is pushing costs up. Rates are bouncing. And layoffs are creeping back in.</p>
         <p>In this market, you only get one clean shot to liquidate.</p>
         <p><strong>The right buyer. The first time.</strong></p>
         <p>Vihara gives sellers:</p>
         <ul>
           <li><strong>X%</strong> more buyer engagement</li>
           <li><strong>Y%</strong> better close rates</li>
           <li><strong>Z%</strong> faster time-to-cash</li>
         </ul>
         <p>Want a walkthrough?</p>
         <p>Just one asset. One test. That’s it.</p>
         <p>– Trisha</p>
         ${logo}
         ${unsubscribe}`
    },
    {
      subject: "The hidden foreclosure surge no one’s talking about.",
      body:
        `<p style="display: none;">It’s not 2008 — but pockets of distress are growing fast.</p>
         <p>Hi ${user?.["First Name"] || "Valued Partner"},</p>
         <p>Bankrate just reported:</p>
         <p>Foreclosures aren’t a 2008 repeat — but cracks are showing, fast.</p>
         <p>🏠 Judicial states like FL, NY, IL are seeing sharp jumps.</p>
         <p>📉 Pockets of inventory are building quietly.</p>
         <p>At Vihara, we match assets to serious buyers before the discount wave hits.</p>
         <p>Quiet. Fast. Above reserve.</p>
         <p>Want to position one of your assets early?</p>
         <p>– Trisha</p>
         ${logo}
         ${unsubscribe}`
    },
    {
      subject: "Why waiting 90 days could cost you 10%.",
      body:
        `<p style="display: none;">Home equity cushions are shrinking. Distress is getting real.</p>
         <p>Hi ${user?.["First Name"] || "Valued Partner"},</p>
         <p>Homeowner equity was supposed to cushion the market.</p>
         <p>But according to Bankrate, it’s already thinning out — especially in distressed pockets.</p>
         <p>That’s bad news for passive sellers. Good news if you move early.</p>
         <p>Vihara targets serious buyers fast—before markdowns start.</p>
         <p>Let’s walk through a no-risk pilot?</p>
         <p>– Trisha</p>
         ${logo}
         ${unsubscribe}`
    },
    {
      subject: "Florida and New York: The quiet REO opportunity zone.",
      body:
        `<p style="display: none;">Judicial states are showing early cracks. Here's how to capitalize.</p>
         <p>Hi ${user?.["First Name"] || "Valued Partner"},</p>
         <p>Foreclosure cases are ticking up fastest in judicial states like Florida and New York.</p>
         <p>(The states where court approval delays used to keep supply low.)</p>
         <p>This next wave won’t be a crash—it’ll be a slow leak.</p>
         <p>Vihara places assets with committed buyers now, not after prices slide.</p>
         <p>Timing is everything.</p>
         <p>– Trisha</p>
         ${logo}
         ${unsubscribe}`
    },
    {
      subject: "Buyers are cautious — but still closing. Here’s how we know.",
      body:
        `<p style="display: none;">It's not about more bidders. It's about better ones.</p>
         <p>Hi ${user?.["First Name"] || "Valued Partner"},</p>
         <p>According to Bankrate, buyers haven’t disappeared.</p>
         <p>They’re just being smarter — waiting for the right deals.</p>
         <p>Vihara isn’t a volume auction.</p>
         <p>We pre-match assets to buyers showing real engagement, funding, and intent.</p>
         <p>No surprises. No relists. Just fast, clean closes.</p>
         <p>Want to see it live?</p>
         <p>– Trisha</p>
         ${logo}
         ${unsubscribe}`
    },
    {
      subject: "Economic shock risks are rising. Smart sellers are adapting.",
      body:
        `<p style="display: none;">Waiting for the "bottom" is risky. Liquidity beats timing.</p>
         <p>Hi ${user?.["First Name"] || "Valued Partner"},</p>
         <p>Unemployment pressures and tariff risks are back on the radar (Bankrate, Apr 2025).</p>
         <p>If a shock hits, REO volumes will spike overnight.</p>
         <p>When that happens, only pre-positioned sellers win.</p>
         <p>Vihara sellers move assets before the noise starts.</p>
         <p>Want to get ahead?</p>
         <p>– Trisha</p>
         ${logo}
         ${unsubscribe}`
    },
    {
      subject: "Today's auction market isn’t noisy. It's sniper-quiet.",
      body:
        `<p style="display: none;">Fewer buyers. Smarter matches. Faster closes.</p>
         <p>Hi ${user?.["First Name"] || "Valued Partner"},</p>
         <p>This isn’t 2021.</p>
         <p>Auction buyers today aren’t overbidding. They’re sniping clean, targeted assets.</p>
         <p>That’s why Vihara’s model is different:</p>
         <ul>
           <li>🎯 Pre-qualified buyers</li>
           <li>🎯 No mass marketing</li>
           <li>🎯 17-day average close</li>
         </ul>
         <p>Want to line up a clean win?</p>
         <p>Let’s chat.</p>
         <p>– Trisha</p>
         ${logo}
         ${unsubscribe}`
    },
    {
      subject: "Your first move now defines your next six months.",
      body:
        `<p style="display: none;">Early liquidation = margin protection. Late = markdowns.</p>
         <p>Hi ${user?.["First Name"] || "Valued Partner"},</p>
         <p>Every market cycle rewards early movers.</p>
         <p>(Just look at how judicial-state REO sellers are positioning already — Bankrate, Apr 2025.)</p>
         <p>Waiting costs you margin. Acting wisely protects it.</p>
         <p>Vihara gives you the buyers you need, before the headlines catch up.</p>
         <p>One test listing. One clean close.</p>
         <p>Ready?</p>
         <p>– Trisha</p>
         ${logo}
         ${unsubscribe}`
    }
  ];
};
