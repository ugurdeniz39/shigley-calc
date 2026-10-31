import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  boltBearingStress,
  boltGroupCentroid,
  boltShearStress,
  eccentricBoltGroup,
} from '../src/index.mjs';

/** Assert |actual - expected| <= absTol (use for quantities that can be 0). */
function within(actual, expected, absTol, label = '') {
  assert.ok(
    Math.abs(actual - expected) <= absTol,
    `${label} expected ${expected} +/- ${absTol} but got ${actual}`,
  );
}

/** Assert |actual - expected| <= relTol * |expected|. */
function near(actual, expected, relTol, label = '') {
  within(actual, expected, relTol * Math.abs(expected), label);
}

test('centroid is the (area-weighted) mean of the bolt positions', () => {
  // (0,0), (120,0), (0,90):  x = 120/3 = 40,  y = 90/3 = 30
  assert.deepEqual(boltGroupCentroid([{ x: 0, y: 0 }, { x: 120, y: 0 }, { x: 0, y: 90 }]), { x: 40, y: 30 });
  // areas 1 and 3 at x = 0 and 100:  (1*0 + 3*100)/4 = 75
  assert.deepEqual(boltGroupCentroid([{ x: 0, y: 0, area: 1 }, { x: 100, y: 0, area: 3 }]), { x: 75, y: 0 });
});

test('load through the centroid: pure primary shear, no secondary shear', () => {
  // 4 bolts at (+-50, +-50); Fy = -8000 N applied at the centroid (0, 0)
  //   M = 0;  each bolt: F' = 8000/4 = 2000 N downward;  F'' = 0;  R = 2000 N
  const r = eccentricBoltGroup({
    bolts: [{ x: 50, y: 50 }, { x: -50, y: 50 }, { x: -50, y: -50 }, { x: 50, y: -50 }],
    load: { Fy: -8000, x: 0, y: 0 },
  });
  assert.equal(r.moment, 0);
  for (const b of r.bolts) {
    within(b.primary.y, -2000, 1e-9);
    within(b.secondary.magnitude, 0, 1e-9);
    within(b.resultant.magnitude, 2000, 1e-9);
  }
});

test('three collinear bolts, vertical load 200 mm from the centroid', () => {
  // bolts (0,0), (100,0), (200,0): centroid (100, 0);  F = 6000 N down at x = 300
  //   e = 200 mm;  M = e * Fy = 200 * (-6000) = -1.2e6 N*mm (clockwise)
  //   sum r^2 = 100^2 + 0 + 100^2 = 20 000 mm^2;  M/sum r^2 = -60 N/mm
  //   F' = 6000/3 = 2000 N down on every bolt
  //   F'' = 60 * r:  bolt (200,0): 6000 N down;  bolt (0,0): 6000 N up;  middle bolt: 0
  //   R: bolt (200,0) = 2000 + 6000 = 8000 N (critical);  bolt (0,0) = 6000 - 2000 = 4000 N;
  //      middle = 2000 N
  const r = eccentricBoltGroup({
    bolts: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 0 }],
    load: { Fx: 0, Fy: -6000, x: 300, y: 0 },
  });
  assert.deepEqual(r.centroid, { x: 100, y: 0 });
  within(r.moment, -1.2e6, 1e-6, 'M');
  within(r.sumAr2, 20000, 1e-9, 'sum r^2');
  within(r.bolts[2].resultant.y, -8000, 1e-9);
  within(r.bolts[0].resultant.y, 4000, 1e-9);
  within(r.bolts[1].resultant.magnitude, 2000, 1e-9);
  assert.equal(r.critical.index, 2);
  within(r.critical.resultant.magnitude, 8000, 1e-9);
});

