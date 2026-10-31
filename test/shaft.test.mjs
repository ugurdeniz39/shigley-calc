import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  deAsmeEllipticDiameter,
  deGerberDiameter,
  deGoodmanDiameter,
  deSoderbergDiameter,
  enduranceLimit,
  roundShaftStresses,
  shaftFatigueSafetyFactor,
  staticShaftDiameter,
  staticShaftSafetyFactor,
} from '../src/index.mjs';

/** Assert |actual - expected| <= relTol * |expected|. */
function near(actual, expected, relTol, label = '') {
  const err = Math.abs(actual - expected);
  assert.ok(
    err <= relTol * Math.abs(expected),
    `${label} expected ${expected} +/- ${relTol * 100}% but got ${actual}`,
  );
}

test('nominal stresses of a solid round section', () => {
  // M = 100 000 N*mm, T = 50 000 N*mm, d = 20 mm;  d^3 = 8000 mm^3;  pi*d^3 = 25132.74
  //   sigma = 32*100000/25132.74 = 127.324 MPa;  tau = 16*50000/25132.74 = 31.831 MPa
  const r = roundShaftStresses({ M: 100000, T: 50000, d: 20 });
  near(r.sigma, 127.324, 1e-5);
  near(r.tau, 31.831, 1e-5);
});

test('static DE diameter: bending + torsion', () => {
  // M = 100 000 N*mm, T = 200 000 N*mm, Sy = 350 MPa, n = 2.5
  //   sqrt(4 M^2 + 3 T^2) = sqrt(4e10 + 1.2e11) = sqrt(1.6e11) = 400 000 N*mm
  //   16 n / (pi Sy) = 40 / 1099.557 = 0.0363783
  //   d^3 = 0.0363783 * 400 000 = 14 551.3 mm^3;  d = 24.4137 mm   (tolerance 1e-5)
  const r = staticShaftDiameter({ M: 100000, T: 200000, Sy: 350, n: 2.5 });
  near(r.combined, 400000, 1e-12, 'combined');
  near(r.d3, 14551.3, 1e-5, 'd^3');
  near(r.d, 24.4137, 1e-5, 'd');
});

test('static DE diameter: pure torsion reduces to sqrt(3) T', () => {
  // T = 100 000 N*mm, Sy = 300 MPa, n = 2:  sqrt(3) T = 173 205.1 N*mm
  //   16*2/(pi*300) = 0.0339531;  d^3 = 5880.8 mm^3;  d = 18.0501 mm
  const r = staticShaftDiameter({ T: 100000, Sy: 300, n: 2 });
  near(r.combined, 173205.1, 1e-6);
  near(r.d, 18.0501, 1e-5);
});

test('static factor of safety of a given diameter', () => {
  // same loads and material as above, d = 25 mm: 16/(pi*25^3) = 3.259493e-4
  //   sigma' = 3.259493e-4 * 400 000 = 130.380 MPa;  n = 350/130.380 = 2.68447
  const r = staticShaftSafetyFactor({ M: 100000, T: 200000, d: 25, Sy: 350 });
  near(r.sigmaPrime, 130.380, 1e-5, 'sigma\'');
  near(r.n, 2.68447, 1e-5, 'n');
  // unloaded shaft: infinite factor of safety
  assert.equal(staticShaftSafetyFactor({ d: 10, Sy: 300 }).n, Infinity);
});

test('round trip: the static diameter returns the design factor', () => {
  for (const [M, T, Sy, n] of [[8e4, 0, 300, 1.5], [0, 5e4, 420, 3], [2e5, 1.5e5, 275, 2.2]]) {
    const { d } = staticShaftDiameter({ M, T, Sy, n });
    near(staticShaftSafetyFactor({ M, T, d, Sy }).n, n, 1e-12);
  }
});

// Fatigue operating point shared by the next tests (N*mm and MPa):
//   Ma = 100 000, Mm = 0, Ta = 0, Tm = 60 000, Kf = 1.6, Kfs = 1.4
//   Se = 150, Sut = 500, Sy = 380, target n = 2
//   A = sqrt(4 (1.6*100000)^2) = 320 000;   B = sqrt(3) * 1.4 * 60 000 = 145 492.27
//   A/Se = 2133.333;  B/Sut = 290.985;  B/Sy = 382.875
const fat = {
  Ma: 100000, Mm: 0, Ta: 0, Tm: 60000, Kf: 1.6, Kfs: 1.4, n: 2, Se: 150, Sut: 500, Sy: 380,
};

