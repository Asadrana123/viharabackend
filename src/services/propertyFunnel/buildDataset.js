// services/propertyFunnel/buildDataset.js
//
// Property Funnel: builds the one JSON the tab reads (the `Dataset` in vihara-next
// lib/property-funnel/contract.ts) from the rows pfSources.js loads. Port of Prajwal's
// server/build-dataset.ts, on our collections.
//
// Rules the page depends on: daily rows only, no totals; null = unknown, 0 = zero; Pacific dates;
// phones and emails masked here, never sent in full.
// Paid: we don't record payments yet, so `paid`, `paidAmount` and `paidAt` are always null (Prajwal, 9 Nov).

const {
  pacificDate, addDays, pacificDayStart, slugFromUrl, channelFromGa4, channelFromLead,
  phoneKey, emailKey, maskPhone, maskEmail, buyerType,
} = require("./pfCore");
const { buildTouches } = require("./pfTouches");

const SITE = "https://www.vihara.ai";
const num = (v) => (v == null ? null : Number(v));

function destinationOf(url) {
  if (!url || /fb\.me|facebook\.com\/.*lead/i.test(url)) return "Lead form";
  if (/\/deal\b/.test(url)) return "Deal form";
  if (/\/(listing|auction)\//.test(url)) return "Property page";
  if (/\/(find|new-deals)\b/.test(url)) return "Finder";
  return "Other page";
}

function sourceLabel(kind, utm) {
  if (kind === "meta_form") return "Meta lead form";
  if (kind === "meta_form_organic") return "Facebook / Instagram form (organic)";
  const from = utm.utm_source ? ` (${utm.utm_source}${utm.utm_medium ? ` / ${utm.utm_medium}` : ""})` : "";
  if (kind === "finder") return `Deal Finder${from}`;
  return `Property page${from}`;
}

function channelOfLead(l) {
  if (l.kind === "meta_form") return "Meta ads";
  if (l.kind === "meta_form_organic") return "Organic social";
  return channelFromLead("", l.utm || {});
}

/** The window: `days` Pacific days ending today. */
function windowFor(days, now) {
  const maxDate = pacificDate(now);
  const minDate = addDays(maxDate, -(days - 1));
  return { minDate, maxDate, since: pacificDayStart(minDate) };
}

function buildDataset(inp, { days = 60, now = new Date() } = {}) {
  const { minDate, maxDate } = windowFor(days, now);

  // ---------------------------------------------------------------- properties + links
  const properties = inp.properties.map((p) => ({
    id: p.id, address: p.address, city: p.city, state: p.state, status: p.status,
    saleDate: p.saleDate ? pacificDate(p.saleDate) : null, startingBid: num(p.startingBid), imageUrl: p.imageUrl || null,
    url: `${SITE}/listing/${p.id}`,
    links: [
      { kind: "listing", label: "Listing", url: `${SITE}/listing/${p.id}` },
      { kind: "landing", label: "Landing form", url: `${SITE}/deal?property=${p.id}` },
      { kind: "register", label: "Register page", url: `${SITE}/listing/${p.id}?register=1` },
      ...inp.extraLinks.filter((l) => l.propertyId === p.id).map((l) => ({ kind: "other", label: l.label, url: l.url })),
    ],
  }));
  const propIds = new Set(properties.map((p) => p.id));

  // ---------------------------------------------------------------- ads
  const linksByAd = new Map();
  for (const l of inp.adLinks) linksByAd.set(l.adId, [...(linksByAd.get(l.adId) || []), l]);
  const stageBySet = new Map(inp.adSetStages.map((s) => [s.adSetId, s.awareness]));
  const ads = inp.ads.map((a) => {
    const links = (linksByAd.get(a.adId) || []).filter((l) => propIds.has(l.propertyId));
    const ids = [...new Set(links.map((l) => l.propertyId))];
    return {
      id: a.adId, name: a.name, campaignId: a.campaignId, campaignName: a.campaignName, adSetId: a.adSetId, adSetName: a.adSetName,
      audience: a.audience || "", awareness: stageBySet.get(a.adSetId) || a.awarenessAuto || "Cold", status: a.status, format: a.format,
      destination: destinationOf(a.linkUrl), propertyIds: ids,
      propertyLink: !ids.length ? "not linked" : links.some((l) => l.linkedBy === "ad link") ? "ad link" : "ad_property table",
      thumbnailUrl: a.thumbnailUrl || null,
    };
  });
  const adById = new Map(ads.map((a) => [a.id, a]));

  // ---------------------------------------------------------------- registrations, matched to leads by email or phone
  const regsByProp = new Map();
  for (const r of inp.registrations) {
    if (!propIds.has(r.propertyId)) continue;
    regsByProp.set(r.propertyId, [...(regsByProp.get(r.propertyId) || []), r]);
  }
  // Same person = same lowercased email or same 10-digit phone (Prajwal: cleaned-up email and phone).
  const samePerson = (l, r) => (r.emailKey && r.emailKey === emailKey(l.email)) || (r.phoneKey.length === 10 && r.phoneKey === phoneKey(l.phone));

  // ---------------------------------------------------------------- leads
  const leadRows = inp.leads.filter((l) => propIds.has(l.propertyId) && pacificDate(l.createdAt) >= minDate);
  const regLead = new Map(); // registration → the lead behind it (its channel)
  const leads = leadRows.map((l) => {
    const channel = channelOfLead(l);
    const regs = (regsByProp.get(l.propertyId) || []).filter((r) => samePerson(l, r));
    for (const r of regs) if (!regLead.has(r)) regLead.set(r, channel);
    const first = regs.map((r) => new Date(r.at)).sort((a, b) => a - b)[0];
    const adId = [l.adId, l.utm && l.utm.ad_id, l.utm && l.utm.utm_content, l.utm && l.utm.utm_id]
      .map((c) => (c ? String(c) : null)).find((c) => c && adById.has(c)) || null;
    return {
      id: l.id, propertyId: l.propertyId, createdAt: new Date(l.createdAt).toISOString(), date: pacificDate(l.createdAt),
      name: l.name, phone: maskPhone(l.phone), email: maskEmail(l.email), location: null,
      channel, adId, source: sourceLabel(l.kind, l.utm || {}), buyerType: buyerType(l.buyerTypeRaw),
      signedUp: inp.signedUpEmails.has(emailKey(l.email)),
      registeredAt: first ? first.toISOString() : null,
      paidAt: null,
    };
  });

  // ---------------------------------------------------------------- touches (Vtext, Maya, Brevo)
  const touches = buildTouches(leadRows, inp);

  // ---------------------------------------------------------------- property-day-channel rows
  const ga4Known = inp.ga4Rows.length > 0 || inp.syncRuns.some((r) => r.source === "GA4" && r.lastSuccess);
  const pd = new Map();
  const row = (propertyId, date, channel) => {
    const k = `${propertyId}|${date}|${channel}`;
    let r = pd.get(k);
    if (!r) {
      const meta = channel === "Meta ads";
      r = {
        propertyId, date, channel, spend: meta ? 0 : null, impressions: meta ? 0 : null, clicks: meta ? 0 : null,
        visits: ga4Known ? 0 : null, leads: 0, signups: 0, registrations: 0, paid: null, paidAmount: null,
      };
      pd.set(k, r);
    }
    return r;
  };

  const perAdDay = new Map();
  for (const l of leads) if (l.adId) {
    const k = `${l.adId}|${l.date}`;
    const g = perAdDay.get(k) || { l: 0, r: 0 };
    g.l++; if (l.registeredAt) g.r++;
    perAdDay.set(k, g);
  }
  const adDays = [];
  let metaSpend = 0, linkedSpend = 0;
  for (const d of inp.adDays) {
    const g = perAdDay.get(`${d.adId}|${d.date}`);
    adDays.push({
      adId: d.adId, date: d.date, spend: Number(d.spend), impressions: Number(d.impressions), clicks: Number(d.clicks),
      landingPageViews: num(d.landingPageViews), metaLeads: num(d.metaLeads), leadsReceived: g ? g.l : 0, registrations: g ? g.r : 0, paid: null,
    });
    metaSpend += Number(d.spend);
    const ad = adById.get(d.adId);
    if (!ad || !ad.propertyIds.length) continue;
    const share = 1 / ad.propertyIds.length;
    for (const pid of ad.propertyIds) {
      const r = row(pid, d.date, "Meta ads");
      r.spend += Number(d.spend) * share;
      r.impressions += Math.round(Number(d.impressions) * share);
      r.clicks += Math.round(Number(d.clicks) * share);
      linkedSpend += Number(d.spend) * share;
    }
  }

  for (const g of inp.ga4Rows) {
    const slug = slugFromUrl(g.pagePath);
    if (!slug || !propIds.has(slug)) continue;
    row(slug, g.date, channelFromGa4(g.channelGroup, g.sourceMedium)).visits += Number(g.sessions);
  }
  for (const l of leads) {
    const r = row(l.propertyId, l.date, l.channel);
    r.leads++;
    if (l.signedUp) r.signups++;
  }
  // Registrations count on their own day, on the channel of the lead behind them, else on their own UTM
  // (saved from 9 Nov 2026; older registrations have none and count as Direct).
  for (const [pid, regs] of regsByProp) for (const r of regs) {
    const date = pacificDate(r.at);
    if (date < minDate) continue;
    row(pid, date, regLead.get(r) || channelFromLead("", r.utm || {})).registrations++;
  }
  const propertyDays = [...pd.values()].map((r) => ({ ...r, spend: r.spend == null ? null : Math.round(r.spend * 100) / 100 }));

  // ---------------------------------------------------------------- Clarity (several URLs per property → one row a day)
  const cBy = new Map();
  for (const c of inp.clarityRows) {
    const slug = slugFromUrl(c.url);
    if (!slug || !propIds.has(slug)) continue;
    const k = `${slug}|${c.date}`;
    const g = cBy.get(k) || { propertyId: slug, date: c.date, sessions: 0, scrollDepth: null, rageClicks: 0, deadClicks: 0, quickBacks: null, registerClicks: null, w: 0 };
    if (c.scrollDepth != null) {
      g.scrollDepth = ((g.scrollDepth || 0) * g.w + Number(c.scrollDepth) * Number(c.sessions)) / (g.w + Number(c.sessions) || 1);
      g.w += Number(c.sessions);
    }
    g.sessions += Number(c.sessions); g.rageClicks += Number(c.rageClicks); g.deadClicks += Number(c.deadClicks);
    if (c.quickBacks != null) g.quickBacks = (g.quickBacks || 0) + Number(c.quickBacks);
    if (c.registerClicks != null) g.registerClicks = (g.registerClicks || 0) + Number(c.registerClicks);
    cBy.set(k, g);
  }
  const clarityDays = [...cBy.values()].map(({ w, ...c }) => c);

  // ---------------------------------------------------------------- blog
  const posts = inp.blogPosts.map((p) => ({
    id: p.sanityId, title: p.title, slug: p.slug, path: `/blog/${p.slug}`, author: p.author || null,
    primaryKeyword: p.primaryKeyword || null, publishedAt: p.publishedAt || null, status: p.status,
  }));
  const postBySlug = new Map(posts.filter((p) => p.status === "published").map((p) => [p.slug, p]));
  const pdBy = new Map();
  const postDay = (post, date) => {
    const k = `${post.id}|${date}`;
    if (!pdBy.has(k)) pdBy.set(k, { postId: post.id, date, sessions: 0, engagedSessions: 0, avgEngagementSec: null, searchSessions: 0, leads: 0, secs: 0 });
    return pdBy.get(k);
  };
  for (const g of inp.ga4Rows) {
    const m = String(g.pagePath).match(/^\/blogs?\/([^/?#]+)/);
    const post = m && postBySlug.get(m[1]);
    if (!post) continue;
    const r = postDay(post, g.date);
    r.sessions += Number(g.sessions); r.engagedSessions += Number(g.engagedSessions); r.secs += Number(g.engagementSeconds);
    if (g.channelGroup === "Organic Search") r.searchSessions += Number(g.sessions);
  }
  for (const l of inp.leads) {
    const m = String(l.landingPath || "").match(/^\/blogs?\/([^/?#]+)/);
    const post = m && postBySlug.get(m[1]);
    if (!post || pacificDate(l.createdAt) < minDate) continue;
    postDay(post, pacificDate(l.createdAt)).leads++;
  }
  const postDays = [...pdBy.values()].map(({ secs, ...r }) => ({ ...r, avgEngagementSec: r.sessions ? Math.round(secs / r.sessions) : null }));

  // ---------------------------------------------------------------- organic social
  const socialPosts = inp.socialPosts.map((s) => ({
    id: s.postId, platform: s.platform, publishedAt: s.publishedAt, text: s.text || "", url: s.url || null, thumbnailUrl: s.thumbnailUrl || null,
    propertyId: s.propertyId && propIds.has(s.propertyId) ? s.propertyId : null,
    impressions: num(s.impressions), reach: num(s.reach), engagement: num(s.engagement), clicks: num(s.clicks), videoViews: num(s.videoViews),
  }));

  // ---------------------------------------------------------------- health
  const latest = (xs) => xs.reduce((m, x) => (x && (!m || x > m) ? x : m), null);
  const ourOwn = [
    { name: "VText", rows: inp.messages, at: (m) => m.createdAt, what: "texts, read live from Vtext" },
    { name: "Dialer", rows: inp.calls, at: (c) => c.startedAt || c.createdAt, what: "Maya calls, read live from the call log (hand calls aren't logged)" },
    { name: "Brevo", rows: inp.emailEvents, at: (e) => e.date, what: "email events, read live from the Brevo webhook log" },
  ];
  const synced = new Set(inp.syncRuns.map((r) => r.source));
  const sources = [
    { name: "Our database", ok: true, lastSync: now.toISOString(), detail: `${properties.length} properties, ${leads.length} leads, ${inp.registrations.length} registrations (pending and approved). Payments are not recorded yet` },
    ...ourOwn.filter((s) => !synced.has(s.name)).map((s) => {
      const last = latest(s.rows.map((x) => new Date(s.at(x))));
      return { name: s.name, ok: true, lastSync: last ? last.toISOString() : null, detail: `${s.rows.length} ${s.what} for these leads` };
    }),
    ...inp.syncRuns.map((r) => ({ name: r.source, ok: !!r.ok, lastSync: r.lastSuccess ? new Date(r.lastSuccess).toISOString() : null, detail: r.detail || "" })),
  ];

  return {
    sample: false, generatedAt: now.toISOString(), timezone: "America/Los_Angeles", currency: "USD",
    minDate, maxDate,
    properties, propertyDays, ads, adDays, clarityDays, leads, touches, posts, postDays, socialPosts, sources,
    checks: [{ label: "Meta spend linked to a property", aLabel: "All Meta spend", a: Math.round(metaSpend * 100) / 100, bLabel: "Linked to a property", b: Math.round(linkedSpend * 100) / 100 }],
  };
}

module.exports = { buildDataset, windowFor };
