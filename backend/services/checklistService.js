// Models removed - will need DynamoDB refactoring
// const Trip = require('../models/Trip');
// const ChecklistItem = require('../models/ChecklistItem');

class ChecklistService {
  constructor() {
    // Enhanced checklist rules with categories and weights
    this.checklistRules = {
      base: [
        { name: 'Backpack', category: 'Tools', priority: 'high' },
        { name: 'Water bottle', category: 'Food & Water', priority: 'high' },
        { name: 'First aid kit', category: 'Safety', priority: 'high' },
        { name: 'Emergency whistle', category: 'Safety', priority: 'medium' }
      ],
      terrain: {
        'Mountain': [
          { name: 'Hiking boots', category: 'Clothing', priority: 'high' },
          { name: 'Warm layers', category: 'Clothing', priority: 'high' },
          { name: 'Trekking poles', category: 'Tools', priority: 'medium' },
          { name: 'Altitude sickness medication', category: 'Safety', priority: 'medium' },
          { name: 'Crampons', category: 'Tools', priority: 'low' }
        ],
        'Forest': [
          { name: 'Bug spray', category: 'Safety', priority: 'high' },
          { name: 'Tarp', category: 'Shelter', priority: 'medium' },
          { name: 'Long pants', category: 'Clothing', priority: 'medium' },
          { name: 'Tick remover', category: 'Safety', priority: 'medium' },
          { name: 'Bear spray', category: 'Safety', priority: 'high' }
        ],
        'Desert': [
          { name: 'Extra water containers', category: 'Food & Water', priority: 'high' },
          { name: 'Sun hat', category: 'Clothing', priority: 'high' },
          { name: 'Sunscreen SPF 50+', category: 'Safety', priority: 'high' },
          { name: 'Sunglasses', category: 'Clothing', priority: 'high' },
          { name: 'Cooling towel', category: 'Clothing', priority: 'medium' },
          { name: 'Electrolyte supplements', category: 'Food & Water', priority: 'medium' }
        ],
        'Beach': [
          { name: 'Swimwear', category: 'Clothing', priority: 'high' },
          { name: 'Waterproof bag', category: 'Tools', priority: 'high' },
          { name: 'Beach tent/umbrella', category: 'Shelter', priority: 'medium' },
          { name: 'Water shoes', category: 'Clothing', priority: 'medium' },
          { name: 'Snorkel gear', category: 'Tools', priority: 'low' }
        ],
        'Snow': [
          { name: 'Snow boots', category: 'Clothing', priority: 'high' },
          { name: 'Snow jacket', category: 'Clothing', priority: 'high' },
          { name: 'Thermal underwear', category: 'Clothing', priority: 'high' },
          { name: 'Hand warmers', category: 'Clothing', priority: 'medium' },
          { name: 'Snowshoes', category: 'Tools', priority: 'low' }
        ]
      },
      season: {
        'Winter': [
          { name: 'Winter jacket', category: 'Clothing', priority: 'high' },
          { name: 'Insulated gloves', category: 'Clothing', priority: 'high' },
          { name: 'Warm hat/beanie', category: 'Clothing', priority: 'high' },
          { name: 'Insulated sleeping bag', category: 'Shelter', priority: 'high' },
          { name: 'Hand/foot warmers', category: 'Clothing', priority: 'medium' },
          { name: 'Thermos', category: 'Food & Water', priority: 'medium' }
        ],
        'Summer': [
          { name: 'Lightweight clothing', category: 'Clothing', priority: 'high' },
          { name: 'Cooling towel', category: 'Clothing', priority: 'medium' },
          { name: 'Lightweight tent', category: 'Shelter', priority: 'high' },
          { name: 'Portable fan', category: 'Tools', priority: 'low' },
          { name: 'Extra water bottles', category: 'Food & Water', priority: 'high' }
        ],
        'Fall': [
          { name: 'Layered clothing', category: 'Clothing', priority: 'high' },
          { name: 'Rain jacket', category: 'Clothing', priority: 'high' },
          { name: 'Warm sleeping bag', category: 'Shelter', priority: 'high' },
          { name: 'Waterproof boots', category: 'Clothing', priority: 'high' },
          { name: 'Leaf identification guide', category: 'Tools', priority: 'low' }
        ],
        'Spring': [
          { name: 'Layered clothing', category: 'Clothing', priority: 'high' },
          { name: 'Rain jacket/poncho', category: 'Clothing', priority: 'high' },
          { name: 'Waterproof boots', category: 'Clothing', priority: 'high' },
          { name: 'Allergy medication', category: 'Safety', priority: 'medium' },
          { name: 'Wildflower guide', category: 'Tools', priority: 'low' }
        ]
      },
      duration: {
        overnight: [
          { name: 'Tent', category: 'Shelter', priority: 'high' },
          { name: 'Sleeping pad', category: 'Shelter', priority: 'high' },
          { name: 'Camping stove', category: 'Food & Water', priority: 'high' },
          { name: 'Cookware set', category: 'Food & Water', priority: 'medium' },
          { name: 'Headlamp + extra batteries', category: 'Safety', priority: 'high' }
        ],
        extended: [
          { name: 'Extra batteries/power bank', category: 'Tools', priority: 'high' },
          { name: 'Water purification tablets/filter', category: 'Food & Water', priority: 'high' },
          { name: 'Multi-tool', category: 'Tools', priority: 'high' },
          { name: 'Rope/paracord', category: 'Tools', priority: 'medium' },
          { name: 'Duct tape', category: 'Tools', priority: 'medium' },
          { name: 'Portable shower', category: 'Tools', priority: 'low' }
        ]
      }
    };
  }

