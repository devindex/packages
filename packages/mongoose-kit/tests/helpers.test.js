import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import {
  isObjectId,
  toObjectId,
  isUUID,
  isDuplicateKeyError,
  duplicateKeyFields,
} from '../helpers.js';

describe('isObjectId', () => {
  test('accepts a canonical hex string and an ObjectId instance', () => {
    const id = new mongoose.Types.ObjectId();

    assert.equal(isObjectId(id.toString()), true);
    assert.equal(isObjectId(id), true);
  });

  test('rejects the 12-byte values ObjectId.isValid reads as raw bytes', () => {
    // The round-trip is what makes this strict: `isValid` accepts anything it can
    // coerce into 12 bytes. Which values those are moved between mongoose 8 and 9
    // (12-char strings were dropped, buffers kept) — the round-trip covers both.
    const twelveBytes = Buffer.alloc(12);
    assert.equal(mongoose.Types.ObjectId.isValid(twelveBytes), true, 'premise');

    assert.equal(isObjectId(twelveBytes), false);
    assert.equal(isObjectId('abcdefghijkl'), false, '12-char string');
  });

  test('rejects junk', () => {
    assert.equal(isObjectId(''), false);
    assert.equal(isObjectId(null), false);
    assert.equal(isObjectId('not-an-id'), false);
  });
});

describe('toObjectId', () => {
  test('round-trips a hex string', () => {
    const hex = new mongoose.Types.ObjectId().toString();

    assert.equal(toObjectId(hex).toString(), hex);
  });
});

describe('isUUID', () => {
  test('accepts v4 and v7', () => {
    assert.equal(isUUID('f47ac10b-58cc-4372-a567-0e02b2c3d479'), true, 'v4');
    assert.equal(isUUID('018f6d2c-1a2b-7c3d-8e4f-5a6b7c8d9e0f'), true, 'v7');
  });

  test('rejects malformed values', () => {
    assert.equal(isUUID('f47ac10b58cc4372a5670e02b2c3d479'), false, 'no dashes');
    assert.equal(isUUID('f47ac10b-58cc-0372-a567-0e02b2c3d479'), false, 'version 0');
    assert.equal(isUUID('f47ac10b-58cc-4372-c567-0e02b2c3d479'), false, 'bad variant');
    assert.equal(isUUID(''), false);
    assert.equal(isUUID(null), false);
    assert.equal(isUUID(123), false);
  });
});

describe('duplicate key errors', () => {
  test('detects code 11000 directly and through cause', () => {
    assert.equal(isDuplicateKeyError({ code: 11000 }), true);
    assert.equal(isDuplicateKeyError({ cause: { code: 11000 } }), true);
    assert.equal(isDuplicateKeyError({ code: 121 }), false);
    assert.equal(isDuplicateKeyError(null), false);
  });

  test('reports the colliding fields, direct or wrapped', () => {
    assert.deepEqual(duplicateKeyFields({ keyPattern: { email: 1 } }), ['email']);
    assert.deepEqual(duplicateKeyFields({ cause: { keyPattern: { slug: 1, tenant: 1 } } }), ['slug', 'tenant']);
    assert.deepEqual(duplicateKeyFields({ code: 11000 }), []);
    assert.deepEqual(duplicateKeyFields(null), []);
  });
});
