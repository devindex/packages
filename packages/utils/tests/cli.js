import * as array from '../array.js';
import * as boolean from '../boolean.js';
import * as baseCrypto from '../crypto.js';
import * as nodeCrypto from '../crypto.node.js';
import * as env from '../env.js';
import * as http from '../http.js';
import * as number from '../number.js';
import * as object from '../object.js';
import * as string from '../string.js';
import * as terminal from '../terminal.js';

let totalTests = 0;
let passedTests = 0;

function assertEq(actual, expected) {
  if (actual !== expected) throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

async function runTest(name, testFn) {
  totalTests++;
  try {
    await testFn();
    console.log(`✅ PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`❌ FAIL: ${name}`);
    console.error(`   ${err.message}`);
  }
}

async function runAllTests() {
  console.log('--- ARRAY ---');
  await runTest('first([1, 2, 3])', () => assertEq(array.first([1, 2, 3]), 1));
  await runTest('last([1, 2, 3])', () => assertEq(array.last([1, 2, 3]), 3));
  await runTest('ensureArray(1)', () => assertEq(JSON.stringify(array.ensureArray(1)), '[]'));
  await runTest('hasItems([])', () => assertEq(array.hasItems([]), false));

  console.log('\n--- BOOLEAN ---');
  await runTest('parse("yes")', () => assertEq(boolean.parse('yes'), true));
  await runTest('parse("1")', () => assertEq(boolean.parse('1'), true));

  console.log('\n--- CRYPTO (Cross-Platform) ---');
  await runTest('random(10)', () => assertEq(baseCrypto.random(10).length, 10));
  await runTest('btoa() / atob()', () => assertEq(baseCrypto.atob(baseCrypto.btoa('hello')), 'hello'));

  console.log('\n--- CRYPTO (Node.js/Bun/Deno) ---');
  await runTest('md5("hello")', () => assertEq(nodeCrypto.md5('hello'), '5d41402abc4b2a76b9719d911017c592'));

  console.log('\n--- ENV ---');
  await runTest('getValue(fallback)', () => assertEq(env.getValue('DOES_NOT_EXIST', 'fallback'), 'fallback'));

  console.log('\n--- NUMBER ---');
  await runTest('round(10.1234, 2)', () => assertEq(number.round(10.1234, 2), 10.12));

  console.log('\n--- OBJECT ---');
  await runTest('isEmpty({})', () => assertEq(object.isEmpty({}), true));
  await runTest('replaceProperty()', () => {
    const obj = { a: 1 };
    object.replaceProperty(obj, 'a', 'b');
    assertEq(JSON.stringify(obj), JSON.stringify({ b: 1 }));
  });

  console.log('\n--- STRING ---');
  await runTest('hexToBase64() / base64ToHex()', () => {
    const hex = '48656c6c6f20576f726c64';
    const b64 = 'SGVsbG8gV29ybGQ=';
    assertEq(string.hexToBase64(hex), b64);
    assertEq(string.base64ToHex(b64), hex);
  });
  await runTest('sanitizeDigits("a1b2c3")', () => assertEq(string.sanitizeDigits('a1b2c3'), '123'));
  await runTest('capitalize("hello world")', () => assertEq(string.capitalize('hello world'), 'Hello World'));

  console.log('\n--- TERMINAL ---');
  await runTest('getArgs runs', () => { terminal.getArgs(); });

  console.log('\n=======================================');
  console.log(`Results: ${passedTests}/${totalTests} passed`);
  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runAllTests();
