// -----------------------------------------------------------------------------
// Fake Faikout units on a fake network, for the tests: no socket is opened.
//
// Each unit answers like the firmware: every WebSocket frame on `/status` gets
// one status answer, a JSON frame first applies the controls it carries (the
// ones the unit has, and does not refuse), `/common/basic_info` gives the MAC.
// -----------------------------------------------------------------------------

import { FaikoutClient } from '../../src/faikout/client.js';

export const SAMPLE_STATUS = {
  protocol: 'S21',
  online: true,
  model: 'FTXM25R',
  home: 21.5,
  heat: true,
  outside: 8,
  inlet: 22.5,
  liquid: 30,
  hum: 45,
  consumption: 450,
  power: true,
  mode: 'H',
  temp: 22,
  fan: 'A',
  swingh: false,
  swingv: true,
  econo: false,
  powerful: false,
  quiet: false,
  comp: 30,
  antifreeze: false,
  control: false,
  autor: 0,
  autot: 21,
  auto0: '00:00',
  auto1: '00:00',
  autop: false,
  autoe: true,
};

export class FakeUnit {
  constructor({ mac = '30AEA4A1B2C3', name = 'GuestAC', status = SAMPLE_STATUS } = {}) {
    this.mac = mac;
    this.name = name;
    this.status = structuredClone(status);
    // false: connection refused. 'mute': accepts the connection, never answers.
    this.reachable = true;
    // Control keys the unit ignores (an option its air conditioner lacks).
    this.refuse = new Set();
    // Every frame received, in order ('' for a read).
    this.frames = [];
  }

  apply(frame) {
    for (const [key, value] of Object.entries(frame)) {
      if (this.refuse.has(key) || !(key in this.status)) {
        continue;
      }
      this.status[key] = value;
    }
  }
}

export function createFakeNetwork() {
  const units = new Map();
  const sockets = new Set();

  class FakeWebSocket {
    constructor(url) {
      this.url = url;
      this.listeners = {};
      this.host = new URL(url).host;
      this.closed = false;
      sockets.add(this);
      setImmediate(() => {
        const unit = units.get(this.host);
        if (unit?.reachable) {
          this.emit('open', {});
        } else {
          this.emit('error', {});
          this.close();
        }
      });
    }

    addEventListener(type, listener) {
      (this.listeners[type] ??= []).push(listener);
    }

    emit(type, event) {
      for (const listener of this.listeners[type] ?? []) {
        listener(event);
      }
    }

    send(data) {
      if (this.closed) {
        throw new Error('WebSocket is closed');
      }
      const unit = units.get(this.host);
      if (!unit || unit.reachable !== true) {
        return; // Lost on the way: the client's timeout handles it.
      }
      unit.frames.push(data);
      if (data) {
        unit.apply(JSON.parse(data));
      }
      const answer = JSON.stringify(unit.status);
      setImmediate(() => {
        if (!this.closed) {
          this.emit('message', { data: answer });
        }
      });
    }

    close() {
      if (this.closed) {
        return;
      }
      this.closed = true;
      sockets.delete(this);
      setImmediate(() => this.emit('close', {}));
    }
  }

  async function fakeFetch(url) {
    const { host, pathname } = new URL(url);
    const unit = units.get(host);
    if (!unit || unit.reachable !== true) {
      throw new TypeError('fetch failed');
    }
    if (pathname !== '/common/basic_info') {
      return { ok: false, status: 404, text: async () => '' };
    }
    return {
      ok: true,
      status: 200,
      text: async () =>
        `ret=OK,type=aircon,reg=eu,ver=1.0,pow=1,err=0,name=${unit.name},mac=${unit.mac},adp_mode=run`,
    };
  }

  return {
    units,
    sockets,
    WebSocket: FakeWebSocket,
    fetch: fakeFetch,
    add(host, unit = new FakeUnit()) {
      units.set(host, unit);
      return unit;
    },
    clientFactory: (host) =>
      new FaikoutClient(host, { WebSocket: FakeWebSocket, fetch: fakeFetch, timeoutMs: 100 }),
  };
}
