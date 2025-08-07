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
      subject: "AI is reshaping real estate closings. Quietly.",
      preheader: "We don’t just match buyers. We predict who closes.",
      body: `
<p style="display: none;">We don’t just match buyers. We predict who closes.</p>
<p>Hi ${user?.["First Name"] || "Valued Partner"},</p>
<p>Everyone has a “buyer list.”</p>
<p>But we use predictive scoring — based on behavior, funding, and past close velocity — to find the one who actually wires.</p>
<p>It’s why our sellers don’t relist.</p>
<p>Let’s show you how it works on one property:</p>
<p>👉 www.vihara.ai or reply and we’ll walk you through it.</p>
<p>– Trisha</p>
${logo}
${unsubscribe}`
    },
    {
      subject: "Zillow won’t fix this. You need precision.",
      preheader: "Listing exposure ≠ listing performance.",
      body: `
<p style="display: none;">Listing exposure ≠ listing performance.</p>
<p>Hi ${user?.["First Name"] || "Valued Partner"},</p>
<p>More listings. Fewer closings.</p>
<p>Buyers today don’t browse. They zero in.</p>
<p>Vihara connects to intent-driven buyers directly — no spam, no fluff. Just closings.</p>
<p>Want to try one property?</p>
<p>👉 www.vihara.ai — or reply “let’s go.”</p>
<p>– Trisha</p>
${logo}
${unsubscribe}`
    },
    {
      subject: "REO flipping is slowing — but buyer appetite isn’t.",
      preheader: "The smart capital is asking for clean inventory.",
      body: `
<p style="display: none;">The smart capital is asking for clean inventory.</p>
<p>Hi ${user?.["First Name"] || "Valued Partner"},</p>
<p>Flipping is down across 30 states (ATTOM, Q2 2025).</p>
<p>But the money hasn’t vanished — it’s just being smarter.</p>
<p>We surface clean, pre-screened REOs to motivated institutional + private buyers.</p>
<p>Want to see what they’re looking for?</p>
<p>👉 www.vihara.ai</p>
<p>– Trisha</p>
${logo}
${unsubscribe}`
    },
    {
      subject: "Silent sellers win. Loud ones get buried.",
      preheader: "You don’t need exposure. You need execution.",
      body: `
<p style="display: none;">You don’t need exposure. You need execution.</p>
<p>Hi ${user?.["First Name"] || "Valued Partner"},</p>
<p>We’re in a buyer filter cycle.</p>
<p>Volume platforms are flooding inboxes. But serious sellers? They go where the closings happen.</p>
<p>That’s why Vihara works:</p>
<ul>
  <li>Pre-vetted buyers</li>
  <li>Zero listing fee</li>
  <li>Fast exits</li>
</ul>
<p>One property. One clean test.</p>
<p>👉 www.vihara.ai — or reply and we’ll show you.</p>
<p>– Trisha</p>
${logo}
${unsubscribe}`
    },
    {
      subject: "The post-pandemic cushion is gone. Quietly.",
      preheader: "Sellers are still pricing like it's 2022. Buyers aren't.",
      body: `
<p style="display: none;">Sellers are still pricing like it's 2022. Buyers aren't.</p>
<p>Hi ${user?.["First Name"] || "Valued Partner"},</p>
<p>Bankrate and ATTOM agree: equity-rich sellers are fading.</p>
<p>Buyers? They're sharpening pencils — and waiting for clean exits.</p>
<p>At Vihara, we front-load that process.</p>
<p>Our buyers don’t bid. They buy.</p>
<p>Let’s test it.</p>
<p>👉 www.vihara.ai or just reply “ready.”</p>
<p>– Trisha</p>
${logo}
${unsubscribe}`
    },
    {
      subject: "Auction.com volumes are rising. So are mistakes.",
      preheader: "Speed ≠ close rate. Intent = margin.",
      body: `
<p style="display: none;">Speed ≠ close rate. Intent = margin.</p>
<p>Hi ${user?.["First Name"] || "Valued Partner"},</p>
<p>Auction.com just posted a Q2 volume spike.</p>
<p>But talk to sellers, and you’ll hear the same: lots of bids, few real closings.</p>
<p>Vihara is different.</p>
<p>Behavioral filtering. Private network. 17-day avg to cash.</p>
<p>Try one.</p>
<p>👉 www.vihara.ai or reply “show me.”</p>
<p>– Trisha</p>
${logo}
${unsubscribe}`
    },
    {
      subject: "Your Fed window just narrowed.",
      preheader: "Rate watch = REO risk.",
      body: `
<p style="display: none;">Rate watch = REO risk.</p>
<p>Hi ${user?.["First Name"] || "Valued Partner"},</p>
<p>The next Fed adjustment could shrink buyer capital again.</p>
<p>That means more discounting… unless you act now.</p>
<p>Vihara = clean buyer matches, before the market softens further.</p>
<p>One asset. Zero noise.</p>
<p>👉 www.vihara.ai</p>
<p>– Trisha</p>
${logo}
${unsubscribe}`
    }


  ];
};
