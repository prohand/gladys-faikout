// -----------------------------------------------------------------------------
// What a Faikout says, and what Gladys understands.
//
// A Faikout answers every frame sent to its `/status` WebSocket with one JSON
// object: the controls (`power`, `mode`, `temp`, `fan`, `swingh`...) and the
// readings (`home`, `outside`, `hum`, `consumption`...). A field is present
// only when the air conditioner reports it, so the features of a unit are
// deduced from the fields it sends (`capabilitiesOf`), never assumed.
//
// The same field names are written back to change a control: `{"power":true}`,
// `{"mode":"H"}`, `{"temp":21.5}`. They are also the feature keys of the
// Gladys devices: keys are stored by users, never rename one.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as CATEGORIES,
  DEVICE_FEATURE_TYPES as TYPES,
  DEVICE_FEATURE_UNITS as UNITS,
} from '@gladysassistant/integration-sdk';

// Gladys values of the air-conditioning features (AC_MODE and AC_FAN_SPEED in
// server/utils/constants.js of the Gladys repository).
export const AC_MODE = { AUTO: 0, COOLING: 1, HEATING: 2, DRYING: 3, FAN: 4 };
export const AC_FAN_SPEED = {
  AUTO: 0,
  LOW: 1,
  LOW_MID: 2,
  MID: 3,
  MID_HIGH: 4,
  HIGH: 5,
  QUIET: 6,
};

// Faikout letters (`FHCA456D` in the firmware): F fan, H heat, C cool, A auto,
// D dry. The digits are modes no known unit uses: they are not published.
const MODE_FROM_FAIKOUT = {
  A: AC_MODE.AUTO,
  C: AC_MODE.COOLING,
  H: AC_MODE.HEATING,
  D: AC_MODE.DRYING,
  F: AC_MODE.FAN,
};
// Faikout fan letters (`A12345Q`): A auto, 1 to 5, Q quiet (night).
const FAN_FROM_FAIKOUT = {
  A: AC_FAN_SPEED.AUTO,
  1: AC_FAN_SPEED.LOW,
  2: AC_FAN_SPEED.LOW_MID,
  3: AC_FAN_SPEED.MID,
  4: AC_FAN_SPEED.MID_HIGH,
  5: AC_FAN_SPEED.HIGH,
  Q: AC_FAN_SPEED.QUIET,
};

const invert = (map) => Object.fromEntries(Object.entries(map).map(([k, v]) => [v, k]));
const MODE_TO_FAIKOUT = invert(MODE_FROM_FAIKOUT);
const FAN_TO_FAIKOUT = invert(FAN_FROM_FAIKOUT);

// Names used by scene fields and widgets (stable keys, stored by users).
export const MODE_NAMES = { A: 'auto', C: 'cool', H: 'heat', D: 'dry', F: 'fan' };
export const FAN_NAMES = {
  A: 'auto',
  1: '1',
  2: '2',
  3: '3',
  4: '4',
  5: '5',
  Q: 'quiet',
};
export const MODE_FROM_NAME = invert(MODE_NAMES);
export const FAN_FROM_NAME = invert(FAN_NAMES);

const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);

const boolean = {
  toGladys: (value) => (typeof value === 'boolean' ? Number(value) : undefined),
  toFaikout: (value) => {
    const number = Number(value);
    return number === 0 || number === 1 ? number === 1 : undefined;
  },
};
const reading = { toGladys: (value) => (isNumber(value) ? value : undefined) };
const control = (fromFaikout, toFaikout) => ({
  toGladys: (value) => fromFaikout[value],
  toFaikout: (value) => toFaikout[Number(value)],
});

const switchFeature = (key, name) => ({
  key,
  name,
  category: CATEGORIES.SWITCH,
  type: TYPES.SWITCH.BINARY,
  min: 0,
  max: 1,
  read_only: false,
  has_feedback: true,
  keep_history: true,
  ...boolean,
});

const probeFeature = (key, name, min, max) => ({
  key,
  name,
  category: CATEGORIES.TEMPERATURE_SENSOR,
  // An external probe, not the ambient temperature of a room: Gladys keeps it
  // out of the room average.
  type: TYPES.TEMPERATURE_SENSOR.PROBE,
  unit: UNITS.CELSIUS,
  min,
  max,
  read_only: true,
  has_feedback: false,
  keep_history: true,
  ...reading,
});

