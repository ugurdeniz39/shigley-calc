import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  asmeEllipticFactor,
  fatigueConcentrationFactor,
  fluctuatingSafetyFactors,
  gerberFactor,
  goodmanFactor,
  langerFactor,
  soderbergFactor,
  stressComponents,
  vonMisesComponents,
} from '../src/index.mjs';

/** Assert |actual - expected| <= relTol * |expected|. */
function near(actual, expected, relTol, label = '') {
  const err = Math.abs(actual - expected);
  assert.ok(
    err <= relTol * Math.abs(expected),
    `${label} expected ${expected} +/- ${relTol * 100}% but got ${actual}`,
  );
}

// Shared operating point: sigmaA = 80, sigmaM = 60, Se = 200, Sut = 600, Sy = 450 (all MPa)
const p = { sigmaA: 80, sigmaM: 60, Se: 200, Sut: 600, Sy: 450 };

test('Goodman: 1/n = sa/Se + sm/Sut', () => {
  // 80/200 + 60/600 = 0.4 + 0.1 = 0.5  ->  n = 2 (tolerance 1e-12)
  near(goodmanFactor(p), 2, 1e-12);
});

test('Soderberg: 1/n = sa/Se + sm/Sy', () => {
  // 0.4 + 60/450 = 0.4 + 0.133333 = 0.533333  ->  n = 1.875
  near(soderbergFactor(p), 1.875, 1e-12);
});

test('Gerber: n sa/Se + (n sm/Sut)^2 = 1', () => {
  // textbook form: n = 1/2 (Sut/sm)^2 (sa/Se) [ -1 + sqrt(1 + (2 sm Se/(Sut sa))^2) ]
  //   (Sut/sm)^2 = 100;  sa/Se = 0.4;  2*60*200/(600*80) = 0.5;  sqrt(1.25) = 1.118034
  //   n = 0.5 * 100 * 0.4 * (1.118034 - 1) = 20 * 0.118034 = 2.36068
  near(gerberFactor(p), 2.36068, 1e-5);
  // substitution check: 2.36068*0.4 + (2.36068*0.1)^2 = 0.944272 + 0.055728 = 1.000000
});

test('ASME-elliptic: (n sa/Se)^2 + (n sm/Sy)^2 = 1', () => {
  // 1/n^2 = 0.4^2 + (60/450)^2 = 0.16 + 0.017778 = 0.177778  ->  n = 2.37171
  near(asmeEllipticFactor(p), 2.37171, 1e-5);
});

test('Langer first-cycle yield: n = Sy/(sa + sm)', () => {
  // 450 / (80 + 60) = 3.214286
  near(langerFactor(p), 3.214286, 1e-6);
});

test('fluctuatingSafetyFactors bundles all five criteria', () => {
  const all = fluctuatingSafetyFactors(p);
  near(all.goodman, 2, 1e-12);
  near(all.soderberg, 1.875, 1e-12);
  near(all.gerber, 2.36068, 1e-5);
  near(all.asmeElliptic, 2.37171, 1e-5);
  near(all.langer, 3.214286, 1e-6);
});

test('invariant: Soderberg <= Goodman <= Gerber for any first-quadrant stress state', () => {
  for (const sigmaA of [10, 50, 120]) {
    for (const sigmaM of [5, 40, 150]) {
      const s = { sigmaA, sigmaM, Se: 200, Sut: 600, Sy: 450 };
      const sod = soderbergFactor(s);
      const good = goodmanFactor(s);
      const ger = gerberFactor(s);
      assert.ok(sod <= good + 1e-12, `Soderberg>Goodman at ${sigmaA}/${sigmaM}`);
      assert.ok(good <= ger + 1e-12, `Goodman>Gerber at ${sigmaA}/${sigmaM}`);
    }
  }
});

