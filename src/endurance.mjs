// Endurance limit and Marin modification factors (Shigley notation).
//
// Units: strengths in MPa, lengths in mm, temperature in degrees Celsius.
// Everything here is a pure function; invalid input throws RangeError.
//
//   Se = ka * kb * kc * kd * ke * kMisc * Se'
//
// "kMisc" is Shigley's miscellaneous-effects factor k_f. It is spelled out in
// full here so it cannot be confused with the fatigue stress-concentration
// factor Kf (capital K) that lives in fatigue.mjs.

import {
  normaliseKey,
  requireFinite,
  requirePositive,
} from './validate.mjs';

/** Tensile strength above which Se' stops growing, MPa. */
export const SUT_LIMIT_MPA = 1400;
/** Cap on the uncorrected endurance limit Se' for Sut > 1400 MPa, MPa. */
export const SE_PRIME_CAP_MPA = 700;

/**
 * Uncorrected (rotating-beam specimen) endurance limit of steel.
 *
 *   Se' = 0.5 Sut   for Sut <= 1400 MPa
 *   Se' = 700 MPa   for Sut >  1400 MPa
 *
 * @param {number} Sut ultimate tensile strength, MPa
 * @returns {number} Se', MPa
 */
export function uncorrectedEnduranceLimit(Sut) {
  requirePositive('Sut', Sut);
  return Sut <= SUT_LIMIT_MPA ? 0.5 * Sut : SE_PRIME_CAP_MPA;
}

/**
 * Surface-finish coefficients for ka = a * Sut^b with Sut in MPa
 * (Shigley Table 6-2, SI column; 9th/10th editions).
 * "cold-drawn" shares the machined row, as in the table.
 */
export const SURFACE_FINISHES = Object.freeze({
  ground: Object.freeze({ a: 1.58, b: -0.085 }),
  machined: Object.freeze({ a: 4.51, b: -0.265 }),
  'cold-drawn': Object.freeze({ a: 4.51, b: -0.265 }),
  'hot-rolled': Object.freeze({ a: 57.7, b: -0.718 }),
  'as-forged': Object.freeze({ a: 272, b: -0.995 }),
});

/**
 * Surface factor ka = a * Sut^b (not capped at 1: a ground surface on a very
 * soft steel can give a value marginally above 1, and the source table does
 * not cap it).
 *
 * @param {string} finish 'ground' | 'machined' | 'cold-drawn' | 'hot-rolled' | 'as-forged'
 *   (case-insensitive; spaces or underscores are accepted instead of hyphens)
 * @param {number} Sut ultimate tensile strength, MPa
 * @returns {number} ka (dimensionless)
 */
export function surfaceFactor(finish, Sut) {
  requirePositive('Sut', Sut);
  const key = normaliseKey(finish);
  if (!Object.hasOwn(SURFACE_FINISHES, key)) {
    throw new RangeError(
      `Unknown surface finish "${String(finish)}"; expected one of: ${Object.keys(SURFACE_FINISHES).join(', ')}`,
    );
  }
  const { a, b } = SURFACE_FINISHES[key];
  return a * Sut ** b;
}

/** Diameter range (mm) over which the size-factor correlation is valid. */
export const SIZE_FACTOR_RANGE_MM = Object.freeze({ min: 2.79, max: 254 });

/**
 * Size factor for bending or torsion of a rotating round, using the
 * effective diameter de.
 *
 *   kb = (de / 7.62)^-0.107   for 2.79 <= de <= 51 mm
 *   kb = 1.51 de^-0.157       for 51 < de <= 254 mm
 *
 * Outside 2.79-254 mm the correlation is not defined and a RangeError is
 * thrown (no silent clamping).
 *
 * @param {number} de effective (equivalent) diameter, mm
 * @returns {number} kb (dimensionless)
 */
export function sizeFactor(de) {
  requirePositive('de', de);
  const { min, max } = SIZE_FACTOR_RANGE_MM;
  if (de < min || de > max) {
    throw new RangeError(
      `Size factor is only defined for ${min} mm <= de <= ${max} mm (got ${de} mm)`,
    );
  }
  return de <= 51 ? (de / 7.62) ** -0.107 : 1.51 * de ** -0.157;
}

/**
 * Effective diameter of a solid round section.
 * Rotating: de = d. Non-rotating (stationary bending load): de = 0.370 d.
 *
 * @param {number} d diameter, mm
 * @param {boolean} [rotating=true]
 * @returns {number} de, mm
 */
export function equivalentDiameterRound(d, rotating = true) {
  requirePositive('d', d);
  return rotating ? d : 0.37 * d;
}

