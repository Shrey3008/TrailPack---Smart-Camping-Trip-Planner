// Unit tests for the provisions (water + food) estimator.
const { estimateProvisions } = require('../services/provisionsService');

describe('estimateProvisions', () => {
  test('returns sane defaults for a minimal input', () => {
    const p = estimateProvisions({ duration: 1 });
    expect(p.inputs.duration).toBe(1);
    expect(p.inputs.participants).toBe(1);
    expect(p.water.totalLiters).toBeGreaterThan(0);
    expect(p.food.totalCalories).toBeGreaterThan(0);
    expect(p.food.totalGrams).toBeGreaterThan(0);
    expect(typeof p.disclaimer).toBe('string');
  });

  test('clamps invalid duration/participants to minimum of 1', () => {
    const p = estimateProvisions({ duration: 0, participants: -3 });
    expect(p.inputs.duration).toBe(1);
    expect(p.inputs.participants).toBe(1);
  });

  test('scales linearly with duration', () => {
    const a = estimateProvisions({ duration: 1, terrain: 'Forest', season: 'Spring' });
    const b = estimateProvisions({ duration: 3, terrain: 'Forest', season: 'Spring' });
    expect(b.water.totalLiters).toBeCloseTo(a.water.totalLiters * 3, 1);
    expect(b.food.totalCalories).toBe(a.food.totalCalories * 3);
  });

  test('scales linearly with participants', () => {
    const solo = estimateProvisions({ duration: 2, participants: 1, terrain: 'Forest', season: 'Spring' });
    const group = estimateProvisions({ duration: 2, participants: 4, terrain: 'Forest', season: 'Spring' });
    expect(group.water.totalLiters).toBeCloseTo(solo.water.totalLiters * 4, 1);
    expect(group.food.totalCalories).toBe(solo.food.totalCalories * 4);
  });

  test('desert terrain roughly doubles water vs forest', () => {
    const forest = estimateProvisions({ duration: 3, terrain: 'Forest', season: 'Spring' });
    const desert = estimateProvisions({ duration: 3, terrain: 'Desert', season: 'Spring' });
    expect(desert.water.totalLiters).toBeGreaterThan(forest.water.totalLiters * 1.8);
  });

  test('mountain terrain increases calories over forest', () => {
    const forest = estimateProvisions({ duration: 2, terrain: 'Forest', season: 'Fall' });
    const mountain = estimateProvisions({ duration: 2, terrain: 'Mountain', season: 'Fall' });
    expect(mountain.food.caloriesPerPersonPerDay).toBeGreaterThan(forest.food.caloriesPerPersonPerDay);
  });

  test('winter adds calorie delta; summer adds water delta', () => {
    const base = estimateProvisions({ duration: 2, terrain: 'Forest', season: 'Spring' });
    const winter = estimateProvisions({ duration: 2, terrain: 'Forest', season: 'Winter' });
    const summer = estimateProvisions({ duration: 2, terrain: 'Forest', season: 'Summer' });
    expect(winter.food.caloriesPerPersonPerDay).toBeGreaterThan(base.food.caloriesPerPersonPerDay);
    expect(summer.water.perPersonPerDay).toBeGreaterThan(base.water.perPersonPerDay);
  });

  test('includes relevant reasoning chips', () => {
    const p = estimateProvisions({ duration: 6, terrain: 'Desert', season: 'Summer', participants: 3 });
    const texts = p.reasons.map(r => r.text);
    expect(texts.some(t => /Desert/i.test(t))).toBe(true);
    expect(texts.some(t => /Summer/i.test(t))).toBe(true);
    expect(texts.some(t => /Group of 3/i.test(t))).toBe(true);
    expect(texts.some(t => /6-day/i.test(t))).toBe(true);
  });

  test('never returns negative water per person per day', () => {
    // Stress case: winter forest with zero-ish duration
    const p = estimateProvisions({ duration: 1, terrain: 'Forest', season: 'Winter' });
    expect(p.water.perPersonPerDay).toBeGreaterThanOrEqual(0.5);
  });
});