test('limits: fully reversed, purely static, unloaded', () => {
  // sm = 0: every endurance criterion reduces to n = Se/sa = 200/50 = 4
  const reversed = { sigmaA: 50, sigmaM: 0, Se: 200, Sut: 600, Sy: 450 };
  near(goodmanFactor(reversed), 4, 1e-12);
  near(soderbergFactor(reversed), 4, 1e-12);
  near(gerberFactor(reversed), 4, 1e-12);
  near(asmeEllipticFactor(reversed), 4, 1e-12);
  // Gerber approaches Se/sa continuously as sm -> 0 (sm = 1e-6 here)
  near(gerberFactor({ ...reversed, sigmaM: 1e-6 }), 4, 1e-9);
  // sa = 0: Goodman and Gerber give Sut/sm = 600/150 = 4; Soderberg and ASME give Sy/sm = 3
  const steady = { sigmaA: 0, sigmaM: 150, Se: 200, Sut: 600, Sy: 450 };
  near(goodmanFactor(steady), 4, 1e-12);
  near(gerberFactor(steady), 4, 1e-12);
  near(soderbergFactor(steady), 3, 1e-12);
  near(asmeEllipticFactor(steady), 3, 1e-12);
  // nothing applied: infinite factor of safety
  const none = { sigmaA: 0, sigmaM: 0, Se: 200, Sut: 600, Sy: 450 };
  for (const fn of [goodmanFactor, soderbergFactor, gerberFactor, asmeEllipticFactor, langerFactor]) {
    assert.equal(fn(none), Infinity);
  }
});

test('stressComponents from a stress cycle', () => {
  // sigmaMax = 150, sigmaMin = -30:  sa = |150 - (-30)|/2 = 90;  sm = (150 + (-30))/2 = 60
  assert.deepEqual(stressComponents(150, -30), { sigmaA: 90, sigmaM: 60 });
  // released cycle 0 -> 100: sa = sm = 50
  assert.deepEqual(stressComponents(100, 0), { sigmaA: 50, sigmaM: 50 });
  // order of the arguments does not change the amplitude
  assert.equal(stressComponents(-30, 150).sigmaA, 90);
});

test('fatigue concentration factor Kf = 1 + q (Kt - 1)', () => {
  // Kt = 2.0, q = 0.8:  1 + 0.8 * 1.0 = 1.8
  near(fatigueConcentrationFactor(2.0, 0.8), 1.8, 1e-12);
  // q = 0 -> no sensitivity -> 1;  q = 1 -> full Kt
  assert.equal(fatigueConcentrationFactor(2.5, 0), 1);
  assert.equal(fatigueConcentrationFactor(2.5, 1), 2.5);
});

test('von Mises alternating and mean components', () => {
  // Kf = 1.5, Kfs = 1.3, sigmaA = 100, tauA = 20, sigmaM = 0, tauM = 40
  //   sigmaA' = sqrt((1.5*100)^2 + 3*(1.3*20)^2) = sqrt(22500 + 2028) = sqrt(24528) = 156.614
  //   sigmaM' = sqrt(0 + 3*(1.3*40)^2) = sqrt(3) * 52 = 90.0666
  const r = vonMisesComponents({
    sigmaA: 100, tauA: 20, sigmaM: 0, tauM: 40, Kf: 1.5, Kfs: 1.3,
  });
  near(r.sigmaAPrime, 156.614, 1e-5);
  near(r.sigmaMPrime, 90.0666, 1e-5);
  // defaults: pure bending reproduces the nominal stress
  assert.deepEqual(vonMisesComponents({ sigmaA: 70 }), { sigmaAPrime: 70, sigmaMPrime: 0 });
});

test('invalid input throws RangeError with a clear message', () => {
  const range = (message) => ({ name: 'RangeError', message });
  assert.throws(() => goodmanFactor({ ...p, sigmaA: -1 }), range(/sigmaA must not be negative/));
  assert.throws(
    () => goodmanFactor({ ...p, sigmaM: -10 }),
    range(/sigmaM must not be negative.*compressive mean stress/),
  );
  assert.throws(() => gerberFactor({ ...p, sigmaM: Number.NaN }), range(/sigmaM must be a finite number/));
  assert.throws(() => goodmanFactor({ ...p, Se: 0 }), range(/Se must be greater than 0/));
  assert.throws(() => goodmanFactor({ ...p, Sut: -600 }), range(/Sut must be greater than 0/));
  assert.throws(() => soderbergFactor({ ...p, Sy: 0 }), range(/Sy must be greater than 0/));
  assert.throws(() => langerFactor({ ...p, Sy: Infinity }), range(/Sy must be a finite number/));
  assert.throws(() => fluctuatingSafetyFactors({ ...p, Sy: undefined }), range(/Sy/));
  assert.throws(() => fatigueConcentrationFactor(0.9, 0.5), range(/Kt must be at least 1/));
  assert.throws(() => fatigueConcentrationFactor(2, 1.2), range(/q must satisfy 0 <= q <= 1/));
  assert.throws(() => vonMisesComponents({ Kf: 0.8 }), range(/Kf must be at least 1/));
  assert.throws(() => vonMisesComponents({ tauA: -3 }), range(/tauA must not be negative/));
  assert.throws(() => stressComponents(Number.NaN, 0), range(/sigmaMax/));
});
