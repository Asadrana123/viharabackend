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
  subject: "Buyers don’t need perfect. They need clear.",
  preheader: "Home valuation gaps are widening. Transparency wins.",
  body: `
<p style="display: none;">Home valuation gaps are widening. Transparency wins.</p>
<p>Hi ${user?.["First Name"] || "Valued Partner"},</p>
<p>Bankrate’s latest survey shows buyer confusion on pricing is at a 5-year high.</p>
<p>That’s stalling offers.</p>
<p>We solve that—by educating our buyer base before they bid.</p>
<p>Result? Clarity = confidence = closings.</p>
<p>Want in?</p>
<p>– Trisha</p>
${logo}
${unsubscribe}`
},
{
  subject: "Equity erosion isn’t dramatic. It’s daily.",
  preheader: "Most sellers wait too long to find out.",
  body: `
<p style="display: none;">Most sellers wait too long to find out.</p>
<p>Hi ${user?.["First Name"] || "Valued Partner"},</p>
<p>REO sellers aren’t panicking.</p>
<p>But the ones who wait quietly lose 3–5% while watching headlines.</p>
<p>Vihara exits early—with full visibility and zero fee risk.</p>
<p>Let’s move one.</p>
<p>– Trisha</p>
${logo}
${unsubscribe}`
},{
  subject: "You’re not early until you sell.",
  preheader: "“I knew the market was turning” doesn’t pay the mortgage.",
  body: `
<p style="display: none;">“I knew the market was turning” doesn’t pay the mortgage.</p>
<p>Hi ${user?.["First Name"] || "Valued Partner"},</p>
<p>A lot of sellers say they saw the trend early.</p>
<p>Only a few acted.</p>
<p>At Vihara, we help you move when it matters—not when it’s too late.</p>
<p>No fees. No games. Just action.</p>
<p>– Trisha</p>
${logo}
${unsubscribe}`
},
{
  subject: "One asset. One test. One shot at clean margin.",
  preheader: "The next 60 days could define your REO results.",
  body: `
<p style="display: none;">The next 60 days could define your REO results.</p>
<p>Hi ${user?.["First Name"] || "Valued Partner"},</p>
<p>Everything is compounding right now:</p>
<p>Rates. Tariffs. Wildfire costs. Buyer fatigue.</p>
<p>But margin is still possible—if you move now.</p>
<p>Let’s test one together.</p>
<p>– Trisha</p>
${logo}
${unsubscribe}`
},
{
  subject: "Inventory’s building. Quiet sellers are winning.",
  preheader: "Vihara = qualified buyers. Clean exits. No noise.",
  body: `
<p style="display: none;">Vihara = qualified buyers. Clean exits. No noise.</p>
<p>Hi ${user?.["First Name"] || "Valued Partner"},</p>
<p>ATTOM just reported another monthly rise in foreclosure starts.</p>
<p>Sellers who move quietly are exiting clean—above reserve, zero listing fees unless we deliver.</p>
<p>Want to move one? Reply here and we’ll show you how.</p>
<p>– Trisha</p>
${logo}
${unsubscribe}`
},
{
  subject: "Buyers are still there — but they’re filtering harder.",
  preheader: "Sellers who qualify buyers first are closing faster.",
  body: `
<p style="display: none;">Sellers who qualify buyers first are closing faster.</p>
<p>Hi ${user?.["First Name"] || "Valued Partner"},</p>
<p>Loan originations are slowing. But buyers haven’t vanished—they’ve just gotten sharper.</p>
<p>We pre-screen buyer intent and funding before auction day.</p>
<p>Let’s try one listing?</p>
<p>👉 www.vihara.ai</p>
<p>– Trisha</p>
${logo}
${unsubscribe}`
},
{
  subject: "Rate shifts are coming. Margin windows are narrowing.",
  preheader: "Exit before discount season begins.",
  body: `
<p style="display: none;">Exit before discount season begins.</p>
<p>Hi ${user?.["First Name"] || "Valued Partner"},</p>
<p>Mortgage rates may shift again this quarter. If they do, buyer pools shrink.</p>
<p>At Vihara, we help sellers exit ahead of markdown season—17-day average close.</p>
<p>– Trisha</p>
${logo}
${unsubscribe}`
},
{
  subject: "Serious buyers don’t scroll MLS. They ask us.",
  preheader: "Vetted buyers don’t wait for listings.",
  body: `
<p style="display: none;">Vetted buyers don’t wait for listings.</p>
<p>Hi ${user?.["First Name"] || "Valued Partner"},</p>
<p>The buyers we work with don’t waste time browsing.</p>
<p>They ask us directly for off-market opportunities.</p>
<p>Let’s place one of your assets in front of them?</p>
<p>👉 www.vihara.ai — or just reply here.</p>
<p>– Trisha</p>
${logo}
${unsubscribe}`
},
  ];
};
