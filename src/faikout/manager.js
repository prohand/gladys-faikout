// -----------------------------------------------------------------------------
// The Faikout units, as Gladys sees them.
//
// One Gladys device per unit, keyed by its MAC address (read once from
// `/common/basic_info`, then remembered): the address typed in the
// configuration may change (DHCP, a name instead of an IP), the device stays.
//
// The integration reads every unit itself, every `poll_frequency` seconds,
// over the unit's WebSocket: Gladys never polls these devices. Each status
// read (or answer to a command) is turned into:
//   - feature states, sent only when they changed (publishChangedStates);
//   - a transport badge: `local`, degraded when the air conditioner does not
//     answer the Faikout, `unreachable` when the Faikout does not answer;
//   - scene events on transitions only (link, defrost, a control changed with
//     the IR remote or the Faikout page);
//   - a widget refresh nudge when what the widgets show changed.
// Publications are collected while reading and sent by flush(), once.
// -----------------------------------------------------------------------------

import { createLogger, DEVICE_TRANSPORTS } from '@gladysassistant/integration-sdk';
import { parseUnits } from '../config.js';
import { LoginRequiredError } from './client.js';
import {
  FAN_NAMES,
  FEATURES,
  MODE_NAMES,
  WATCHED_CONTROLS,
  capabilitiesOf,
  controlFrame,
  frameApplied,
  statesOf,
} from './protocol.js';

const logger = createLogger({ name: 'faikout' });

export const DEVICE_TYPE = 'faikout';

// Scene trigger keys, as declared in the manifest `scene_triggers`. Keys are
// stored by scenes: never rename one.
export const TRIGGERS = {
  LINK_CHANGED: 'link_changed',
  CHANGED_OUTSIDE: 'changed_outside',
  DEFROST_CHANGED: 'defrost_changed',
};

export const LINK = {
  UNKNOWN: 'unknown',
  ONLINE: 'online',
  // The Faikout answers, the air conditioner behind it does not.
  AIRCON: 'aircon',
  UNREACHABLE: 'unreachable',
};

// An unchanged reading is re-sent this often, so it stays recently dated.
const STATE_HEARTBEAT_MS = 30 * 60 * 1000;
// A control Gladys set is not reported as changed "outside Gladys" for this
// long: the unit may take a poll or two to show it settled.
const COMMAND_ECHO_MS = 2 * 60 * 1000;
// What the widgets show, besides the live feature tiles.
const WIDGET_FIELDS = [
  'power',
  'mode',
  'fan',
  'temp',
  'swingh',
  'swingv',
  'econo',
  'powerful',
  'comfort',
  'quiet',
  'streamer',
  'antifreeze',
];
const WIDGET_SETTINGS = ['autoe', 'autot', 'autor'];

export class UnitManager {
  #dirty = { devices: false, transports: false, widgets: false };
  #events = [];
  #timer = null;
  #generation = 0;

  /**
   * @param {import('@gladysassistant/integration-sdk').GladysIntegration} gladys
   * @param {object} options
   * @param {(host: string, options: { password: string }) => import('./client.js').FaikoutClient} options.clientFactory
   * @param {{ load(): object, save(units: object): void }} options.store
   * @param {string[]} [options.widgetKeys] widgets nudged when their content changes
   * @param {() => number} [options.now]
   */
  constructor(gladys, { clientFactory, store, widgetKeys = [], now = Date.now }) {
    this.gladys = gladys;
    this.clientFactory = clientFactory;
    this.store = store;
    this.widgetKeys = widgetKeys;
    this.now = now;
    this.memory = store.load();
    /** @type {Map<string, object>} units by host, in configuration order */
    this.units = new Map();
    this.invalid = [];
    this.pollFrequency = 30;
    this.password = '';
  }

  /**
   * (Re)build the unit list from the configuration. A unit already known
   * keeps its connection and its last status.
   */
  configure(config) {
    const { units, invalid } = parseUnits(config.units);
    this.invalid = invalid;
    this.pollFrequency = config.poll_frequency;
    const passwordChanged = (config.password ?? '') !== this.password;
    this.password = config.password ?? '';
    const next = new Map();
    for (const { host, label } of units) {
      const unit = this.units.get(host) ?? this.#createUnit(host);
      unit.label = label;
      if (passwordChanged && this.units.has(host)) {
        // An open socket keeps working with the old cookie: start over.
        unit.client.close();
        unit.client = this.#createClient(host);
      }
      next.set(host, unit);
    }
    for (const [host, unit] of this.units) {
      if (!next.has(host)) {
        unit.client.close();
      }
    }
    this.units = next;
    this.#markAll();
    if (invalid.length > 0) {
      logger.warn(`Ignored unit entries: ${invalid.join(', ')}`);
    }
  }

