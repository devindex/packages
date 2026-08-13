import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { cleanStack } from '../errors/index.js';

test('relativizes both file:// and plain-path frames, leaving node: frames alone', () => {
  const cwd = '/repo/app';
  const fileUrl = pathToFileURL(`${cwd}/`).href;
  const stack = [
    'Error: boom',
    `    at handler (${fileUrl}http/plugins/errorHandler.js:88:15)`,
    `    at Object.<anonymous> (${cwd}/internal/retry.js:10:5)`,
    '    at process.processTicksAndRejections (node:internal/process/task_queues:95:5)',
  ].join('\n');

  const cleaned = cleanStack(stack, { cwd });

  assert.match(cleaned, /at handler \(http\/plugins\/errorHandler\.js:88:15\)/);
  assert.match(cleaned, /at Object\.<anonymous> \(internal\/retry\.js:10:5\)/);
  assert.match(cleaned, /node:internal\/process\/task_queues:95:5/, 'node: frames untouched');
  assert.doesNotMatch(cleaned, new RegExp(cwd));
});

test('a trailing separator on cwd does not double up', () => {
  const stack = `    at fn (${pathToFileURL('/repo/app/').href}a.js:1:1)`;
  assert.equal(cleanStack(stack, { cwd: '/repo/app/' }), '    at fn (a.js:1:1)');
});

test('non-string input passes through unchanged', () => {
  assert.equal(cleanStack(undefined), undefined);
  assert.equal(cleanStack(null), null);
});

test('a real error stack loses its absolute prefix but keeps the file', () => {
  const cleaned = cleanStack(new Error('x').stack);

  assert.match(cleaned, /tests\/stack\.test\.js/);
  assert.doesNotMatch(cleaned, new RegExp(process.cwd()));
});
