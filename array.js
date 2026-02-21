/**
 * Iterate over an array asynchronously, awaiting each callback in sequence.
 * @param {Array} array - The array to iterate over
 * @param {Function} callback - Async function called with (item, index, array)
 * @returns {Promise<void>}
 */
export async function asyncForEach(array, callback) {
  for (let i = 0; i < array.length; i++) {
    await callback(array[i], i, array);
  }
}

/**
 * Sort an array of objects by a specific field.
 * @param {Object[]} items - Array of objects to sort
 * @param {string} field - Field name to sort by
 * @param {boolean} [desc=false] - Sort in descending order
 * @returns {Object[]}
 */
export function sortBy(items, field, desc = false) {
  return items.sort((a, b) => {
    if (a[field] > b[field]) return desc ? -1 : 1;
    if (a[field] < b[field]) return desc ? 1 : -1;
    return 0;
  });
}

/**
 * Get the first element of an array, or a default value if empty.
 * @param {Array} items - The array
 * @param {*} [defaultValue=null] - Value to return if array is empty or invalid
 * @returns {*}
 */
export function first(items, defaultValue = null) {
  return Array.isArray(items) && items.length > 0
    ? items[0]
    : defaultValue;
}

/**
 * Get the last element of an array, or a default value if empty.
 * @param {Array} items - The array
 * @param {*} [defaultValue=null] - Value to return if array is empty or invalid
 * @returns {*}
 */
export function last(items, defaultValue = null) {
  return Array.isArray(items) && items.length > 0
    ? items[items.length - 1]
    : defaultValue;
}

/**
 * Return the value if it is an array, otherwise return a default array.
 * @param {*} items - The value to check
 * @param {Array} [defaultValue=[]] - Fallback array
 * @returns {Array}
 */
export function ensureArray(items, defaultValue = []) {
  return Array.isArray(items) ? items : defaultValue;
}

/**
 * Check if a value is a non-empty array.
 * @param {*} items - The value to check
 * @returns {boolean}
 */
export function hasItems(items) {
  return Array.isArray(items) && items.length > 0;
}
