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

    return [
      edit,
      repair,
      preserve,
      'Keep the original camera angle, perspective, framing, time of day, and direction of light unchanged.',
      'Render as photorealistic professional real estate photography.'
    ].join(' ');
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

    return `${work} Finish the exterior in ${color}. ${styleDetail} ${landscaping}`;
  }

  /**
   * Landscaping vegetation is the one place location genuinely changes the edit.
   * A Kingwood, TX yard and an Oakland, CA yard do not plant the same things.
   */
  static getLandscapingInstruction(propertyData) {
    const state = propertyData?.state;
    const vegetation = this.LANDSCAPING_BY_STATE[state] || this.LANDSCAPING_BY_STATE.DEFAULT;

    return `Replace the lawn with healthy green turf, add ${vegetation}, and clean the driveway and walkway surfaces.`;
  }

  static EXTERIOR_WORK_BY_TIER = {
    'Budget-Friendly': 'Repaint the existing exterior siding and trim in fresh, clean paint. Do not change any materials.',
    'Mid-Range':       'Replace the exterior siding with new fiber cement lap siding and install clean new trim. Refresh the front entrance door and hardware.',
    'Premium':         'Replace the exterior siding with premium engineered siding, install new windows in the existing openings, and rebuild the front entrance with an upgraded door and porch finish.',
    'Luxury':          'Reclad the facade in natural stone and premium siding, install custom windows in the existing openings, and rebuild the front entrance as a grand covered entry.'
  };

  static EXTERIOR_COLORS = {
    'Warm tones': 'warm beige and cream with cream trim',
    'Cool tones': 'soft grey and slate blue with white trim',
    'Neutral':    'clean white and light grey with white trim',
    'Bold':       'deep charcoal with crisp white trim'
  };

  static EXTERIOR_STYLE = {
    'Modern':       'Use clean horizontal lines, flush trim, and matte black fixtures.',
    'Traditional':  'Use classic proportions, wide trim boards, and warm-toned fixtures.',
    'Contemporary': 'Use mixed cladding materials with sharp, minimal detailing.',
    'Rustic':       'Use natural wood accents, stone base, and dark bronze fixtures.',
    'Luxury':       'Use refined stone and millwork detailing with polished fixtures.'
  };

  static LANDSCAPING_BY_STATE = {
    'CA':      'drought-tolerant shrubs, ornamental grasses, and a trimmed hedge border',
    'TX':      'native shrubs, mulched beds, and mature shade planting near the entrance',
    'DEFAULT': 'trimmed hedges, mulched planting beds, and low shrubs along the foundation'
  };

  // ==================== KITCHEN ====================

  static getKitchenInstruction(style, colorScheme, budgetTier) {
    const work = this.KITCHEN_WORK_BY_TIER[budgetTier] || this.KITCHEN_WORK_BY_TIER['Mid-Range'];
    const styleDetail = this.KITCHEN_STYLE[style] || this.KITCHEN_STYLE['Modern'];
    const color = this.INTERIOR_COLORS[colorScheme] || this.INTERIOR_COLORS['Neutral'];

    return `${work} ${styleDetail} Paint the walls in ${color}`;
  }

  static KITCHEN_WORK_BY_TIER = {
    'Budget-Friendly': 'Repaint the existing kitchen cabinets, replace the cabinet hardware, resurface the countertops, and replace the ceiling light fixture.',
    'Mid-Range':       'Replace the kitchen cabinets with shaker-front cabinets, install quartz countertops, install stainless steel appliances in the existing appliance locations, and hang pendant lights over the counter.',
    'Premium':         'Replace the kitchen cabinets with full-height custom cabinetry, install a waterfall quartz countertop, install high-end appliances in the existing appliance locations, and add designer lighting.',
    'Luxury':          'Replace the kitchen cabinets with bespoke millwork, install marble countertops and a full marble backsplash, install professional-grade appliances in the existing appliance locations, and add statement chef lighting.'
  };

  static KITCHEN_STYLE = {
    'Modern':       'Use handleless flat cabinet fronts and minimalist detailing.',
    'Traditional':  'Use raised panel cabinet doors, classic hardware, and warm wood tones.',
    'Contemporary': 'Use flat-front cabinets, mixed materials, and bold fixtures.',
    'Rustic':       'Use reclaimed wood accents, a farmhouse sink, and natural stone surfaces.',
    'Luxury':       'Use floor-to-ceiling custom millwork with premium stone finishes.'
  };

  // ==================== BATHROOM ====================

  static getBathroomInstruction(style, budgetTier) {
    const work = this.BATHROOM_WORK_BY_TIER[budgetTier] || this.BATHROOM_WORK_BY_TIER['Mid-Range'];
    const styleDetail = this.BATHROOM_STYLE[style] || this.BATHROOM_STYLE['Modern'];

    return `${work} ${styleDetail}`;
  }

  static BATHROOM_WORK_BY_TIER = {
    'Budget-Friendly': 'Repaint the bathroom walls, replace the faucet and fixtures, replace the vanity mirror, and regrout the existing tile.',
    'Mid-Range':       'Replace the vanity, retile the walls and floor, install modern fixtures, hang a frameless mirror, and replace the vanity lighting.',
    'Premium':         'Install a custom vanity, retile in large-format tile, install a rainfall shower head, add a freestanding tub in the existing tub location, and install designer fixtures.',
    'Luxury':          'Retile floor-to-ceiling in marble, install a custom double vanity, place a freestanding soaking tub in the existing tub location, install a frameless glass shower enclosure, and add statement lighting.'
  };

  static BATHROOM_STYLE = {
    'Modern':       'Use a floating vanity, a linear drain, and minimalist fixtures.',
    'Traditional':  'Use subway tile, classic chrome fixtures, and a paneled vanity.',
    'Contemporary': 'Use mixed metal finishes, geometric tile, and a bold mirror.',
    'Rustic':       'Use a wood vanity, stone tile, and matte black fixtures.',
    'Luxury':       'Use premium natural stone throughout for a spa-like finish.'
  };

  // ==================== BEDROOM ====================

  static getBedroomInstruction(style, colorScheme, budgetTier) {
    const work = this.BEDROOM_WORK_BY_TIER[budgetTier] || this.BEDROOM_WORK_BY_TIER['Mid-Range'];
    const styleDetail = this.BEDROOM_STYLE[style] || this.BEDROOM_STYLE['Modern'];
    const color = this.INTERIOR_COLORS[colorScheme] || this.INTERIOR_COLORS['Neutral'];

    return `${work} ${styleDetail} Paint the walls in ${color}`;
  }

  static BEDROOM_WORK_BY_TIER = {
    'Budget-Friendly': 'Repaint the bedroom walls, replace the ceiling light fixture, and stage the room with clean, simple furnishings.',
    'Mid-Range':       'Install new flooring, replace the trim and baseboards, install modern lighting, and stage the room with coordinated furnishings.',
    'Premium':         'Install hardwood flooring, add a custom built-in wardrobe along the existing wall, install designer lighting, and stage with premium furnishings.',
    'Luxury':          'Install herringbone hardwood flooring, add full custom millwork, hang a statement chandelier, and stage with luxury furnishings.'
  };

  static BEDROOM_STYLE = {
    'Modern':       'Use clean lines, a neutral palette, and minimal clutter.',
    'Traditional':  'Use warm wood tones, classic furniture, and layered textiles.',
    'Contemporary': 'Use one accent wall, mixed textures, and statement lighting.',
    'Rustic':       'Use a reclaimed wood headboard, warm tones, and cozy textiles.',
    'Luxury':       'Use a hotel-suite aesthetic with rich fabrics and custom details.'
  };

  // ==================== LIVING ROOM ====================

  static getLivingRoomInstruction(style, colorScheme, budgetTier) {
    const work = this.LIVING_ROOM_WORK_BY_TIER[budgetTier] || this.LIVING_ROOM_WORK_BY_TIER['Mid-Range'];
    const styleDetail = this.LIVING_ROOM_STYLE[style] || this.LIVING_ROOM_STYLE['Modern'];
    const color = this.INTERIOR_COLORS[colorScheme] || this.INTERIOR_COLORS['Neutral'];

    return `${work} ${styleDetail} Paint the walls in ${color}`;
  }

  static LIVING_ROOM_WORK_BY_TIER = {
    'Budget-Friendly': 'Repaint the living room walls, replace the light fixtures, and stage the room with a clean furniture layout.',
    'Mid-Range':       'Install new flooring, replace the trim and crown moulding, install modern lighting, and stage with cohesive furniture.',
    'Premium':         'Install hardwood flooring, add custom built-ins along the existing wall, refinish the fireplace surround, and stage with designer furniture and statement lighting.',
    'Luxury':          'Install premium hardwood flooring, add full custom millwork, reclad the fireplace surround in marble, and stage with luxury furniture and curated art lighting.'
  };

  static LIVING_ROOM_STYLE = {
    'Modern':       'Use low-profile furniture and a neutral palette with bold artwork.',
    'Traditional':  'Use crown moulding, a classic furniture arrangement, and warm wood tones.',
    'Contemporary': 'Use mixed materials, a statement sofa, and layered lighting.',
    'Rustic':       'Use exposed beams, a stone fireplace, leather furniture, and warm textiles.',
    'Luxury':       'Use grand-scale furniture, custom drapery, and a curated art collection.'
  };

  // ==================== SHARED ====================

  static INTERIOR_COLORS = {
    'Warm tones': 'warm beige and cream.',
    'Cool tones': 'cool grey and soft blue.',
    'Neutral':    'clean white and light grey.',
    'Bold':       'a deep, saturated colour with high-contrast trim.'
  };

  /**
   * Damage repair. Phrased as an instruction, not as a description of a clean
   * room — Kontext acts on verbs.
   */
  static getRepairInstruction(primaryArea) {
    if (primaryArea === 'Exterior') {
      return 'Repair all visible damage: remove peeling paint, water stains, cracks, rot, and debris. Every exterior surface must read as newly finished and well maintained.';
    }

    return 'Repair all visible damage: remove mould, water stains, peeling paint, cracks, and damaged surfaces. Replaster and repaint every wall so all surfaces read as brand new and move-in ready.';
  }

  /**
   * Replaces the SD negative prompt. This is the clause that stops Kontext from
   * silently redrawing the property as a different building or room.
   */
  static getPreservationClause(primaryArea) {
    if (primaryArea === 'Exterior') {
      return 'Preserve the building exactly: the same roof line and roof pitch, the same chimney, the same number and position of every window and door, the same footprint, the same height, and the same overall architectural form. Do not add or remove any structure. Do not include people, vehicles, scaffolding, text, or watermarks.';
    }

    return 'Preserve the room exactly: the same walls, the same ceiling height, the same room shape, and the same number and position of every window and door. Do not move or remove any wall. Do not change the viewpoint. Do not include people, text, or watermarks.';
  }
}

module.exports = BflPromptBuilder;
