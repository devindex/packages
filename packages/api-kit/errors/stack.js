import { sep } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Strips the machine-specific prefix from every frame of a stack trace, leaving
 * each path relative to `cwd`. Node-internal (`node:…`) frames and anything
 * outside `cwd` are left as-is.
 *
 * @param {string} stack - An `Error.stack` string. Non-strings pass through.
 * @param {object} [options]
 * @param {string} [options.cwd=process.cwd()]
 * @return {string} The stack with absolute repo paths relativized.
 */
export function cleanStack(stack, { cwd = process.cwd() } = {}) {
  if (typeof stack !== 'string') return stack;
  const base = cwd.endsWith(sep) ? cwd : cwd + sep;
  // ESM frames render file URLs (`file:///…`), CJS frames render plain paths.
  // The URL form embeds the plain path, so it must be stripped first.
  const fileUrlBase = pathToFileURL(base).href;
  return stack.replaceAll(fileUrlBase, '').replaceAll(base, '');
}