  #createUnit(host) {
    const remembered = this.memory[host] ?? {};
    return {
      host,
      label: null,
      mac: remembered.mac ?? null,
      name: remembered.name ?? null,
      model: remembered.model ?? null,
      capabilities: new Set(remembered.capabilities ?? []),
      client: this.#createClient(host),
      status: null,
      link: LINK.UNKNOWN,
      lastSeen: null,
      lastError: null,
      // The unit wants a web password and refuses the configured one.
      loginRequired: false,
      // Feature key -> time Gladys last set it.
      commands: new Map(),
    };
  }

  #createClient(host) {
    return this.clientFactory(host, { password: this.password });
  }

  #markAll() {
    this.#dirty.devices = true;
    this.#dirty.transports = true;
    this.#dirty.widgets = true;
  }

  // --- Identity --------------------------------------------------------------

  displayName(unit) {
    return unit.label ?? unit.name ?? unit.host;
  }

  ids(unit) {
    return this.gladys.externalIds(DEVICE_TYPE, unit.mac);
  }

  /**
   * The units Gladys can know: identified, with at least one feature, one
   * per MAC (the same unit typed twice, by IP and by name, is one device).
   */
  publishableUnits() {
    const seen = new Set();
    const result = [];
    for (const unit of this.units.values()) {
      if (!unit.mac || unit.capabilities.size === 0 || seen.has(unit.mac)) {
        continue;
      }
      seen.add(unit.mac);
      result.push(unit);
    }
    return result;
  }

  findByDevice(deviceExternalId) {
    return this.publishableUnits().find((unit) => this.ids(unit).device === deviceExternalId);
  }

  /** @returns {{ unit: object, key: string } | null} */
  findFeature(featureExternalId) {
    for (const unit of this.publishableUnits()) {
      const prefix = `${this.ids(unit).device}:`;
      if (featureExternalId.startsWith(prefix)) {
        return { unit, key: featureExternalId.slice(prefix.length) };
      }
    }
    return null;
  }

  isCreated(unit) {
    const id = this.ids(unit).device;
    return (this.gladys.devices ?? []).some((device) => device.external_id === id);
  }

  // --- Gladys payloads -------------------------------------------------------

  /** The discovery payload: one device per unit. */
  devices() {
    return this.publishableUnits().map((unit) => {
      const ids = this.ids(unit);
      const params = [{ name: 'host', value: unit.host }];
      if (unit.model) {
        params.push({ name: 'model', value: unit.model });
      }
      return {
        name: this.displayName(unit),
        external_id: ids.device,
        // The integration reads the units on its own timer.
        should_poll: false,
        params,
        features: FEATURES.filter((feature) => unit.capabilities.has(feature.key)).map(
          (feature) => ({
            name: feature.name,
            external_id: ids.feature(feature.key),
            category: feature.category,
            type: feature.type,
            ...(feature.unit ? { unit: feature.unit } : {}),
            min: feature.min,
            max: feature.max,
            read_only: feature.read_only,
            has_feedback: feature.has_feedback,
            keep_history: feature.keep_history,
          }),
        ),
      };
    });
  }

  /** The transport badges of the devices created in Gladys. */
  transports() {
    return this.publishableUnits()
      .filter((unit) => unit.link !== LINK.UNKNOWN && this.isCreated(unit))
      .map((unit) => {
        const external_id = this.ids(unit).device;
        if (unit.link === LINK.UNREACHABLE) {
          return { external_id, transport: DEVICE_TRANSPORTS.UNREACHABLE };
        }
        if (unit.link === LINK.AIRCON) {
          return {
            external_id,
            transport: DEVICE_TRANSPORTS.LOCAL,
            degraded: true,
            message: {
              en: 'The Faikout answers, but the air conditioner does not.',
              fr: 'Le Faikout répond, mais pas la climatisation.',
            },
          };
        }
        return { external_id, transport: DEVICE_TRANSPORTS.LOCAL };
      });
  }

  // --- Reading and commanding -----------------------------------------------

  /** Read every unit, at the same time. */
  async refreshAll() {
    await Promise.all([...this.units.values()].map((unit) => this.refresh(unit)));
  }

  /**
   * Read one unit, or send it a control frame. A read that fails marks the
   * unit unreachable and resolves null; a command that fails throws, so
   * whoever asked for it is told.
   * @param {object} unit
   * @param {object | null} [frame] controls to apply
   * @returns {Promise<object | null>} the status
   */
  async refresh(unit, frame = null) {
    let status;
    try {
      if (!unit.mac) {
        await this.#identify(unit);
      }
      if (frame) {
        const sentAt = this.now();
        for (const key of Object.keys(frame)) {
          unit.commands.set(key, sentAt);
        }
        if ('power' in frame) {
          // Switching off a cooling unit may put it in fan mode for a while
          // (`fanrun`): that mode change is Gladys' doing too.
          unit.commands.set('mode', sentAt);
        }
      }
      status = await unit.client.request(frame);
    } catch (err) {
      if (unit.link !== LINK.UNREACHABLE) {
        logger.warn(`${this.displayName(unit)} (${unit.host}) does not answer: ${err.message}`);
      }
      unit.lastError = err.message;
      unit.loginRequired = err instanceof LoginRequiredError;
      this.#setLink(unit, LINK.UNREACHABLE);
      if (frame) {
        throw new Error(`${this.displayName(unit)} does not answer: ${err.message}`, {
          cause: err,
        });
      }
      return null;
    }
    await this.#handleStatus(unit, status, frame);
    return status;
  }

  /**
   * Run a Gladys command on a feature.
   * @throws {Error} unknown feature, invalid value, unit not answering or refusing
   */
  async setValue(featureExternalId, value) {
    const found = this.findFeature(featureExternalId);
    if (!found) {
      throw new Error(`Unknown feature ${featureExternalId}`);
    }
    return this.control(found.unit, controlFrame(found.key, value));
  }

  /**
   * Send a control frame to a unit and check that it took it.
   * @returns {Promise<object>} the status after the command
   */
  async control(unit, frame) {
    logger.info(`${this.displayName(unit)} <- ${JSON.stringify(frame)}`);
    const status = await this.refresh(unit, frame);
    if (!frameApplied(frame, status)) {
      throw new Error(
        `${this.displayName(unit)} did not apply ${JSON.stringify(frame)}: this unit may not support it`,
      );
    }
    return status;
  }

  async #identify(unit) {
    const info = await unit.client.basicInfo();
    unit.mac = info.mac.toLowerCase().replace(/[^0-9a-f]/g, '');
    unit.name = info.name || null;
    logger.info(`${unit.host} is the Faikout ${unit.name ?? '?'} (${unit.mac})`);
    this.#dirty.devices = true;
    this.#remember();
  }

  async #handleStatus(unit, status, frame) {
    const previous = unit.status;
    unit.status = status;
    unit.lastSeen = this.now();
    unit.lastError = null;
    unit.loginRequired = false;

    let learned = false;
    for (const key of capabilitiesOf(status)) {
      if (!unit.capabilities.has(key)) {
        unit.capabilities.add(key);
        learned = true;
      }
    }
    if (typeof status.model === 'string' && status.model && status.model !== unit.model) {
      unit.model = status.model;
      learned = true;
    }
    if (learned) {
      this.#dirty.devices = true;
      this.#remember();
    }

    this.#setLink(unit, status.online === false ? LINK.AIRCON : LINK.ONLINE);

    if (!previous || WIDGET_FIELDS.some((key) => status[key] !== previous[key])) {
      this.#dirty.widgets = true;
    }
    if (previous && WIDGET_SETTINGS.some((key) => status[key] !== previous[key])) {
      this.#dirty.widgets = true;
    }

    if (previous) {
      this.#detectEvents(unit, previous, status, frame);
    }
    await this.publishStates(unit);
  }

  /** Publish the states of a unit's last status, if its device exists in Gladys. */
  async publishStates(unit) {
    if (!unit.status || !unit.mac || !this.isCreated(unit)) {
      return;
    }
    const states = statesOf(unit.status, unit.capabilities, this.ids(unit).feature);
    if (states.length === 0) {
      return;
    }
    try {
      await this.gladys.publishChangedStates(states, { heartbeat: STATE_HEARTBEAT_MS });
    } catch (err) {
      logger.error(`Publishing the states of ${this.displayName(unit)} failed`, err);
    }
  }

  #detectEvents(unit, previous, status, frame) {
    if (!unit.mac) {
      return;
    }
    const device = this.ids(unit).device;
    const now = this.now();
    for (const key of WATCHED_CONTROLS) {
      if (!(key in status) || !(key in previous) || status[key] === previous[key]) {
        continue;
      }
      if (frame && key in frame) {
        continue;
      }
      const sentAt = unit.commands.get(key);
      if (sentAt !== undefined && now - sentAt < COMMAND_ECHO_MS) {
        continue;
      }
      // Under Faikout auto (or an external `control`), the Faikout moves the
      // set point and the mode itself: those are not a person's doing.
      if (status.control && (key === 'temp' || key === 'mode')) {
        continue;
      }
      this.#events.push({
        key: TRIGGERS.CHANGED_OUTSIDE,
        data: {
          device,
          what: key,
          power: typeof status.power === 'boolean' ? status.power : null,
          mode: MODE_NAMES[status.mode] ?? null,
          temperature: typeof status.temp === 'number' ? status.temp : null,
          fan: FAN_NAMES[status.fan] ?? null,
        },
      });
    }
    if (
      typeof status.antifreeze === 'boolean' &&
      typeof previous.antifreeze === 'boolean' &&
      status.antifreeze !== previous.antifreeze
    ) {
      this.#events.push({
        key: TRIGGERS.DEFROST_CHANGED,
        data: { device, state: status.antifreeze ? 'started' : 'ended' },
      });
    }
  }

  #setLink(unit, link) {
    if (unit.link === link) {
      return;
    }
    const before = unit.link;
    unit.link = link;
    this.#dirty.transports = true;
    this.#dirty.widgets = true;
    if (before !== LINK.UNKNOWN) {
      logger.info(`${this.displayName(unit)}: ${before} -> ${link}`);
    }
    const wasOnline = before === LINK.ONLINE;
    const isOnline = link === LINK.ONLINE;
    // The first reading after a start sets the baseline: no event.
    if (before === LINK.UNKNOWN || !unit.mac || wasOnline === isOnline) {
      return;
    }
    this.#events.push({
      key: TRIGGERS.LINK_CHANGED,
      data: {
        device: this.ids(unit).device,
        state: isOnline ? 'online' : 'offline',
        reason: isOnline ? null : link,
      },
    });
  }

  #remember() {
    const memory = { ...this.memory };
    for (const unit of this.units.values()) {
      if (unit.mac) {
        memory[unit.host] = {
          mac: unit.mac,
          name: unit.name,
          model: unit.model,
          capabilities: [...unit.capabilities],
        };
      }
    }
    this.memory = memory;
    this.store.save(memory);
  }

  // --- Publication -----------------------------------------------------------

  /**
   * Mark for publication at the next flush (reconnection, device created...).
   * @param {Array<'devices' | 'transports' | 'widgets'>} [parts]
   */
  invalidate(parts = ['devices', 'transports', 'widgets']) {
    for (const part of parts) {
      this.#dirty[part] = true;
    }
  }

  /**
   * Send what the last readings changed: devices, then transports (they
   * reference the devices), then scene events, then widget nudges. Each step
   * is independent: one refused never blocks the others.
   */
  async flush() {
    const dirty = this.#dirty;
    this.#dirty = { devices: false, transports: false, widgets: false };
    const events = this.#events;
    this.#events = [];

    if (dirty.devices) {
      try {
        await this.gladys.publishDiscoveredDevices(this.devices());
      } catch (err) {
        logger.error('Publishing the discovered devices failed', err);
      }
    }
    if (dirty.transports) {
      const entries = this.transports();
      // At most 100 entries per request.
      for (let i = 0; i < entries.length; i += 100) {
        try {
          await this.gladys.publishTransports(entries.slice(i, i + 100));
        } catch (err) {
          logger.error('Publishing the transport badges failed', err);
        }
      }
    }
    for (const { key, data } of events) {
      try {
        await this.gladys.publishSceneEvent(key, data);
      } catch (err) {
        logger.error(`Scene event ${key} refused`, err);
      }
    }
    if (dirty.widgets) {
      for (const key of this.widgetKeys) {
        this.gladys.requestWidgetRefresh(key);
      }
    }
  }

  // --- Timer -----------------------------------------------------------------

  /**
   * Read every unit now, then every `poll_frequency` seconds.
   * @param {() => Promise<void>} [afterTick] run after each reading
   * @returns {Promise<void>} resolved once the first reading is published
   */
  start(afterTick = async () => {}) {
    this.stop();
    // A tick still running from a previous start() must not re-arm its own
    // timer next to the new one.
    const generation = ++this.#generation;
    const tick = async () => {
      try {
        await this.refreshAll();
        await this.flush();
        await afterTick();
      } catch (err) {
        logger.error('Reading the units failed', err);
      }
      if (generation === this.#generation) {
        this.#timer = setTimeout(tick, this.pollFrequency * 1000);
      }
    };
    return tick();
  }

  stop() {
    this.#generation += 1;
    clearTimeout(this.#timer);
    this.#timer = null;
  }

  /** Close every connection (shutdown). */
  close() {
    this.stop();
    for (const unit of this.units.values()) {
      unit.client.close();
    }
  }
}
