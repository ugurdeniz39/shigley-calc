// Fatigue failure criteria for fluctuating stress (Shigley notation).
//
// Units: all stresses and strengths in MPa. Factors of safety are
// dimensionless; an unloaded member returns Infinity.
//
// The criteria below work in the first quadrant of the (mean, alternating)
// plane, so sigmaA and sigmaM must both be >= 0. A compressive mean stress
// needs a different treatment (the failure line is horizontal there) and is
// deliberately out of scope.

import { requireAtLeast, requireFinite, requireNonNegative, requirePositive } from './validate.mjs';

/**
 * Alternating and mean components from the extreme stresses of a cycle.
 *
 *   sigmaA = |sigmaMax - sigmaMin| / 2
 *   sigmaM = (sigmaMax + sigmaMin) / 2   (signed)
 *
 * @param {number} sigmaMax maximum stress, MPa
 * @param {number} sigmaMin minimum stress, MPa
 * @returns {{sigmaA:number, sigmaM:number}} MPa
 */
export function stressComponents(sigmaMax, sigmaMin) {
  requireFinite('sigmaMax', sigmaMax);
  requireFinite('sigmaMin', sigmaMin);
  return {
    sigmaA: Math.abs(sigmaMax - sigmaMin) / 2,
    sigmaM: (sigmaMax + sigmaMin) / 2,
  };
}

/**
 * Fatigue stress-concentration factor from the geometric factor Kt and the
 * notch sensitivity q: Kf = 1 + q (Kt - 1).
 *
 * @param {number} Kt theoretical stress-concentration factor (>= 1)
 * @param {number} q notch sensitivity, 0 <= q <= 1
 * @returns {number} Kf (dimensionless)
 */
export function fatigueConcentrationFactor(Kt, q) {
  requireAtLeast('Kt', Kt, 1);
  requireFinite('q', q);
  if (q < 0 || q > 1) {
    throw new RangeError(`q must satisfy 0 <= q <= 1 (got ${q})`);
  }
  return 1 + q * (Kt - 1);
}

/**
 * Von Mises equivalent alternating and mean stresses for combined bending and
 * torsion, with the fatigue concentration factors applied to the nominal
 * stresses (axial load is not included).
 *
 *   sigmaA' = sqrt( (Kf sigmaA)^2 + 3 (Kfs tauA)^2 )
 *   sigmaM' = sqrt( (Kf sigmaM)^2 + 3 (Kfs tauM)^2 )
 *
 * @param {object} p
 * @param {number} [p.sigmaA=0] nominal alternating bending stress, MPa
 * @param {number} [p.sigmaM=0] nominal mean bending stress, MPa
 * @param {number} [p.tauA=0] nominal alternating torsional shear stress, MPa
 * @param {number} [p.tauM=0] nominal mean torsional shear stress, MPa
 * @param {number} [p.Kf=1] fatigue concentration factor, bending
 * @param {number} [p.Kfs=1] fatigue concentration factor, torsion
 * @returns {{sigmaAPrime:number, sigmaMPrime:number}} MPa
 */
export function vonMisesComponents({
  sigmaA = 0, sigmaM = 0, tauA = 0, tauM = 0, Kf = 1, Kfs = 1,
}) {
  requireNonNegative('sigmaA', sigmaA);
  requireFinite('sigmaM', sigmaM); // a signed mean is squared below
  requireNonNegative('tauA', tauA);
  requireFinite('tauM', tauM);
  requireAtLeast('Kf', Kf, 1);
  requireAtLeast('Kfs', Kfs, 1);
  return {
    sigmaAPrime: Math.hypot(Kf * sigmaA, Math.sqrt(3) * Kfs * tauA),
    sigmaMPrime: Math.hypot(Kf * sigmaM, Math.sqrt(3) * Kfs * tauM),
  };
}

function checkStresses(sigmaA, sigmaM) {
  requireNonNegative('sigmaA', sigmaA);
  requireFinite('sigmaM', sigmaM);
  if (sigmaM < 0) {
    throw new RangeError(
      `sigmaM must not be negative (got ${sigmaM}); compressive mean stress is outside the first-quadrant criteria implemented here`,
    );
  }
}

/**
 * Modified-Goodman factor of safety: 1/n = sigmaA/Se + sigmaM/Sut.
 *
 * @param {object} p
 * @param {number} p.sigmaA alternating stress, MPa
 * @param {number} p.sigmaM mean stress, MPa
 * @param {number} p.Se corrected endurance limit, MPa
 * @param {number} p.Sut ultimate tensile strength, MPa
 * @returns {number} n
 */
export function goodmanFactor({ sigmaA, sigmaM, Se, Sut }) {
  checkStresses(sigmaA, sigmaM);
  requirePositive('Se', Se);
  requirePositive('Sut', Sut);
  const inverse = sigmaA / Se + sigmaM / Sut;
  return inverse === 0 ? Infinity : 1 / inverse;
}

