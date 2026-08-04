// Pack weight: defaults, and the base/consumable split.
//
// Unit is GRAMS, stored as an integer, everywhere — schema, API and UI.
// Backpacking gear is published in grams (or ounces, which convert cleanly to
// them), gram precision is finer than anyone measures, and integers keep the
// Mongo aggregation exact. Kilograms would have meant floats and a rounding
// question at every boundary; the UI formats to kg for display instead.

// ---------- Base vs consumables ----------
//
// Base weight is what you carry the whole trip; consumables are eaten, drunk or
// burned along the way. The distinction is the one backpackers actually plan
// against — base weight is the number you change by buying different gear,
// consumables are the number that shrinks as you walk.
//
// The checklist vocabulary is six fixed categories, so the first cut is by
// category: 'Food & Water' is consumable, the rest are base. That is too coarse
// on its own — a water bottle, filter or stove lives in 'Food & Water' and is
// durable gear that never gets lighter — so durable names are pulled back out.
// Fuel is the mirror image: genuinely consumable, but it usually gets filed
// under Tools.
const CONSUMABLE_CATEGORY = 'Food & Water';

// Durable items that live in the consumable category. Matched on the item name,
// case-insensitively, as whole-ish words so "water bottle" is caught but
// "bottled water" is not mistaken for hardware.
const DURABLE_IN_FOOD_RE =
  /\b(bottle|flask|canteen|bladder|reservoir|filter|purifier|stove|pot|pan|mug|cup|bowl|spork|utensil|cutlery|cooler|thermos|opener|kettle|grill)\b/i;

// Consumable items filed outside the consumable category — fuel, mostly.
const CONSUMABLE_ANYWHERE_RE =
  /\b(fuel|propane|butane|isobutane|gas canister|firewood|charcoal|lighter fluid)\b/i;

function isConsumable(name, category) {
  const n = String(name || '');
  if (CONSUMABLE_ANYWHERE_RE.test(n)) return true;
  if (category !== CONSUMABLE_CATEGORY) return false;
  return !DURABLE_IN_FOOD_RE.test(n);
}

// ---------- Default weights ----------
//
// Seeded onto AI-generated items so a fresh checklist has a usable total
// instead of a row of zeros. Deliberately conservative mid-range figures for a
// typical three-season item; anyone weighing their own gear will correct them,
// and a plausible starting number is far more useful than an empty field.
//
// Nothing is guessed. An item that matches no rule gets null, and the API
// reports how many such items exist so the UI can say the total is incomplete
// rather than quietly understating it.
// Rules are word lists rather than raw regexes for two reasons.
//
// Plurals: item names are written however the user (or the model) felt like
// writing them, and "Trekking poles" is at least as likely as "Trekking pole".
// A literal \b after the word fails on the trailing s, so every rule is
// compiled with an optional one. That single mistake had "Trekking poles"
// scoring null while "Trekking pole" scored 500.
//
// Order: the FIRST match wins, so narrower phrases must come before the broader
// words they contain. "Stove fuel" contains "stove", and reading it as a stove
// rather than as fuel is wrong in both weight and kind — fuel burns off, a
// stove does not.
const WEIGHT_RULES = [
  // Consumable-ish first: these names embed gear words and must not be read as
  // the gear itself.
  [['fuel', 'gas canister', 'propane', 'butane', 'isobutane'], 380],

  // Shelter
  [['tent'], 2000],
  [['tarp', 'footprint', 'groundsheet'], 450],
  [['sleeping bag', 'quilt'], 1100],
  [['sleeping pad', 'sleep pad', 'air mattress', 'bed roll'], 500],
  [['pillow'], 120],
  [['hammock'], 700],
  [['bivy'], 800],

  // Cooking / water
  [['stove'], 350],
  [['pot', 'pan', 'cookset', 'mess kit', 'kettle'], 400],
  [['water filter', 'filter', 'purifier'], 300],
  [['water bottle', 'bottle', 'canteen', 'flask'], 150],
  [['bladder', 'reservoir', 'hydration'], 200],
  [['mug', 'cup', 'bowl'], 110],
  [['spork', 'utensil', 'cutlery', 'spoon', 'fork'], 25],
  [['cooler'], 3000],

  // Clothing
  [['down jacket', 'puffy', 'insulated jacket'], 400],
  [['rain jacket', 'rain shell', 'shell', 'poncho'], 300],
  [['fleece', 'midlayer', 'mid layer'], 350],
  [['base layer', 'thermal', 'long john'], 220],
  [['boot', 'hiking shoe', 'trail runner'], 900],
  [['sandal', 'camp shoe', 'water shoe'], 350],
  [['sock'], 60],
  [['glove', 'mitten'], 90],
  [['hat', 'beanie', 'cap'], 80],
  [['pants', 'trousers', 'shorts'], 300],
  [['shirt', 'tee', 't-shirt'], 150],
  [['gaiter'], 180],

  // Safety / navigation
  [['first aid', 'med kit', 'medical kit'], 350],
  [['headlamp', 'head torch'], 90],
  [['flashlight', 'torch', 'lantern'], 200],
  [['map'], 50],
  [['compass'], 40],
  [['gps', 'satellite', 'beacon', 'plb', 'inreach'], 200],
  [['whistle'], 10],
  [['bear spray'], 350],
  [['bear canister', 'bear bag'], 1200],
  [['sunscreen'], 120],
  [['insect repellent', 'bug spray'], 110],
  [['microspike', 'crampon'], 500],
  [['helmet'], 350],

  // Tools / misc
  [['trekking pole', 'hiking pole', 'walking pole'], 500],
  [['backpack', 'pack', 'rucksack'], 1600],
  [['knife', 'multi-?tool'], 120],
  [['rope', 'cord', 'paracord'], 300],
  [['duct tape', 'repair kit'], 90],
  [['power bank', 'battery pack', 'charger'], 250],
  [['batteries', 'battery'], 100],
  [['dry bag', 'stuff sack'], 90],
  [['trowel', 'shovel'], 60],
  [['towel'], 150],
  [['sunglasses'], 30],
  [['camera'], 500],
  [['book', 'journal', 'notebook'], 250],
  [['camp chair', 'chair', 'stool'], 900],
  [['axe', 'hatchet', 'saw'], 700],
].map(([words, grams]) => [
  new RegExp(`\\b(?:${words.join('|')})s?\\b`, 'i'),
  grams,
]);

/**
 * Best-guess weight in grams for an item name, or null when nothing matches.
 * Null is a deliberate outcome, not a failure: a wrong weight silently corrupts
 * every total that includes it, while a missing one is visible, reported as
 * `unweighed` by the rollup, and correctable by whoever owns the gear.
 *
 * Food is deliberately absent from the rules. "Trail mix" weighs whatever the
 * trip's length and party size say it weighs, so any fixed number would be
 * wrong for everyone; it is left null on purpose rather than overlooked.
 */
function estimateWeightGrams(name) {
  const n = String(name || '').trim();
  if (!n) return null;
  for (const [re, grams] of WEIGHT_RULES) {
    if (re.test(n)) return grams;
  }
  return null;
}

module.exports = {
  estimateWeightGrams,
  isConsumable,
  CONSUMABLE_CATEGORY,
  DURABLE_IN_FOOD_RE,
  CONSUMABLE_ANYWHERE_RE,
};
