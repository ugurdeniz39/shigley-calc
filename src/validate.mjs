// Internal input-validation helpers. Every failure is a RangeError with a
// message that names the offending parameter, so callers can see what to fix.

/**
 * @param {string} name parameter name used in the error message
 * @param {unknown} value
 * @returns {number} the value, unchanged
 */
export function requireFinite(name, value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new RangeError(`${name} must be a finite number (got ${String(value)})`);
  }
  return value;
}

/**
 * @param {string} name
 * @param {unknown} value
 * @returns {number}
 */
export function requirePositive(name, value) {
  requireFinite(name, value);
  if (!(value > 0)) {
    throw new RangeError(`${name} must be greater than 0 (got ${value})`);
  }
  return value;
}

/**
 * @param {string} name
 * @param {unknown} value
 * @returns {number}
 */
export function requireNonNegative(name, value) {
  requireFinite(name, value);
  if (value < 0) {
    throw new RangeError(`${name} must not be negative (got ${value})`);
  }
  return value;
}

/**
 * @param {string} name
 * @param {unknown} value
 * @param {number} min inclusive lower bound
 * @returns {number}
 */
export function requireAtLeast(name, value, min) {
  requireFinite(name, value);
  if (value < min) {
    throw new RangeError(`${name} must be at least ${min} (got ${value})`);
  }
  return value;
}

/**
 * Normalise a user-supplied option name: trim, lower-case, spaces/underscores
 * become hyphens ("Hot Rolled" -> "hot-rolled").
 * @param {unknown} value
 * @returns {string}
 */
export function normaliseKey(value) {
  return String(value).trim().toLowerCase().replace(/[\s_]+/g, '-');
}
