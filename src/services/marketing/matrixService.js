// services/marketing/matrixService.js
//
// PRD Step 3 - persona x awareness matrix. Pure functions over the config and
// the gate's readiness flags. Each buildable cell = one targetable bucket and
// one creative variant.
//
// A cell is built when:
//   1. its stage is at or after the persona's entry stage (experts skip
//      beginner stages), and
//   2. every input the stage requires is ready (photos / value gap / auction date).

const {
    AWARENESS_STAGES,
    REQUIREMENT_LABELS,
    PERSONAS,
    PERSONAS_BY_BUYER_TYPE,
    CTA_OVERRIDES_BY_BUYER_TYPE,
} = require("../../config/marketing/personaMatrixConfig");

const stageById = (id) => AWARENESS_STAGES.find((s) => s.id === id);

/** Persona objects for a buyer type ([] when none are defined, e.g. retail). */
function getPersonasForBuyerType(buyerType) {
    return (PERSONAS_BY_BUYER_TYPE[buyerType] || []).map((id) => PERSONAS[id]).filter(Boolean);
}

function resolveCta(buyerType, defaultCta) {
    const overrides = CTA_OVERRIDES_BY_BUYER_TYPE[buyerType] || {};
    return overrides[defaultCta] || defaultCta;
}

/**
 * @param {string} buyerType
 * @param {{ photos: boolean, valueGap: boolean, auctionDate: boolean }} readiness  from the gate
 * @returns {{ cells: object[], skipped: object[] }}
 */
function getBuildableCells(buyerType, readiness = {}) {
    const cells = [];
    const skipped = [];

    getPersonasForBuyerType(buyerType).forEach((persona) => {
        const entry = stageById(persona.entryStage);
        if (!entry) return;

        AWARENESS_STAGES.filter((s) => s.order >= entry.order).forEach((stage) => {
            const key = `${persona.id}__${stage.id}`;
            const missing = stage.requires.filter((req) => !readiness[req]);

            if (missing.length) {
                skipped.push({
                    key,
                    personaLabel: persona.label,
                    stageLabel: stage.label,
                    reason: missing.map((m) => REQUIREMENT_LABELS[m] || m).join(", "),
                });
                return;
            }

            cells.push({
                key,
                personaId: persona.id,
                personaLabel: persona.label,
                stageId: stage.id,
                stageLabel: stage.label,
                stageOrder: stage.order,
                audience: stage.audience,
                cta: resolveCta(buyerType, stage.defaultCta),
            });
        });
    });

    return { cells, skipped };
}

module.exports = { getBuildableCells, getPersonasForBuyerType, resolveCta };
