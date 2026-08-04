# devindex packages

Monorepo for the `@devindex` packages, managed with [npm workspaces](https://docs.npmjs.com/cli/using-npm/workspaces) and [Changesets](https://github.com/changesets/changesets).

## Packages

| Package | Description |
| --- | --- |
| [`@devindex/utils`](packages/utils) | A collection of pure ESM JavaScript utility functions |
| [`@devindex/mongoose-kit`](packages/mongoose-kit) | Mongoose model builder and helpers |

## Development

```bash
npm install   # install dependencies and link workspaces
npm test      # run tests for all packages
```

To run a script for a single package, use the `-w` flag from the root:

```bash
npm test -w @devindex/utils
```

## Making changes

Every change that should be published needs a changeset describing it:

```bash
npx changeset
```

The CLI asks which packages are affected, the bump type (`patch`, `minor` or `major`) and a summary. The summary becomes the package's CHANGELOG entry, so write it for consumers of the package. Commit the generated `.changeset/*.md` file together with the change.

Guidelines for the bump type:

- `patch` — bug fixes, no API change
- `minor` — new exports or features, backwards compatible (including deprecations)
- `major` — breaking changes (removed or renamed exports, changed behavior)

## Releasing

```bash
npm run version                              # apply pending changesets: bump versions + update CHANGELOGs
git add -A && git commit -m "chore: version packages"
npm run release                              # run tests, then publish changed packages to npm
git push --follow-tags
```

`npm run release` publishes with public access and creates one git tag per package (e.g. `@devindex/utils@1.1.0`). Publishing requires being logged in to npm (`npm whoami` to check).