test('DE-Goodman diameter', () => {
  // d^3 = (16 n / pi)(A/Se + B/Sut) = 10.18592 * (2133.333 + 290.985) = 24 693.9 mm^3
  //   d = 29.1203 mm
  const r = deGoodmanDiameter(fat);
  near(r.A, 320000, 1e-12, 'A');
  near(r.B, 145492.27, 1e-7, 'B');
  near(r.d, 29.1203, 1e-5, 'd');
  assert.equal(r.iterations, 0);
});

test('DE-Soderberg diameter', () => {
  // d^3 = 10.18592 * (2133.333 + 382.875) = 25 629.9 mm^3;  d = 29.4837 mm
  near(deSoderbergDiameter(fat).d, 29.4837, 1e-5);
});

test('DE-Gerber diameter', () => {
  // a = A/Se = 2133.333, b = B/Sut = 290.985
  //   K = 0.5 (a + sqrt(a^2 + 4 b^2)) = 0.5 (2133.333 + sqrt(4 551 111 + 338 668)) = 2172.31
  //   d^3 = 10.18592 * 2172.31 = 22 127 mm^3;  d = 28.0742 mm
  near(deGerberDiameter(fat).d, 28.0742, 1e-5);
});

test('DE-ASME-elliptic diameter', () => {
  // K = sqrt(2133.333^2 + 382.875^2) = 2167.42;  d^3 = 10.18592 * 2167.42 = 22 076 mm^3
  //   d = 28.0531 mm
  near(deAsmeEllipticDiameter(fat).d, 28.0531, 1e-5);
});

test('fatigue factors of safety at a given diameter (d = 30 mm)', () => {
  // 16/(pi d^3) = 1.886281e-4;  sigmaA' = 1.886281e-4 * 320 000 = 60.361 MPa
  //   sigmaM' = 1.886281e-4 * 145 492.27 = 27.444 MPa
  //   Goodman   1/n = 60.361/150 + 27.444/500 = 0.402407 + 0.054888 -> n = 2.18677
  //   Soderberg 1/n = 0.402407 + 27.444/380 = 0.474625           -> n = 2.10692
  //   Gerber                                                      -> n = 2.44046
  //   ASME      1/n^2 = 0.402407^2 + 0.072221^2 = 0.167151        -> n = 2.44597
  //   Langer    n = 380 / (60.361 + 27.444) = 4.32778
  //   first-cycle yield (max load): sigmaMax' = 66.307 MPa -> n = 380/66.307 = 5.73092
  const r = shaftFatigueSafetyFactor({
    Ma: fat.Ma, Mm: fat.Mm, Ta: fat.Ta, Tm: fat.Tm, Kf: fat.Kf, Kfs: fat.Kfs,
    d: 30, Se: fat.Se, Sut: fat.Sut, Sy: fat.Sy,
  });
  near(r.sigmaAPrime, 60.361, 1e-4, 'sigmaA\'');
  near(r.sigmaMPrime, 27.444, 1e-4, 'sigmaM\'');
  near(r.sigmaMaxPrime, 66.307, 1e-4, 'sigmaMax\'');
  near(r.n.goodman, 2.18677, 1e-5, 'Goodman');
  near(r.n.soderberg, 2.10692, 1e-5, 'Soderberg');
  near(r.n.gerber, 2.44046, 1e-5, 'Gerber');
  near(r.n.asmeElliptic, 2.44597, 1e-5, 'ASME-elliptic');
  near(r.n.langer, 4.32778, 1e-5, 'Langer');
  near(r.n.yield, 5.73092, 1e-5, 'first-cycle yield');
});

test('round trip: each criterion\'s diameter returns the design factor', () => {
  const pairs = [
    [deGoodmanDiameter, 'goodman'],
    [deSoderbergDiameter, 'soderberg'],
    [deGerberDiameter, 'gerber'],
    [deAsmeEllipticDiameter, 'asmeElliptic'],
  ];
  const cases = [
    fat,
    { ...fat, Mm: 40000, Ta: 25000, Tm: 0, n: 1.5 },
    { Ma: 0, Mm: 0, Ta: 30000, Tm: 90000, Kf: 1, Kfs: 2.1, n: 3, Se: 210, Sut: 700, Sy: 520 },
  ];
  for (const c of cases) {
    for (const [diameterFn, key] of pairs) {
      const { d } = diameterFn(c);
      const back = shaftFatigueSafetyFactor({ ...c, d });
      near(back.n[key], c.n, 1e-9, `${key} n at its own d`);
    }
  }
});

test('invariant: diameters order Soderberg >= Goodman >= Gerber', () => {
  const g = deGoodmanDiameter(fat).d;
  assert.ok(deSoderbergDiameter(fat).d >= g);
  assert.ok(g >= deGerberDiameter(fat).d);
});

