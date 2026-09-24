/**
 * BflPromptBuilder
 *
 * Builds instruction-style edit prompts for FLUX.1 Kontext.
 *
 * Kontext is an *edit* model, not a generator. It takes the source photo as
 * context and applies the instruction to it. Two consequences vs. the Replicate
 * (SD 1.5 + ControlNet) builder:
 *
 *   1. No negative prompt. Kontext has no `negative_prompt` input. Structure is
 *      protected by an explicit preservation clause in the positive prompt.
 *   2. Prompts must read as commands ("Replace the siding with...") rather than
 *      as a description of a finished scene ("Modern renovated kitchen with...").
 *      Descriptive prompts push Kontext toward regenerating the scene, which is
 *      exactly the structural drift we are trying to avoid.
 *
 * ── 2026-09-23 rewrite ────────────────────────────────────────────────────────
 * Reworked after two real, reported failure modes: (a) extra hallucinated
 * structure (e.g. a second door appearing inside an existing doorway) and
 * (b) edits that read as "just cleaner" rather than genuinely renovated.
 * Both trace back to the same root cause, confirmed against Black Forest
 * Labs' own current prompting guidance (docs + the flux-image-best-practices
 * skill, github.com/black-forest-labs/skills):
 *
 *   - Prompts were running ~120-130 words; BFL's own guidance puts the
 *     optimal range at 30-80 words and warns that excess length "risks
 *     confusion." Only ~24% of that length was the actual creative
 *     instruction — the rest was preservation/repair/render boilerplate
 *     drowning out the one thing we actually want the model to do.
 *   - Every area's WORK_BY_TIER instruction asked for 4-6 simultaneous,
 *     unrelated changes (new vanity + retile + fixtures + mirror + lighting,
 *     all in one clause). BFL's guidance is explicit: "For complex
 *     transformations... break edits into sequential steps rather than
 *     attempting simultaneous multiple changes. This iterative method
 *     reduces artifact generation and unwanted structural modifications."
 *     Trimmed every tier down to its 2 highest-impact changes.
 *   - The preservation clause was almost entirely "Do not..." commands.
 *     BFL's negative-prompt-alternatives guidance: "Negative prompts can
 *     actually make models focus MORE on unwanted elements." Rewritten as
 *     positive, stated-fact descriptions of the room/building's existing
 *     state (e.g. "every window and door remain in their exact original
 *     positions" instead of "do not add or remove any structure").
 *
 * Deliberately NOT changed: still a single BFL call per renovation (a true
 * multi-step "structure first, then finishes" pipeline was considered, but
 * that means 2-3x the real per-call BFL cost and latency — flagged as a
 * possible follow-up, not adopted here).
 */
class BflPromptBuilder {

  /**
   * @param {Object} propertyData  - { city, state, propertyType }
   * @param {Object} renovationData - { primaryArea, style, colorScheme, budgetTier }
   * @returns {{ prompt: String }}
   */
  static buildPrompts(propertyData, renovationData) {
    return { prompt: this.buildPrompt(propertyData, renovationData) };
  }

  static buildPrompt(propertyData, renovationData) {
    const { primaryArea, style, colorScheme, budgetTier } = renovationData;

    const edit = this.getEditInstruction(primaryArea, style, colorScheme, budgetTier, propertyData);
    const repair = this.getRepairInstruction(primaryArea);
    const preserve = this.getPreservationClause(primaryArea);
    const render = this.getRenderInstruction(primaryArea);

    return [edit, repair, preserve, render].join(' ');
  }

  // ==================== AREA ROUTING ====================

  static getEditInstruction(primaryArea, style, colorScheme, budgetTier, propertyData) {
    const areaMap = {
      'Exterior':    () => this.getExteriorInstruction(style, colorScheme, budgetTier, propertyData),
      'Kitchen':     () => this.getKitchenInstruction(style, colorScheme, budgetTier),
      'Bathroom':    () => this.getBathroomInstruction(style, budgetTier),
      'Bedroom':     () => this.getBedroomInstruction(style, colorScheme, budgetTier),
      'Living Room': () => this.getLivingRoomInstruction(style, colorScheme, budgetTier)
    };

    const builder = areaMap[primaryArea] || areaMap['Exterior'];
    return builder();
  }

