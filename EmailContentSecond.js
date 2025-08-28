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
      subject: "Foreclosures up. Inventory up. Closings?",
      preheader: "ATTOM’s midyear data tells a clear story.",
      body: `
<p style="display: none;">ATTOM’s midyear data tells a clear story.</p>
<p>Hi ${user?.["First Name"] || "Valued Partner"},</p>
<p>ATTOM just flagged a midyear foreclosure spike across 21 states.</p>
<p>Buyers are watching. So are servicers.</p>
<p>If you’re sitting on margin — move now.</p>
<p>Vihara helps you exit before markdowns hit.</p>
<p>Test one with us:</p>
<p>👉 www.vihara.ai — or just reply.</p>
<p>– Trisha</p>
${logo}
${unsubscribe}`
    },
    {
      subject: "You don’t need to guess buyer appetite. We measure it.",
      preheader: "Why we close faster — and cleaner.",
      body: `
<p style="display: none;">Why we close faster — and cleaner.</p>
<p>Hi ${user?.["First Name"] || "Valued Partner"},</p>
<p>Every seller thinks their asset will sell fast.</p>
<p>We don’t think. We know.</p>
<p>Vihara tracks real-time buyer demand — per zip code, per property type.</p>
<p>Want to place one property in front of the right pool?</p>
<p>👉 www.vihara.ai</p>
<p>– Trisha</p>
${logo}
${unsubscribe}`
    },
    {
      subject: "Buyers aren’t gone. They’re just better at math.",
      preheader: "Clean assets still close. But only when priced right.",
      body: `
<p style="display: none;">Clean assets still close. But only when priced right.</p>
<p>Hi ${user?.["First Name"] || "Valued Partner"},</p>
<p>ATTOM’s latest flip data shows it:</p>
<p>Margins are thinning. Buyer expectations are sharper.</p>
<p>We pre-screen intent and pricing tolerance — before you list.</p>
<p>That’s why Vihara sellers don’t relist. They close.</p>
<p>Want in?</p>
<p>👉 www.vihara.ai or reply “let’s go.”</p>
<p>– Trisha</p>
${logo}
${unsubscribe}`
    },
    {
      subject: "REO isn’t emotional. It’s math.",
      preheader: "We move assets before the headlines do.",
      body: `
<p style="display: none;">We move assets before the headlines do.</p>
<p>Hi ${user?.["First Name"] || "Valued Partner"},</p>
<p>Mortgage delinquency is creeping back up (see LiveNow + TMP).</p>
<p>Bankruptcies are ticking. Buyers are watching. Quietly.</p>
<p>We work off metrics, not hope.</p>
<p>Match the asset. Move it fast. That’s the model.</p>
<p>Let’s try one.</p>
<p>👉 www.vihara.ai</p>
<p>– Trisha</p>
${logo}
${unsubscribe}`
    },
    {
      subject: "Not all clicks are buyers. We filter.",
      preheader: "Clicks ≠ closings. Behavior does.",
      body: `
<p style="display: none;">Clicks ≠ closings. Behavior does.</p>
<p>Hi ${user?.["First Name"] || "Valued Partner"},</p>
<p>Open rates, scroll depth, vanity metrics — we don’t care.</p>
<p>We care about buyer behavior.</p>
<p>That’s how we’ve cut fallout rates and slashed time-to-cash.</p>
<p>Want to test one?</p>
<p>👉 www.vihara.ai — or just reply.</p>
<p>– Trisha</p>
${logo}
${unsubscribe}`
    },
    {
      subject: "We don't list. We place.",
      preheader: "Where we list assets is more important than when.",
      body: `
<p style="display: none;">Where we list assets is more important than when.</p>
<p>Hi ${user?.["First Name"] || "Valued Partner"},</p>
<p>Most REO platforms throw your listing into the noise.</p>
<p>We place it directly in front of qualified buyers.</p>
<p>Not listed. Not overexposed. Just sold.</p>
<p>👉 www.vihara.ai — or reply to try it.</p>
<p>– Trisha</p>
${logo}
${unsubscribe}`
    },
    {
      subject: "Buyers don’t want flash. They want fit.",
      preheader: "Our model works because we know their filters.",
      body: `
<p style="display: none;">Our model works because we know their filters.</p>
<p>Hi ${user?.["First Name"] || "Valued Partner"},</p>
<p>Every buyer has their unspoken checklist.</p>
<p>We’ve studied the patterns.</p>
<p>That’s why our average close time is 17 days.</p>
<p>Because we don’t guess. We match.</p>
<p>Let’s place one of your assets where it fits.</p>
<p>👉 www.vihara.ai</p>
<p>– Trisha</p>
${logo}
${unsubscribe}`
    },
    {
      subject: "One seller moved early. One didn’t.",
      preheader: "One got 98% of ask. The other relisted twice.",
      body: `
<p style="display: none;">One got 98% of ask. The other relisted twice.</p>
<p>Hi ${user?.["First Name"] || "Valued Partner"},</p>
<p>Same zip. Same asset type.</p>
<p>One seller tested Vihara. The other waited 3 weeks too long.</p>
<p>Result?</p>
<p>17-day close vs 63-day relist cycle.</p>
<p>Timing = margin.</p>
<p>👉 www.vihara.ai — ready to test one?</p>
<p>– Trisha</p>
${logo}
${unsubscribe}`
    },
    {
      subject: "Where is foreclosure risk rising? Quietly, everywhere.",
      preheader: "New data points to upticks in Midwest + Southeast.",
      body: `
<p style="display: none;">New data points to upticks in Midwest + Southeast.</p>
<p>Hi ${user?.["First Name"] || "Valued Partner"},</p>
<p>Auction.com and ATTOM both show rising default activity —</p>
<p>especially in “stable” metros.</p>
<p>The next wave won’t scream. It’ll leak.</p>
<p>We help you stay early. Positioned. Liquid.</p>
<p>Test one today: 👉 www.vihara.ai</p>
<p>– Trisha</p>
${logo}
${unsubscribe}`
    },
    {
      subject: "The last clean margin window of 2025?",
      preheader: "What you do now defines Q4.",
      body: `
<p style="display: none;">What you do now defines Q4.</p>
<p>Hi ${user?.["First Name"] || "Valued Partner"},</p>
<p>Rates, cost inflation, buyer fatigue. It’s compounding.</p>
<p>And it’s not even October.</p>
<p>Sellers using Vihara today are locking in clean margin.</p>
<p>Those who delay… will chase it.</p>
<p>Ready to move? 👉 www.vihara.ai</p>
<p>– Trisha</p>
${logo}
${unsubscribe}`
    },
    {
      subject: "Last chance to move before Q4 pressure builds.",
      preheader: "Let’s close clean before the market shifts again.",
      body: `
<p style="display: none;">Let’s close clean before the market shifts again.</p>
<p>Hi ${user?.["First Name"] || "Valued Partner"},</p>
<p>This is your last call for summer closings.</p>
<p>We still have committed buyers in multiple markets.</p>
<p>Place just one asset — we’ll handle the rest.</p>
<p>Close in 17 days. No listing fees unless we deliver.</p>
<p>👉 www.vihara.ai — or reply here.</p>
<p>– Trisha</p>
${logo}
${unsubscribe}`
    }

  ];
};
