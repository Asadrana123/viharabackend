module.exports = function(user) {
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
    subject: "What if the best buyers never saw your listings?",
    body: 
          `<p style="display: none;">Most platforms miss 60% of qualified REO buyers. We don't.</p>
           <p>Hi ${user?.["First Name"] || "Valued Partner"},</p>
           <p>Quick thought: What if the <strong>highest-intent buyers</strong>—the ones who close fast—never saw your listings?</p>
           <ul>
             <li>Most auction platforms market to the <em>usual buyers.</em></li>
             <li>Vihara connects sellers to <strong>private buyer pools</strong> that aren't visible on other sites.</li>
             <li>It's not about more eyes—it's about <strong>the right eyes</strong></li>
           </ul>
           <p>Curious? I'll show you how.</p>
           <p>– Trisha<br>Head of Asset Management | Vihara</p>
           ${logo}
           ${unsubscribe}`
  },
  {
    subject: "Update: Our buyer funnel doesn't look like anyone else's.",
    body: 
          `<p style="display: none;">And that's why sellers like you switch to Vihara.</p>
           <p>Hi ${user?.["First Name"] || "Valued Partner"},</p>
           <p>Most sellers think "more traffic = better outcome." We've found the opposite:</p>
           <ul>
             <li>Traditional platforms chase volume—we track <strong>engagement depth</strong></li>
             <li>Our buyer network includes <strong>off-market investors</strong>, trust funds, and fix-and-hold firms you won't see on the public grid</li>
             <li>We bring them in <em>before</em> auction day—<strong>quietly.</strong></li>
           </ul>
           <p>We don't compete with the crowd. We skip it.</p>
           <p>Want to see what that changes?</p>
           <p>– Trisha</p>
           ${logo}
           ${unsubscribe}`
  },
  {
    subject: "Not all buyers are created equal. We sort them before they waste your time.",
    body: 
          `<p style="display: none;">Here's how we protect your listing from buyer fallout.</p>
           <p>Hi ${user?.["First Name"] || "Valued Partner"},</p>
           <p>Sellers tell us the same thing:</p>
           <p>"We had 12 bidders. 1 closed."</p>
           <p>We get it. So we built Vihara differently:</p>
           <ul>
             <li>Our buyer intake process <strong>qualifies intent</strong> with behavioral and financial signals</li>
             <li>That means <strong>fewer bids, more closings</strong></li>
             <li>It's not about flashy listings—it's about <strong>quiet confidence in the outcome</strong></li>
           </ul>
           <p>Less noise. More certainty.</p>
           <p>Want a walkthrough?</p>
           <p>– Trisha</p>
           ${logo}
           ${unsubscribe}`
  },
  {
    subject: "Let's make your next auction boring—in a good way.",
    body: 
          `<p style="display: none;">No drama. No fallout. Just real closings.</p>
           <p>Hi ${user?.["First Name"] || "Valued Partner"},</p>
           <p>REO shouldn't feel like roulette. At Vihara:</p>
           <ul>
             <li>We treat auctions like <strong>matchmaking</strong>, not marketing</li>
             <li>The right buyers show up <em>before</em> auction day—and stay through closing</li>
             <li>No surprises, no re-listing, no endless back-and-forth</li>
           </ul>
           <p>I'd love to show you how we do it.</p>
           <p>👉 <a href="https://calendly.com/trisha-vihara/15min" target="_blank">Grab time here</a></p>
           <p>– Trisha<br>Head of Asset Management | Vihara</p>
           ${logo}
           ${unsubscribe}`
  },
  {
    subject: "Why one seller called us 'the quiet advantage'",
    body: 
          `<p style="display: none;">A peek into how Vihara buyers behave differently.</p>
           <p>Hi ${user?.["First Name"] || "Valued Partner"},</p>
           <p>One of our clients recently said:</p>
           <p>"With Vihara, it just <em>felt</em> different. No games, no ghosting—just the right buyers, ready."</p>
           <p>Here's what made the difference:</p>
           <ul>
             <li>Vihara doesn't chase mass traffic. We <strong>cultivate readiness</strong></li>
             <li>Our buyer signals go beyond clicks—we look at <strong>intent, history, and capability</strong></li>
             <li>Sellers stay in control because <strong>we control for buyer noise</strong></li>
           </ul>
           <p>Would you want to pilot one listing?</p>
           <p>– Trisha</p>
           ${logo}
           ${unsubscribe}`
  },
  {
    subject: "Want less drama in your next disposition?",
    body: 
          `<p style="display: none;">Our sellers say "it just works."</p>
           <p>Hi ${user?.["First Name"] || "Valued Partner"},</p>
           <p>If REO sales feel unpredictable— It's likely a <strong>buyer problem</strong>, not a seller one.</p>
           <p>Vihara fixes that with:</p>
           <ul>
             <li>A <strong>pre-qualified pool</strong> that behaves more like direct buyers than opportunists</li>
             <li>Zero listing fees unless we win for you</li>
             <li>A process that's simple, not loud</li>
           </ul>
           <p>One test listing. One clean close.</p>
           <p>Let's talk: <a href="https://calendly.com/trisha-vihara/15min" target="_blank">https://calendly.com/trisha-vihara/15min</a></p>
           <p>– Trisha</p>
           ${logo}
           ${unsubscribe}`
  },
  {
    subject: "The smartest REO sellers are trying something different",
    body: 
          `<p style="display: none;">And it's not because it's better. It's because it's quieter.</p>
           <p>Hi ${user?.["First Name"] || "Valued Partner"},</p>
           <p>Better is debatable. Different is undeniable.</p>
           <ul>
             <li>Vihara doesn't list. We <em>target.</em></li>
             <li>Our buyers don't browse. They <em>buy.</em></li>
             <li>And our sellers? They sleep better.</li>
           </ul>
           <p>Let's try one together. Just one asset. One test. That's it.</p>
           <p>👉 <a href="https://calendly.com/trisha-vihara/15min" target="_blank">Schedule here</a></p>
           <p>Hope we connect,<br>Trisha</p>
           ${logo}
           ${unsubscribe}`
  },
  {
    subject: "Your listings deserve better buyers.",
    body: 
      `<p style="display: none;">Most auction platforms chase noise. Vihara delivers focus.</p>
       <p>Hi ${user?.["First Name"] || "there"},</p>
       <p>Ever feel like your listings are being shown to the wrong crowd?</p>
       <p>Most auction platforms push for more clicks. More views. More noise.</p>
       <ul>
         <li>We don’t just list—we match.</li>
         <li>We whisper to the right buyers—not blast to the masses.</li>
         <li>We prioritize closings—not chaos.</li>
       </ul>
       <p>You’ve worked hard to secure these properties. Let’s make sure the right people see them.</p>
       <p>– Trisha<br>Head of Asset Management | Vihara</p>
       ${logo}
       ${unsubscribe}`
  },
  {
    subject: "We skip the chaos. You close faster.",
    body: 
      `<p style="display: none;">What if REO didn't have to be noisy and messy?</p>
       <p>Hi ${user?.["First Name"] || "there"},</p>
       <p>Most REO sales come with chaos:</p>
       <ul>
         <li>Buyers who ghost.</li>
         <li>Auctions with high drama.</li>
         <li>Re-listings that waste weeks.</li>
       </ul>
       <p>We built Vihara to skip all of that.</p>
       <p>We connect REO sellers with buyers who:</p>
       <ul>
         <li>Are pre-vetted</li>
         <li>Show up before auction day</li>
         <li>Close quietly</li>
       </ul>
       <p>It’s not louder. It’s smarter.</p>
       <p>– Trisha</p>
       ${logo}
       ${unsubscribe}`
  },
  {
    subject: "The auction doesn’t start on auction day.",
    body: 
      `<p style="display: none;">At Vihara, the match happens before the bidding starts.</p>
       <p>Hi ${user?.["First Name"] || "there"},</p>
       <p>Here’s a secret: Your best buyer often decides <strong>before</strong> auction day.</p>
       <ul>
         <li>They’ve seen the asset early.</li>
         <li>They’ve been qualified quietly.</li>
         <li>They’re ready to close before the crowd shows up.</li>
       </ul>
       <p>That’s why we don’t just post listings—we start conversations.</p>
       <p>If you're tired of surprises on auction day, let’s talk.</p>
       <p>– Trisha</p>
       ${logo}
       ${unsubscribe}`
  },
  {
    subject: "Why we show your property to fewer people on purpose.",
    body: 
      `<p style="display: none;">Fewer eyes. More results. That's the Vihara advantage.</p>
       <p>Hi ${user?.["First Name"] || "there"},</p>
       <p>This might sound crazy in a world obsessed with traffic:</p>
       <p>We show your property to <strong>fewer</strong> people—on purpose.</p>
       <ul>
         <li>More traffic = more noise</li>
         <li>Our buyers are pre-filtered and curated</li>
         <li>We protect your time and your listing</li>
       </ul>
       <p>More isn't always better. Sometimes, less is power.</p>
       <p>– Trisha</p>
       ${logo}
       ${unsubscribe}`
  },
  {
    subject: "The bidder problem nobody talks about.",
    body: 
      `<p style="display: none;">Not every bid is worth your time. We filter for intent.</p>
       <p>Hi ${user?.["First Name"] || "there"},</p>
       <p>Sellers often say: “We had 10 bidders. One closed.”</p>
       <p>That’s not success. That’s frustration.</p>
       <ul>
         <li>We score buyer behavior before they even raise their hand</li>
         <li>We weed out flakers and window shoppers</li>
         <li>You see fewer bids—but better closings</li>
       </ul>
       <p>Want to see how it works?</p>
       <p>– Trisha</p>
       ${logo}
       ${unsubscribe}`
  },
  {
    subject: "Try this: 1 listing. 1 test. 0 drama.",
    body: 
      `<p style="display: none;">A single asset is enough to see the difference.</p>
       <p>Hi ${user?.["First Name"] || "there"},</p>
       <p>Here’s what we’re asking:</p>
       <p>Pick one listing. Let us run it through the Vihara system.</p>
       <ul>
         <li>No commitment.</li>
         <li>No drama.</li>
         <li>Just one clean close.</li>
       </ul>
       <p>If it works, great. If not, no harm done.</p>
       <p>👉 <a href="https://calendly.com/trisha-vihara/15min" target="_blank">Book a time here</a></p>
       <p>– Trisha</p>
       ${logo}
       ${unsubscribe}`
  },
  {
    subject: "Most platforms sell noise. We sell silence.",
    body: 
      `<p style="display: none;">Vihara isn’t louder. It’s smarter.</p>
       <p>Hi ${user?.["First Name"] || "there"},</p>
       <p>Let’s be honest. Most platforms promise visibility, views, volume.</p>
       <p>We promise something different:</p>
       <ul>
         <li>Sellers who sleep better</li>
         <li>Buyers who are actually ready</li>
         <li>Listings that close quietly—and quickly</li>
       </ul>
       <p>If that sounds better than noise, let’s connect.</p>
       <p>👉 <a href="https://calendly.com/trisha-vihara/15min" target="_blank">Schedule a chat</a></p>
       <p>Hope to hear from you,<br>Trisha</p>
       ${logo}
       ${unsubscribe}`
  }
 ];
};