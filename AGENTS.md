# Conventions

Rules for anyone — human or agent — writing code in this repository.

## Keep it simple

Solve the problem in front of you, not the one you imagine arriving later.
The simplest thing that works is the target; reach for more only when a
concrete, present need forces it.

- No abstraction for a single caller. Wait for the second one to show its shape.
- No configuration option, hook or flag nobody asked for. YAGNI.
- No layer, wrapper or indirection that only forwards to the thing beneath it.
- No speculative generality — build for today's requirement, not a hypothetical.
- When two designs work, ship the one with fewer moving parts.

Prefer deleting code to adding it. If a change feels clever, it probably needs
a comment; if it needs a comment to be understood at all, it is probably too
clever.

## English, always

Source, comments, JSDoc, tests, commit messages, changesets and package
documentation are written in English, with no exceptions. Conversation with the
author may happen in any language; what lands in the repository does not.

## Native JavaScript, no TypeScript

Every package in this repository is written in plain, standards-based
JavaScript. TypeScript is not used — no `.ts` files, no compile step, no type
annotations in the source.

- Ship `.js` (or `.mjs`/`.cjs`) that runs as-is; never a build artifact.
- Express types through JSDoc, not syntax — that is what [JSDoc](#jsdoc) is for.
- No `tsconfig.json`, no `tsc`, no TypeScript-only syntax (`enum`, `interface`,
  `as`, parameter properties, type-only imports).

## Naming

Casing follows what a name *is*, not where it sits. Functions and variables are
`camelCase`; classes are `PascalCase`. A constant that names a fixed set — a
frozen enum-like object or a module-level literal — is `UPPER_SNAKE_CASE`, keys
included. A frozen "enum" is a constant, not a type, so it never takes a type's
casing.

- `export const LOG_TYPE = Object.freeze({ REQUEST: 'request' })`, like
  `ERROR_CODE` — never `LogType`.
- Pair a singular map with a plural for its values: `ERROR_CODE` holds the
  entries, `ERROR_CODES` is `Object.values(ERROR_CODE)`.

## Comments

A comment earns its place by explaining something the code cannot: why a
decision was made, what breaks without it, which alternative was rejected.

- Never restate what the line does. `// increments the counter` is noise.
- One or two lines. If it takes a paragraph, the design is the problem.
- Prefer the failure it prevents over the mechanism it describes — that is what
  stops the next reader from "simplifying" it away.
- Document the choice only where alternatives compete; obvious code stays bare.

```js
// Two copies of the package give the app two DomainError classes, and
// `instanceof` rejects the one it did not import. A registry symbol is shared.
const DOMAIN_ERROR_BRAND = Symbol.for('@devindex/api-kit/DomainError');
```

## JSDoc

JSDoc is the contract, not the essay. One summary line, then the parameters and
the return.

- Types, defaults, optionality and the return value — that is the payload.
- No `@param` for a parameter whose name and type already say everything.
- Skip the block entirely on a one-line function whose signature is self-evident.
- Keep prose out: rationale belongs in a comment, usage belongs in the README.

```js
/**
 * Whether the domain threw this on purpose. Use it over `instanceof`.
 *
 * @param {unknown} error - Anything, including `null` and non-objects.
 * @return {boolean} True for a DomainError from any copy of this package.
 */
```

## Commits

Conventional Commits, scoped by the package or module the change touches:
`feat(api-kit): add environment variable reader`. A release commit carries only
what `changeset version` wrote and names the tag it produces:
`chore(release): api-kit@0.2.0`.
