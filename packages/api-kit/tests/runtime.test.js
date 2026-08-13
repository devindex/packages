import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const runtimeUrl = new URL('../runtime/index.js', import.meta.url).href;

// onShutdown always calls process.exit, so it is exercised in a child that
// receives a real signal; the child's exit code and stdout are the assertions.
function runChild(script, onReady) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', script]);
    let stdout = '';
    let signalled = false;

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
      if (!signalled && stdout.includes('ready')) {
        signalled = true;
        onReady(child);
      }
    });
    child.on('error', reject);
    child.on('exit', (code) => resolve({ code, stdout }));
  });
}

const countOf = (haystack, needle) => haystack.split(needle).length - 1;

test('runs close on the signal and exits 0', async () => {
  const { code, stdout } = await runChild(
    `import { onShutdown } from '${runtimeUrl}';
     onShutdown(async (signal) => { process.stdout.write('closed:' + signal + '\\n'); });
     process.stdout.write('ready\\n');
     setInterval(() => {}, 1000);`,
    (child) => child.kill('SIGTERM'),
  );

  assert.equal(code, 0);
  assert.match(stdout, /closed:SIGTERM/);
});

test('a failing close exits 1', async () => {
  const { code } = await runChild(
    `import { onShutdown } from '${runtimeUrl}';
     onShutdown(async () => { throw new Error('boom'); }, { logger: { error() {} } });
     process.stdout.write('ready\\n');
     setInterval(() => {}, 1000);`,
    (child) => child.kill('SIGTERM'),
  );

  assert.equal(code, 1);
});

test('a second signal mid-drain does not run close twice', async () => {
  const { code, stdout } = await runChild(
    `import { onShutdown } from '${runtimeUrl}';
     onShutdown(async () => {
       await new Promise((resolve) => setTimeout(resolve, 100));
       process.stdout.write('closed\\n');
     });
     process.stdout.write('ready\\n');
     setInterval(() => {}, 1000);`,
    (child) => {
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGINT'), 20);
    },
  );

  assert.equal(code, 0);
  assert.equal(countOf(stdout, 'closed'), 1);
});
