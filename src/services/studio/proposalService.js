// services/studio/proposalService.js
//
// Weekly learning proposals in the Video Studio (D-043): who may decide one, and what the Creative OS
// may send. A person's words are kept as typed.

const ID = /^P-\d{4}$/;
const STATUSES = new Set(["proposed", "accepted", "declined"]);
const MAX_BATCH = 500;
const MAX_WORDS = 2000;

const shortText = (value, max, what) => {
  const s = String(value ?? "").trim();
  if (!s || s.length > max) throw new Error(`${what} is required, at most ${max} characters.`);
  return s;
};

/** Checks one proposal from the Creative OS and returns the fields stored. */
function cleanProposal(p) {
  const proposalId = String(p?.id ?? "");
  if (!ID.test(proposalId)) throw new Error(`"${proposalId}" is not a proposal id.`);
  const status = String(p?.status ?? "");
  if (!STATUSES.has(status)) throw new Error(`${proposalId}: unknown status "${status}".`);
  return {
    proposalId,
    kind: shortText(p?.kind, 40, "A kind"),
    title: shortText(p?.title, 200, "A title"),
    proposal: shortText(p?.proposal, 4000, "The proposal"),
    landsIn: shortText(p?.lands_in, 300, "Where it lands"),
    limits: shortText(p?.limits, 2000, "Its limits"),
    forEditor: p?.for_editor ? shortText(p.for_editor, 80, "The editor") : null,
    status,
  };
}

function cleanProposals(list) {
  if (list === undefined) return [];
  if (!Array.isArray(list)) throw new Error("Send proposals as a list.");
  if (list.length > MAX_BATCH) throw new Error(`At most ${MAX_BATCH} proposals in one push.`);
  return list.map(cleanProposal);
}

const same = (a, b) => String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();

/** Why this person may not decide this proposal, or null. An admin decides one with no editor; an editor decides their own. */
function decideProblem(proposal, { role, name }) {
  if (proposal.status !== "proposed") return `This proposal is already ${proposal.status}.`;
  if (!proposal.forEditor) return role === "admin" ? null : "An admin decides this one.";
  return same(proposal.forEditor, name) ? null : `This is ${proposal.forEditor}'s own way of working: only they decide it.`;
}

/** Whether this person sees it: their own, and admins see everything. */
const canSee = (proposal, { role, name }) => role === "admin" || same(proposal.forEditor, name);

function cleanDecision(body) {
  const decision = String(body?.decision ?? "");
  if (decision !== "accept" && decision !== "decline") throw new Error("Accept or decline.");
  const words = String(body?.words ?? "").trim();
  if (!words) throw new Error("Say why, in your own words.");
  if (words.length > MAX_WORDS) throw new Error(`At most ${MAX_WORDS} characters.`);
  return { decision, words };
}

/** Decisions the Creative OS has not recorded yet, oldest first. */
function undeliveredDecisions(rows) {
  return rows
    .filter((p) => p.status !== "proposed" && p.decision?.byName && !p.decision.deliveredAt)
    .map((p) => ({ id: p.proposalId, decision: p.status === "accepted" ? "accept" : "decline", by: p.decision.byName, words: p.decision.words, at: p.decision.at }))
    .sort((a, b) => new Date(a.at) - new Date(b.at));
}

module.exports = { cleanProposal, cleanProposals, decideProblem, canSee, cleanDecision, undeliveredDecisions };
