// Solid round shaft: static yield and fatigue sizing / checking with the
// distortion-energy (von Mises) combination of bending and torsion.
//
// Units: moments and torques in N*mm, stresses and strengths in MPa,
// diameters in mm (so N/mm^2 = MPa throughout, no hidden conversions).
//
// For a solid round section of diameter d, the nominal stresses are
//   sigma = 32 M / (pi d^3)      tau = 16 T / (pi d^3)
// and the von Mises combination of both collapses to
//   sigma' = (16 / (pi d^3)) sqrt( 4 M^2 + 3 T^2 ).
// Fatigue loads are split into alternating (Ma, Ta) and mean (Mm, Tm)
// components, with the fatigue concentration factors Kf (bending) and
// Kfs (torsion) applied to them:
//   A = sqrt( 4 (Kf Ma)^2 + 3 (Kfs Ta)^2 )     (alternating, N*mm)
//   B = sqrt( 4 (Kf Mm)^2 + 3 (Kfs Tm)^2 )     (mean, N*mm)
// so that sigmaA' = 16 A / (pi d^3) and sigmaM' = 16 B / (pi d^3).
//
// Use kc = 1 for the Se of a shaft carrying combined bending and torsion
// (see loadFactor in endurance.mjs): the von Mises step already accounts
// for the torsion.

import { fluctuatingSafetyFactors, vonMisesComponents } from './fatigue.mjs';
import { requireAtLeast, requireNonNegative, requirePositive } from './validate.mjs';

const CRITERIA = ['goodman', 'soderberg', 'gerber', 'asme-elliptic'];

/**
 * Nominal bending and torsional shear stress of a solid round section.
 *
 * @param {object} p
 * @param {number} [p.M=0] bending moment, N*mm
 * @param {number} [p.T=0] torque, N*mm
 * @param {number} p.d diameter, mm
 * @returns {{sigma:number, tau:number}} MPa
 */
export function roundShaftStresses({ M = 0, T = 0, d }) {
  requireNonNegative('M', M);
  requireNonNegative('T', T);
  requirePositive('d', d);
  const d3 = d ** 3;
  return { sigma: (32 * M) / (Math.PI * d3), tau: (16 * T) / (Math.PI * d3) };
}

/**
 * Static diameter from the distortion-energy theory and yield:
 *
 *   d = [ (16 n / (pi Sy)) sqrt(4 M^2 + 3 T^2) ]^(1/3)
 *
 * @param {object} p
 * @param {number} [p.M=0] steady bending moment, N*mm
 * @param {number} [p.T=0] steady torque, N*mm
 * @param {number} p.Sy yield strength, MPa
 * @param {number} p.n design factor of safety (> 0)
 * @returns {{d:number, combined:number, d3:number}} d in mm; combined =
 *   sqrt(4M^2+3T^2) in N*mm; d3 = d^3 in mm^3
 */
export function staticShaftDiameter({ M = 0, T = 0, Sy, n }) {
  requireNonNegative('M', M);
  requireNonNegative('T', T);
  requirePositive('Sy', Sy);
  requirePositive('n', n);
  if (M === 0 && T === 0) {
    throw new RangeError('At least one of M and T must be non-zero');
  }
  const combined = Math.hypot(2 * M, Math.sqrt(3) * T);
  const d3 = ((16 * n) / (Math.PI * Sy)) * combined;
  return { d: Math.cbrt(d3), combined, d3 };
}

/**
 * Static factor of safety of a given diameter: n = Sy / sigma', with
 * sigma' = (16 / (pi d^3)) sqrt(4 M^2 + 3 T^2).
 *
 * @param {object} p
 * @param {number} [p.M=0] steady bending moment, N*mm
 * @param {number} [p.T=0] steady torque, N*mm
 * @param {number} p.d diameter, mm
 * @param {number} p.Sy yield strength, MPa
 * @returns {{sigma:number, tau:number, sigmaPrime:number, n:number}} stresses
 *   in MPa; n is Infinity for an unloaded shaft
 */
export function staticShaftSafetyFactor({ M = 0, T = 0, d, Sy }) {
  requirePositive('Sy', Sy);
  const { sigma, tau } = roundShaftStresses({ M, T, d });
  const sigmaPrime = Math.sqrt(sigma ** 2 + 3 * tau ** 2);
  return { sigma, tau, sigmaPrime, n: sigmaPrime === 0 ? Infinity : Sy / sigmaPrime };
}