/**
 * Soderberg factor of safety: 1/n = sigmaA/Se + sigmaM/Sy.
 *
 * @param {object} p
 * @param {number} p.sigmaA alternating stress, MPa
 * @param {number} p.sigmaM mean stress, MPa
 * @param {number} p.Se corrected endurance limit, MPa
 * @param {number} p.Sy yield strength, MPa
 * @returns {number} n
 */
export function soderbergFactor({ sigmaA, sigmaM, Se, Sy }) {
  checkStresses(sigmaA, sigmaM);
  requirePositive('Se', Se);
  requirePositive('Sy', Sy);
  const inverse = sigmaA / Se + sigmaM / Sy;
  return inverse === 0 ? Infinity : 1 / inverse;
}

/**
 * Gerber (parabola) factor of safety, from
 *
 *   n sigmaA / Se + (n sigmaM / Sut)^2 = 1.
 *
 * The textbook closed form is
 *   n = 1/2 (Sut/sigmaM)^2 (sigmaA/Se) [ -1 + sqrt(1 + (2 sigmaM Se / (Sut sigmaA))^2) ].
 * This implementation uses the algebraically identical
 *   n = (2 Se / sigmaA) / (1 + sqrt(1 + r^2)),  r = 2 sigmaM Se / (Sut sigmaA),
 * which has no cancellation for small sigmaM and reduces to n = Se/sigmaA when
 * sigmaM = 0. With sigmaA = 0 the limit n = Sut/sigmaM is returned.
 *
 * @param {object} p
 * @param {number} p.sigmaA alternating stress, MPa
 * @param {number} p.sigmaM mean stress, MPa
 * @param {number} p.Se corrected endurance limit, MPa
 * @param {number} p.Sut ultimate tensile strength, MPa
 * @returns {number} n
 */
export function gerberFactor({ sigmaA, sigmaM, Se, Sut }) {
  checkStresses(sigmaA, sigmaM);
  requirePositive('Se', Se);
  requirePositive('Sut', Sut);
  if (sigmaA === 0 && sigmaM === 0) return Infinity;
  if (sigmaA === 0) return Sut / sigmaM;
  const r = (2 * sigmaM * Se) / (Sut * sigmaA);
  return (2 * Se) / sigmaA / (1 + Math.sqrt(1 + r * r));
}

/**
 * ASME-elliptic factor of safety: (n sigmaA/Se)^2 + (n sigmaM/Sy)^2 = 1.
 *
 * @param {object} p
 * @param {number} p.sigmaA alternating stress, MPa
 * @param {number} p.sigmaM mean stress, MPa
 * @param {number} p.Se corrected endurance limit, MPa
 * @param {number} p.Sy yield strength, MPa
 * @returns {number} n
 */
export function asmeEllipticFactor({ sigmaA, sigmaM, Se, Sy }) {
  checkStresses(sigmaA, sigmaM);
  requirePositive('Se', Se);
  requirePositive('Sy', Sy);
  const inverseSquared = (sigmaA / Se) ** 2 + (sigmaM / Sy) ** 2;
  return inverseSquared === 0 ? Infinity : 1 / Math.sqrt(inverseSquared);
}

/**
 * Langer first-cycle yield factor of safety: n = Sy / (sigmaA + sigmaM).
 *
 * @param {object} p
 * @param {number} p.sigmaA alternating stress, MPa
 * @param {number} p.sigmaM mean stress, MPa
 * @param {number} p.Sy yield strength, MPa
 * @returns {number} n
 */
export function langerFactor({ sigmaA, sigmaM, Sy }) {
  checkStresses(sigmaA, sigmaM);
  requirePositive('Sy', Sy);
  const total = sigmaA + sigmaM;
  return total === 0 ? Infinity : Sy / total;
}

/**
 * All five criteria at once.
 *
 * @param {object} p
 * @param {number} p.sigmaA alternating stress, MPa
 * @param {number} p.sigmaM mean stress, MPa
 * @param {number} p.Se corrected endurance limit, MPa
 * @param {number} p.Sut ultimate tensile strength, MPa
 * @param {number} p.Sy yield strength, MPa
 * @returns {{goodman:number, soderberg:number, gerber:number,
 *   asmeElliptic:number, langer:number}} factors of safety
 */
export function fluctuatingSafetyFactors({ sigmaA, sigmaM, Se, Sut, Sy }) {
  return {
    goodman: goodmanFactor({ sigmaA, sigmaM, Se, Sut }),
    soderberg: soderbergFactor({ sigmaA, sigmaM, Se, Sy }),
    gerber: gerberFactor({ sigmaA, sigmaM, Se, Sut }),
    asmeElliptic: asmeEllipticFactor({ sigmaA, sigmaM, Se, Sy }),
    langer: langerFactor({ sigmaA, sigmaM, Sy }),
  };
}
