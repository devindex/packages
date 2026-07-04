# @devindex/utils

A collection of JavaScript utility functions for any runtime.

## Installation

```bash
npm install @devindex/utils
```

## Usage

```js
// Import a specific module
import { array, string, crypto } from '@devindex/utils';

array.first([1, 2, 3]); // 1
string.capitalize('hello world'); // "Hello World"
crypto.random(); // "a1b2c3d4e5"

// Or import directly from a module
import { first, last } from '@devindex/utils/array';
import { capitalize } from '@devindex/utils/string';
```

## Modules

### array

- `asyncForEach(array, callback)` — async iteration
- `sortBy(items, field, desc?)` — sort array of objects by field
- `first(items, defaultValue?)` — first element or default
- `last(items, defaultValue?)` — last element or default
- `ensureArray(items, defaultValue?)` — return array or default
- `hasItems(items)` — check if array has elements

### boolean

- `toBoolean(value)` — convert value to boolean (`'true'`, `'yes'`, `'1'`, `1` → `true`)
- `parse(value)` — deprecated alias of `toBoolean`, will be removed in the next major version

### crypto

- `random(size?)` — random hex string
- `btoa(str)` — base64 encode
- `atob(str)` — base64 decode
- `md5(str)` — MD5 hash

### env

- `getValue(name, defaults?)` — get env variable with fallback

### http

- `normalizeURLProtocol(url)` — prepend `https:` to protocol-relative URLs
- `getAsArrayBuffer(url, options?)` — fetch URL as ArrayBuffer
- `getPDFAsArrayBuffer(url)` — fetch PDF as ArrayBuffer
- `getImageAsArrayBuffer(url)` — fetch image as ArrayBuffer

### number

- `round(value, precision?)` — round to precision

### object

- `fillFields(fields, source, target)` — copy specific fields from source to target
- `isEmpty(obj)` — check if object has no keys
- `replaceProperty(obj, from, to)` — rename a single property
- `replaceProperties(obj, props)` — rename multiple properties

### stream

- `toBuffer(stream)` — convert readable stream to Buffer

### string

- `hexToBase64(str)` / `base64ToHex(str)` — encoding conversion
- `sanitizeDigits(value, defaultValue?)` — extract digits only
- `sanitizeChars(text)` — remove special characters
- `removeAccents(text)` — remove diacritics
- `escapeRegex(str)` — escape regex special chars
- `capitalize(value, skipTerms?)` — capitalize words
- `capitalizeWord(word)` — capitalize single word
- `capitalizeNameBR(value)` — capitalize Brazilian names
- `capitalizeFirst(value)` — capitalize first letter only
- `parsePhoneBR(phone, defaultDDD?)` — normalize Brazilian phone

### terminal

- `getArgs()` — parse CLI arguments
- `execute(fn)` — run async function with error handling

## License

MIT
