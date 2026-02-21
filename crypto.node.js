import crypto from 'node:crypto';

export { random, btoa, atob } from './crypto.js';

/**
 * Compute the MD5 hash of a string.
 * @param {string} str - The input string
 * @returns {string} MD5 hex digest
 */
export function md5(str) {
  return crypto.createHash('md5').update(str).digest('hex');
}
