/**
 * Builds `toObject`/`toJSON` options that expose `_id` as the string `id`, drop hidden
 * fields and optionally hand the result to a custom handler.
 *
 * @param {Object} [options={}] - Extra mongoose options, merged last, so they win over
 *  the defaults (`getters: true`, `virtuals: false`, `versionKey: false`).
 * @param {Object} [params={}] - Transform parameters.
 * @param {string|string[]} [params.hide] - Fields removed from the output. Overridable per
 *  call through `opts.hide` on `toObject`/`toJSON`.
 * @param {Function} [params.handler] - Receives `(doc, result, opts)` and returns the
 *  payload to serialize, replacing the default result.
 * @return {Object} Options accepted by `schema.set('toJSON', ...)` and `set('toObject', ...)`.
 */
export function buildToObjectOptions(options = {}, params = {}) {
  const hide = [].concat(params.hide || []).filter(Boolean);
  const { handler } = params;

  return {
    getters: true,
    virtuals: false,
    versionKey: false,
    transform: (doc, ret, opts) => {
      const result = { ...ret };

      if (doc._id) {
        result.id = doc._id.toString();
      }

      const hideFields = Array.isArray(opts?.hide) ? opts.hide : hide;
      hideFields.forEach((field) => delete result[field]);

      return typeof handler === 'function' ? handler(doc, result, opts) : result;
    },
    ...options,
  };
}

/**
 * Schema plugin that snapshots into `$locals`, before the write, the state mongoose resets
 * once it succeeds: `wasNew` (the key mongoose documents for this idiom), `modifiedPaths`
 * and `directModifiedPaths`. Post-save hooks read them back through `wasNew`, `isModified`
 * and `isDirectModified`, which return `false` for every document saved without it.
 *
 * `ModelBuilder` applies it by default.
 *
 * @param {import('mongoose').Schema} schema - The schema to extend.
 * @return {void}
 */
export function capturePreSaveState(schema) {
  schema.pre('save', function capturePreSaveStateHook() {
    this.$locals.wasNew = this.isNew;
    this.$locals.modifiedPaths = this.modifiedPaths();
    this.$locals.directModifiedPaths = this.directModifiedPaths();
  });
}

/**
 * Matches one of the captured path lists against the paths asked about.
 *
 * @param {string[]|undefined} captured - The captured list, absent without the plugin.
 * @param {string|string[]} value - Path or paths to look for.
 * @return {boolean} True when the list holds at least one of them.
 */
function matchesCapturedPaths(captured, value) {
  if (!captured) return false;
  const values = Array.isArray(value) ? value : [value];
  return captured.some((path) => values.includes(path));
}

/**
 * Checks whether the save that produced `doc` was an insert rather than an update, which
 * `doc.isNew` can no longer answer by the time post-save hooks run.
 * Requires the `capturePreSaveState` plugin on the schema.
 *
 * @param {import('mongoose').Document} doc - The saved document.
 * @return {boolean} True when the document was inserted.
 */
export function wasNew(doc) {
  return doc.$locals?.wasNew === true;
}

/**
 * Checks whether any of the given paths changed in the save that produced `doc`. A nested
 * path counts as modified when a child of it changed.
 * Requires the `capturePreSaveState` plugin on the schema.
 *
 * @param {import('mongoose').Document} doc - The saved document.
 * @param {string|string[]} value - Path or paths to check.
 * @return {boolean} True when at least one path was modified.
 */
export function isModified(doc, value) {
  return matchesCapturedPaths(doc.$locals?.modifiedPaths, value);
}

/**
 * Same question as `isModified`, restricted to the paths that were set directly: writing
 * `contact.email` marks `contact` as modified, but only `contact.email` as directly modified.
 * Requires the `capturePreSaveState` plugin on the schema.
 *
 * @param {import('mongoose').Document} doc - The saved document.
 * @param {string|string[]} value - Path or paths to check.
 * @return {boolean} True when at least one path was set directly.
 */
export function isDirectModified(doc, value) {
  return matchesCapturedPaths(doc.$locals?.directModifiedPaths, value);
}
