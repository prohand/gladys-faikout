// -----------------------------------------------------------------------------
// Local link to one Faikout.
//
// Two endpoints of the Faikout web server, nothing else:
//   - `ws://<host>/status`: the WebSocket its own web page uses. Every frame
//     sent gets exactly one answer, the full status: an empty frame only asks
//     for it, a JSON object first applies the controls it carries. Answers are
//     not tagged, so exchanges run one at a time, in order.
//   - `http://<host>/common/basic_info`: the Daikin-compatible page that gives
//     the MAC address, the stable id of the unit in Gladys.
//
// No password: the firmware does not protect these endpoints (its settings
// password only guards the settings page and the Faikout auto settings).
// -----------------------------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 5000;

export class FaikoutClient {
  #socket = null;
  #opening = null;
  #pending = null;
  #queue = Promise.resolve();
  #closed = false;

  /**
   * @param {string} host host[:port] of the unit
   * @param {object} [options]
   * @param {typeof WebSocket} [options.WebSocket] WebSocket implementation (tests)
   * @param {typeof fetch} [options.fetch] fetch implementation (tests)
   * @param {number} [options.timeoutMs] answer deadline of one exchange
   */
  constructor(host, options = {}) {
    this.host = host;
    this.WebSocket = options.WebSocket ?? globalThis.WebSocket;
    this.fetch = options.fetch ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /**
   * Send a control frame (or nothing, to only read) and resolve the status
   * the unit answers with.
   * @param {object | null} frame controls to apply, e.g. `{ power: true }`
   * @returns {Promise<object>} the status
   */
  request(frame = null) {
    const exchange = this.#queue.then(() => this.#exchange(frame));
    // The next exchange waits for this one, whatever its outcome.
    this.#queue = exchange.catch(() => {});
    return exchange;
  }

  /**
   * Read `/common/basic_info`: `ret=OK,type=aircon,...,mac=...,name=...`.
   * @returns {Promise<Record<string, string>>}
   */
  async basicInfo() {
    const response = await this.fetch(`http://${this.host}/common/basic_info`, {
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const info = parseLegacy(await response.text());
    if (info.ret !== 'OK' || !info.mac) {
      throw new Error('Not a Faikout answer');
    }
    return info;
  }

  close() {
    this.#closed = true;
    this.#drop(new Error('Connection closed'));
  }

  async #exchange(frame) {
    if (this.#closed) {
      throw new Error('Connection closed');
    }
    const socket = await this.#open();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        // A unit that stopped answering on an open socket (Wi-Fi lost, reboot):
        // drop the socket, the next exchange opens a fresh one.
        this.#drop(new Error(`No answer within ${this.timeoutMs / 1000} s`));
      }, this.timeoutMs);
      this.#pending = {
        resolve: (status) => {
          clearTimeout(timer);
          resolve(status);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      };
      try {
        socket.send(frame ? JSON.stringify(frame) : '');
      } catch (err) {
        this.#drop(err);
      }
    });
  }

  #open() {
    if (this.#socket) {
      return Promise.resolve(this.#socket);
    }
    if (this.#opening) {
      return this.#opening;
    }
    this.#opening = new Promise((resolve, reject) => {
      let socket;
      try {
        socket = new this.WebSocket(`ws://${this.host}/status`);
      } catch (err) {
        reject(err);
        return;
      }
      const timer = setTimeout(() => {
        fail(new Error(`No connection within ${this.timeoutMs / 1000} s`));
        try {
          socket.close();
        } catch {
          // Already closing.
        }
      }, this.timeoutMs);
      const fail = (err) => {
        clearTimeout(timer);
        if (this.#opening) {
          this.#opening = null;
          reject(err);
        }
      };
      socket.addEventListener('open', () => {
        clearTimeout(timer);
        this.#opening = null;
        this.#socket = socket;
        resolve(socket);
      });
      socket.addEventListener('message', (event) => this.#onMessage(event.data));
      socket.addEventListener('error', () => {
        fail(new Error('Connection refused or lost'));
        if (this.#socket === socket) {
          this.#drop(new Error('Connection lost'));
        }
      });
      socket.addEventListener('close', () => {
        fail(new Error('Connection closed by the unit'));
        if (this.#socket === socket) {
          this.#drop(new Error('Connection closed by the unit'));
        }
      });
    });
    return this.#opening;
  }

  #onMessage(data) {
    let status;
    try {
      status = JSON.parse(typeof data === 'string' ? data : String(data));
    } catch {
      return;
    }
    if (!status || typeof status !== 'object' || Array.isArray(status)) {
      return;
    }
    const pending = this.#pending;
    this.#pending = null;
    pending?.resolve(status);
  }

  #drop(err) {
    const socket = this.#socket;
    this.#socket = null;
    const pending = this.#pending;
    this.#pending = null;
    pending?.reject(err);
    if (socket) {
      try {
        socket.close();
      } catch {
        // Already closed.
      }
    }
  }
}

/**
 * Parse a Daikin-style answer: `key=value` pairs separated by commas, values
 * URL-encoded.
 */
export function parseLegacy(text) {
  const result = {};
  for (const pair of String(text).trim().split(',')) {
    const separator = pair.indexOf('=');
    if (separator > 0) {
      const value = pair.slice(separator + 1);
      try {
        result[pair.slice(0, separator)] = decodeURIComponent(value);
      } catch {
        result[pair.slice(0, separator)] = value;
      }
    }
  }
  return result;
}
