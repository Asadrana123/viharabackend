class ReplicatePromptBuilder {

  /**
   * Build prompt and negative prompt for Replicate adirik/interior-design model
   * @param {Object} propertyData - Property details
   * @param {Object} renovationData - User form selections
   * @param {Object} costAnalysis - Calculated cost analysis
   * @returns {Object} { prompt, negativePrompt }
   */
  static buildPrompts(propertyData, renovationData, costAnalysis) {
    const prompt = this.buildPrompt(propertyData, renovationData, costAnalysis);
    const negativePrompt = this.buildNegativePrompt();
    return { prompt, negativePrompt };
  }

  /**
   * Build the main transformation prompt
   * Key rules for adirik/interior-design model:
   * - Be specific about what to CHANGE
   * - Be explicit about what to PRESERVE
   * - Include style, materials, colors
   * - Keep it under 400 characters for best results
   */
  static buildPrompt(propertyData, renovationData, costAnalysis) {
    const { city, state, yearBuilt, propertyType } = propertyData;
    const {
      style,
      colorScheme,
      exteriorFocusAreas,
      architecturalElements,
      budgetTier
    } = renovationData;

    // Build change instructions based on user selections
    const changes = this.buildChangeInstructions(
      architecturalElements,
      exteriorFocusAreas,
      style,
      colorScheme,
      budgetTier
    );

    // Build style descriptor
    const styleDescriptor = this.getStyleDescriptor(style, budgetTier);

    // Build location context
    const locationContext = `${city}, ${state}`;

    const prompt = `${styleDescriptor} exterior renovation of this ${propertyType || 'single family home'} in ${locationContext}. ${changes} Preserve the exact roof line, chimney positions, arched entrance, architectural structure, surrounding trees, and street lamp. Photorealistic, sunny day, high quality.`;

    return prompt;
  }

  /**
   * Build specific change instructions from form selections
   */
  static buildChangeInstructions(architecturalElements, focusAreas, style, colorScheme, budgetTier) {
    const instructions = [];

    // Primary changes based on architecturalElements
    const primaryChanges = {
      'Repaint only': this.getPaintInstruction(colorScheme, budgetTier),
      'Update roof/siding': this.getSidingInstruction(colorScheme, style, budgetTier),
      'New windows': this.getWindowInstruction(style, budgetTier),
      'New entrance': this.getEntranceInstruction(style, budgetTier)
    };

    const primaryInstruction = primaryChanges[architecturalElements];
    if (primaryInstruction) {
      instructions.push(primaryInstruction);
    }

    // Focus area changes
    const focusChanges = {
      'Front entrance': this.getEntranceInstruction(style, budgetTier),
      'Landscaping': this.getLandscapingInstruction(budgetTier),
      'Driveway': this.getDrivewayInstruction(budgetTier),
      'Patio': 'Add a clean patio area with outdoor furniture.',
      'All': `${this.getLandscapingInstruction(budgetTier)} ${this.getEntranceInstruction(style, budgetTier)}`
    };

    const focusInstruction = focusChanges[focusAreas];
    if (focusInstruction && focusAreas !== architecturalElements) {
      instructions.push(focusInstruction);
    }

    // Always add landscaping polish if not already included
    if (
      architecturalElements !== 'Landscaping' &&
      focusAreas !== 'Landscaping' &&
      focusAreas !== 'All'
    ) {
      instructions.push('Perfectly manicured green lawn with trimmed hedges.');
    }

    return instructions.join(' ');
  }

  /**
   * Paint instruction based on color scheme and budget
   */
  static getPaintInstruction(colorScheme, budgetTier) {
    const colorMap = {
      'Warm tones': 'warm beige and cream tones',
      'Cool tones': 'soft grey and slate blue tones',
      'Neutral': 'clean white and light grey tones',
      'Bold': 'deep charcoal with white trim accents'
    };

    const color = colorMap[colorScheme] || 'warm beige tones';

    if (budgetTier === 'Luxury' || budgetTier === 'Premium') {
      return `Repaint exterior in ${color} with crisp white trim, shutters, and a freshly painted dark front door.`;
    }
    return `Repaint exterior walls in ${color} with clean white trim.`;
  }

  /**
   * Siding instruction based on style and budget
   */
  static getSidingInstruction(colorScheme, style, budgetTier) {
    const materialMap = {
      'Budget-Friendly': 'new vinyl siding',
      'Mid-Range': 'fiber cement siding (James Hardie style)',
      'Premium': 'premium engineered wood siding',
      'Luxury': 'natural stone and premium composite siding'
    };

    const colorMap = {
      'Warm tones': 'warm greige',
      'Cool tones': 'soft grey',
      'Neutral': 'classic white',
      'Bold': 'deep charcoal'
    };

    const material = materialMap[budgetTier] || 'fiber cement siding';
    const color = colorMap[colorScheme] || 'warm greige';

    return `Replace exterior cladding with ${material} in ${color} with white trim and updated fascia boards.`;
  }

  /**
   * Window instruction
   */
  static getWindowInstruction(style, budgetTier) {
    const windowMap = {
      'Budget-Friendly': 'new white vinyl double-hung windows',
      'Mid-Range': 'new fiberglass windows with clean white frames',
      'Premium': 'premium black-framed windows for modern contrast',
      'Luxury': 'custom dark bronze aluminum-clad windows'
    };

    return `Replace all windows with ${windowMap[budgetTier] || 'new clean white windows'}.`;
  }

  /**
   * Entrance instruction based on style and budget
   */
  static getEntranceInstruction(style, budgetTier) {
    const entranceMap = {
      'Modern': {
        'Budget-Friendly': 'a new dark grey steel front door with modern hardware',
        'Mid-Range': 'a new black fiberglass double door with sidelights and modern hardware',
        'Premium': 'a grand black steel and glass door with contemporary surround',
        'Luxury': 'a custom dark mahogany double door with full glass inserts, transom, and statement lighting'
      },
      'Traditional': {
        'Budget-Friendly': 'a new classic red painted wood door with brass hardware',
        'Mid-Range': 'a new mahogany fiberglass door with sidelights and colonial trim',
        'Premium': 'a solid wood double door with decorative glass and pillar surround',
        'Luxury': 'a grand custom wood double door with ornate millwork, columns, and gas lanterns'
      },
      'Contemporary': {
        'Budget-Friendly': 'a sleek dark charcoal door with brushed nickel hardware',
        'Mid-Range': 'a flush dark wood fiberglass door with frosted glass panel',
        'Premium': 'a wide pivot door in dark wood with full height glass',
        'Luxury': 'a custom oversized pivot door with floor-to-ceiling glass and statement entryway'
      },
      'Rustic': {
        'Budget-Friendly': 'a barn-style dark wood door with black hardware',
        'Mid-Range': 'a solid wood plank door with black iron hardware and stone pathway',
        'Premium': 'a reclaimed wood double door with iron accents and stone surround',
        'Luxury': 'a custom knotty wood double door with wrought iron details and natural stone arch'
      },
      'Luxury': {
        'Budget-Friendly': 'a new dark mahogany door with gold hardware',
        'Mid-Range': 'a grand double door in dark mahogany with sidelights and statement lighting',
        'Premium': 'a custom double door with glass panels, marble surround, and designer lighting',
        'Luxury': 'an oversized custom mahogany double door with full glass inserts, marble columns, and crystal lighting'
      }
    };

    const styleEntry = entranceMap[style] || entranceMap['Modern'];
    return `Add ${styleEntry[budgetTier] || styleEntry['Mid-Range']}.`;
  }

  /**
   * Landscaping instruction based on budget
   */
  static getLandscapingInstruction(budgetTier) {
    const landscapingMap = {
      'Budget-Friendly': 'Fresh green lawn, trimmed shrubs, and basic mulched flower beds.',
      'Mid-Range': 'Lush green lawn, symmetrical shrubs, colorful flower beds with pink and red blooms, and clean mulched borders.',
      'Premium': 'Professional landscaping with lush lawn, mature shrubs, blooming flower beds, ornamental trees, and garden lighting.',
      'Luxury': 'Designer landscaping with manicured lawn, specimen trees, dramatic flower beds, stone pathway, water feature, and accent lighting.'
    };

    return landscapingMap[budgetTier] || landscapingMap['Mid-Range'];
  }

  /**
   * Driveway instruction based on budget
   */
  static getDrivewayInstruction(budgetTier) {
    const drivewayMap = {
      'Budget-Friendly': 'Clean and resealed asphalt driveway with tidy edges.',
      'Mid-Range': 'New clean concrete driveway with crisp edges and border trim.',
      'Premium': 'Stamped concrete driveway with decorative border pattern.',
      'Luxury': 'Elegant paver driveway in natural stone with manicured grass borders.'
    };

    return drivewayMap[budgetTier] || drivewayMap['Mid-Range'];
  }

  /**
   * Style descriptor prefix for the prompt
   */
  static getStyleDescriptor(style, budgetTier) {
    const descriptors = {
      'Modern': 'Modern',
      'Traditional': 'Classic traditional',
      'Contemporary': 'Contemporary',
      'Rustic': 'Rustic',
      'Luxury': 'Luxury'
    };

    const tierDescriptors = {
      'Budget-Friendly': 'refreshed',
      'Mid-Range': 'renovated',
      'Premium': 'premium renovated',
      'Luxury': 'luxury renovated'
    };

    const styleStr = descriptors[style] || 'Modern';
    const tierStr = tierDescriptors[budgetTier] || 'renovated';

    return `${styleStr} ${tierStr}`;
  }

  /**
   * Negative prompt — tells model what NOT to generate
   * Critical for preserving original building structure
   */
  static buildNegativePrompt() {
    return [
      'different house',
      'different architecture',
      'different roof shape',
      'different building structure',
      'cartoon',
      'illustration',
      'painting',
      'drawing',
      'blurry',
      'low quality',
      'distorted',
      'unrealistic',
      'fantasy',
      'demolished',
      'construction site',
      'scaffolding',
      'people',
      'cars',
      'watermark',
      'text',
      'logo'
    ].join(', ');
  }
}

module.exports = ReplicatePromptBuilder;