/**
 * Effective diameter of a rectangular section in bending: de = 0.808 sqrt(h b).
 *
 * @param {number} h section depth, mm
 * @param {number} b section width, mm
 * @returns {number} de, mm
 */
export function equivalentDiameterRectangle(h, b) {
  requirePositive('h', h);
  requirePositive('b', b);
  return 0.808 * Math.sqrt(h * b);
}

/** Load factors kc by loading type. */
export const LOAD_FACTORS = Object.freeze({ bending: 1, axial: 0.85, torsion: 0.59 });

/**
 * Load factor kc: bending 1, axial 0.85, torsion 0.59.
 *
 * Note: 0.59 is for pure torsional fatigue. When bending and torsion are
 * combined through the von Mises / distortion-energy expressions (the shaft
 * equations in shaft.mjs), use kc = 1 ('bending') so the load is not
 * penalised twice.
 *
 * @param {string} load 'bending' | 'axial' | 'torsion'
 * @returns {number} kc (dimensionless)
 */
export function loadFactor(load) {
  const key = normaliseKey(load);
  if (!Object.hasOwn(LOAD_FACTORS, key)) {
    throw new RangeError(
      `Unknown load type "${String(load)}"; expected one of: ${Object.keys(LOAD_FACTORS).join(', ')}`,
    );
  }
  return LOAD_FACTORS[key];
}

/**
 * Ratio of tensile strength at temperature to room-temperature strength for
 * steel (Shigley Table 6-4, SI), used as the temperature factor kd.
 */
export const TEMPERATURE_TABLE = Object.freeze([
  Object.freeze({ tempC: 20, kd: 1.0 }),
  Object.freeze({ tempC: 50, kd: 1.01 }),
  Object.freeze({ tempC: 100, kd: 1.02 }),
  Object.freeze({ tempC: 150, kd: 1.025 }),
  Object.freeze({ tempC: 200, kd: 1.02 }),
  Object.freeze({ tempC: 250, kd: 1.0 }),
  Object.freeze({ tempC: 300, kd: 0.975 }),
  Object.freeze({ tempC: 350, kd: 0.943 }),
  Object.freeze({ tempC: 400, kd: 0.9 }),
  Object.freeze({ tempC: 450, kd: 0.843 }),
  Object.freeze({ tempC: 500, kd: 0.768 }),
  Object.freeze({ tempC: 550, kd: 0.672 }),
  Object.freeze({ tempC: 600, kd: 0.549 }),
]);

/**
 * Temperature factor kd for steel by linear interpolation in the table
 * above. Omit the argument (or pass undefined) for room temperature, kd = 1.
 *
 * @param {number} [tempC] operating temperature, degrees Celsius (20-600)
 * @returns {number} kd (dimensionless)
 */
export function temperatureFactor(tempC) {
  if (tempC === undefined) return 1;
  requireFinite('tempC', tempC);
  const first = TEMPERATURE_TABLE[0];
  const last = TEMPERATURE_TABLE[TEMPERATURE_TABLE.length - 1];
  if (tempC < first.tempC || tempC > last.tempC) {
    throw new RangeError(
      `Temperature factor is tabulated for ${first.tempC}-${last.tempC} degC (got ${tempC} degC)`,
    );
  }
  for (let i = 1; i < TEMPERATURE_TABLE.length; i += 1) {
    const hi = TEMPERATURE_TABLE[i];
    if (tempC <= hi.tempC) {
      const lo = TEMPERATURE_TABLE[i - 1];
      const t = (tempC - lo.tempC) / (hi.tempC - lo.tempC);
      return lo.kd + t * (hi.kd - lo.kd);
    }
  }
  return last.kd; // unreachable; keeps the function total
}

/**
 * Reliability factors (Shigley Table 6-5). Each row is the factor for a
 * target reliability, assuming an 8 % standard deviation of the endurance limit.
 */
export const RELIABILITY_FACTORS = Object.freeze([
  Object.freeze({ reliability: 0.5, ke: 1.0 }),
  Object.freeze({ reliability: 0.9, ke: 0.897 }),
  Object.freeze({ reliability: 0.95, ke: 0.868 }),
  Object.freeze({ reliability: 0.99, ke: 0.814 }),
  Object.freeze({ reliability: 0.999, ke: 0.753 }),
  Object.freeze({ reliability: 0.9999, ke: 0.702 }),
  Object.freeze({ reliability: 0.99999, ke: 0.659 }),
  Object.freeze({ reliability: 0.999999, ke: 0.62 }),
]);

/**
 * Reliability factor ke from the table (exact reliabilities only).
 *
 * @param {number} reliability fraction, e.g. 0.99 for 99 %
 * @returns {number} ke (dimensionless)
 */