  // ==================== EXTERIOR ====================

  static getExteriorInstruction(style, colorScheme, budgetTier, propertyData) {
    const color = this.EXTERIOR_COLORS[colorScheme] || this.EXTERIOR_COLORS['Neutral'];
    const work = this.EXTERIOR_WORK_BY_TIER[budgetTier] || this.EXTERIOR_WORK_BY_TIER['Mid-Range'];
    const styleDetail = this.EXTERIOR_STYLE[style] || this.EXTERIOR_STYLE['Modern'];
    const landscaping = this.getLandscapingInstruction(propertyData);

    return `${work} Finish it in ${color}. ${styleDetail} ${landscaping}`;
  }

  /**
   * Landscaping vegetation is the one place location genuinely changes the edit.
   * A Kingwood, TX yard and an Oakland, CA yard do not plant the same things.
   */
  static getLandscapingInstruction(propertyData) {
    const state = propertyData?.state;
    const vegetation = this.LANDSCAPING_BY_STATE[state] || this.LANDSCAPING_BY_STATE.DEFAULT;

    return `The lawn is healthy turf with ${vegetation}.`;
  }

  // Each tier: the two highest-impact changes only, not the full scope of work
  // (fewer simultaneous edits = fewer chances for Kontext to hallucinate structure).
  static EXTERIOR_WORK_BY_TIER = {
    'Budget-Friendly': 'Repaint the existing siding and trim, keeping the same materials.',
    'Mid-Range':       'Replace the siding with new fiber cement lap siding and refresh the front door and hardware.',
    'Premium':         'Replace the siding with premium engineered siding and rebuild the front entrance with an upgraded door.',
    'Luxury':          'Reclad the facade in natural stone and rebuild the front entrance as a grand covered entry.'
  };

  static EXTERIOR_COLORS = {
    'Warm tones': 'warm beige and cream with cream trim',
    'Cool tones': 'soft grey and slate blue with white trim',
    'Neutral':    'clean white and light grey with white trim',
    'Bold':       'deep charcoal with crisp white trim'
  };

  static EXTERIOR_STYLE = {
    'Modern':       'Clean horizontal lines, flush trim, matte black fixtures.',
    'Traditional':  'Classic proportions, wide trim boards, warm-toned fixtures.',
    'Contemporary': 'Mixed cladding materials, sharp minimal detailing.',
    'Rustic':       'Natural wood accents, stone base, dark bronze fixtures.',
    'Luxury':       'Refined stone and millwork detailing, polished fixtures.'
  };

  static LANDSCAPING_BY_STATE = {
    'CA':      'drought-tolerant shrubs and a trimmed hedge border',
    'TX':      'native shrubs and mature shade planting near the entrance',
    'DEFAULT': 'trimmed hedges and low shrubs along the foundation'
  };

  // ==================== KITCHEN ====================

  static getKitchenInstruction(style, colorScheme, budgetTier) {
    const work = this.KITCHEN_WORK_BY_TIER[budgetTier] || this.KITCHEN_WORK_BY_TIER['Mid-Range'];
    const styleDetail = this.KITCHEN_STYLE[style] || this.KITCHEN_STYLE['Modern'];
    const color = this.INTERIOR_COLORS[colorScheme] || this.INTERIOR_COLORS['Neutral'];

    return `${work} ${styleDetail} Walls are painted ${color}`;
  }

  // The sink is the kitchen's equivalent of the bathroom's tub: never
  // mentioned, but sitting exactly where every tier's countertop
  // instruction applies. Every tier now pins it (and appliances) in place —
  // Luxury previously had neither anchor, an inconsistency with Mid-Range/
  // Premium, not a deliberate choice.
  static KITCHEN_WORK_BY_TIER = {
    'Budget-Friendly': 'Repaint the existing cabinets and replace the hardware, keeping the same layout.',
    'Mid-Range':       'Replace the cabinets with shaker-front cabinets and install quartz countertops, keeping the sink and appliances in their existing locations.',
    'Premium':         'Replace the cabinets with full-height custom cabinetry and install a waterfall quartz countertop, keeping the sink and appliances in their existing locations.',
    'Luxury':          'Replace the cabinets with bespoke millwork and install marble countertops with a matching backsplash, keeping the sink and appliances in their existing locations.'
  };