test('DE-Gerber diameter stays finite with no alternating load (A = 0)', () => {
  // Mm = 0, Tm = 60 000 only: A = 0, B = 145 492.27;  K = 0.5 (0 + 2 b) = b = B/Sut = 290.985
  //   d^3 = (16*2/pi) * 290.985 = 2964.0;  d = 14.36 mm
  const r = deGerberDiameter({ ...fat, Ma: 0 });
  near(r.d, 14.36, 1e-3);
  assert.ok(Number.isFinite(r.d));
});

test('Se that depends on the diameter is solved by iteration', () => {
  // Se(d) = 200 (30/d)^0.1 MPa, Goodman, same loads and Sut = 500 (hand fixed-point iteration):
  //   d0 = 25 -> Se = 203.7 -> d1 = 26.6 -> ... converges to d = 26.7185 mm, Se = 202.330 MPa
  const r = deGoodmanDiameter({ ...fat, Se: (d) => 200 * (30 / d) ** 0.1 });
  near(r.d, 26.7185, 1e-6, 'd');
  near(r.Se, 202.33, 1e-5, 'Se');
  assert.ok(r.iterations > 1 && r.iterations < 30);
});

test('Se(d) built from the Marin factors converges and is self-consistent', () => {
  const Sut = 690;
  const SeOf = (d) => enduranceLimit({ Sut, finish: 'machined', d, reliability: 0.99 }).Se;
  const r = deGoodmanDiameter({
    Ma: 280000, Tm: 340000, Kf: 1.7, Kfs: 1.5, n: 2, Se: SeOf, Sut,
  });
  // the converged Se is the Marin Se at the converged d
  near(r.Se, SeOf(r.d), 1e-9, 'Se(d)');
  // size sanity: roughly 40 mm for these loads
  assert.ok(r.d > 39 && r.d < 41);
});

test('a non-converging Se(d) is reported, not looped forever', () => {
  let calls = 0;
  const flipping = () => (calls++ % 2 === 0 ? 100 : 400);
  assert.throws(() => deGoodmanDiameter({ ...fat, Se: flipping }), /did not converge/);
});

test('invalid input throws RangeError with a clear message', () => {
  const range = (message) => ({ name: 'RangeError', message });
  assert.throws(() => staticShaftDiameter({ M: -1, T: 5, Sy: 300, n: 2 }), range(/M must not be negative/));
  assert.throws(() => staticShaftDiameter({ M: 1, T: 5, Sy: 0, n: 2 }), range(/Sy must be greater than 0/));
  assert.throws(() => staticShaftDiameter({ M: 1, T: 5, Sy: 300, n: 0 }), range(/n must be greater than 0/));
  assert.throws(() => staticShaftDiameter({ Sy: 300, n: 2 }), range(/At least one of M and T/));
  assert.throws(() => staticShaftSafetyFactor({ M: 1, T: 1, d: 0, Sy: 300 }), range(/d must be greater than 0/));
  assert.throws(() => roundShaftStresses({ M: 1, T: -1, d: 10 }), range(/T must not be negative/));
  assert.throws(() => deGoodmanDiameter({ ...fat, Kf: 0.9 }), range(/Kf must be at least 1/));
  assert.throws(() => deGoodmanDiameter({ ...fat, Kfs: 0.5 }), range(/Kfs must be at least 1/));
  assert.throws(() => deGoodmanDiameter({ ...fat, Ma: -5 }), range(/Ma must not be negative/));
  assert.throws(() => deGoodmanDiameter({ ...fat, Se: -10 }), range(/Se must be greater than 0/));
  assert.throws(() => deGoodmanDiameter({ ...fat, Se: '150' }), range(/Se must be a number/));
  assert.throws(() => deGoodmanDiameter({ ...fat, Sut: undefined }), range(/Sut/));
  assert.throws(() => deAsmeEllipticDiameter({ ...fat, Sy: undefined }), range(/Sy/));
  assert.throws(() => deGoodmanDiameter({ ...fat, n: -2 }), range(/n must be greater than 0/));
  assert.throws(
    () => deGoodmanDiameter({ ...fat, Ma: 0, Mm: 0, Ta: 0, Tm: 0 }),
    range(/At least one of Ma, Mm, Ta, Tm/),
  );
  assert.throws(
    () => deGoodmanDiameter({ ...fat, Se: () => -1 }),
    range(/Se must be greater than 0/),
  );
  assert.throws(
    () => shaftFatigueSafetyFactor({ ...fat, d: -3 }),
    range(/d must be greater than 0/),
  );
});
