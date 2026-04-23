// Pure, rule-based estimator for trip provisions (water + food).
// No external APIs, no AI — deterministic and easy to test.

// Baselines are intentionally conservative for camping/backpacking.
const BASELINE_WATER_L_PER_PERSON_PER_DAY = 2.0;   // drinking + cooking
const BASELINE_CALORIES_PER_PERSON_PER_DAY = 2500; // sedentary day
const TRAIL_FOOD_CAL_PER_GRAM = 4.5;               // mixed dehydrated/trail food

const TERRAIN_WATER_MULT = {
  Desert: 2.0,
  Mountain: 1.25,
  Forest: 1.0,
};

const TERRAIN_CAL_MULT = {
  Mountain: 1.3,   // strenuous ascents
  Desert: 1.15,
  Forest: 1.1,
};

const SEASON_WATER_DELTA = {
  Summer: 0.5,   // extra L/person/day in heat
  Spring: 0.0,
  Fall: 0.0,
  Winter: -0.2,  // slightly less fluid loss but still need hydration
};

const SEASON_CAL_DELTA = {
  Winter: 400,  // thermoregulation burns more calories
  Summer: 0,
  Spring: 100,
  Fall: 200,
};

function clampPositive(n, min = 0) {
  return Number.isFinite(n) && n > min ? n : min;
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

/**
 * Estimate water and food needs for a trip.
 * @param {Object} trip
 * @param {number} trip.duration - days, integer >= 1
 * @param {string} trip.terrain - 'Mountain' | 'Forest' | 'Desert' | other
 * @param {string} trip.season  - 'Winter' | 'Spring' | 'Summer' | 'Fall' | other
 * @param {number} [trip.participants=1] - group size, integer >= 1
 */
function estimateProvisions(trip = {}) {
  const duration = Math.max(1, Math.floor(Number(trip.duration) || 1));
  const participants = Math.max(1, Math.floor(Number(trip.participants) || 1));
  const terrain = trip.terrain || 'Forest';
  const season = trip.season || 'Summer';

  const waterMult = TERRAIN_WATER_MULT[terrain] ?? 1.0;
  const waterDelta = SEASON_WATER_DELTA[season] ?? 0;
  const waterPerPersonPerDay = clampPositive(
    BASELINE_WATER_L_PER_PERSON_PER_DAY * waterMult + waterDelta,
    0.5
  );
  const totalWaterLiters = waterPerPersonPerDay * duration * participants;

  const calMult = TERRAIN_CAL_MULT[terrain] ?? 1.0;
  const calDelta = SEASON_CAL_DELTA[season] ?? 0;
  const caloriesPerPersonPerDay = Math.round(
    BASELINE_CALORIES_PER_PERSON_PER_DAY * calMult + calDelta
  );
  const totalCalories = caloriesPerPersonPerDay * duration * participants;
  const totalFoodGrams = Math.round(totalCalories / TRAIL_FOOD_CAL_PER_GRAM);
  const foodGramsPerPersonPerDay = Math.round(caloriesPerPersonPerDay / TRAIL_FOOD_CAL_PER_GRAM);

  // Human-friendly reasoning chips.
  const reasons = [];
  if (terrain === 'Desert') reasons.push({ icon: '🏜️', text: 'Desert terrain: ~2× water' });
  if (terrain === 'Mountain') reasons.push({ icon: '⛰️', text: 'Mountain terrain: high exertion' });
  if (season === 'Summer') reasons.push({ icon: '☀️', text: 'Summer heat: extra hydration' });
  if (season === 'Winter') reasons.push({ icon: '❄️', text: 'Winter cold: extra calories' });
  if (participants > 1) reasons.push({ icon: '👥', text: `Group of ${participants}` });
  if (duration >= 5) reasons.push({ icon: '📅', text: `${duration}-day trip` });

  return {
    inputs: { duration, participants, terrain, season },
    water: {
      totalLiters: round1(totalWaterLiters),
      perPersonPerDay: round1(waterPerPersonPerDay),
      perDay: round1(waterPerPersonPerDay * participants),
    },
    food: {
      totalGrams: totalFoodGrams,
      totalCalories,
      caloriesPerPersonPerDay,
      gramsPerPersonPerDay: foodGramsPerPersonPerDay,
    },
    reasons,
    disclaimer:
      'Estimates only. Adjust for personal needs, altitude, medical conditions, and resupply points.',
  };
}

module.exports = {
  estimateProvisions,
  // Export constants for tests / future tuning.
  _internals: {
    BASELINE_WATER_L_PER_PERSON_PER_DAY,
    BASELINE_CALORIES_PER_PERSON_PER_DAY,
    TRAIL_FOOD_CAL_PER_GRAM,
    TERRAIN_WATER_MULT,
    TERRAIN_CAL_MULT,
    SEASON_WATER_DELTA,
    SEASON_CAL_DELTA,
  },
};
