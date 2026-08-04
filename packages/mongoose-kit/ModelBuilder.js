import mongoose from 'mongoose';
import { buildToObjectOptions, capturePreSaveState as preSaveStatePlugin } from './serialize.js';

/**
 * Derives a collection name from a model name: `ApiDocuments` → `apiDocuments`.
 *
 * `ModelBuilder` applies it as an explicit `collection` schema option. Exported so a
 * project can reuse the same convention outside a model.
 *
 * @param {string} name - The model name.
 * @return {string} The collection name.
 */
export function collectionName(name) {
  return name.charAt(0).toLowerCase() + name.slice(1);
}

class ModelBuilder {
  /**
   * Builds the schema from a definition, applying the package defaults and the
   * `private: true` field hiding.
   *
   * @param {Object} args - The arguments to initialize the ModelBuilder.
   * @param {string|null} [args.name=null] - The model name, required only to compile a
   *  model. It also decides the collection name; sub-schemas leave it null.
   * @param {Object} args.schema - The schema definition, as accepted by `mongoose.Schema`.
   * @param {Object} [args.schemaOptions={}] - Schema options, merged over the defaults and
   *  handed to `mongoose.Schema` as they are.
   * @param {Function|null} [args.jsonHandler=null] - Receives `(doc, result, opts)` and
   *  returns the payload to serialize as JSON.
   * @param {boolean} [args.includesBase=true] - Whether to include the base schema fields.
   * @param {boolean} [args.capturePreSaveState=true] - Whether to apply the
   *  `capturePreSaveState` plugin, which backs `wasNew`, `isModified` and
   *  `isDirectModified`.
   * @throws {Error} Throws if `schema` is missing or is not an object.
   */
  constructor(args) {
    const {
      name = null,
      schema,
      schemaOptions = {},
      jsonHandler = null,
      includesBase = true,
      capturePreSaveState = true,
    } = args;

    if (!schema || typeof schema !== 'object') {
      throw new Error('ModelBuilder: "schema" is required and must be an object.');
    }

    this.name = name;
    this.schemaDefinition = this.prepareSchemaDefinition(schema, includesBase);
    this.schemaOptions = this.prepareSchemaOptions(schemaOptions);
    this.schema = new mongoose.Schema(this.schemaDefinition, this.schemaOptions);

    if (capturePreSaveState) {
      this.schema.plugin(preSaveStatePlugin);
    }

    if (jsonHandler || typeof schemaOptions.toJSON === 'undefined') {
      this.setJSONHandler(jsonHandler);
    }
  }

  /**
   * Replaces the schema's `toJSON` options.
   *
   * @param {Object} options - Options, typically from `buildToObjectOptions`.
   * @return {ModelBuilder} The builder, for chaining.
   */
  setToJSON(options) {
    this.schema.set('toJSON', options);
    return this;
  }

  /**
   * Replaces the schema's `toObject` options.
   *
   * @param {Object} options - Options, typically from `buildToObjectOptions`.
   * @return {ModelBuilder} The builder, for chaining.
   */
  setToObject(options) {
    this.schema.set('toObject', options);
    return this;
  }

  /**
   * Rebuilds the `toJSON` options around a handler, keeping `_id` and the private fields
   * hidden. Call it after adding paths, so fields declared later are still picked up.
   *
   * @param {Function|null} handler - Receives `(doc, result, opts)` and returns the payload
   *  to serialize. Null keeps the default result.
   * @return {ModelBuilder} The builder, for chaining.
   */
  setJSONHandler(handler) {
    this.setToJSON(buildToObjectOptions({}, {
      hide: ['_id', ...this.getPrivateFields()],
      handler,
    }));
    return this;
  }

  /**
   * Compiles the schema into a mongoose model.
   *
   * @return {import('mongoose').Model} The compiled model.
   * @throws {Error} Throws if the builder has no name.
   */
  toModel() {
    if (!this.name || typeof this.name !== 'string') {
      throw new Error('ModelBuilder: "name" is required and must be a string.');
    }

    return mongoose.model(this.name, this.schema);
  }

