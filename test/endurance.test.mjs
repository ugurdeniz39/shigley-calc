import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  correctedEnduranceLimit,
  enduranceLimit,
  equivalentDiameterRectangle,
  equivalentDiameterRound,
  loadFactor,
  reliabilityFactor,
  reliabilityFactorFromZ,
  sizeFactor,
  surfaceFactor,
  temperatureFactor,
  uncorrectedEnduranceLimit,
} from '../src/index.mjs';

/** Assert |actual - expected| <= relTol * |expected|. */
function near(actual, expected, relTol, label = '') {
  const err = Math.abs(actual - expected);
  assert.ok(
    err <= relTol * Math.abs(expected),
    `${label} expected ${expected} +/- ${relTol * 100}% but got ${actual}`,
  );
}

test('uncorrected endurance limit Se\' = 0.5 Sut, capped at 700 MPa', () => {
  // Sut = 800 MPa  ->  Se' = 0.5 * 800 = 400 MPa
  assert.equal(uncorrectedEnduranceLimit(800), 400);
  // Sut = 1000 MPa ->  Se' = 500 MPa
  assert.equal(uncorrectedEnduranceLimit(1000), 500);
  // Sut = 1400 MPa (boundary): 0.5 * 1400 = 700 MPa, same as the cap
  assert.equal(uncorrectedEnduranceLimit(1400), 700);
  // Sut = 1600 MPa: 0.5 * 1600 = 800 would exceed the cap -> 700 MPa
  assert.equal(uncorrectedEnduranceLimit(1600), 700);
});

test('surface factor ka = a * Sut^b for every finish', () => {
  // Tolerance 1e-4 (relative); expected values are hand-evaluated below.
  // machined, Sut = 800:  ln(800) = 6.68461
  //   b ln(Sut) = -0.265 * 6.68461 = -1.77142;  e^-1.77142 = 0.170091
  //   ka = 4.51 * 0.170091 = 0.76711
  near(surfaceFactor('machined', 800), 0.76711, 1e-4, 'machined');
  // ground, Sut = 500:  ln(500) = 6.21461;  -0.085 * 6.21461 = -0.52824
  //   e^-0.52824 = 0.589641;  ka = 1.58 * 0.589641 = 0.93163
  near(surfaceFactor('ground', 500), 0.93163, 1e-4, 'ground');
  // hot-rolled, Sut = 400:  ln(400) = 5.99146;  -0.718 * 5.99146 = -4.30187
  //   e^-4.30187 = 0.0135432;  ka = 57.7 * 0.0135432 = 0.78144
  near(surfaceFactor('hot-rolled', 400), 0.78144, 1e-4, 'hot-rolled');
  // as-forged, Sut = 600:  ln(600) = 6.39693;  -0.995 * 6.39693 = -6.36495
  //   e^-6.36495 = 0.0017209;  ka = 272 * 0.0017209 = 0.46807
  near(surfaceFactor('as-forged', 600), 0.46807, 1e-4, 'as-forged');
});

test('surface finish names: cold-drawn = machined, case/space/underscore tolerant', () => {
  assert.equal(surfaceFactor('cold-drawn', 800), surfaceFactor('machined', 800));
  assert.equal(surfaceFactor('Hot Rolled', 400), surfaceFactor('hot-rolled', 400));
  assert.equal(surfaceFactor('AS_FORGED', 600), surfaceFactor('as-forged', 600));
});

test('size factor: both branches and continuity at 51 mm', () => {
  // d = 30 mm: (30/7.62)^-0.107;  30/7.62 = 3.93701;  ln = 1.37042
  //   -0.107 * 1.37042 = -0.146635;  e^-0.146635 = 0.86361
  near(sizeFactor(30), 0.86361, 1e-4, 'd=30');
  // d = 80 mm: 1.51 * 80^-0.157;  ln(80) = 4.38203;  -0.157 * 4.38203 = -0.68798
  //   e^-0.68798 = 0.50259;  kb = 1.51 * 0.50259 = 0.75891
  near(sizeFactor(80), 0.75891, 1e-4, 'd=80');
  // Branches meet at 51 mm: 0.81594 (lower) vs 0.81450 (upper), a 0.18 % step.
  near(sizeFactor(51), 0.81594, 1e-4, 'd=51 (lower branch)');
  near(sizeFactor(51.0001), 0.81450, 1e-3, 'd=51+ (upper branch)');
  // Range limits are inclusive
  near(sizeFactor(2.79), (2.79 / 7.62) ** -0.107, 1e-12, 'd=2.79');
  near(sizeFactor(254), 1.51 * 254 ** -0.157, 1e-12, 'd=254');
});

