# @devindex/utils

## 1.2.1

### Patch Changes

- Fix `capitalizeFirst`, which uppercased the second letter too (`'hello world'` became `'HEllo world'`). It now capitalizes only the first letter, accented letters included, and no longer the one after `(`. `capitalizeNameBR` keeps `com` lowercase.

## 1.2.0

### Minor Changes

- Add slugify and truncate to the string module

## 1.1.0

### Minor Changes

- Add `boolean.toBoolean` (renaming `parse`, kept as a deprecated alias to be removed in the next major) and a full HTTP client API in `http`: `request` with `responseType` support, plus `get`, `post`, `put`, `patch` and `del` helpers (`del` also exported as `delete` for namespaced usage).