/** Validate load components and concentration factors, return A and B (N*mm). */
function loadTerms({ Ma = 0, Mm = 0, Ta = 0, Tm = 0, Kf = 1, Kfs = 1 }) {
  requireNonNegative('Ma', Ma);
  requireNonNegative('Mm', Mm);
  requireNonNegative('Ta', Ta);
  requireNonNegative('Tm', Tm);
  requireAtLeast('Kf', Kf, 1);
  requireAtLeast('Kfs', Kfs, 1);
  return {
    A: Math.hypot(2 * Kf * Ma, Math.sqrt(3) * Kfs * Ta),
    B: Math.hypot(2 * Kf * Mm, Math.sqrt(3) * Kfs * Tm),
  };
}

/**
 * Diameter for a distortion-energy fatigue criterion. With
 * K = d^3 pi / (16 n), the criteria give
 *   goodman        K = A/Se + B/Sut
 *   soderberg      K = A/Se + B/Sy
 *   gerber         K = 1/2 [ A/Se + sqrt( (A/Se)^2 + 4 (B/Sut)^2 ) ]
 *   asme-elliptic  K = sqrt( (A/Se)^2 + (B/Sy)^2 )
 * Se may depend on the diameter (through the size factor); then the diameter
 * is found by fixed-point iteration.
 */
function fatigueDiameter(criterion, params) {
  if (!CRITERIA.includes(criterion)) {
    throw new RangeError(`Unknown criterion "${criterion}"; expected one of: ${CRITERIA.join(', ')}`);
  }
  const { n, Se, Sut, Sy, dGuess = 25 } = params;
  requirePositive('n', n);
  if (criterion === 'goodman' || criterion === 'gerber') requirePositive('Sut', Sut);
  if (criterion === 'soderberg' || criterion === 'asme-elliptic') requirePositive('Sy', Sy);

  const { A, B } = loadTerms(params);
  if (A === 0 && B === 0) {
    throw new RangeError('At least one of Ma, Mm, Ta, Tm must be non-zero');
  }

  const dFor = (SeValue) => {
    requirePositive('Se', SeValue);
    const a = A / SeValue;
    let K;
    if (criterion === 'goodman') K = a + B / Sut;
    else if (criterion === 'soderberg') K = a + B / Sy;
    else if (criterion === 'gerber') K = 0.5 * (a + Math.sqrt(a * a + 4 * (B / Sut) ** 2));
    else K = Math.hypot(a, B / Sy);
    return Math.cbrt(((16 * n) / Math.PI) * K);
  };

  if (typeof Se === 'number') {
    return { criterion, d: dFor(Se), A, B, Se, iterations: 0 };
  }
  if (typeof Se !== 'function') {
    throw new RangeError('Se must be a number (MPa) or a function d => Se (MPa)');
  }

  requirePositive('dGuess', dGuess);
  let d = dGuess;
  for (let iterations = 1; iterations <= 100; iterations += 1) {
    const next = dFor(Se(d));
    if (Math.abs(next - d) <= 1e-10 * Math.max(1, next)) {
      return { criterion, d: next, A, B, Se: Se(next), iterations };
    }
    d = next;
  }
  throw new Error('Shaft diameter iteration did not converge within 100 iterations');
}

/**
 * @typedef {object} FatigueDiameterParams
 * @property {number} [Ma=0] alternating bending moment, N*mm
 * @property {number} [Mm=0] mean bending moment, N*mm
 * @property {number} [Ta=0] alternating torque, N*mm
 * @property {number} [Tm=0] mean torque, N*mm
 * @property {number} [Kf=1] fatigue concentration factor, bending (>= 1)
 * @property {number} [Kfs=1] fatigue concentration factor, torsion (>= 1)
 * @property {number} n design factor of safety (> 0)
 * @property {number|function(number):number} Se corrected endurance limit,
 *   MPa, or a function d (mm) => Se (MPa) when Se depends on the diameter
 * @property {number} [Sut] ultimate strength, MPa (Goodman, Gerber)
 * @property {number} [Sy] yield strength, MPa (Soderberg, ASME-elliptic)
 * @property {number} [dGuess=25] starting diameter for the iteration, mm
 */

/**
 * DE-Goodman diameter: d = [ (16 n / pi) (A/Se + B/Sut) ]^(1/3).
 * @param {FatigueDiameterParams} p
 * @returns {{criterion:string, d:number, A:number, B:number, Se:number, iterations:number}}
 *   d in mm; A and B in N*mm; iterations is 0 when Se is a plain number
 */
