import mongoose from 'mongoose';

const DUPLICATE_KEY = 11000;

// RFC 9562: version nibble 1–8, variant nibble 8/9/a/b.
const uuidRegExp = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Checks whether a value is a canonical ObjectId. The value has to round-trip, which
 * narrows `ObjectId.isValid` down: that one also accepts anything it can read as 12
 * raw bytes.
 *
 * @param {*} value - The value to check.
 * @return {boolean} True when the value is an ObjectId or its 24-character hex string.
 */
export function isObjectId(value) {
  return mongoose.Types.ObjectId.isValid(value)
    && String(new mongoose.Types.ObjectId(value)) === String(value);
}

/**
 * Builds an ObjectId from a hex string or an existing ObjectId.
 *
 * @param {string|import('mongoose').Types.ObjectId} value - The value to convert.
 * @return {import('mongoose').Types.ObjectId} The ObjectId instance.
 * @throws {Error} Throws if the value is not a valid ObjectId — guard with `isObjectId`.
 */
export function toObjectId(value) {
  return new mongoose.Types.ObjectId(value);
}

/**
 * Checks whether a value is a canonical UUID string, of any version from 1 to 8.
 *
 * @param {*} value - The value to check.
 * @return {boolean} True when the value is a well-formed UUID string.
 */
export function isUUID(value) {
  if (!value) return false;
  if (typeof value === 'string') {
    return value.length === 36 && uuidRegExp.test(value);
  }
  return false;
}

/**
 * Checks whether an error is a MongoDB duplicate key error (code 11000), raised directly
 * by the driver or wrapped by an application error.
 *
 * @param {*} error - The error to check.
 * @return {boolean} True when the error, or its `cause`, carries code 11000.
 */
export function isDuplicateKeyError(error) {
  return Boolean(error) && (error.code === DUPLICATE_KEY || error.cause?.code === DUPLICATE_KEY);
}

/**
 * Reads the field names that collided, so a duplicate can become a precise domain error.
 *
 * @param {*} error - The duplicate key error, wrapped or not.
 * @return {string[]} The colliding field names, empty when the error carries no key pattern.
 */
export function duplicateKeyFields(error) {
  const pattern = error?.keyPattern ?? error?.cause?.keyPattern;
  return pattern ? Object.keys(pattern) : [];
}
