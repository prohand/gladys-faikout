// -----------------------------------------------------------------------------
// Consistency checks between `gladys-assistant-integration.json` and the code.
// The store indexer validates the manifest itself, but it cannot know which
// handlers the code registers: these tests keep both sides in sync.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { createApp } from '../src/app.js';
import { DEFAULT_CONFIG, POLL_FREQUENCY_MAX, POLL_FREQUENCY_MIN } from '../src/config.js';
import { TRIGGERS } from '../src/faikout/manager.js';
import { createMemoryStore } from '../src/faikout/store.js';
import { SCENE_ACTIONS } from '../src/scenes.js';
import { WIDGETS } from '../src/widgets.js';
import { createFakeNetwork } from './helpers/fakeFaikout.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

const keysOf = (list) => (list ?? []).map((entry) => entry.key);

// Every form field list of the manifest (same field grammar).
const allFields = [
  ...manifest.config_schema,
  ...[...manifest.actions, ...manifest.scene_triggers, ...manifest.scene_actions].flatMap(
    (item) => item.fields ?? [],
  ),
  ...manifest.widgets.flatMap((widget) => widget.settings ?? []),
];

// Every user-facing text of the manifest: label, description, placeholder.
function* texts(node, path = 'manifest') {
  if (Array.isArray(node)) {
    for (const [i, item] of node.entries()) {
      yield* texts(item, `${path}[${i}]`);
    }
  } else if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      if (['label', 'description', 'placeholder'].includes(key)) {
        yield [`${path}.${key}`, value];
      } else {
        yield* texts(value, `${path}.${key}`);
      }
    }
  }
}

function minGladysVersion() {
  const match = manifest.gladys_version.match(/>=\s*(\d+)\.(\d+)\.(\d+)/);
  assert.ok(match, 'gladys_version must declare a minimum version');
  return match.slice(1).map(Number);
}

test('the manifest version is the package version, and the image is tagged with it', () => {
  assert.equal(manifest.version, pkg.version);
  assert.equal(manifest.docker_image, `ghcr.io/prohand/gladys-faikout:${manifest.version}`);
});

test('scene triggers, scene actions and widgets require Gladys >= 5.1.0', () => {
  const [major, minor] = minGladysVersion();
  assert.ok(major > 5 || (major === 5 && minor >= 1), manifest.gladys_version);
});

test('the integration is declared local only: Faikout has no cloud', () => {
  assert.deepEqual(manifest.transports, ['local']);
  assert.ok(manifest.categories.includes('climate'));
});

test('every manifest text is bilingual (en and fr), never a plain string', () => {
  for (const [path, value] of texts(manifest)) {
    assert.equal(typeof value, 'object', `${path} must be a multi-language object`);
    assert.ok(value.en && value.fr, `${path} needs en and fr`);
  }
});

test('the catalog description holds 10 to 100 characters per language', () => {
  for (const [lang, text] of Object.entries(manifest.description)) {
    assert.ok(text.length >= 10 && text.length <= 100, `description.${lang}: ${text.length}`);
  }
});

test('config_schema defaults and bounds match the code', () => {
  for (const field of manifest.config_schema) {
    if (field.type === 'section') {
      assert.equal(field.default, undefined);
      assert.ok(!(field.key in DEFAULT_CONFIG));
      continue;
    }
    assert.equal(DEFAULT_CONFIG[field.key], field.default, `default of ${field.key}`);
  }
  const poll = manifest.config_schema.find((f) => f.key === 'poll_frequency');
  assert.equal(poll.min, POLL_FREQUENCY_MIN);
  assert.equal(poll.max, POLL_FREQUENCY_MAX);
});

test('dynamic selects declare a source and no static options', () => {
  for (const field of allFields.filter((f) => f.source !== undefined)) {
    assert.equal(field.source, 'devices');
    assert.equal(field.options, undefined, field.key);
  }
});

test('every scene_actions key has a handler, and vice versa', () => {
  assert.deepEqual(keysOf(manifest.scene_actions).sort(), Object.keys(SCENE_ACTIONS).sort());
});

test('every widgets key has a handler, and vice versa', () => {
  assert.deepEqual(keysOf(manifest.widgets).sort(), Object.keys(WIDGETS).sort());
});

test('every scene trigger fired is declared, and every declared one is fired', () => {
  assert.deepEqual(keysOf(manifest.scene_triggers).sort(), Object.values(TRIGGERS).sort());
});

test('scene event data only carries declared keys, with primitive values', async () => {
  // Fire the three triggers through the real integration.
  const net = createFakeNetwork();
  const unit = net.add('10.0.0.5');
  const gladys = createFakeGladys({ config: { units: '10.0.0.5', poll_frequency: 600 } });
  const { manager } = createApp(gladys, {
    clientFactory: net.clientFactory,
    store: createMemoryStore(),
  });
  await gladys.connect();
  try {
    unit.status.mode = 'C';
    unit.status.antifreeze = true;
    await manager.refreshAll();
    unit.reachable = false;
    await manager.refreshAll();
    await manager.flush();
  } finally {
    manager.close();
    await gladys.disconnect();
  }
  const fired = new Set(gladys.fake.sceneEvents.map((e) => e.key));
  assert.deepEqual([...fired].sort(), Object.values(TRIGGERS).sort());
  for (const { key, data } of gladys.fake.sceneEvents) {
    const trigger = manifest.scene_triggers.find((t) => t.key === key);
    const declared = [...keysOf(trigger.fields), ...keysOf(trigger.variables)];
    for (const [name, value] of Object.entries(data)) {
      assert.ok(declared.includes(name), `${key}: data.${name} is not declared`);
      assert.ok(value === null || typeof value !== 'object', `${key}: data.${name}`);
    }
    for (const field of trigger.fields.filter((f) => f.options)) {
      assert.ok(
        field.options.some((o) => o.value === data[field.key]),
        `${key}: ${field.key}=${data[field.key]} is not an option of its filter`,
      );
    }
  }
});

test('scene action outputs are declared', async () => {
  for (const action of manifest.scene_actions) {
    const declared = keysOf(action.outputs);
    assert.ok(declared.length > 0, action.key);
  }
});

test('the test_connection action is the only manifest action, and it is handled', () => {
  assert.deepEqual(keysOf(manifest.actions), ['test_connection']);
});
