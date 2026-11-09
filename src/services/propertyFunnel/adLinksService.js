// services/propertyFunnel/adLinksService.js
//
// Property Funnel step 6: marketing's form for what the ads sync can't work out on its own.
//   - Which property an ad is for, when its link names none (lead forms, the homepage, /find,
//     /new-deals) or it covers several properties. Stored as "manual" rows in pf_ad_property_links.
//     "ad link" rows come from the ad's own URL: they're shown, but not removable here (the next sync
//     would add them back).
//   - The Cold / Warm / Hot override per ad set (pf_ad_set_stages). The sync guesses it from the ad
//     set's name, since Zernio doesn't return targeting.

const PfAd = require("../../model/propertyFunnel/pfAdModel");
const PfAdDay = require("../../model/propertyFunnel/pfAdDayModel");
const PfAdPropertyLink = require("../../model/propertyFunnel/pfAdPropertyLinkModel");
const PfAdSetStage = require("../../model/propertyFunnel/pfAdSetStageModel");
const Product = require("../../model/property/productModel");
const { pacificDate, addDays, toStatus, stateCode } = require("./pfCore");

const AWARENESS = ["Cold", "Warm", "Hot"];
const MAX_LINKS = 20;
const SLUG = /^[a-z0-9-]{1,200}$/;

class InputError extends Error {}

/** propertyIds from the request: unique slugs, at most MAX_LINKS. Throws InputError otherwise. */
function cleanPropertyIds(v) {
  if (!Array.isArray(v)) throw new InputError("propertyIds must be a list of property slugs");
  const ids = [...new Set(v.map((x) => String(x || "").trim().toLowerCase()))].filter(Boolean);
  if (ids.length > MAX_LINKS) throw new InputError(`An ad can be linked to at most ${MAX_LINKS} properties`);
  if (ids.some((id) => !SLUG.test(id))) throw new InputError("A property slug has characters it can't have");
  return ids;
}

/** "Cold" | "Warm" | "Hot", or null to go back to the automatic guess. Throws InputError otherwise. */
function cleanAwareness(v) {
  if (v === null || v === "" || v === undefined) return null;
  if (!AWARENESS.includes(v)) throw new InputError("awareness must be Cold, Warm, Hot or null");
  return v;
}

/** Everything the form shows: ads that spent in the last `days` days (or have a manual link), their links, and ad sets. */
async function getAdLinks({ days = 30, now = new Date() } = {}) {
  const from = addDays(pacificDate(now), -(days - 1));
  const [spendRows, manual, listings, stages] = await Promise.all([
    PfAdDay.aggregate([{ $match: { date: { $gte: from } } }, { $group: { _id: "$adId", spend: { $sum: "$spend" } } }]),
    PfAdPropertyLink.find({ linkedBy: "manual" }).distinct("adId"),
    Product.find({ slug: { $nin: [null, ""] }, isTestProperty: { $ne: true } }).select("slug street city state status archived").lean(),
    PfAdSetStage.find().lean(),
  ]);
  const spend = new Map(spendRows.map((r) => [r._id, r.spend]));
  const adIds = [...new Set([...spendRows.filter((r) => r.spend > 0).map((r) => r._id), ...manual])];
  const [ads, links] = await Promise.all([
    PfAd.find({ adId: { $in: adIds } }).lean(),
    PfAdPropertyLink.find({ adId: { $in: adIds } }).lean(),
  ]);
  const linksByAd = new Map();
  for (const l of links) linksByAd.set(l.adId, [...(linksByAd.get(l.adId) || []), { propertyId: l.propertyId, linkedBy: l.linkedBy }]);
  const stageBySet = new Map(stages.map((s) => [s.adSetId, s]));

  const adRows = ads.map((a) => ({
    adId: a.adId, name: a.name, campaignName: a.campaignName, adSetId: a.adSetId, adSetName: a.adSetName,
    status: a.status, linkUrl: a.linkUrl || null, spend: Math.round((spend.get(a.adId) || 0) * 100) / 100,
    links: linksByAd.get(a.adId) || [],
  })).sort((x, y) => y.spend - x.spend);

  const sets = new Map();
  for (const a of ads) {
    const s = sets.get(a.adSetId) || { adSetId: a.adSetId, adSetName: a.adSetName, campaignName: a.campaignName, auto: a.awarenessAuto, ads: 0, spend: 0 };
    s.ads++;
    s.spend += spend.get(a.adId) || 0;
    sets.set(a.adSetId, s);
  }
  const adSets = [...sets.values()].map((s) => {
    const o = stageBySet.get(s.adSetId);
    return { ...s, spend: Math.round(s.spend * 100) / 100, override: o ? o.awareness : null, setBy: o ? o.setBy || null : null, setAt: o ? o.setAt : null };
  }).sort((x, y) => y.spend - x.spend);

  const properties = listings.map((p) => ({
    id: p.slug, address: p.street || p.slug, city: p.city || "", state: stateCode(p.state), status: toStatus(p.status, p.archived),
  })).sort((x, y) => (x.status === "live") === (y.status === "live") ? x.address.localeCompare(y.address) : x.status === "live" ? -1 : 1);

  return { days, from, ads: adRows, adSets, properties };
}

/** Sets an ad's manual property links to exactly `propertyIds`. "ad link" rows stay as they are. */
async function setAdLinks(adId, propertyIds, setBy) {
  const ids = cleanPropertyIds(propertyIds);
  if (!(await PfAd.exists({ adId: String(adId) }))) throw new InputError("No such ad. Wait for the next ads sync and try again.");
  const known = new Set(await Product.find({ slug: { $in: ids } }).distinct("slug"));
  const unknown = ids.filter((id) => !known.has(id));
  if (unknown.length) throw new InputError(`Not a property: ${unknown.join(", ")}`);
  await PfAdPropertyLink.deleteMany({ adId: String(adId), linkedBy: "manual", propertyId: { $nin: ids } });
  for (const id of ids) {
    // A row from the ad's own link is kept as it is; anything new is a manual link.
    await PfAdPropertyLink.updateOne({ adId: String(adId), propertyId: id }, { $setOnInsert: { linkedBy: "manual", setBy: setBy || null } }, { upsert: true });
  }
  return PfAdPropertyLink.find({ adId: String(adId) }).select("propertyId linkedBy -_id").lean();
}

/** Sets an ad set's Cold / Warm / Hot, or with null goes back to the automatic guess. */
async function setAdSetStage(adSetId, awareness, setBy) {
  const value = cleanAwareness(awareness);
  if (!(await PfAd.exists({ adSetId: String(adSetId) }))) throw new InputError("No such ad set. Wait for the next ads sync and try again.");
  if (value === null) {
    await PfAdSetStage.deleteOne({ adSetId: String(adSetId) });
    return { adSetId: String(adSetId), override: null };
  }
  await PfAdSetStage.updateOne({ adSetId: String(adSetId) }, { $set: { awareness: value, setBy: setBy || null, setAt: new Date() } }, { upsert: true });
  return { adSetId: String(adSetId), override: value };
}

module.exports = { getAdLinks, setAdLinks, setAdSetStage, cleanPropertyIds, cleanAwareness, InputError, AWARENESS };
