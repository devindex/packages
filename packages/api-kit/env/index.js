/**
 * Reads environment variables, collecting every problem instead of failing on
 * the first one, so a misconfigured boot reports all of them at once.
 *
 * @param {Record<string, string|undefined>} [source=process.env]
 * @return {{str: Function, int: Function, oneOf: Function, issues: Function}}
 *   Frozen reader owning its own issue list.
 */
export function createEnvReader(source = process.env) {
  const issues = [];

  // An empty string is a variable someone left blank in a .env, not a value.
  function read(name, required) {
    const value = source[name];
    if (value === undefined || value === '') {
      if (required) issues.push(`${name} is required`);
      return null;
    }
    return value;
  }

  function str(name, { fallback = null, required = false } = {}) {
    return read(name, required) ?? fallback;
  }

  function int(name, { fallback = null, required = false } = {}) {
    const raw = read(name, required);
    if (raw === null) return fallback;
    const value = Number.parseInt(raw, 10);
    if (Number.isNaN(value)) {
      issues.push(`${name} must be an integer`);
      return fallback;
    }
    return value;
  }

  function oneOf(name, values, { fallback = null, required = false } = {}) {
    const raw = read(name, required);
    if (raw === null) return fallback;
    if (!values.includes(raw)) {
      issues.push(`${name} must be one of ${values.join(', ')}`);
      return fallback;
    }
    return raw;
  }

  // A copy: the caller merges these with its own cross-field checks, and must
  // not be able to edit the reader's list while doing it.
  return Object.freeze({ str, int, oneOf, issues: () => [...issues] });
}
