class ReplicatePromptBuilder {

  /**
   * Build prompt and negative prompt for Replicate adirik/interior-design model
   * @param {Object} propertyData - { city, state, propertyType }
   * @param {Object} renovationData - { primaryArea, style, colorScheme, budgetTier }
   * @returns {Object} { prompt, negativePrompt }
   */
  static buildPrompts(propertyData, renovationData) {
    const prompt = this.buildPrompt(propertyData, renovationData);
    const negativePrompt = this.buildNegativePrompt(renovationData.primaryArea);
    return { prompt, negativePrompt };
  }

  /**
   * Build the main transformation prompt
   * Routes to area-specific prompt builder based on primaryArea
   */
  static buildPrompt(propertyData, renovationData) {
    const { city, state } = propertyData;
    const { primaryArea, style, colorScheme, budgetTier } = renovationData;

    const styleDescriptor = this.getStyleDescriptor(style, budgetTier);
    const colorInstruction = this.getColorInstruction(colorScheme);
    const areaInstructions = this.getAreaInstructions(primaryArea, style, colorScheme, budgetTier);
    const locationContext = city && state ? ` in ${city}, ${state}` : '';

    return `${styleDescriptor} renovation${locationContext}. ${areaInstructions} ${colorInstruction} Photorealistic, high quality, professional photography.`;
  }

  /**
   * Area-specific renovation instructions
   */
  static getAreaInstructions(primaryArea, style, colorScheme, budgetTier) {
    const areaMap = {
      'Exterior': this.getExteriorInstructions(style, colorScheme, budgetTier),
      'Kitchen': this.getKitchenInstructions(style, budgetTier),
      'Bathroom': this.getBathroomInstructions(style, budgetTier),
      'Bedroom': this.getBedroomInstructions(style, budgetTier),
      'Living Room': this.getLivingRoomInstructions(style, budgetTier)
    };

    return areaMap[primaryArea] || areaMap['Exterior'];
  }

  /**
   * Exterior renovation instructions
   */
  static getExteriorInstructions(style, colorScheme, budgetTier) {
    const paintMap = {
      'Warm tones': 'warm beige and cream tones',
      'Cool tones': 'soft grey and slate blue tones',
      'Neutral': 'clean white and light grey tones',
      'Bold': 'deep charcoal with white trim accents'
    };

    const materialMap = {
      'Budget-Friendly': 'freshly painted exterior with clean trim',
      'Mid-Range': 'fiber cement siding with quality trim and updated entrance',
      'Premium': 'premium engineered siding, new windows, and landscaped entrance',
      'Luxury': 'natural stone facade, custom windows, grand entrance, and designer landscaping'
    };

    const color = paintMap[colorScheme] || 'warm neutral tones';
    const material = materialMap[budgetTier] || materialMap['Mid-Range'];

    return `${material} in ${color}. Lush green lawn, trimmed hedges, and clean driveway. Preserve the exact roof line, chimney, and architectural structure.`;
  }

  /**
   * Kitchen renovation instructions
   */
  static getKitchenInstructions(style, budgetTier) {
    const kitchenMap = {
      'Budget-Friendly': 'Repainted cabinets, new hardware, clean countertops, and updated lighting.',
      'Mid-Range': 'New shaker cabinets, quartz countertops, stainless steel appliances, and pendant lighting.',
      'Premium': 'Custom cabinets to ceiling, waterfall quartz island, high-end appliances, and designer fixtures.',
      'Luxury': 'Bespoke cabinetry, marble countertops, professional-grade appliances, statement island, and chef lighting.'
    };

    const styleMap = {
      'Modern': 'Clean lines, handleless cabinets, and minimalist design.',
      'Traditional': 'Raised panel cabinets, classic hardware, and warm wood tones.',
      'Contemporary': 'Flat-front cabinets, mixed materials, and bold fixtures.',
      'Rustic': 'Reclaimed wood accents, farmhouse sink, and natural stone.',
      'Luxury': 'Floor-to-ceiling custom millwork with premium finishes.'
    };

    const budget = kitchenMap[budgetTier] || kitchenMap['Mid-Range'];
    const styleDetail = styleMap[style] || styleMap['Modern'];

    return `${budget} ${styleDetail} Preserve the kitchen layout and structural walls.`;
  }