// Every feature a Faikout can carry, in the order Gladys shows them. Every one
// declares `min`/`max`: they are NOT NULL in Gladys.
export const FEATURES = [
  {
    key: 'power',
    name: 'Power',
    category: CATEGORIES.AIR_CONDITIONING,
    type: TYPES.AIR_CONDITIONING.BINARY,
    min: 0,
    max: 1,
    read_only: false,
    has_feedback: true,
    keep_history: true,
    ...boolean,
  },
  {
    key: 'mode',
    name: 'Mode',
    category: CATEGORIES.AIR_CONDITIONING,
    type: TYPES.AIR_CONDITIONING.MODE,
    min: AC_MODE.AUTO,
    max: AC_MODE.FAN,
    read_only: false,
    has_feedback: true,
    keep_history: true,
    ...control(MODE_FROM_FAIKOUT, MODE_TO_FAIKOUT),
  },
  {
    key: 'temp',
    name: 'Target temperature',
    category: CATEGORIES.AIR_CONDITIONING,
    type: TYPES.AIR_CONDITIONING.TARGET_TEMPERATURE,
    unit: UNITS.CELSIUS,
    // The firmware defaults (tmin 16, tmax 32) widened: some units accept 10.
    min: 10,
    max: 32,
    read_only: false,
    has_feedback: true,
    keep_history: true,
    toGladys: reading.toGladys,
    // Daikin units take half degrees.
    toFaikout: (value) => {
      const number = Number(value);
      return Number.isFinite(number) ? Math.round(number * 2) / 2 : undefined;
    },
  },
  {
    key: 'fan',
    name: 'Fan speed',
    category: CATEGORIES.AIR_CONDITIONING,
    type: TYPES.AIR_CONDITIONING.FAN_SPEED,
    min: AC_FAN_SPEED.AUTO,
    max: AC_FAN_SPEED.QUIET,
    read_only: false,
    has_feedback: true,
    keep_history: true,
    ...control(FAN_FROM_FAIKOUT, FAN_TO_FAIKOUT),
  },
  {
    key: 'swingh',
    name: 'Horizontal swing',
    category: CATEGORIES.AIR_CONDITIONING,
    type: TYPES.AIR_CONDITIONING.SWING_HORIZONTAL,
    min: 0,
    max: 1,
    read_only: false,
    has_feedback: true,
    keep_history: false,
    ...boolean,
  },
  {
    key: 'swingv',
    name: 'Vertical swing',
    category: CATEGORIES.AIR_CONDITIONING,
    type: TYPES.AIR_CONDITIONING.SWING_VERTICAL,
    min: 0,
    max: 1,
    read_only: false,
    has_feedback: true,
    keep_history: false,
    ...boolean,
  },
  switchFeature('econo', 'Econo'),
  switchFeature('powerful', 'Powerful'),
  switchFeature('comfort', 'Comfort'),
  switchFeature('quiet', 'Quiet outdoor unit'),
  switchFeature('streamer', 'Streamer'),
  {
    key: 'home',
    name: 'Room temperature',
    category: CATEGORIES.TEMPERATURE_SENSOR,
    type: TYPES.SENSOR.DECIMAL,
    unit: UNITS.CELSIUS,
    min: -20,
    max: 60,
    read_only: true,
    has_feedback: false,
    keep_history: true,
    ...reading,
  },
  probeFeature('outside', 'Outside temperature', -50, 60),
  probeFeature('inlet', 'Inlet temperature', -50, 60),
  probeFeature('liquid', 'Refrigerant temperature', -50, 100),
  {
    key: 'hum',
    name: 'Humidity',
    category: CATEGORIES.HUMIDITY_SENSOR,
    type: TYPES.SENSOR.DECIMAL,
    unit: UNITS.PERCENT,
    min: 0,
    max: 100,
    read_only: true,
    has_feedback: false,
    keep_history: true,
    ...reading,
  },
  {
    key: 'consumption',
    name: 'Power consumption',
    category: CATEGORIES.ENERGY_SENSOR,
    type: TYPES.ENERGY_SENSOR.POWER,
    unit: UNITS.WATT,
    min: 0,
    max: 10000,
    read_only: true,
    has_feedback: false,
    keep_history: true,
    ...reading,
  },
];

export const FEATURE_BY_KEY = new Map(FEATURES.map((feature) => [feature.key, feature]));

// The controls a person changes with the IR remote or the Faikout web page:
// a change of one of them that Gladys did not ask for fires `changed_outside`.
export const WATCHED_CONTROLS = ['power', 'mode', 'temp', 'fan'];

/**
 * The feature keys a status carries: a field the unit does not report is
 * absent from its status, a field reported but unknown for now is `null`.
 * @param {object} status Faikout status
 * @returns {string[]} feature keys, in FEATURES order
 */
export function capabilitiesOf(status) {
  return FEATURES.filter((feature) => Object.hasOwn(status ?? {}, feature.key)).map(
    (feature) => feature.key,
  );
}

/**
 * The Gladys states of a status, for the features the device declares.
 * Values Gladys cannot represent (an unknown mode, a null reading) are left out.
 * @param {object} status Faikout status
 * @param {Iterable<string>} capabilities feature keys of the device
 * @param {(key: string) => string} featureId feature external_id builder
 */
export function statesOf(status, capabilities, featureId) {
  const states = [];
  for (const key of capabilities) {
    const feature = FEATURE_BY_KEY.get(key);
    const state = feature?.toGladys(status[key]);
    if (state !== undefined) {
      states.push({ device_feature_external_id: featureId(key), state });
    }
  }
  return states;
}

/**
 * The JSON control frame that sets one feature to a Gladys value.
 * @throws {Error} on a read-only feature or a value the unit cannot take
 */
export function controlFrame(key, value) {
  const feature = FEATURE_BY_KEY.get(key);
  if (!feature || feature.read_only) {
    throw new Error(`The feature "${key}" cannot be controlled`);
  }
  const faikoutValue = feature.toFaikout(value);
  if (faikoutValue === undefined) {
    throw new Error(`Invalid value ${value} for "${key}"`);
  }
  return { [key]: faikoutValue };
}

/**
 * Whether a status shows a control frame applied. The firmware acknowledges
 * every frame with its status, errors included, so a refused control (a unit
 * that does not have it, a password-protected setting) only shows as an
 * unchanged value.
 */
export function frameApplied(frame, status) {
  return Object.entries(frame).every(([key, value]) => {
    if (key === 'temp') {
      // The firmware clamps the set point to its own range: whatever it kept
      // is the truth, published as is.
      return true;
    }
    if (key === 'power' && value === false && status.mode === 'F') {
      // `fanrun`: switching a cooling unit off runs the fan for a while first.
      return true;
    }
    return status[key] === value;
  });
}
