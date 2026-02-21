/**
 * Generate a random hexadecimal string.
 * @param {number} [size=10] - Length of the resulting hex string
 * @returns {string}
 */
export function random(size = 10) {
  const bytes = new Uint8Array(size / 2);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Encode a string to Base64.
 * @param {string} str - The input string to encode
 * @returns {string}
 */
export function btoa(str) {
  return globalThis.btoa(str);
}

/**
 * Decode a Base64 string to its binary representation.
 * @param {string} str - Base64-encoded string
 * @returns {string}
 */
export function atob(str) {
  return globalThis.atob(str);
}