  /**
   * Bathroom renovation instructions
   */
  static getBathroomInstructions(style, budgetTier) {
    const bathroomMap = {
      'Budget-Friendly': 'Repainted walls, new fixtures, updated vanity mirror, and clean tile.',
      'Mid-Range': 'New vanity, updated tile, modern fixtures, frameless mirror, and updated lighting.',
      'Premium': 'Custom vanity, large format tile, rainfall shower, freestanding tub, and designer fixtures.',
      'Luxury': 'Marble tile floor-to-ceiling, custom double vanity, freestanding soaking tub, frameless glass shower, and statement lighting.'
    };

    const styleMap = {
      'Modern': 'Floating vanity, linear drain, and minimalist fixtures.',
      'Traditional': 'Pedestal sink, subway tile, and classic chrome fixtures.',
      'Contemporary': 'Mixed metals, geometric tile, and bold mirror.',
      'Rustic': 'Wood vanity, stone tile, and matte black fixtures.',
      'Luxury': 'Spa-like atmosphere with premium natural materials.'
    };

    const budget = bathroomMap[budgetTier] || bathroomMap['Mid-Range'];
    const styleDetail = styleMap[style] || styleMap['Modern'];

    return `${budget} ${styleDetail} Preserve the bathroom layout and plumbing positions.`;
  }

  /**
   * Bedroom renovation instructions
   */
  static getBedroomInstructions(style, budgetTier) {
    const bedroomMap = {
      'Budget-Friendly': 'Fresh paint, updated lighting, and clean styling.',
      'Mid-Range': 'New flooring, updated trim, modern lighting, and coordinated furnishings.',
      'Premium': 'Custom built-in wardrobe, hardwood floors, designer lighting, and premium bedding.',
      'Luxury': 'Full custom millwork, herringbone hardwood, statement chandelier, and luxury furnishings.'
    };

    const styleMap = {
      'Modern': 'Clean lines, neutral palette, and minimal clutter.',
      'Traditional': 'Warm wood tones, classic furniture, and layered textiles.',
      'Contemporary': 'Bold accent wall, mixed textures, and statement lighting.',
      'Rustic': 'Reclaimed wood headboard, warm tones, and cozy textiles.',
      'Luxury': 'Hotel-suite aesthetic with rich fabrics and custom details.'
    };

    const budget = bedroomMap[budgetTier] || bedroomMap['Mid-Range'];
    const styleDetail = styleMap[style] || styleMap['Modern'];

    return `${budget} ${styleDetail} Preserve the room layout and window positions.`;
  }

  /**
   * Living room renovation instructions
   */
  static getLivingRoomInstructions(style, budgetTier) {
    const livingMap = {
      'Budget-Friendly': 'Fresh paint, updated lighting, and rearranged furniture layout.',
      'Mid-Range': 'New flooring, updated trim and moldings, modern lighting, and cohesive furniture.',
      'Premium': 'Custom built-ins, hardwood floors, fireplace update, designer furniture, and statement lighting.',
      'Luxury': 'Full custom millwork, marble fireplace surround, designer furniture, art lighting, and luxury finishes.'
    };

    const styleMap = {
      'Modern': 'Open layout, low-profile furniture, and neutral palette with bold art.',
      'Traditional': 'Crown molding, classic furniture arrangement, and warm wood tones.',
      'Contemporary': 'Mixed materials, statement sofa, and layered lighting.',
      'Rustic': 'Exposed beams, stone fireplace, leather furniture, and warm textiles.',
      'Luxury': 'Grand scale furniture, custom drapery, and curated art collection.'
    };

    const budget = livingMap[budgetTier] || livingMap['Mid-Range'];
    const styleDetail = styleMap[style] || styleMap['Modern'];

    return `${budget} ${styleDetail} Preserve the room layout and architectural features.`;
  }

  /**
   * Color instruction appended to all prompts
   */
  static getColorInstruction(colorScheme) {
    const colorMap = {
      'Warm tones': 'Use warm beige, cream, and terracotta tones throughout.',
      'Cool tones': 'Use cool grey, slate, and soft blue tones throughout.',
      'Neutral': 'Use clean white, off-white, and light grey tones throughout.',
      'Bold': 'Use deep, rich colors with high contrast accents throughout.'
    };

    return colorMap[colorScheme] || colorMap['Neutral'];
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
   * Negative prompt — area-aware
   */
  static buildNegativePrompt(primaryArea) {
    const base = [
      'cartoon',
      'illustration',
      'painting',
      'drawing',
      'blurry',
      'low quality',
      'distorted',
      'unrealistic',
      'watermark',
      'text',
      'logo',
      'people'
    ];

    const exteriorExtra = [
      'different house',
      'different architecture',
      'different roof shape',
      'different building structure',
      'demolished',
      'construction site',
      'scaffolding',
      'cars'
    ];

    const interiorExtra = [
      'different room layout',
      'different room shape',
      'demolished walls',
      'construction site',
      'structural changes'
    ];

    const extra = primaryArea === 'Exterior' ? exteriorExtra : interiorExtra;

    return [...base, ...extra].join(', ');
  }
}

module.exports = ReplicatePromptBuilder;