/**
 * Parse command-line arguments (--key=value) into an object.
 * @returns {Object<string, string>}
 */
export function getArgs() {
  return process.argv.slice(2)
    .reduce((result, arg) => {
      const [key, value = ''] = arg.replace('--', '').split('=');
      result[key] = value;
      return result;
    }, {});
}

/**
 * Execute an async function, log any errors, and exit the process.
 * @param {Function} fn - Async function to execute
 * @returns {void}
 */
export function execute(fn) {
  (async () => {
    try {
      await fn();
    } catch (e) {
      console.error(e);
    }
    process.exit();
  })();
}