test('unsymmetrical group with both force components', () => {
  // bolts (0,0), (120,0), (0,90): centroid (40, 30);  F = (3000, -4000) N applied at (200, 90)
  //   M = (200-40)(-4000) - (90-30)(3000) = -640 000 - 180 000 = -820 000 N*mm
  //   r^2: 40^2+30^2 = 2500;  80^2+30^2 = 7300;  40^2+60^2 = 5200  -> sum = 15 000 mm^2
  //   k = M/sum r^2 = -54.667 N/mm;  F'' = (-k ry, k rx);  F' = (1000, -1333.33)
  //   bolt (0,0)  : r = (-40,-30): F'' = (-1640,  2186.67) -> R = (-640,  853.33), |R| = 1066.67
  //   bolt (120,0): r = ( 80,-30): F'' = (-1640, -4373.33) -> R = (-640, -5706.67), |R| = 5742.44
  //   bolt (0,90) : r = (-40, 60): F'' = ( 3280,  2186.67) -> R = (4280,  853.33), |R| = 4364.24
  const r = eccentricBoltGroup({
    bolts: [{ x: 0, y: 0 }, { x: 120, y: 0 }, { x: 0, y: 90 }],
    load: { Fx: 3000, Fy: -4000, x: 200, y: 90 },
  });
  within(r.moment, -820000, 1e-6, 'M');
  within(r.sumAr2, 15000, 1e-9, 'sum r^2');
  near(r.bolts[0].resultant.magnitude, 1066.67, 1e-5, '|R| bolt 0');
  near(r.bolts[1].resultant.magnitude, 5742.44, 1e-5, '|R| bolt 1');
  near(r.bolts[2].resultant.magnitude, 4364.24, 1e-5, '|R| bolt 2');
  near(r.bolts[1].resultant.x, -640, 1e-9, 'Rx bolt 1');
  near(r.bolts[1].resultant.y, -5706.67, 1e-6, 'Ry bolt 1');
  near(r.bolts[1].secondary.x, -1640, 1e-9, 'F\'\'x bolt 1');
  near(r.bolts[1].secondary.y, -4373.33, 1e-6, 'F\'\'y bolt 1');
  assert.equal(r.critical.index, 1);
});

test('pure couple on a circular pattern (flange coupling): equal tangential forces', () => {
  // 8 bolts on a 60 mm radius, couple 1.2e6 N*mm counter-clockwise, no force
  //   F = couple / (n R) = 1 200 000 / (8 * 60) = 2500 N on every bolt, perpendicular to its radius
  const bolts = Array.from({ length: 8 }, (_, k) => ({
    x: 60 * Math.cos((k * Math.PI) / 4),
    y: 60 * Math.sin((k * Math.PI) / 4),
  }));
  const r = eccentricBoltGroup({ bolts, couple: 1.2e6 });
  let sumX = 0;
  let sumY = 0;
  for (const b of r.bolts) {
    within(b.resultant.magnitude, 2500, 1e-6, 'tangential force');
    // tangential: R . r = 0, and counter-clockwise: r x R > 0
    within(b.resultant.x * b.rx + b.resultant.y * b.ry, 0, 1e-6, 'radial component');
    assert.ok(b.rx * b.resultant.y - b.ry * b.resultant.x > 0);
    sumX += b.resultant.x;
    sumY += b.resultant.y;
  }
  within(sumX, 0, 1e-6, 'net Fx');
  within(sumY, 0, 1e-6, 'net Fy');
});

test('bolts of different size share load in proportion to their area', () => {
  // areas 1 and 3 at x = 0 and x = 100; centroid x = 75;  F = 4000 N down through (100, 0)
  //   M = (100-75)(-4000) = -100 000 N*mm;  S = sum A r^2 = 1*75^2 + 3*25^2 = 7500
  //   bolt 1: F' = 4000*1/4 = 1000 down;   F'' = M A rx / S = (-100000)(1)(-75)/7500 = +1000 (up)  -> R = 0
  //   bolt 2: F' = 4000*3/4 = 3000 down;   F'' = (-100000)(3)(+25)/7500 = -1000 (down)           -> R = 4000
  const r = eccentricBoltGroup({
    bolts: [{ x: 0, y: 0, area: 1 }, { x: 100, y: 0, area: 3 }],
    load: { Fy: -4000, x: 100, y: 0 },
  });
  within(r.bolts[0].resultant.magnitude, 0, 1e-9);
  within(r.bolts[1].resultant.y, -4000, 1e-9);
  assert.equal(r.critical.index, 1);
});

