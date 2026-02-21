/**
 * Round a number to a given decimal precision.
 * @param {number} value - The number to round
 * @param {number} [precision=2] - Number of decimal places
 * @returns {number}
 */
export function round(value, precision = 2) {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}