  /**
   * Fields shared by every model built by this class. Override in a subclass to inject
   * them; they land before the fields passed to the constructor.
   *
   * @return {Object} A schema definition fragment.
   */
  baseSchemaDefinition() {
    return {};
  }

  /**
   * Merges the base fields into the definition. Override in a subclass when position
   * matters — to append fields after the ones the caller passed, for instance.
   *
   * @param {Object} schemaDefinition - The definition passed to the constructor.
   * @param {boolean} includesBase - Whether the base fields apply.
   * @return {Object} The definition handed to `mongoose.Schema`.
   */
  prepareSchemaDefinition(schemaDefinition, includesBase) {
    return includesBase
      ? { ...this.baseSchemaDefinition(), ...schemaDefinition }
      : schemaDefinition;
  }

  /**
   * Collects the paths to keep out of the JSON output.
   *
   * @return {string[]} The schema paths declared `private: true`.
   */
  getPrivateFields() {
    const { paths } = this.schema;
    return Object.keys(paths).reduce((acc, key) => (
      !paths[key].options.private ? acc : [...acc, key]
    ), []);
  }

  /**
   * Applies the package defaults over the caller's options: `timestamps`, no automatic
   * index or collection creation, the collection name convention, and `toObject`/`toJSON`
   * without a version key. Anything the caller passes wins.
   *
   * @param {Object} schemaOptions - The options passed to the constructor.
   * @return {Object} The options handed to `mongoose.Schema`.
   */
  prepareSchemaOptions(schemaOptions) {
    const options = {
      timestamps: true,
      autoIndex: false,
      autoCreate: false,
      ...schemaOptions,
    };

    // Sub-schemas run through here too, with `this.name === null`. Only a named
    // builder — the one that becomes a model — gets a collection.
    if (typeof this.name === 'string' && !('collection' in options)) {
      options.collection = collectionName(this.name);
    }

    if ('_id' in options && options._id === false) {
      options.id = false;
    }

    if (typeof options.toObject === 'undefined') {
      options.toObject = { versionKey: false };
    }

    if (typeof options.toJSON === 'undefined') {
      options.toJSON = { versionKey: false };
    }

    return options;
  }

  /**
   * Builds a schema for a sub-document: no base fields, no timestamps, and an `_id` by
   * default. Being unnamed, it never receives a collection.
   *
   * No `capturePreSaveState` either: mongoose runs it on every sub-document of every save,
   * and the parent's own snapshot already reports the paths that changed.
   *
   * @param {Object} schema - The schema definition.
   * @param {Object} [schemaOptions={}] - Schema options, merged over the sub-document
   *  defaults. Pass `_id: false` to drop the identifier.
   * @param {Function|null} [jsonHandler=null] - Receives `(doc, result, opts)` and returns
   *  the payload to serialize.
   * @return {import('mongoose').Schema} The sub-document schema.
   */
  static subSchema(schema, schemaOptions = {}, jsonHandler = null) {
    const builder = new this({
      schema,
      schemaOptions: {
        _id: true,
        timestamps: false,
        ...schemaOptions,
      },
      includesBase: false,
      jsonHandler,
      capturePreSaveState: false,
    });
    return builder.schema;
  }

  /**
   * Builds and compiles in one step, for models that need no further setup.
   *
   * @param {Object} args - The same arguments as the constructor; `name` is required here.
   * @return {import('mongoose').Model} The compiled model.
   * @throws {Error} Throws if `schema` is missing or `name` is not a string.
   */
  static createModel(args) {
    const model = new this(args);
    return model.toModel();
  }

  /**
   * Shortcut for declaring reference fields, so schemas need no mongoose import.
   *
   * @return {typeof import('mongoose').Schema.Types.ObjectId} The ObjectId schema type.
   */
  static get ObjectId() {
    return mongoose.Schema.Types.ObjectId;
  }
}

export default ModelBuilder;