test('equivalent diameters', () => {
  // rotating round: de = d
  assert.equal(equivalentDiameterRound(40), 40);
  // non-rotating round: de = 0.370 * 40 = 14.8 mm
  near(equivalentDiameterRound(40, false), 14.8, 1e-12);
  // rectangle 30 x 12: de = 0.808 * sqrt(360) = 0.808 * 18.97367 = 15.33072 mm
  near(equivalentDiameterRectangle(30, 12), 15.33072, 1e-6);
  // symmetric in h and b
  assert.equal(equivalentDiameterRectangle(12, 30), equivalentDiameterRectangle(30, 12));
});

test('load factor kc', () => {
  assert.equal(loadFactor('bending'), 1);
  assert.equal(loadFactor('axial'), 0.85);
  assert.equal(loadFactor('torsion'), 0.59);
});

test('temperature factor: table points, interpolation, room temperature', () => {
  assert.equal(temperatureFactor(), 1); // omitted = room temperature
  assert.equal(temperatureFactor(20), 1);
  assert.equal(temperatureFactor(100), 1.02); // table row
  assert.equal(temperatureFactor(600), 0.549); // last table row
  // 75 degC lies midway between 50 (1.010) and 100 (1.020): 1.015
  near(temperatureFactor(75), 1.015, 1e-12);
  // 325 degC midway between 300 (0.975) and 350 (0.943): 0.975 - 0.016 = 0.959
  near(temperatureFactor(325), 0.959, 1e-12);
});

test('reliability factor: table and normal-deviate formula', () => {
  assert.equal(reliabilityFactor(0.5), 1);
  assert.equal(reliabilityFactor(0.9), 0.897);
  assert.equal(reliabilityFactor(0.99), 0.814);
  assert.equal(reliabilityFactor(0.999999), 0.62);
  // za = 2.326 (99 %):  ke = 1 - 0.08 * 2.326 = 1 - 0.18608 = 0.81392
  near(reliabilityFactorFromZ(2.326), 0.81392, 1e-12);
  assert.equal(reliabilityFactorFromZ(0), 1);
});

test('corrected endurance limit is the plain product of the factors', () => {
  // Se' = 350, ka = 0.8, kb = 0.9, kc = 1, kd = 1.02, ke = 0.868, kMisc = 0.95
  //   0.8 * 0.9 = 0.72;  * 1.02 = 0.7344;  * 0.868 = 0.6374592
  //   * 0.95 = 0.60558624;  * 350 = 211.955184 MPa
  near(
    correctedEnduranceLimit(350, { ka: 0.8, kb: 0.9, kc: 1, kd: 1.02, ke: 0.868, kMisc: 0.95 }),
    211.955184,
    1e-9,
  );
  // all factors default to 1
  assert.equal(correctedEnduranceLimit(123), 123);
});

test('enduranceLimit: machined steel in bending, 95 % reliability', () => {
  // Sut = 700 MPa, machined, d = 25 mm (rotating), bending, R = 0.95
  //   Se' = 350;  ka = 4.51 * 700^-0.265 = 0.79474;  kb = (25/7.62)^-0.107 = 0.88062
  //   kc = kd = 1;  ke = 0.868
  //   Se = 350 * 0.79474 * 0.88062 * 0.868 = 212.62 MPa
  const r = enduranceLimit({ Sut: 700, finish: 'machined', d: 25, reliability: 0.95 });
  near(r.SePrime, 350, 1e-12, 'Se\'');
  near(r.ka, 0.79474, 1e-4, 'ka');
  near(r.kb, 0.88062, 1e-4, 'kb');
  assert.equal(r.kc, 1);
  assert.equal(r.kd, 1);
  assert.equal(r.ke, 0.868);
  assert.equal(r.de, 25);
  near(r.Se, 212.62, 1e-4, 'Se');
});

test('enduranceLimit: torsion, elevated temperature, misc. factor', () => {
  // Sut = 900, ground, d = 12 mm, torsion, R = 0.99, 200 degC, kMisc = 0.9
  //   Se' = 450;  ka = 1.58 * 900^-0.085 = 0.88623;  kb = (12/7.62)^-0.107 = 0.95257
  //   kc = 0.59;  kd = 1.020 (table, 200 degC);  ke = 0.814;  kMisc = 0.9
  //   Se = 450 * 0.88623 * 0.95257 * 0.59 * 1.02 * 0.814 * 0.9 = 167.48 MPa
  const r = enduranceLimit({
    Sut: 900, finish: 'ground', d: 12, load: 'torsion', tempC: 200, reliability: 0.99, kMisc: 0.9,
  });
  near(r.Se, 167.48, 1e-4, 'Se');
  assert.equal(r.kc, 0.59);
  assert.equal(r.kd, 1.02);
});

