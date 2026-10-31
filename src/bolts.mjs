// Eccentrically loaded bolt (or rivet) group in shear.
//
// Units: coordinates in mm, forces in N, moments in N*mm, stresses in MPa.
// Sign convention: x to the right, y up, moments positive counter-clockwise.
//
// Method (the usual elastic, rigid-plate model):
//   1. centroid        (xbar, ybar) = area-weighted mean of bolt positions
//   2. moment          M = (xF - xbar) Fy - (yF - ybar) Fx + couple
//   3. primary shear   F'_i  = F * A_i / sum(A)                    (direct)
//   4. secondary shear F''_i = M * A_i * r_i / sum(A_j r_j^2),
//                      acting perpendicular to r_i, i.e. components
//                      ( -M A_i ry_i / S ,  +M A_i rx_i / S ),  S = sum(A_j r_j^2)
//   5. resultant       R_i = F'_i + F''_i  (vector sum); the critical bolt is
//                      the one with the largest |R_i|.
// With identical bolts (the default) A_i drops out and F''_i = M r_i / sum(r_j^2).
// The model assumes a rigid joint plate and that every bolt carries the load
// in single shear at its own shank (or thread) area; it ignores friction
// between the plates and any clearance between bolt and hole.

import { requireFinite, requireNonNegative, requirePositive } from './validate.mjs';

/**
 * @typedef {object} Bolt
 * @property {number} x x coordinate, mm
 * @property {number} y y coordinate, mm
 * @property {number} [area=1] shear area weight; leave out for identical bolts
 *   (any consistent unit, only the ratios matter)
 */

/**
 * @typedef {object} Vec
 * @property {number} x component, N
 * @property {number} y component, N
 * @property {number} magnitude length of the vector, N
 */

function vec(x, y) {
  return { x, y, magnitude: Math.hypot(x, y) };
}

function checkBolts(bolts) {
  if (!Array.isArray(bolts) || bolts.length === 0) {
    throw new RangeError('bolts must be a non-empty array of {x, y, area?}');
  }
  return bolts.map((bolt, i) => {
    if (bolt === null || typeof bolt !== 'object') {
      throw new RangeError(`bolts[${i}] must be an object {x, y, area?}`);
    }
    const { x, y, area = 1 } = bolt;
    requireFinite(`bolts[${i}].x`, x);
    requireFinite(`bolts[${i}].y`, y);
    requirePositive(`bolts[${i}].area`, area);
    return { x, y, area };
  });
}

/**
 * Centroid of a bolt group (area-weighted).
 *
 * @param {Bolt[]} bolts positions in mm
 * @returns {{x:number, y:number}} mm
 */
export function boltGroupCentroid(bolts) {
  const list = checkBolts(bolts);
  const total = list.reduce((s, b) => s + b.area, 0);
  return {
    x: list.reduce((s, b) => s + b.area * b.x, 0) / total,
    y: list.reduce((s, b) => s + b.area * b.y, 0) / total,
  };
}

/**
 * Analyse an eccentrically loaded bolt group in shear.
 *
 * @param {object} p
 * @param {Bolt[]} p.bolts bolt positions, mm
 * @param {object} [p.load] applied force and its point of application
 * @param {number} [p.load.Fx=0] force in x, N
 * @param {number} [p.load.Fy=0] force in y, N
 * @param {number} p.load.x x of the line of action, mm (any point on it)
 * @param {number} p.load.y y of the line of action, mm
 * @param {number} [p.couple=0] additional pure couple on the group, N*mm
 *   (counter-clockwise positive), e.g. a torque on a flange coupling
 * @returns {{
 *   count:number,
 *   centroid:{x:number, y:number},
 *   force:{x:number, y:number},
 *   moment:number,
 *   sumAr2:number,
 *   bolts:Array<{index:number, x:number, y:number, area:number, rx:number,
 *     ry:number, r:number, primary:Vec, secondary:Vec, resultant:Vec}>,
 *   critical:{index:number, resultant:Vec}
 * }} moment about the centroid in N*mm; sumAr2 = sum(A_i r_i^2) in
 *   (area unit)*mm^2; every force in N; critical points at the bolt with the
 *   largest resultant (the first one in case of a tie)
 */
export function eccentricBoltGroup({ bolts, load, couple = 0 }) {
  const list = checkBolts(bolts);
  requireFinite('couple', couple);

  let Fx = 0;
  let Fy = 0;
  let xF = 0;
  let yF = 0;
  if (load !== undefined) {
    if (load === null || typeof load !== 'object') {
      throw new RangeError('load must be an object {Fx, Fy, x, y}');
    }
    ({ Fx = 0, Fy = 0, x: xF, y: yF } = load);
    requireFinite('load.Fx', Fx);
    requireFinite('load.Fy', Fy);
    requireFinite('load.x', xF);
    requireFinite('load.y', yF);
  }

  const totalArea = list.reduce((s, b) => s + b.area, 0);
  const centroid = boltGroupCentroid(list);
  const moment = load === undefined
    ? couple
    : (xF - centroid.x) * Fy - (yF - centroid.y) * Fx + couple;

  const sumAr2 = list.reduce(
    (s, b) => s + b.area * ((b.x - centroid.x) ** 2 + (b.y - centroid.y) ** 2),
    0,
  );
  // Compare against the scale of the geometry so round-off never hides a
  // genuinely unresisted moment.
  const scale = Math.max(1, ...list.map((b) => Math.abs(b.x) + Math.abs(b.y))) ** 2;
  if (moment !== 0 && sumAr2 <= 1e-12 * scale) {
    throw new RangeError(
      'The bolts coincide with their centroid (zero polar moment), so a moment about the centroid cannot be resisted',
    );
  }

  const results = list.map((b, index) => {
    const rx = b.x - centroid.x;
    const ry = b.y - centroid.y;
    const share = b.area / totalArea;
    const primary = vec(Fx * share, Fy * share);
    const k = sumAr2 === 0 ? 0 : (moment * b.area) / sumAr2;
    const secondary = vec(-k * ry, k * rx);
    const resultant = vec(primary.x + secondary.x, primary.y + secondary.y);
    return {
      index, x: b.x, y: b.y, area: b.area, rx, ry, r: Math.hypot(rx, ry), primary, secondary, resultant,
    };
  });

  let critical = results[0];
  for (const bolt of results) {
    if (bolt.resultant.magnitude > critical.resultant.magnitude) critical = bolt;
  }

  return {
    count: results.length,
    centroid,
    force: { x: Fx, y: Fy },
    moment,
    sumAr2,
    bolts: results,
    critical: { index: critical.index, resultant: critical.resultant },
  };
}

/**
 * Average shear stress on a circular bolt cross-section: tau = R / (pi d^2 / 4).
 * Use the minor/tensile-stress area instead if threads lie in the shear plane.
 *
 * @param {number} R shear force on the bolt, N
 * @param {number} d bolt diameter, mm
 * @returns {number} tau, MPa
 */
export function boltShearStress(R, d) {
  requireNonNegative('R', R);
  requirePositive('d', d);
  return R / ((Math.PI / 4) * d * d);
}

/**
 * Bearing stress on the bolt and plate: sigma_b = R / (d t).
 *
 * @param {number} R shear force on the bolt, N
 * @param {number} d bolt diameter, mm
 * @param {number} t thickness of the plate in bearing, mm
 * @returns {number} sigma_b, MPa
 */
export function boltBearingStress(R, d, t) {
  requireNonNegative('R', R);
  requirePositive('d', d);
  requirePositive('t', t);
  return R / (d * t);
}
