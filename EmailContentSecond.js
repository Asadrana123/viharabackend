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
  }
 ];
};