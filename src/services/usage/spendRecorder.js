// services/usage/spendRecorder.js
/**
 * Records what each Claude and Gemini call in this backend cost, under the feature that made it, for the
 * admin page's AI Spend tab (services/usage/spendReport.js).
 *
 *   client = trackAnthropic(new Anthropic(...), "ga-report");
 *
 * wraps a client so every messages.create / messages.stream (and their beta forms) is recorded when it
 * finishes. The call itself is untouched: the same promise or stream comes back, and a record that cannot
 * be written is only logged, never thrown into the feature.
 *
 *   recordGemini("vtext-replies", MODEL_NAME, result);
 *
 * records one Gemini generateContent answer from its usageMetadata.
 */
const mongoose = require("mongoose");
const { claudeCost, geminiCost, toolName } = require("./prices");

let sink = null;
/** Tests replace where records go. */
function setSpendSink(fn) {
  sink = fn;
}

function write(doc) {
  if (sink) return sink(doc);
  // Not connected (a script, a test): nothing to write to, and mongoose would hold the call open.
  if (mongoose.connection.readyState !== 1) return;
  const { AiSpend } = require("../../model/usage/aiSpendModel");
  AiSpend.create(doc).catch((e) => console.error(`[ai-spend] not recorded (${doc.feature}): ${e.message}`));
}

/** Records one finished Claude response. */
function recordClaude(feature, message, extra = {}) {
  try {
    if (!message || !message.usage) return;
    const model = message.model || extra.model || "";
    write({ at: new Date(), source: "backend", feature, provider: "anthropic", tool: toolName(model), model, ...claudeCost(model, message.usage), what: extra.what || "", by: extra.by || "", ref: extra.ref || "" });
  } catch (e) {
    console.error(`[ai-spend] ${feature}: ${e.message}`);
  }
}

/** Anthropic refuses a call when the account's credits are gone ("Your credit balance is too low ..."). */
const isCreditOut = (err) => /credit balance is too low|ran out of credits/i.test(String(err?.message || err?.error?.error?.message || ""));

/** Notes when and where the Anthropic credits ran out, for the AI Spend page. */
function noteCreditOut(feature, err) {
  try {
    if (!isCreditOut(err)) return;
    const doc = { provider: "anthropic-credits-out", usd: null, at: new Date(), note: feature };
    if (sink) return sink({ creditOut: doc });
    if (mongoose.connection.readyState !== 1) return;
    const { AiBalance } = require("../../model/usage/aiSpendModel");
    AiBalance.updateOne({ provider: doc.provider }, { $set: doc }, { upsert: true }).catch(() => {});
  } catch {
    // never break the caller
  }
}

/** Records one Gemini generateContent result (the object with .response.usageMetadata). */
function recordGemini(feature, model, result, extra = {}) {
  try {
    const meta = result?.response?.usageMetadata || result?.usageMetadata;
    if (!meta) return;
    write({ at: new Date(), source: "backend", feature, provider: "google", tool: toolName(model), model, ...geminiCost(model, meta), what: extra.what || "", by: extra.by || "", ref: extra.ref || "" });
  } catch (e) {
    console.error(`[ai-spend] ${feature}: ${e.message}`);
  }
}

const bindAll = (target) => (value) => (typeof value === "function" ? value.bind(target) : value);

/** Wraps a messages resource (client.messages or client.beta.messages). */
function wrapMessages(api, feature) {
  if (!api) return api;
  return new Proxy(api, {
    get(target, prop) {
      const value = Reflect.get(target, prop, target);
      if (prop === "create" && typeof value === "function") {
        return (body, options) => {
          const result = value.call(target, body, options);
          // A create with stream: true returns raw events, not a message; those calls are not used here.
          if (!body?.stream && result && typeof result.then === "function") result.then((m) => recordClaude(feature, m), (e) => noteCreditOut(feature, e));
          return result;
        };
      }
      if (prop === "stream" && typeof value === "function") {
        return (body, options) => {
          const stream = value.call(target, body, options);
          if (stream && typeof stream.on === "function") {
            stream.on("finalMessage", (m) => recordClaude(feature, m));
            stream.on("error", (e) => noteCreditOut(feature, e));
          }
          return stream;
        };
      }
      return bindAll(target)(value);
    },
  });
}

/**
 * Returns the client with its messages calls recorded under feature. A client that is already tracked is
 * re-tracked under the new feature (a shared client used by two features), never recorded twice.
 */
function trackAnthropic(client, feature) {
  if (!client) return client;
  if (client.__spendFeature) {
    if (client.__spendFeature === feature) return client;
    client = client.__spendTarget;
  }
  return new Proxy(client, {
    get(target, prop) {
      if (prop === "__spendFeature") return feature;
      if (prop === "__spendTarget") return target;
      const value = Reflect.get(target, prop, target);
      if (prop === "messages") return wrapMessages(value, feature);
      if (prop === "beta" && value) {
        return new Proxy(value, {
          get(beta, p) {
            const v = Reflect.get(beta, p, beta);
            return p === "messages" ? wrapMessages(v, feature) : bindAll(beta)(v);
          },
        });
      }
      return bindAll(target)(value);
    },
  });
}

module.exports = { trackAnthropic, recordClaude, recordGemini, setSpendSink, isCreditOut };
