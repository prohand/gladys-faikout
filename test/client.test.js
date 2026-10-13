import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FaikoutClient, LoginRequiredError, parseLegacy } from '../src/faikout/client.js';
import { createFakeNetwork } from './helpers/fakeFaikout.js';

test('a read sends an empty frame and resolves the status', async () => {
  const net = createFakeNetwork();
  const unit = net.add('10.0.0.5');
  const client = net.clientFactory('10.0.0.5');
  try {
    const status = await client.request();
    assert.equal(status.mode, 'H');
    assert.deepEqual(unit.frames, ['']);
  } finally {
    client.close();
  }
});

test('commands go one at a time, each answer to its own request', async () => {
  const net = createFakeNetwork();
  const unit = net.add('10.0.0.5');
  const client = net.clientFactory('10.0.0.5');
  try {
    const [first, second] = await Promise.all([
      client.request({ mode: 'C' }),
      client.request({ temp: 24 }),
    ]);
    assert.equal(first.mode, 'C');
    assert.equal(first.temp, 22, 'the first answer predates the second frame');
    assert.equal(second.temp, 24);
    assert.deepEqual(unit.frames, ['{"mode":"C"}', '{"temp":24}']);
    assert.equal(net.sockets.size, 1, 'one socket serves every exchange');
  } finally {
    client.close();
  }
});

test('a refused connection rejects, and the next request tries again', async () => {
  const net = createFakeNetwork();
  const unit = net.add('10.0.0.5');
  unit.reachable = false;
  const client = net.clientFactory('10.0.0.5');
  try {
    await assert.rejects(client.request(), /refused|closed/);
    unit.reachable = true;
    assert.equal((await client.request()).power, true);
  } finally {
    client.close();
  }
});

test('a unit that stops answering times out, and a fresh socket is opened', async () => {
  const net = createFakeNetwork();
  const unit = net.add('10.0.0.5');
  const client = net.clientFactory('10.0.0.5');
  try {
    await client.request();
    unit.reachable = 'mute';
    await assert.rejects(client.request(), /No answer within/);
    unit.reachable = true;
    assert.equal((await client.request()).power, true);
    assert.equal(net.sockets.size, 1, 'the silent socket was closed');
  } finally {
    client.close();
  }
});

test('basic_info gives the MAC address', async () => {
  const net = createFakeNetwork();
  net.add('10.0.0.5');
  const client = net.clientFactory('10.0.0.5');
  const info = await client.basicInfo();
  assert.equal(info.mac, '30AEA4A1B2C3');
  assert.equal(info.name, 'GuestAC');
  await assert.rejects(net.clientFactory('10.0.0.9').basicInfo(), /fetch failed/);
});

test('with a web password, the client sends the cookie of the login page', async () => {
  const net = createFakeNetwork();
  const unit = net.add('10.0.0.5');
  unit.password = 's3cret';
  const client = net.clientFactory('10.0.0.5', { password: 's3cret' });
  try {
    assert.equal((await client.basicInfo()).mac, '30AEA4A1B2C3');
    assert.equal((await client.request()).power, true);
    const socket = [...net.sockets][0];
    assert.deepEqual(socket.headers, { Cookie: 'Faikout=s3cret' });
  } finally {
    client.close();
  }
});

test('a missing or wrong web password is told apart from a unit off', async () => {
  const net = createFakeNetwork();
  const unit = net.add('10.0.0.5');
  unit.password = 's3cret';
  for (const password of ['', 'wrong']) {
    const client = net.clientFactory('10.0.0.5', { password });
    try {
      await assert.rejects(client.basicInfo(), LoginRequiredError);
      await assert.rejects(client.request(), /web password missing or wrong/);
    } finally {
      client.close();
    }
  }
  unit.reachable = false;
  const client = net.clientFactory('10.0.0.5', { password: 'wrong' });
  await assert.rejects(client.request(), /Connection refused/);
  client.close();
});

test('without a web password, no cookie is sent', async () => {
  const net = createFakeNetwork();
  net.add('10.0.0.5');
  const client = net.clientFactory('10.0.0.5');
  try {
    await client.request();
    assert.deepEqual([...net.sockets][0].headers, {});
  } finally {
    client.close();
  }
});

test('a closed client refuses new requests', async () => {
  const net = createFakeNetwork();
  net.add('10.0.0.5');
  const client = net.clientFactory('10.0.0.5');
  client.close();
  await assert.rejects(client.request(), /closed/);
});

test('Daikin-style answers are decoded', () => {
  assert.deepEqual(parseLegacy('ret=OK,name=Living%20room,mac=AABB,empty=\n'), {
    ret: 'OK',
    name: 'Living room',
    mac: 'AABB',
    empty: '',
  });
  assert.deepEqual(parseLegacy('ret=OK,bad=%E0'), { ret: 'OK', bad: '%E0' });
});

test('the default client uses the global WebSocket and fetch of Node', () => {
  const client = new FaikoutClient('10.0.0.5');
  assert.equal(client.WebSocket, globalThis.WebSocket);
  assert.equal(client.fetch, globalThis.fetch);
});
