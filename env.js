/**
 * Get the value of an environment variable, with optional per-environment defaults.
 * @param {string} name - Environment variable name
 * @param {string|Object<string, string>} [defaults={}] - Fallback value or NODE_ENV → value map
 * @returns {string|null}
 */
export function getValue(name, defaults = {}) {
  const { env } = process;
  if (env[name]) {
    return env[name];
  }

  if (defaults) {
    if (typeof defaults === 'string') {
      return defaults;
    }

    const mode = env.NODE_ENV;
    if (mode in defaults) {
      return defaults[mode];
    }

    if ('default' in defaults) {
      return defaults.default;
    }
  }

  return null;
}
