const LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace'];

// A tiny structured logger with the shape the kit expects (level methods +
// child). A real service passes a pino instance instead; the sample avoids the
// extra dependency so it runs with nothing installed.
function createLogger(bindings = {}) {
  const emit = (level) => (first, second) => {
    const [fields, msg] = typeof first === 'string' ? [{}, first] : [first, second];
    process.stdout.write(`${JSON.stringify({ level, ...bindings, ...fields, ...(msg ? { msg } : {}) })}\n`);
  };
  const logger = Object.fromEntries(LEVELS.map((level) => [level, emit(level)]));
  logger.child = (extra) => createLogger({ ...bindings, ...extra });
  return logger;
}

export const logger = createLogger();
