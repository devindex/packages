# @devindex/mongoose-kit

Mongoose model builder and helpers, parameterized by data — every project decision stays in
the app. No connection, no global state, no HTTP.

## Installation

```bash
npm install @devindex/mongoose-kit
```

Requires `mongoose@>=8` as a peer dependency and Node `>=22`.

## Usage

```js
// Import from the package root
import { ModelBuilder, collectionName, serialize, helpers } from '@devindex/mongoose-kit';

// Or import directly from a module
import ModelBuilder from '@devindex/mongoose-kit/model';
import { buildToObjectOptions } from '@devindex/mongoose-kit/serialize';
import { isObjectId } from '@devindex/mongoose-kit/helpers';
```

## ModelBuilder

```js
const Document = ModelBuilder.createModel({
  name: 'ApiDocuments',            // → collection "apiDocuments"
  schema: {
    name: { type: String, required: true },
    active: { type: Boolean, private: true },
    items: { type: [ModelBuilder.subSchema({ name: { type: String } })] },
  },
});

const doc = new Document({ name: 'Sergio', active: true });
JSON.stringify(doc); // '{"name":"Sergio","createdAt":"...","updatedAt":"...","id":"..."}'
```

Defaults applied to every schema:

- `collection: collectionName(name)` — `ApiDocuments` → `apiDocuments`, set explicitly instead
  of through the global `mongoose.pluralize()`. Sub-schemas never get one. Pass
  `schemaOptions.collection` to override.
- `timestamps: true`
- `autoIndex: false`, `autoCreate: false` — index and collection creation belong to whoever
  owns the connection, not to the model.
- `toObject` with `versionKey: false`
- `toJSON` from [`buildToObjectOptions`](#serialize) — `versionKey: false`, `getters: true`,
  `virtuals: false`, `_id` exposed as the string `id`, private fields dropped
- `_id: false` implies `id: false`
- the [`capturePreSaveState`](#serialize) plugin — snapshots `wasNew`, `modifiedPaths` and
  `directModifiedPaths` for post-save hooks — unless the `capturePreSaveState` argument is
  `false`. Sub-schemas never get it: mongoose runs sub-document pre-save hooks on the parent's
  save, and the parent's own snapshot already reports what changed

Fields declared `private: true` are stripped from `toJSON`, along with `_id` (exposed as the
string `id`). Passing `schemaOptions.toJSON` keeps those options as they are and skips the
transform — unless a `jsonHandler` comes with them, which restores the transform and discards
`schemaOptions.toJSON`.

### API

- `new ModelBuilder({ name?, schema, schemaOptions?, jsonHandler?, includesBase?,
  capturePreSaveState? })` — `schemaOptions` is merged over the defaults and handed to
  `mongoose.Schema`; the other arguments are the builder's own. `includesBase: false` skips
  `baseSchemaDefinition()`
- `ModelBuilder.createModel(args)` — build and compile in one step
- `ModelBuilder.subSchema(schema, schemaOptions?, jsonHandler?)` — sub-document schema: `_id`,
  no timestamps, no base fields, no `capturePreSaveState`. Pass `_id: false` in `schemaOptions`
  to drop the identifier
- `ModelBuilder.ObjectId` — `mongoose.Schema.Types.ObjectId`
- `.setToJSON(options)` / `.setToObject(options)` / `.setJSONHandler(handler)`
- `.toModel()` — compile the model, requires `name`
- `.getPrivateFields()` — paths declared `private: true`
- `collectionName(name)` — the naming convention, a named export of the package root and
  `/model` rather than a `ModelBuilder` member, exported for reuse

### Extension points

Override `baseSchemaDefinition()` to inject fields into every model, or
`prepareSchemaDefinition(schema, includesBase)` when position matters:

```js
class TenantModelBuilder extends ModelBuilder {
  prepareSchemaDefinition(schemaDefinition, includesBase) {
    if (!includesBase) return schemaDefinition;
    return {
      customerId: { type: String, private: true },
      ...schemaDefinition,
      meta: { type: Map, of: {} },
    };
  }
}
```

## serialize

- `buildToObjectOptions(options?, params?)` — `toObject`/`toJSON` options that expose `_id` as
  a string `id`, drop `params.hide` fields — overridable per call through `opts.hide` — and run
  `params.handler(doc, result, opts)`. Defaults to `getters: true`, `virtuals: false` and
  `versionKey: false`; `options` is merged last and wins
- `capturePreSaveState(schema)` — plugin that snapshots `isNew`, `modifiedPaths()` and
  `directModifiedPaths()` into `doc.$locals` before saving, so post-save hooks can still read
  them
- `isModified(doc, path | paths)` — whether any of the paths changed in that save
- `isDirectModified(doc, path | paths)` — same, restricted to paths set directly: writing
  `contact.email` marks `contact` as modified, but only `contact.email` as directly modified
- `wasNew(doc)` — whether that save was an insert; `doc.isNew` is already `false` by the time
  post-save hooks run

All three readers require the plugin, which `ModelBuilder` applies by default — pass
`capturePreSaveState: false` to the constructor to skip it. It writes
`$locals.wasNew`, `$locals.modifiedPaths` and `$locals.directModifiedPaths` — `wasNew` being
the key mongoose itself documents for this idiom.

```js
schema.post('save', (doc) => {
  if (wasNew(doc)) return sendWelcome(doc);
  if (isModified(doc, ['email', 'phone'])) notifyContactChange(doc);
  if (isDirectModified(doc, 'address.zip')) revalidateShipping(doc);
});
```

## helpers

- `isObjectId(value)` — strict check, round-trips the value instead of trusting
  `ObjectId.isValid`
- `toObjectId(value)` — build an `ObjectId`
- `isUUID(value)` — canonical UUID string, any version 1–8
- `isDuplicateKeyError(error)` — MongoDB error `11000`, wrapped in `cause` or not
- `duplicateKeyFields(error)` — the colliding field names, so a duplicate can become a precise
  domain error

## License

MIT