  static KITCHEN_STYLE = {
    'Modern':       'Handleless flat cabinet fronts, minimalist detailing.',
    'Traditional':  'Raised panel cabinet doors, classic hardware, warm wood tones.',
    'Contemporary': 'Flat-front cabinets, mixed materials, bold fixtures.',
    'Rustic':       'Reclaimed wood accents, a farmhouse sink, natural stone surfaces.',
    'Luxury':       'Floor-to-ceiling custom millwork, premium stone finishes.'
  };

  // ==================== BATHROOM ====================

  static getBathroomInstruction(style, budgetTier) {
    const work = this.BATHROOM_WORK_BY_TIER[budgetTier] || this.BATHROOM_WORK_BY_TIER['Mid-Range'];
    const styleDetail = this.BATHROOM_STYLE[style] || this.BATHROOM_STYLE['Modern'];

    return `${work} ${styleDetail}`;
  }

  // 2026-09-24: stopped naming "tub" too, for the same reason toilet was
  // de-named. Even "the existing tub stays exactly as it is" asserts a tub
  // exists — on a photo without one (e.g. a shower-only bathroom), that
  // false assertion caused the model to render a tub anyway (a second real,
  // reported failure, same mechanism as the toilet bug). Budget-Friendly/
  // Mid-Range now rely entirely on the generic "every other fixture..."
  // clause instead of naming any specific fixture.
  //
  // Premium/Luxury genuinely intend to add a nicer tub as a tier feature —
  // that mention stays, but reworded from "replacing the EXISTING tub"
  // (also a false-existence assertion on a tub-less photo) to "add a
  // freestanding tub", which is correct whether or not the source photo
  // has one, while still delivering the deliberate upgrade.
  static BATHROOM_WORK_BY_TIER = {
    'Budget-Friendly': 'Repaint the walls and replace the faucet, hardware, and vanity mirror. Every other fixture already in the photo stays exactly as it is.',
    'Mid-Range':       'Replace the vanity and retile the walls and floor, keeping the same layout. Every other fixture already in the photo stays exactly as it is.',
    'Premium':         'Install a custom vanity and large-format tile, and add a freestanding tub in the same area. Every other fixture already in the photo stays exactly as it is.',
    'Luxury':          'Retile floor-to-ceiling in marble and install a custom double vanity, and add a freestanding soaking tub in the same area. Every other fixture already in the photo stays exactly as it is.'
  };

  static BATHROOM_STYLE = {
    'Modern':       'Floating vanity, linear drain, minimalist fixtures.',
    'Traditional':  'Subway tile, classic chrome fixtures, a paneled vanity.',
    'Contemporary': 'Mixed metal finishes, geometric tile, a bold mirror.',
    'Rustic':       'A wood vanity, stone tile, matte black fixtures.',
    'Luxury':       'Premium natural stone throughout for a spa-like finish.'
  };

  // ==================== BEDROOM ====================

  static getBedroomInstruction(style, colorScheme, budgetTier) {
    const work = this.BEDROOM_WORK_BY_TIER[budgetTier] || this.BEDROOM_WORK_BY_TIER['Mid-Range'];
    const styleDetail = this.BEDROOM_STYLE[style] || this.BEDROOM_STYLE['Modern'];
    const color = this.INTERIOR_COLORS[colorScheme] || this.INTERIOR_COLORS['Neutral'];

    return `${work} ${styleDetail} Walls are painted ${color}`;
  }

  static BEDROOM_WORK_BY_TIER = {
    'Budget-Friendly': 'Repaint the walls and replace the ceiling light fixture.',
    'Mid-Range':       'Install new flooring and modern lighting, keeping the same layout.',
    'Premium':         'Install hardwood flooring and add a custom built-in wardrobe along the existing wall.',
    'Luxury':          'Install herringbone hardwood flooring and hang a statement chandelier.'
  };

