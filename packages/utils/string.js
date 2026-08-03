/**
 * Convert a hexadecimal string to Base64.
 * @param {string} str - Hex-encoded string
 * @returns {string}
 */
export function hexToBase64(str) {
  if (!str) return '';
  const bytes = new Uint8Array(Math.ceil(str.length / 2));
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(str.substring(i * 2, i * 2 + 2), 16);
  }
  const binString = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
  return globalThis.btoa(binString);
}

/**
 * Convert a Base64 string to hexadecimal.
 * @param {string} str - Base64-encoded string
 * @returns {string}
 */
export function base64ToHex(str) {
  if (!str) return '';
  const binString = globalThis.atob(str);
  const bytes = new Uint8Array(binString.length);
  for (let i = 0; i < binString.length; i++) {
    bytes[i] = binString.charCodeAt(i);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Remove all non-digit characters from a value.
 * @param {string|number} value - The value to sanitize
 * @param {string} [defaultValue=''] - Fallback if result is empty
 * @returns {string}
 */
export function sanitizeDigits(value, defaultValue = '') {
  switch (typeof value) {
    case 'string':
      value = value.replace(/\D/g, '');
      return value === '' ? defaultValue : value;
    case 'number':
      return value.toString();
    default:
      return defaultValue;
  }
}

/**
 * Remove non-alphanumeric characters, replacing them with spaces.
 * @param {string} text - The input text
 * @returns {string}
 */
export function sanitizeChars(text) {
  return text ? text.replace(/[^a-zA-Z0-9]/g, ' ').trim() : '';
}

/**
 * Remove diacritical marks (accents) from a string.
 * @param {string} text - The input text
 * @returns {string}
 */
export function removeAccents(text) {
  return text ? text.normalize('NFD').replace(/[\u0300-\u036f]/g, '') : '';
}

/**
 * Escape special regular expression characters in a string.
 * @param {string} str - The input string
 * @returns {string}
 */
export function escapeRegex(str) {
  return str ? str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : '';
}

/**
 * Capitalize the first letter of a single word.
 * @param {string} word - The word to capitalize
 * @returns {string}
 */
export function capitalizeWord(word) {
  if (typeof word !== 'string') {
    return '';
  }

  if (['(', '['].includes(word.charAt(0))) {
    return `${word.charAt(0)}${word.charAt(1).toUpperCase()}${word.substring(2)}`;
  }

  return word.charAt(0).toUpperCase() + word.substring(1);
}

/**
 * Capitalize each word in a string, with optional terms to skip.
 * @param {string} value - The input string
 * @param {string[]} [skipTerms=[]] - Terms to keep lowercase (except first word)
 * @returns {string}
 */
export function capitalize(value, skipTerms = []) {
  if (typeof value !== 'string') {
    return '';
  }

  const parsedSkipTerms = Array.isArray(skipTerms)
    ? skipTerms.map((term) => term.toLowerCase())
    : [];

  const normalizeSubParts = (part, separator) => (
    part
      .split(separator)
      .map((sub) => (sub ? capitalizeWord(sub) : ''))
      .join(separator)
  );

  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((part, i) => {
      if (i > 0 && parsedSkipTerms.includes(part)) {
        return part;
      }

      if (part.includes('-')) {
        return normalizeSubParts(part, '-');
      }
      if (part.includes('\'')) {
        return normalizeSubParts(part, '\'');
      }

      return capitalizeWord(part);
    })
    .join(' ');
}

/**
 * Capitalize a Brazilian name, skipping common Portuguese prepositions.
 * @param {string} value - The name to capitalize
 * @returns {string}
 */
export function capitalizeNameBR(value) {
  return capitalize(value, [
    'da', 'de', 'do', 'das', 'dos', 'e', 'em', 'ou', 'no', 'na', 'c/', 's/',
  ]);
}

/**
 * Capitalize only the first letter of the string.
 * @param {string} value - The input string
 * @returns {string}
 */
export function capitalizeFirst(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value
    .replace(/\s{2,}/g, ' ')
    .toLowerCase()
    .split('(')
    .map((part) => capitalizeWord(part.toLowerCase()))
    .join('(')
    .replace(/[a-z]/, (char) => char.toUpperCase());
}

/**
 * Convert a string into a URL-friendly slug.
 * @param {string} value - The input string
 * @returns {string} The slug, or an empty string for non-string input
 */
export function slugify(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return removeAccents(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Truncate a string, appending an ellipsis when it exceeds the limit.
 * @param {string} value - The input string
 * @param {number} max - Maximum length of the output, ellipsis included
 * @returns {string} The truncated string, or an empty string for non-string input
 */
export function truncate(value, max) {
  if (typeof value !== 'string') {
    return '';
  }

  if (!Number.isFinite(max) || max < 1 || value.length <= max) {
    return value;
  }

  return `${value.slice(0, max - 1).replace(/[\uD800-\uDBFF]$/, '')}…`;
}

/**
 * Parse and normalize a Brazilian phone number, adding area code and 9th digit when needed.
 * @param {string|number} phone - The phone number
 * @param {string} [defaultDDD='00'] - Default area code (DDD)
 * @returns {string}
 */
export function parsePhoneBR(phone, defaultDDD = '00') {
  if (!phone) return '';

  phone = phone.toString();

  let ddd = defaultDDD;

  if (phone.length > 5 && phone.length <= 9) {
    if (phone.length === 9 && !/^..[6-9]/.test(phone)) {
      ddd = phone.substring(0, 2);
      phone = `${ddd}3${phone.substring(2)}`;
    } else {
      phone = ddd + phone;
    }
  }

  if (phone.length === 10 && /^..[6-9]/.test(phone)) {
    ddd = phone.substring(0, 2);
    phone = `${ddd}9${phone.substring(2)}`;
  }
  return phone;
}
