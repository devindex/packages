# @devindex/mongoose-kit

## 1.0.0

### Major Changes

- First release of `@devindex/mongoose-kit`: the `ModelBuilder` extracted from
  `@devindex/node-api`, plus the Mongoose serialization and database helpers that lived
  alongside it.

  - `ModelBuilder` — schema/model builder with `private: true` field hiding, `subSchema`,
    `baseSchemaDefinition()`/`prepareSchemaDefinition()` extension points and a JSON handler.
    The collection name is now an explicit `collection` schema option (`collectionName()`,
    exported) instead of a global `mongoose.pluralize()` call, and schemas default to
    `autoIndex: false` / `autoCreate: false` so the package never depends on who owns the
    connection. The deprecated `simpleSchema` did not come along.
  - `serialize` — `buildToObjectOptions`, `isModified` and the new `capturePreSaveState`
    plugin, which snapshots `isNew`, `modifiedPaths()` and `directModifiedPaths()` into
    `$locals` before the write so post-save hooks can still read them. It is what makes
    `isModified` actually report changes, and it backs the new `wasNew(doc)` — whether that
    save was an insert — and `isDirectModified(doc, paths)` — whether a path was set directly,
    rather than marked modified because a child of it changed. Applied by default on models,
    never on `subSchema`; opt out with `capturePreSaveState: false` on the `ModelBuilder`
    constructor.
  - `helpers` — `isObjectId` (strict, round-trip), `toObjectId`, `isUUID` (now any version 1–8
    per RFC 9562, UUIDv7 included), `isDuplicateKeyError`, `duplicateKeyFields`.
