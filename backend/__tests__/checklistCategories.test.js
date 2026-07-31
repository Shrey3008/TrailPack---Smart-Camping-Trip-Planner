// Guards the single checklist vocabulary.
//
// Three places can put an item on a trip: the rule-based generator in
// routes/trips.js, aiService.generateBaseChecklist, and
// aiService.generateGearSuggestions. They must all emit categories from the
// same set — otherwise items land in groups the checklist renders separately
// and the progress counters can never reconcile.
//
// generateGearSuggestions was missing 'Essentials', so no AI gear suggestion
// could ever join that category even though the rule-based generator fills it.
const fs = require('fs');
const path = require('path');
const aiService = require('../services/aiService');

const { CHECKLIST_CATEGORIES } = aiService;

// Scrape the categories the rule-based generator actually hardcodes, so this
// stays honest if someone adds a new one there without updating the constant.
function categoriesUsedByRuleBasedGenerator() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'routes', 'trips.js'), 'utf8');
  const found = [...src.matchAll(/category:\s*'([^']+)'/g)].map(m => m[1]);
  return [...new Set(found)];
}

describe('checklist category vocabulary', () => {
  test('is exported as a non-empty list', () => {
    expect(Array.isArray(CHECKLIST_CATEGORIES)).toBe(true);
    expect(CHECKLIST_CATEGORIES.length).toBeGreaterThan(0);
  });

  test('includes Essentials — the category AI suggestions used to be unable to reach', () => {
    expect(CHECKLIST_CATEGORIES).toContain('Essentials');
  });

  test('covers every category the rule-based generator emits', () => {
    const used = categoriesUsedByRuleBasedGenerator();
    expect(used.length).toBeGreaterThan(0);
    const missing = used.filter(c => !CHECKLIST_CATEGORIES.includes(c));
    expect(missing).toEqual([]);
  });

  test('has no duplicates', () => {
    expect(new Set(CHECKLIST_CATEGORIES).size).toBe(CHECKLIST_CATEGORIES.length);
  });

  test('both AI generators validate against the same set', () => {
    // Both methods build their allowlist from the shared constant, so a
    // literal set in either would drift. Assert the source has no leftover
    // hardcoded category arrays.
    const src = fs.readFileSync(path.join(__dirname, '..', 'services', 'aiService.js'), 'utf8');
    const hardcoded = src.match(/ALLOWED_CATS\s*=\s*new Set\(\s*\[/g) || [];
    expect(hardcoded).toEqual([]);
  });
});
