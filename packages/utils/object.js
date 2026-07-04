/**
 * Fill specific fields from the source object to the target object.
 * @param {string[]} fields - Fields
 * @param {Object} source - Source object
 * @param {Object} target - Target object
 * @returns {Object}
 */
export function fillFields(fields, source, target) {
  fields.forEach((field) => {
    if (field in source) {
      target[field] = source[field];
    }
  });
  return target;
}

/**
 * Check if an object has no own enumerable properties.
 * @param {Object} obj - The object to check
 * @returns {boolean}
 */
export function isEmpty(obj) {
  return Object.keys(obj || {}).length === 0;
}

/**
 * Replace Object Property
 * @param {Object} obj - Object to replace property
 * @param {String} from - Property to replace
 * @param {String} to - Property to replace with
 * @returns {Object}
 */
export function replaceProperty(obj, from, to) {
  if (from in obj) {
    if (!(to in obj)) {
      obj[to] = obj[from];
    }
    delete obj[from];
  }
  return obj;
}

/**
 * Replace Object Properties
 * @param {Object} obj - Object to replace properties
 * @param {{from: String, to: String}[]} props - Properties to replace
 * @returns {Object}
 */
export function replaceProperties(obj, props) {
  props.forEach(({ from, to }) => {
    obj = replaceProperty(obj, from, to);
  });
  return obj;
}