test('enduranceLimit: axial load ignores size (kb = 1, no diameter needed)', () => {
  // Sut = 500, hot-rolled, axial, R = 0.9
  //   Se' = 250;  ka = 57.7 * 500^-0.718 = 0.66576;  kb = 1;  kc = 0.85;  ke = 0.897
  //   Se = 250 * 0.66576 * 1 * 0.85 * 0.897 = 126.90 MPa
  const r = enduranceLimit({ Sut: 500, finish: 'hot-rolled', load: 'axial', reliability: 0.9 });
  assert.equal(r.kb, 1);
  assert.equal(r.de, null);
  near(r.Se, 126.90, 1e-4, 'Se');
});

test('enduranceLimit: high-strength steel uses the 700 MPa cap', () => {
  // Sut = 1600, ground, d = 20 mm, R = 0.999
  //   Se' = 700 (cap);  ka = 1.58 * 1600^-0.085 = 0.84393;  kb = (20/7.62)^-0.107 = 0.90190
  //   ke = 0.753;  Se = 700 * 0.84393 * 0.90190 * 0.753 = 401.20 MPa
  const r = enduranceLimit({ Sut: 1600, finish: 'ground', d: 20, reliability: 0.999 });
  assert.equal(r.SePrime, 700);
  near(r.Se, 401.2, 1e-4, 'Se');
});

test('enduranceLimit: effective diameter from a rectangle, and non-rotating round', () => {
  // rectangle 30 x 12 -> de = 15.33072;  kb = (15.33072/7.62)^-0.107 = 2.01191^-0.107 = 0.92793
  const rect = enduranceLimit({
    Sut: 600, finish: 'machined', de: equivalentDiameterRectangle(30, 12),
  });
  near(rect.kb, 0.92793, 1e-4, 'kb rectangle');
  // non-rotating round d = 40 -> de = 14.8 mm
  const stationary = enduranceLimit({ Sut: 600, finish: 'machined', d: 40, rotating: false });
  near(stationary.de, 14.8, 1e-12);
});

test('invariant: Se falls as the required reliability rises', () => {
  const se = [0.5, 0.9, 0.95, 0.99, 0.999, 0.9999, 0.99999, 0.999999].map(
    (reliability) => enduranceLimit({ Sut: 650, finish: 'machined', d: 30, reliability }).Se,
  );
  for (let i = 1; i < se.length; i += 1) assert.ok(se[i] < se[i - 1]);
});

test('invalid input throws RangeError with a clear message', () => {
  const range = (message) => ({ name: 'RangeError', message });
  assert.throws(() => uncorrectedEnduranceLimit(-5), range(/Sut must be greater than 0/));
  assert.throws(() => uncorrectedEnduranceLimit(Number.NaN), range(/Sut must be a finite number/));
  assert.throws(() => uncorrectedEnduranceLimit('600'), range(/Sut must be a finite number/));
  assert.throws(() => surfaceFactor('polished', 600), range(/Unknown surface finish "polished".*ground/));
  assert.throws(() => surfaceFactor('ground', 0), range(/Sut/));
  assert.throws(() => sizeFactor(2), range(/2\.79 mm <= de <= 254 mm/));
  assert.throws(() => sizeFactor(300), range(/254/));
  assert.throws(() => sizeFactor(-1), range(/de must be greater than 0/));
  assert.throws(() => equivalentDiameterRectangle(0, 10), range(/h must be greater than 0/));
  assert.throws(() => loadFactor('shear'), range(/Unknown load type "shear"/));
  assert.throws(() => temperatureFactor(19), range(/20-600 degC/));
  assert.throws(() => temperatureFactor(650), range(/20-600 degC/));
  assert.throws(() => reliabilityFactor(0.97), range(/not tabulated/));
  assert.throws(() => reliabilityFactorFromZ(-1), range(/za/));
  assert.throws(() => correctedEnduranceLimit(300, { kb: 0 }), range(/kb must be greater than 0/));
  assert.throws(
    () => enduranceLimit({ Sut: 600, finish: 'ground' }),
    range(/diameter is required/),
  );
  assert.throws(
    () => enduranceLimit({ Sut: 600, finish: 'ground', d: 20, de: 20 }),
    range(/either d or de/),
  );
  assert.throws(
    () => enduranceLimit({ Sut: 600, finish: 'ground', d: 20, load: 'impact' }),
    range(/Unknown load type/),
  );
  assert.throws(
    () => enduranceLimit({ Sut: 600, finish: 'ground', d: 20, reliability: 0.97 }),
    range(/not tabulated/),
  );
});