export function deGoodmanDiameter(p) {
  return fatigueDiameter('goodman', p);
}

/**
 * DE-Soderberg diameter: d = [ (16 n / pi) (A/Se + B/Sy) ]^(1/3).
 * @param {FatigueDiameterParams} p
 * @returns {{criterion:string, d:number, A:number, B:number, Se:number, iterations:number}}
 */
export function deSoderbergDiameter(p) {
  return fatigueDiameter('soderberg', p);
}

/**
 * DE-Gerber diameter:
 * d = { (8 n A / (pi Se)) [ 1 + sqrt( 1 + (2 B Se / (A Sut))^2 ) ] }^(1/3).
 * Evaluated in a form that stays finite when A = 0.
 * @param {FatigueDiameterParams} p
 * @returns {{criterion:string, d:number, A:number, B:number, Se:number, iterations:number}}
 */
export function deGerberDiameter(p) {
  return fatigueDiameter('gerber', p);
}

/**
 * DE-ASME-elliptic diameter:
 * d = { (16 n / pi) sqrt( (A/Se)^2 + (B/Sy)^2 ) }^(1/3).
 * @param {FatigueDiameterParams} p
 * @returns {{criterion:string, d:number, A:number, B:number, Se:number, iterations:number}}
 */
export function deAsmeEllipticDiameter(p) {
  return fatigueDiameter('asme-elliptic', p);
}

/**
 * Factors of safety of a shaft of given diameter under fluctuating bending
 * and torsion.
 *
 * Returns the von Mises alternating/mean stresses, the fatigue factors for
 * Goodman, Soderberg, Gerber, ASME-elliptic and Langer (applied to the von
 * Mises components), and the first-cycle yield factor computed from the
 * maximum load: sigmaMax' = (16 / (pi d^3)) sqrt( 4 (Kf (Ma+Mm))^2 +
 * 3 (Kfs (Ta+Tm))^2 ), n = Sy / sigmaMax'.
 *
 * @param {object} p
 * @param {number} [p.Ma=0] alternating bending moment, N*mm
 * @param {number} [p.Mm=0] mean bending moment, N*mm
 * @param {number} [p.Ta=0] alternating torque, N*mm
 * @param {number} [p.Tm=0] mean torque, N*mm
 * @param {number} [p.Kf=1] fatigue concentration factor, bending
 * @param {number} [p.Kfs=1] fatigue concentration factor, torsion
 * @param {number} p.d diameter, mm
 * @param {number} p.Se corrected endurance limit, MPa
 * @param {number} p.Sut ultimate tensile strength, MPa
 * @param {number} p.Sy yield strength, MPa
 * @returns {{A:number, B:number, sigmaAPrime:number, sigmaMPrime:number,
 *   sigmaMaxPrime:number, n:{goodman:number, soderberg:number, gerber:number,
 *   asmeElliptic:number, langer:number, yield:number}}} A, B in N*mm;
 *   stresses in MPa; n entries dimensionless
 */
export function shaftFatigueSafetyFactor({
  Ma = 0, Mm = 0, Ta = 0, Tm = 0, Kf = 1, Kfs = 1, d, Se, Sut, Sy,
}) {
  requirePositive('d', d);
  const { A, B } = loadTerms({ Ma, Mm, Ta, Tm, Kf, Kfs });
  const alt = roundShaftStresses({ M: Ma, T: Ta, d });
  const mean = roundShaftStresses({ M: Mm, T: Tm, d });
  const { sigmaAPrime, sigmaMPrime } = vonMisesComponents({
    sigmaA: alt.sigma, tauA: alt.tau, sigmaM: mean.sigma, tauM: mean.tau, Kf, Kfs,
  });
  const factors = fluctuatingSafetyFactors({
    sigmaA: sigmaAPrime, sigmaM: sigmaMPrime, Se, Sut, Sy,
  });
  const sigmaMaxPrime = (16 / (Math.PI * d ** 3))
    * Math.hypot(2 * Kf * (Ma + Mm), Math.sqrt(3) * Kfs * (Ta + Tm));
  return {
    A,
    B,
    sigmaAPrime,
    sigmaMPrime,
    sigmaMaxPrime,
    n: { ...factors, yield: sigmaMaxPrime === 0 ? Infinity : Sy / sigmaMaxPrime },
  };
}
