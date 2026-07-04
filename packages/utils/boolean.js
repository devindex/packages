/**
 * Convert a value to boolean.
 * Strings `'true'`, `'yes'`, `'1'` and number `1` return `true`.
 * @param {*} value - The value to convert
 * @returns {boolean}
 */
export function toBoolean(value) {
  switch (typeof value) {
    case 'boolean':
      return value;
    case 'string':
      return ['true', 'yes', '1'].includes(value.toLowerCase());
    case 'number':
      return value === 1;
    default:
      return false;
  }
}

/**
 * @deprecated Use `toBoolean` instead. Will be removed in the next major version.
 */
export const parse = toBoolean;
