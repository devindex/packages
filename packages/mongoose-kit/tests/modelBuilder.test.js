import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import ModelBuilder, { collectionName } from '../ModelBuilder.js';

describe('collection name', () => {
  test('follows the camelCase convention', () => {
    const model = ModelBuilder.createModel({
      name: 'ApiDocuments',
      schema: { name: { type: String } },
    });

    assert.equal(model.collection.name, 'apiDocuments');
  });

  test('an explicit collection wins over the convention', () => {
    const model = ModelBuilder.createModel({
      name: 'LegacyDocuments',
      schema: { name: { type: String } },
      schemaOptions: { collection: 'legacy_documents' },
    });

    assert.equal(model.collection.name, 'legacy_documents');
  });

  test('collectionName is exported for overrides', () => {
    assert.equal(collectionName('ApiDocuments'), 'apiDocuments');
  });

  test('subSchema does not receive a collection', () => {
    const schema = ModelBuilder.subSchema({ name: { type: String } });

    assert.equal('collection' in schema.options, false);
    assert.equal(schema.options.collection, undefined);
  });
});

describe('schema options', () => {
  test('autoIndex and autoCreate default to false', () => {
    const builder = new ModelBuilder({
      name: 'DefaultOptions',
      schema: { name: { type: String } },
    });

    assert.equal(builder.schema.options.autoIndex, false);
    assert.equal(builder.schema.options.autoCreate, false);
    assert.equal(builder.schema.options.timestamps, true);
  });

  test('autoIndex and autoCreate are overridable', () => {
    const builder = new ModelBuilder({
      name: 'OverriddenOptions',
      schema: { name: { type: String } },
      schemaOptions: { autoIndex: true, autoCreate: true },
    });

    assert.equal(builder.schema.options.autoIndex, true);
    assert.equal(builder.schema.options.autoCreate, true);
  });

  test('_id: false implies id: false', () => {
    const builder = new ModelBuilder({
      schema: { name: { type: String } },
      schemaOptions: { _id: false },
      includesBase: false,
    });

    assert.equal(builder.schema.options.id, false);
  });

  test('subSchema has no timestamps and keeps _id', () => {
    const schema = ModelBuilder.subSchema({ name: { type: String } });

    assert.equal(schema.options.timestamps, false);
    assert.equal(schema.options._id, true);
    assert.ok(schema.path('_id'));
    assert.equal(schema.path('createdAt'), undefined);
  });
});

describe('private fields', () => {
  test('a private field is not serialized, an explicit private: false is', () => {
    const model = ModelBuilder.createModel({
      name: 'PrivateFields',
      schema: {
        name: { type: String },
        secret: { type: String, private: true },
        meta: { type: String, private: false },
      },
    });

    const doc = new model({ name: 'Sergio', secret: 'hidden', meta: 'visible' });
    const json = JSON.parse(JSON.stringify(doc));

    assert.equal(json.name, 'Sergio');
    assert.equal(json.meta, 'visible');
    assert.equal('secret' in json, false);
    assert.equal('_id' in json, false);
    assert.equal(json.id, doc._id.toString());
  });
});

describe('extension points', () => {
  test('a subclass overriding baseSchemaDefinition injects base fields', () => {
    class TenantModelBuilder extends ModelBuilder {
      baseSchemaDefinition() {
        return {
          customerId: { type: String, private: true },
          facilityId: { type: String, private: true },
        };
      }
    }

    const builder = new TenantModelBuilder({
      name: 'TenantDocuments',
      schema: { name: { type: String } },
    });

    assert.deepEqual(
      Object.keys(builder.schemaDefinition),
      ['customerId', 'facilityId', 'name'],
    );
    assert.deepEqual(builder.getPrivateFields(), ['customerId', 'facilityId']);
  });

  test('includesBase: false skips the base fields', () => {
    class TenantModelBuilder extends ModelBuilder {
      baseSchemaDefinition() {
        return { customerId: { type: String } };
      }
    }

    const builder = new TenantModelBuilder({
      name: 'PlainDocuments',
      schema: { name: { type: String } },
      includesBase: false,
    });

    assert.deepEqual(Object.keys(builder.schemaDefinition), ['name']);
  });

  test('a subclass overriding prepareSchemaDefinition positions fields after the schema', () => {
    class MetaModelBuilder extends ModelBuilder {
      prepareSchemaDefinition(schemaDefinition, includesBase) {
        if (!includesBase) {
          return schemaDefinition;
        }
        return {
          customerId: { type: String, private: true },
          ...schemaDefinition,
          meta: { type: Map, of: {}, private: false },
        };
      }
    }

    const builder = new MetaModelBuilder({
      name: 'MetaDocuments',
      schema: { name: { type: String } },
    });

    assert.deepEqual(
      Object.keys(builder.schemaDefinition),
      ['customerId', 'name', 'meta'],
    );
  });

  test('createModel builds through the subclass, not ModelBuilder', () => {
    class TenantModelBuilder extends ModelBuilder {
      baseSchemaDefinition() {
        return { customerId: { type: String, private: true } };
      }
    }

    const model = TenantModelBuilder.createModel({
      name: 'TenantCreated',
      schema: { name: { type: String } },
    });

    assert.deepEqual(Object.keys(model.schema.paths).includes('customerId'), true);

    const doc = new model({ name: 'Sergio', customerId: 'acme' });
    assert.equal('customerId' in doc.toJSON(), false);
  });

  test('subSchema builds through the subclass, not ModelBuilder', () => {
    class SoftDeleteModelBuilder extends ModelBuilder {
      prepareSchemaDefinition(schemaDefinition) {
        return { ...schemaDefinition, deletedAt: { type: Date } };
      }
    }

    const schema = SoftDeleteModelBuilder.subSchema({ name: { type: String } });

    assert.equal('deletedAt' in schema.paths, true);
    assert.equal('collection' in schema.options, false);
  });
});

describe('guards', () => {
  test('a missing schema throws', () => {
    assert.throws(() => new ModelBuilder({ name: 'NoSchema' }), /"schema" is required/);
  });

  test('toModel without a name throws', () => {
    const builder = new ModelBuilder({ schema: { name: { type: String } } });
    assert.throws(() => builder.toModel(), /"name" is required/);
  });

  test('ObjectId is exposed as a static', () => {
    assert.equal(ModelBuilder.ObjectId, mongoose.Schema.Types.ObjectId);
  });
});
