const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace'];

export const noopLogger = Object.freeze({
  ...Object.fromEntries(LOG_LEVELS.map((level) => [level, () => {}])),
  child: () => noopLogger,
});