export function reliabilityFactor(reliability) {
  requireFinite('reliability', reliability);
  const row = RELIABILITY_FACTORS.find((r) => Math.abs(r.reliability - reliability) < 1e-9);
  if (!row) {
    const listed = RELIABILITY_FACTORS.map((r) => r.reliability).join(', ');
    throw new RangeError(
      `Reliability ${reliability} is not tabulated; use one of: ${listed} (or reliabilityFactorFromZ)`,
    );
  }
  return row.ke;
}

/**
 * Reliability factor from the standard normal deviate: ke = 1 - 0.08 za.
 * Use this for reliabilities that are not in the table.
 *
 * @param {number} za standard normal deviate for the target reliability (0 <= za < 12.5)
 * @returns {number} ke (dimensionless)
 */
export function reliabilityFactorFromZ(za) {
  requireFinite('za', za);
  if (za < 0 || za >= 12.5) {
    throw new RangeError(`za must satisfy 0 <= za < 12.5 so that ke stays positive (got ${za})`);
  }
  return 1 - 0.08 * za;
}

/**
 * Corrected endurance limit: Se = ka kb kc kd ke kMisc Se'.
 *
 * @param {number} SePrime uncorrected endurance limit Se', MPa
 * @param {object} [factors]
 * @param {number} [factors.ka=1] surface
 * @param {number} [factors.kb=1] size
 * @param {number} [factors.kc=1] load
 * @param {number} [factors.kd=1] temperature
 * @param {number} [factors.ke=1] reliability
 * @param {number} [factors.kMisc=1] miscellaneous effects (Shigley's k_f)
 * @returns {number} Se, MPa
 */
export function correctedEnduranceLimit(SePrime, factors = {}) {
  const { ka = 1, kb = 1, kc = 1, kd = 1, ke = 1, kMisc = 1 } = factors;
  requirePositive('SePrime', SePrime);
  requirePositive('ka', ka);
  requirePositive('kb', kb);
  requirePositive('kc', kc);
  requirePositive('kd', kd);
  requirePositive('ke', ke);
  requirePositive('kMisc', kMisc);
  return ka * kb * kc * kd * ke * kMisc * SePrime;
}

/**
 * One-call endurance limit with every intermediate value returned.
 *
 * Provide the size with either `d` (round section, with `rotating`) or `de`
 * (an already-computed effective diameter, e.g. from
 * equivalentDiameterRectangle). Axial loading ignores size (kb = 1).
 *
 * @param {object} p
 * @param {number} p.Sut ultimate tensile strength, MPa
 * @param {string} p.finish surface finish, see SURFACE_FINISHES
 * @param {string} [p.load='bending'] 'bending' | 'axial' | 'torsion'
 * @param {number} [p.d] round-section diameter, mm
 * @param {boolean} [p.rotating=true] false for a non-rotating round (de = 0.370 d)
 * @param {number} [p.de] effective diameter, mm (alternative to d)
 * @param {number} [p.tempC] operating temperature, degC (omit for room temperature)
 * @param {number} [p.reliability=0.5] target reliability as a fraction (0.5 gives ke = 1)
 * @param {number} [p.kMisc=1] miscellaneous-effects factor
 * @returns {{SePrime:number, ka:number, kb:number, kc:number, kd:number,
 *   ke:number, kMisc:number, de:(number|null), Se:number}} factors, effective
 *   diameter (null for axial) and Se in MPa
 */
export function enduranceLimit({
  Sut,
  finish,
  load = 'bending',
  d,
  rotating = true,
  de,
  tempC,
  reliability = 0.5,
  kMisc = 1,
}) {
  const SePrime = uncorrectedEnduranceLimit(Sut);
  const ka = surfaceFactor(finish, Sut);
  const kc = loadFactor(load);
  const kd = temperatureFactor(tempC);
  const ke = reliabilityFactor(reliability);

  let kb = 1;
  let effectiveDiameter = null;
  if (normaliseKey(load) !== 'axial') {
    if (d !== undefined && de !== undefined) {
      throw new RangeError('Provide either d or de, not both');
    }
    if (d === undefined && de === undefined) {
      throw new RangeError('A diameter is required for bending and torsion: provide d or de');
    }
    effectiveDiameter = de !== undefined
      ? requirePositive('de', de)
      : equivalentDiameterRound(d, rotating);
    kb = sizeFactor(effectiveDiameter);
  }

  const Se = correctedEnduranceLimit(SePrime, { ka, kb, kc, kd, ke, kMisc });
  return { SePrime, ka, kb, kc, kd, ke, kMisc, de: effectiveDiameter, Se };
}
