// -----------------------------------------------------------------------------
// Scene actions (Gladys 5.1+).
//
// Each key is declared in the manifest `scene_actions` (fields, outputs) and
// registered by src/app.js with `gladys.onSceneAction`. The fields arrive
// resolved by the core; an optional field left empty arrives empty and means
// "leave as is". Throwing fails this action only, the scene goes on.
//
// The scene TRIGGERS are fired by the unit manager (src/faikout/manager.js),
// where the transitions are seen.
// -----------------------------------------------------------------------------

import { FAN_FROM_NAME, MODE_FROM_NAME, MODE_NAMES } from './faikout/protocol.js';
import { LINK } from './faikout/manager.js';

const isEmpty = (value) => value === undefined || value === null || value === '';

function unitOf(manager, deviceExternalId) {
  const unit = manager.findByDevice(deviceExternalId);
  if (!unit) {
    throw new Error(`No Faikout unit for device ${deviceExternalId}`);
  }
  return unit;
}

const numberOrUndefined = (value) => (typeof value === 'number' ? value : undefined);

// Outputs are scalars: an unknown value is left out rather than sent as null.
function statusOutputs(unit, status) {
  const outputs = {
    online: unit.link === LINK.ONLINE,
    power: status?.power,
    mode: MODE_NAMES[status?.mode],
    target_temperature: numberOrUndefined(status?.temp),
    room_temperature: numberOrUndefined(status?.home),
    outside_temperature: numberOrUndefined(status?.outside),
    humidity: numberOrUndefined(status?.hum),
  };
  return Object.fromEntries(Object.entries(outputs).filter(([, value]) => value !== undefined));
}

/**
 * The control frame of `set_climate`, from its resolved fields.
 * @throws {Error} on a value the manifest options do not list
 */
export function climateFrame(fields) {
  const frame = {};
  if (!isEmpty(fields.power)) {
    if (fields.power !== 'on' && fields.power !== 'off') {
      throw new Error(`Invalid power "${fields.power}"`);
    }
    frame.power = fields.power === 'on';
  }
  if (!isEmpty(fields.mode)) {
    const mode = MODE_FROM_NAME[fields.mode];
    if (!mode) {
      throw new Error(`Invalid mode "${fields.mode}"`);
    }
    frame.mode = mode;
  }
  if (!isEmpty(fields.temperature)) {
    const temperature = Number(fields.temperature);
    if (!Number.isFinite(temperature)) {
      throw new Error(`Invalid temperature "${fields.temperature}"`);
    }
    frame.temp = Math.round(temperature * 2) / 2;
  }
  if (!isEmpty(fields.fan)) {
    const fan = FAN_FROM_NAME[fields.fan];
    if (!fan) {
      throw new Error(`Invalid fan speed "${fields.fan}"`);
    }
    frame.fan = fan;
  }
  return frame;
}

export const SCENE_ACTIONS = {
  // Power, mode, set point and fan in one frame: the unit gets them together,
  // instead of one Gladys "control a device" action per feature.
  async set_climate(manager, fields) {
    const unit = unitOf(manager, fields.device);
    const frame = climateFrame(fields);
    if (Object.keys(frame).length === 0) {
      throw new Error('Nothing to change: fill in at least one field');
    }
    const status = await manager.control(unit, frame);
    return statusOutputs(unit, status);
  },

  // Faikout auto: the Faikout switches heating and cooling itself to keep the
  // room between target - range and target + range. A range of 0 stops it.
  async set_faikout_auto(manager, fields) {
    const unit = unitOf(manager, fields.device);
    const target = Number(fields.target);
    const range = isEmpty(fields.range) ? 1 : Number(fields.range);
    if (!Number.isFinite(target) || !Number.isFinite(range) || range < 0) {
      throw new Error('Invalid target or range');
    }
    // The firmware keeps one decimal.
    const frame = { autot: Math.round(target * 10) / 10, autor: Math.round(range * 10) / 10 };
    const status = await manager.refresh(unit, frame);
    if (status.remote) {
      throw new Error(
        `${manager.displayName(unit)} is driven by an external controller (EnvMon, MQTT "control"): Faikout auto does not apply`,
      );
    }
    return { enabled: frame.autor > 0 };
  },

  // A fresh reading, for the next actions of the scene. A unit that does not
  // answer resolves `online: false` instead of failing: let the scene decide.
  async read_status(manager, fields) {
    const unit = unitOf(manager, fields.device);
    const status = await manager.refresh(unit);
    return statusOutputs(unit, status);
  },
};