  // Generate smart checklist based on trip parameters
  async generateChecklist(terrain, season, duration) {
    const items = [];
    const usedNames = new Set();

    // Add base items
    this.checklistRules.base.forEach(item => {
      items.push({ ...item, source: 'base' });
      usedNames.add(item.name);
    });

    // Add terrain-specific items
    if (this.checklistRules.terrain[terrain]) {
      this.checklistRules.terrain[terrain].forEach(item => {
        if (!usedNames.has(item.name)) {
          items.push({ ...item, source: 'terrain' });
          usedNames.add(item.name);
        }
      });
    }

    // Add season-specific items
    if (this.checklistRules.season[season]) {
      this.checklistRules.season[season].forEach(item => {
        if (!usedNames.has(item.name)) {
          items.push({ ...item, source: 'season' });
          usedNames.add(item.name);
        }
      });
    }

    // Add duration-based items
    if (duration >= 1) {
      this.checklistRules.duration.overnight.forEach(item => {
        if (!usedNames.has(item.name)) {
          items.push({ ...item, source: 'duration' });
          usedNames.add(item.name);
        }
      });
    }

    if (duration >= 3) {
      this.checklistRules.duration.extended.forEach(item => {
        if (!usedNames.has(item.name)) {
          items.push({ ...item, source: 'duration' });
          usedNames.add(item.name);
        }
      });
    }

    // Add common safety items
    const safetyItems = [
      { name: 'Flashlight/Headlamp', category: 'Safety', priority: 'high', source: 'safety' },
      { name: 'Whistle', category: 'Safety', priority: 'medium', source: 'safety' },
      { name: 'Map and compass', category: 'Tools', priority: 'medium', source: 'safety' }
    ];

    safetyItems.forEach(item => {
      if (!usedNames.has(item.name)) {
        items.push(item);
        usedNames.add(item.name);
      }
    });

    return items;
  }

  // Get smart recommendations based on trip context
  async getRecommendations(tripId) {
    const trip = await Trip.findById(tripId);
    if (!trip) throw new Error('Trip not found');

    const items = await ChecklistItem.find({ tripId });
    const packedCount = items.filter(i => i.packed).length;
    const totalCount = items.length;
    const progress = totalCount > 0 ? (packedCount / totalCount) * 100 : 0;

    const recommendations = [];

    // Check if critical items are packed
    const criticalItems = items.filter(i => 
      ['First aid kit', 'Water bottle', 'Backpack'].includes(i.name)
    );
    const unpackedCritical = criticalItems.filter(i => !i.packed);
    
    if (unpackedCritical.length > 0) {
      recommendations.push({
        type: 'warning',
        message: `${unpackedCritical.length} critical items still need to be packed`,
        items: unpackedCritical.map(i => i.name)
      });
    }

    // Weather-based recommendations
    if (trip.season === 'Winter' && !items.some(i => i.name.includes('Thermal'))) {
      recommendations.push({
        type: 'suggestion',
        message: 'Consider adding thermal underwear for cold weather'
      });
    }

    // Progress-based encouragement
    if (progress >= 80) {
      recommendations.push({
        type: 'success',
        message: 'Almost ready! You have packed most of your items.'
      });
    } else if (progress < 30) {
      recommendations.push({
        type: 'info',
        message: 'Get started by packing essential items first'
      });
    }

    return recommendations;
  }

  // Update trip checklist progress
  async updateTripProgress(tripId) {
    const items = await ChecklistItem.find({ tripId });
    const packedCount = items.filter(i => i.packed).length;

    await Trip.findByIdAndUpdate(tripId, {
      'checklistProgress.total': items.length,
      'checklistProgress.packed': packedCount,
      'checklistProgress.lastUpdated': new Date()
    });

    return {
      total: items.length,
      packed: packedCount,
      percentage: items.length > 0 ? Math.round((packedCount / items.length) * 100) : 0
    };
  }
}

module.exports = new ChecklistService();
