import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AuthError,
  ConflictError,
  DomainError,
  ERROR_CODE,
  ERROR_CODES,
  ForbiddenError,
  isDomainError,
  LimitError,
  MethodNotAllowedError,
  NotFoundError,
  PayloadError,
  TooManyRequestsError,
  UnavailableError,
  ValidationError,
} from '../errors/index.js';

// Each subtype with the code it pins and its default message. The last test
// fails if a subtype or a code is added without landing here.
const SUBTYPES = [
  [ValidationError, ERROR_CODE.VALIDATION_ERROR, 'Validation failed'],
  [AuthError, ERROR_CODE.UNAUTHORIZED, 'Unauthorized'],
  [ForbiddenError, ERROR_CODE.FORBIDDEN, 'Forbidden'],
  [NotFoundError, ERROR_CODE.NOT_FOUND, 'Not found'],
  [MethodNotAllowedError, ERROR_CODE.METHOD_NOT_ALLOWED, 'Method not allowed'],
  [ConflictError, ERROR_CODE.CONFLICT, 'Conflict'],
  [LimitError, ERROR_CODE.LIMIT_REACHED, 'Limit reached'],
  [PayloadError, ERROR_CODE.PAYLOAD_TOO_LARGE, 'Payload too large'],
  [TooManyRequestsError, ERROR_CODE.TOO_MANY_REQUESTS, 'Too many requests'],
  [UnavailableError, ERROR_CODE.UNAVAILABLE, 'Service unavailable'],
];

test('every subtype carries its own code, name and default message', () => {
  for (const [Subtype, code, message] of SUBTYPES) {
    const error = new Subtype();

    assert.equal(error.code, code, Subtype.name);
    assert.equal(error.name, Subtype.name);
    assert.equal(error.message, message, Subtype.name);
    assert.ok(error instanceof DomainError, `${Subtype.name} extends DomainError`);
    assert.ok(error instanceof Error, `${Subtype.name} is an Error`);
    assert.ok(isDomainError(error), `${Subtype.name} is branded`);
  }
});

test('a subtype pins its code — `options.code` cannot move it', () => {
  const error = new ConflictError('already exists', { code: ERROR_CODE.NOT_FOUND });

  assert.equal(error.code, ERROR_CODE.CONFLICT);
});

test('the base error defaults to DOMAIN_ERROR and empty details', () => {
  const error = new DomainError('something is off');

  assert.equal(error.code, ERROR_CODE.DOMAIN_ERROR);
  assert.deepEqual(error.details, []);
  assert.equal(error.cause, undefined);
  // A hoisted default would let one error's details leak into every other.
  assert.notEqual(error.details, new DomainError('and another').details);
});

test('status is opt-in, and absent when nobody asked for one', () => {
  const withStatus = new DomainError('card declined', { code: 'PAYMENT_DECLINED', status: 402 });
  const without = new DomainError('ledger drift', { code: 'RECONCILIATION_FAILED' });

  assert.equal(withStatus.status, 402);
  // Not `undefined` but missing: a worker-only error keeps HTTP out of its logs.
  assert.equal(Object.hasOwn(without, 'status'), false);
});

test('a subtype pins its code but not its status', () => {
  const error = new NotFoundError('order archived', { status: 410 });

  assert.equal(error.code, ERROR_CODE.NOT_FOUND);
  assert.equal(error.status, 410);
});

test('details and cause survive', () => {
  const cause = new Error('duplicate key');
  const error = new ConflictError('already exists', {
    details: [{ field: 'email' }],
    cause,
  });

  assert.deepEqual(error.details, [{ field: 'email' }]);
  assert.equal(error.cause, cause);
});

test('the stack starts at the throw site, not inside the constructor', () => {
  const [firstFrame] = new NotFoundError('user').stack.split('\n').slice(1);

  assert.match(firstFrame, /errors\.test\.js/);
});

test('what is not a domain error stays not one', () => {
  for (const value of [new Error('boom'), new TypeError('boom'), null, undefined, 'CONFLICT', 42, {}]) {
    assert.equal(isDomainError(value), false, String(value));
  }
});

// Unbranded, this is the case where the handler answers 500 for a real 409.
// The key is spelled out rather than imported: it is published API, and another
// package may brand its own errors with it.
test('the brand crosses a second copy of the package, where instanceof fails', () => {
  const brand = Symbol.for('@devindex/api-kit/DomainError');
  class ForeignDomainError extends Error {
    constructor(message, code) {
      super(message);
      this.code = code;
      this.details = [];
      Object.defineProperty(this, brand, { value: true });
    }
  }

  const foreign = new ForeignDomainError('already exists', ERROR_CODE.CONFLICT);

  assert.equal(foreign instanceof DomainError, false);
  assert.ok(isDomainError(foreign));
});

test('the brand never reaches a log line or a response body', () => {
  const error = new ConflictError('already exists', { details: [{ field: 'email' }] });

  assert.deepEqual(Object.keys(error), ['name', 'code', 'details']);
  assert.deepEqual(Object.getOwnPropertySymbols({ ...error }), []);
  assert.equal(
    JSON.stringify({ ...error }),
    '{"name":"ConflictError","code":"CONFLICT","details":[{"field":"email"}]}',
  );
});

test('ERROR_CODES mirrors ERROR_CODE, and both are frozen', () => {
  assert.deepEqual([...ERROR_CODES].sort(), Object.values(ERROR_CODE).sort());
  assert.ok(Object.isFrozen(ERROR_CODE));
  assert.ok(Object.isFrozen(ERROR_CODES));
});

test('every code is either thrown by a subtype or produced by the handler', () => {
  const thrown = SUBTYPES.map(([, code]) => code);
  // The base's default, and the handler's catch-all.
  const handlerOwned = [ERROR_CODE.DOMAIN_ERROR, ERROR_CODE.INTERNAL_ERROR];

  assert.deepEqual([...thrown, ...handlerOwned].sort(), [...ERROR_CODES].sort());
});