test('equilibrium: the bolt forces add up to the load and its moment (random layouts)', () => {
  // Deterministic pseudo-random layouts (linear congruential generator, no Math.random).
  let seed = 12345;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  for (let trial = 0; trial < 20; trial += 1) {
    const count = 2 + Math.floor(rand() * 7);
    const bolts = Array.from({ length: count }, () => ({
      x: rand() * 300 - 100, y: rand() * 200 - 50, area: 0.5 + rand() * 3,
    }));
    const load = {
      Fx: rand() * 8000 - 4000, Fy: rand() * 8000 - 4000, x: rand() * 600 - 200, y: rand() * 400 - 100,
    };
    const couple = rand() * 1e5 - 5e4;
    const r = eccentricBoltGroup({ bolts, load, couple });
    // force balance
    const sx = r.bolts.reduce((s, b) => s + b.resultant.x, 0);
    const sy = r.bolts.reduce((s, b) => s + b.resultant.y, 0);
    within(sx, load.Fx, 1e-6, `trial ${trial} sum Fx`);
    within(sy, load.Fy, 1e-6, `trial ${trial} sum Fy`);
    // moment balance about the centroid: sum(r x R) = M of the applied loading
    const expectedM = (load.x - r.centroid.x) * load.Fy - (load.y - r.centroid.y) * load.Fx + couple;
    const sm = r.bolts.reduce((s, b) => s + (b.rx * b.resultant.y - b.ry * b.resultant.x), 0);
    within(sm, expectedM, 1e-5, `trial ${trial} moment`);
  }
});

test('sliding the load along its line of action changes nothing', () => {
  const bolts = [{ x: 0, y: 0 }, { x: 150, y: 0 }, { x: 0, y: 100 }, { x: 150, y: 100 }];
  const a = eccentricBoltGroup({ bolts, load: { Fy: -5000, x: 300, y: 0 } });
  const b = eccentricBoltGroup({ bolts, load: { Fy: -5000, x: 300, y: 777 } });
  within(a.moment, b.moment, 1e-6);
  within(a.critical.resultant.magnitude, b.critical.resultant.magnitude, 1e-9);
});

test('bolt stresses', () => {
  // R = 8000 N, d = 12 mm: A = pi/4 * 144 = 113.097 mm^2;  tau = 8000/113.097 = 70.7355 MPa
  near(boltShearStress(8000, 12), 70.7355, 1e-5, 'shear');
  // plate t = 10 mm: sigma_b = 8000 / (12 * 10) = 66.667 MPa
  near(boltBearingStress(8000, 12, 10), 66.6667, 1e-6, 'bearing');
});

test('invalid input throws RangeError with a clear message', () => {
  const range = (message) => ({ name: 'RangeError', message });
  const two = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
  assert.throws(() => eccentricBoltGroup({ bolts: [], load: { Fy: 1, x: 0, y: 0 } }), range(/non-empty array/));
  assert.throws(() => eccentricBoltGroup({ bolts: 'nope' }), range(/non-empty array/));
  assert.throws(() => eccentricBoltGroup({ bolts: [null] }), range(/bolts\[0\] must be an object/));
  assert.throws(
    () => eccentricBoltGroup({ bolts: [{ x: 0, y: Number.NaN }] }),
    range(/bolts\[0\]\.y must be a finite number/),
  );
  assert.throws(
    () => eccentricBoltGroup({ bolts: [{ x: 0, y: 0, area: 0 }, { x: 1, y: 1 }] }),
    range(/bolts\[0\]\.area must be greater than 0/),
  );
  assert.throws(
    () => eccentricBoltGroup({ bolts: two, load: { Fy: 100, y: 0 } }),
    range(/load\.x must be a finite number/),
  );
  assert.throws(
    () => eccentricBoltGroup({ bolts: two, load: { Fx: Infinity, x: 0, y: 0 } }),
    range(/load\.Fx/),
  );
  assert.throws(
    () => eccentricBoltGroup({ bolts: two, couple: Number.NaN }),
    range(/couple must be a finite number/),
  );
  // a single bolt cannot resist a moment about itself
  assert.throws(
    () => eccentricBoltGroup({ bolts: [{ x: 10, y: 10 }], load: { Fy: -1000, x: 60, y: 10 } }),
    range(/zero polar moment/),
  );
  // ...but a force through the single bolt is fine and is carried in full
  const single = eccentricBoltGroup({ bolts: [{ x: 10, y: 10 }], load: { Fy: -1000, x: 10, y: 10 } });
  within(single.critical.resultant.magnitude, 1000, 1e-9);
  assert.throws(() => boltShearStress(-1, 10), range(/R must not be negative/));
  assert.throws(() => boltShearStress(100, 0), range(/d must be greater than 0/));
  assert.throws(() => boltBearingStress(100, 10, 0), range(/t must be greater than 0/));
});
