export function assertName(name, subject = 'job') {
  if (typeof name !== 'string' || name.trim().length === 0) {
    throw new TypeError(`a ${subject} needs a non-empty name`);
  }
  return name.trim();
}

export function assertKey(key) {
  if (typeof key !== 'string' || key.length === 0) {
    throw new TypeError(`a \`key\` must be a non-empty string, got ${typeof key === 'string' ? "''" : typeof key}`);
  }
  return key;
}

export function assertHandler(name, handler) {
  if (typeof handler !== 'function') {
    throw new TypeError(`the handler for "${name}" must be a function`);
  }
  return handler;
}

export function assertPositiveInt(label, value) {
  if (!Number.isInteger(value) || value < 1) {
    throw new TypeError(`${label} must be an integer >= 1, got ${value}`);
  }
  return value;
}

export function assertDuration(label, value) {
  if (!Number.isInteger(value) || value < 0) {
    throw new TypeError(`${label} must be an integer >= 0 milliseconds, got ${value}`);
  }
  return value;
}