  static BEDROOM_STYLE = {
    'Modern':       'Clean lines, a neutral palette, minimal clutter.',
    'Traditional':  'Warm wood tones, classic furniture, layered textiles.',
    'Contemporary': 'One accent wall, mixed textures, statement lighting.',
    'Rustic':       'A reclaimed wood headboard, warm tones, cozy textiles.',
    'Luxury':       'A hotel-suite aesthetic with rich fabrics and custom details.'
  };

  // ==================== LIVING ROOM ====================

  static getLivingRoomInstruction(style, colorScheme, budgetTier) {
    const work = this.LIVING_ROOM_WORK_BY_TIER[budgetTier] || this.LIVING_ROOM_WORK_BY_TIER['Mid-Range'];
    const styleDetail = this.LIVING_ROOM_STYLE[style] || this.LIVING_ROOM_STYLE['Modern'];
    const color = this.INTERIOR_COLORS[colorScheme] || this.INTERIOR_COLORS['Neutral'];

    return `${work} ${styleDetail} Walls are painted ${color}`;
  }

  static LIVING_ROOM_WORK_BY_TIER = {
    'Budget-Friendly': 'Repaint the walls and replace the light fixtures.',
    'Mid-Range':       'Install new flooring and modern lighting, keeping the same layout.',
    'Premium':         'Install hardwood flooring and refinish the fireplace surround.',
    'Luxury':          'Install premium hardwood flooring and reclad the fireplace surround in marble.'
  };

  static LIVING_ROOM_STYLE = {
    'Modern':       'Low-profile furniture, a neutral palette, bold artwork.',
    'Traditional':  'Crown moulding, a classic furniture arrangement, warm wood tones.',
    'Contemporary': 'Mixed materials, a statement sofa, layered lighting.',
    'Rustic':       'Exposed beams, a stone fireplace, leather furniture.',
    'Luxury':       'Grand-scale furniture, custom drapery, curated art.'
  };

  // ==================== SHARED ====================

  static INTERIOR_COLORS = {
    'Warm tones': 'warm beige and cream.',
    'Cool tones': 'cool grey and soft blue.',
    'Neutral':    'clean white and light grey.',
    'Bold':       'a deep, saturated colour with high-contrast trim.'
  };

  /**
   * Damage repair, phrased as the finished state (a positive description of
   * what the surfaces look like now), not as a list of things to remove —
   * "free of X" describes the resulting image content; it is not a command
   * about the editing process the way "do not include X" is.
   */
  static getRepairInstruction(primaryArea) {
    if (primaryArea === 'Exterior') {
      return 'Exterior surfaces are freshly finished, free of peeling paint, rot, or damage.';
    }

    return 'All surfaces are freshly repaired and repainted, free of damage, mould, or stains.';
  }

  /**
   * Replaces the SD negative prompt. Written as stated facts about the room/
   * building's existing structure, not as "do not" commands — BFL's own
   * guidance warns that negative phrasing can make a model attend MORE to
   * the exact thing it's told to avoid, which is the likely cause of
   * hallucinated extra doors/openings under the old wording.
   */
  static getPreservationClause(primaryArea) {
    if (primaryArea === 'Exterior') {
      return "The building's roofline, chimney, footprint, height, and every window and door remain in their exact original positions and overall form.";
    }

    return "The room's walls, ceiling height, shape, and every window and door remain in their exact original positions. The camera viewpoint stays unchanged.";
  }

  /**
   * Final render instruction. Kept short on purpose — the viewpoint/lighting
   * continuity for interiors is already stated in getPreservationClause, so
   * this only adds what that clause doesn't cover.
   */
  static getRenderInstruction(primaryArea) {
    if (primaryArea === 'Exterior') {
      return 'Keep the same camera angle and lighting. Photorealistic real estate photography.';
    }

    return 'Match the original lighting. Photorealistic real estate photography.';
  }
}

module.exports = BflPromptBuilder;
