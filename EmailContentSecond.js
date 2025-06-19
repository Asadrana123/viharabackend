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
    subject: "Auctions aren’t for the desperate anymore.",
    preheader: "In 2025, they’re strategic. Fast. And profitable.",
    body: `
<p style="display: none;">In 2025, they’re strategic. Fast. And profitable.</p>
<p>Hi ${user?.["First Name"] || "Valued Partner"},</p>
<p>Forget the old perception.</p>
<p>Today’s smartest sellers are turning to auction platforms by design.</p>
<p>Vihara delivers:</p>
<p>🔍 Private buyer network<br>
📉 No listing fee unless we close<br>
📆 17-day avg. time-to-cash</p>
<p>This isn’t distress selling. It’s precision.</p>
<p>Let’s test it.</p>
<p>– Trisha</p>
${logo}
${unsubscribe}
`
  },
  {
    subject: "You don’t need to compete. You need to opt out.",
    preheader: "Most sellers chase. We select. That’s why we close.",
    body: `
<p style="display: none;">Most sellers chase. We select. That’s why we close.</p>
<p>Hi ${user?.["First Name"] || "Valued Partner"},</p>
<p>Competing on public platforms is like running uphill.</p>
<p>📉 Buyer attention spans are short<br>
📉 Offers are weaker<br>
📉 Fallouts are higher</p>
<p>We skip the noise.</p>
<p>Vihara surfaces real buyers, before your asset is even listed.</p>
<p>One asset. One clean close. Let’s go.</p>
<p>– Trisha</p>
${logo}
${unsubscribe}
`
  },
  {
    subject: "A slowdown is coming. But liquidity is still possible.",
    preheader: "Bankrate says the market’s tipping. We show how to stay liquid.",
    body: `
<p style="display: none;">Bankrate says the market’s tipping. We show how to stay liquid.</p>
<p>Hi ${user?.["First Name"] || "Valued Partner"},</p>
<p>Tariffs. Rates. Supply chain drag.</p>
<p>According to Bankrate, sellers are already seeing pricing pressure.</p>
<p>At Vihara, our sellers close faster and higher—because we don’t wait for headlines.</p>
<p>We use signals. Not sentiment.</p>
<p>Let’s get one asset moving.</p>
<p>– Trisha</p>
${logo}
${unsubscribe}
`
  },
  {
    subject: "The next 60 days will define your year.",
    preheader: "This isn’t a prediction. It’s a math problem.",
    body: `
<p style="display: none;">This isn’t a prediction. It’s a math problem.</p>
<p>Hi ${user?.["First Name"] || "Valued Partner"},</p>
<p>If your listing enters the market after the next Fed shift…</p>
<p>…it competes on discount, not value.</p>
<p>Our sellers move assets before that happens.</p>
<p>Vihara = buyers who close, not just browse.</p>
<p>You’ve seen the shift coming.</p>
<p>Let’s act on it.</p>
<p>– Trisha</p>
${logo}
${unsubscribe}
`
  }
];
};
