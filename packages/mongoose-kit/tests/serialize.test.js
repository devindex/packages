import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import ModelBuilder from '../ModelBuilder.js';
import {
  buildToObjectOptions,
  capturePreSaveState,
  isModified,
  isDirectModified,
  wasNew,
} from '../serialize.js';

/** Pulls the `save` hook out of the plugin, so it can run without a real save(). */
function preSaveHook() {
  let captured = null;
  capturePreSaveState({
    pre(event, fn) {
      assert.equal(event, 'save');
      captured = fn;
    },
  });
  assert.equal(typeof captured, 'function');
  return captured;
}

describe('buildToObjectOptions', () => {
  test('defaults expose getters and drop the version key', () => {
    const options = buildToObjectOptions();

    assert.equal(options.getters, true);
    assert.equal(options.virtuals, false);
    assert.equal(options.versionKey, false);
  });

  test('options passed in win over the defaults', () => {
    const options = buildToObjectOptions({ virtuals: true });

    assert.equal(options.virtuals, true);
  });

  test('transform maps _id to id and removes hidden fields', () => {
    const { transform } = buildToObjectOptions({}, { hide: ['_id', 'secret'] });
    const doc = { _id: { toString: () => 'abc123' } };
    const result = transform(doc, { _id: 'abc123', name: 'Sergio', secret: 'hidden' });

    assert.deepEqual(result, { id: 'abc123', name: 'Sergio' });
  });

  test('opts.hide overrides the configured hide list', () => {
    const { transform } = buildToObjectOptions({}, { hide: ['secret'] });
    const result = transform({}, { name: 'Sergio', secret: 'hidden' }, { hide: ['name'] });

    assert.deepEqual(result, { secret: 'hidden' });
  });

  test('the handler shapes the final result', () => {
    const { transform } = buildToObjectOptions({}, {
      hide: ['_id'],
      handler: (doc, ret) => ({ type: 'root', name: ret.name }),
    });
    const result = transform({}, { _id: 'abc123', name: 'Sergio' });

    assert.deepEqual(result, { type: 'root', name: 'Sergio' });
  });
});

describe('capturePreSaveState', () => {
  test('ModelBuilder applies the plugin by default', () => {
    const builder = new ModelBuilder({
      name: 'PluginDefault',
      schema: { name: { type: String } },
    });

    assert.ok(builder.schema.plugins.some((p) => p.fn === capturePreSaveState));
  });

  test('capturePreSaveState: false opts out, and stays out of the schema options', () => {
    const builder = new ModelBuilder({
      name: 'PluginOptOut',
      schema: { name: { type: String } },
      capturePreSaveState: false,
    });

    assert.equal(builder.schema.plugins.some((p) => p.fn === capturePreSaveState), false);
    assert.equal('capturePreSaveState' in builder.schema.options, false);
  });

  test('subSchema opts out: mongoose would run the hook on every sub-document', () => {
    const schema = ModelBuilder.subSchema({ label: { type: String } });

    assert.equal(schema.plugins.some((p) => p.fn === capturePreSaveState), false);
  });

  test('the hook snapshots the modified paths, and isModified reads them back', () => {
    const Model = ModelBuilder.createModel({
      name: 'ModifiedPaths',
      schema: { name: { type: String }, age: { type: Number } },
    });

    const doc = new Model({ name: 'Sergio' });

    assert.equal(isModified(doc, 'name'), false, 'no snapshot yet');

    preSaveHook().call(doc);

    assert.ok(Array.isArray(doc.$locals.modifiedPaths));
    assert.equal(isModified(doc, 'name'), true);
    assert.equal(isModified(doc, 'age'), false);
    assert.equal(isModified(doc, ['age', 'name']), true);
    assert.equal(isModified(doc, ['age']), false);
  });

  test('isDirectModified separates the leaf that changed from its parent', () => {
    const Model = ModelBuilder.createModel({
      name: 'DirectPaths',
      schema: {
        name: { type: String },
        contact: { email: { type: String }, phone: { type: String } },
      },
    });

    const doc = Model.hydrate({
      _id: '6650f1b2c3d4e5f6a7b8c9d0',
      name: 'Sergio',
      contact: { email: 'a@b.c', phone: '1' },
    });
    doc.contact.email = 'novo@b.c';

    preSaveHook().call(doc);

    assert.deepEqual(doc.$locals.modifiedPaths, ['contact', 'contact.email']);
    assert.deepEqual(doc.$locals.directModifiedPaths, ['contact.email']);

    // The parent counts as modified either way — that is the ambiguity this resolves.
    assert.equal(isModified(doc, 'contact'), true);
    assert.equal(isDirectModified(doc, 'contact'), false);

    assert.equal(isDirectModified(doc, 'contact.email'), true);
    assert.equal(isDirectModified(doc, 'contact.phone'), false);
    assert.equal(isDirectModified(doc, ['name', 'contact.email']), true);
  });

  test('isDirectModified returns false without the plugin', () => {
    assert.equal(isDirectModified({ $locals: {} }, 'name'), false);
  });

  test('the hook records an insert, which post-save can no longer see on isNew', () => {
    const Model = ModelBuilder.createModel({
      name: 'WasNewInsert',
      schema: { name: { type: String } },
    });

    const doc = new Model({ name: 'Sergio' });

    assert.equal(wasNew(doc), false, 'no snapshot yet');

    preSaveHook().call(doc);
    assert.equal(doc.$locals.wasNew, true);
    assert.equal(wasNew(doc), true);

    // What mongoose does once the write lands — the snapshot survives it.
    doc.$isNew = false;
    assert.equal(doc.isNew, false);
    assert.equal(wasNew(doc), true);
  });

  test('the hook records an update on a document loaded from the database', () => {
    const Model = ModelBuilder.createModel({
      name: 'WasNewUpdate',
      schema: { name: { type: String } },
    });

    const doc = Model.hydrate({ _id: '6650f1b2c3d4e5f6a7b8c9d0', name: 'Sergio' });
    doc.name = 'Rodrigues';

    preSaveHook().call(doc);

    assert.equal(wasNew(doc), false);
    assert.equal(isModified(doc, 'name'), true);
  });
});
