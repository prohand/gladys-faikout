// -----------------------------------------------------------------------------
// Dashboard widgets (Gladys 5.1+).
//
// Declared in the manifest `widgets`, registered by src/app.js. The content is
// declarative (tiles, status rows, buttons): the core renders it.
//   - `unit`: one air conditioner. Live tiles bound to its features (they
//     follow the published states with no refresh), status rows for what no
//     feature carries (link, mode, fan, Faikout auto, defrost), On/Off buttons
//     bound to the power feature, and a Refresh button.
//   - `overview`: one row per configured unit.
// The unit manager nudges both whenever what they show changes.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { LINK } from './faikout/manager.js';
import {
  FAN_LABELS,
  LINK_LABELS,
  MODE_LABELS,
  OFF,
  formatTemperature,
  translate,
} from './labels.js';

export const UNIT_WIDGET = 'unit';
export const OVERVIEW_WIDGET = 'overview';
export const REFRESH_ACTION = 'refresh';

const OVERVIEW_ROWS = 10;

const LINK_COLORS = {
  [LINK.UNKNOWN]: WIDGET_COLORS.NEUTRAL,
  [LINK.ONLINE]: WIDGET_COLORS.SUCCESS,
  [LINK.AIRCON]: WIDGET_COLORS.WARNING,
  [LINK.UNREACHABLE]: WIDGET_COLORS.DANGER,
};

// Live tiles, in order of interest. A widget holds 8 components: 4 tiles, the
// status rows and 3 buttons.
const TILES = [
  { key: 'home', label: { en: 'Room', fr: 'Pièce' }, icon: 'thermometer' },
  { key: 'temp', label: { en: 'Set point', fr: 'Consigne' }, icon: 'target' },
  { key: 'outside', label: { en: 'Outside', fr: 'Extérieur' }, icon: 'cloud' },
  { key: 'consumption', label: { en: 'Power', fr: 'Puissance' }, icon: 'zap' },
  { key: 'hum', label: { en: 'Humidity', fr: 'Humidité' }, icon: 'droplet' },
];
const MAX_TILES = 4;

function modeText(status) {
  if (status?.power === false) {
    return OFF;
  }
  return MODE_LABELS[status?.mode] ?? { en: '–', fr: '–' };
}

function statusRows(manager, unit, units) {
  const status = unit.status ?? {};
  const rows = [
    {
      // The unit's name heads the rows: the card title is the widget's.
      label: manager.displayName(unit).slice(0, 40),
      icon: unit.link === LINK.UNREACHABLE ? 'wifi-off' : 'wifi',
      value: LINK_LABELS[unit.link],
      color: LINK_COLORS[unit.link],
    },
  ];
  if (unit.link === LINK.UNREACHABLE || !unit.status) {
    return rows;
  }
  rows.push({
    label: { en: 'Mode', fr: 'Mode' },
    icon: 'power',
    value: modeText(status),
    color: status.power ? WIDGET_COLORS.PRIMARY : WIDGET_COLORS.NEUTRAL,
  });
  if (FAN_LABELS[status.fan]) {
    rows.push({
      label: { en: 'Fan', fr: 'Ventilation' },
      icon: 'wind',
      value: FAN_LABELS[status.fan],
      color: WIDGET_COLORS.NEUTRAL,
    });
  }
  if (typeof status.comp === 'number') {
    rows.push({
      label: { en: 'Compressor', fr: 'Compresseur' },
      icon: 'activity',
      value: status.comp,
      color: status.comp > 0 ? WIDGET_COLORS.INFO : WIDGET_COLORS.NEUTRAL,
    });
  }
  if (typeof status.autor === 'number') {
    const on = status.autor > 0;
    rows.push({
      label: { en: 'Faikout auto', fr: 'Faikout auto' },
      icon: 'sliders',
      value: on
        ? `${formatTemperature(status.autot, units)} ± ${status.autor}`
        : { en: 'Off', fr: 'Arrêt' },
      color: on ? WIDGET_COLORS.PRIMARY : WIDGET_COLORS.NEUTRAL,
    });
  }
  if (status.antifreeze) {
    rows.push({
      label: { en: 'Defrost', fr: 'Dégivrage' },
      icon: 'cloud-snow',
      value: { en: 'In progress', fr: 'En cours' },
      color: WIDGET_COLORS.WARNING,
    });
  }
  return rows;
}

function overviewRow(manager, unit, units) {
  const status = unit.status;
  const label = manager.displayName(unit).slice(0, 40);
  if (unit.link === LINK.UNREACHABLE || unit.link === LINK.AIRCON || !status) {
    return {
      label,
      icon: 'wifi-off',
      value: LINK_LABELS[unit.link],
      color: LINK_COLORS[unit.link],
    };
  }
  const mode = modeText(status);
  const room = formatTemperature(status.home, units);
  return {
    label,
    icon: status.power ? 'power' : 'moon',
    value: translate((language) => `${mode[language]} · ${room}`),
    color: status.power ? WIDGET_COLORS.PRIMARY : WIDGET_COLORS.NEUTRAL,
  };
}

const refreshButton = (params) => ({
  type: 'button',
  label: { en: 'Refresh', fr: 'Actualiser' },
  icon: 'refresh-cw',
  style: 'secondary',
  action: { key: REFRESH_ACTION, ...(params ? { params } : {}) },
});

const REFRESHED = { en: 'Refreshed', fr: 'Actualisé' };

export const WIDGETS = {
  [UNIT_WIDGET]: {
    async get(manager, { settings, units }) {
      const unit = manager.findByDevice(settings?.device);
      if (!unit) {
        return {
          ttl_seconds: 60,
          components: [
            {
              type: 'text',
              text: {
                en: 'Pick a Faikout air conditioner in the widget settings.',
                fr: 'Choisissez une climatisation Faikout dans les réglages du widget.',
              },
            },
          ],
        };
      }
      const ids = manager.ids(unit);
      const tiles = TILES.filter((tile) => unit.capabilities.has(tile.key))
        .slice(0, MAX_TILES)
        .map((tile) => ({
          type: 'value',
          label: tile.label,
          icon: tile.icon,
          device_feature: ids.feature(tile.key),
        }));
      const buttons = [];
      if (unit.capabilities.has('power')) {
        // Bound to the power feature: the core runs it through onSetValue.
        buttons.push(
          {
            type: 'button',
            label: { en: 'On', fr: 'Allumer' },
            icon: 'power',
            style: 'primary',
            device_feature: ids.feature('power'),
            value: 1,
          },
          {
            type: 'button',
            label: { en: 'Off', fr: 'Éteindre' },
            icon: 'power',
            style: 'secondary',
            device_feature: ids.feature('power'),
            value: 0,
          },
        );
      }
      buttons.push(refreshButton({ device: ids.device }));
      return {
        // Every change the rows show nudges the widget: the TTL is a safety net.
        ttl_seconds: 300,
        components: [
          ...tiles,
          { type: 'status', items: statusRows(manager, unit, units) },
          ...buttons,
        ],
      };
    },

    async action(manager, { actionKey, params }) {
      if (actionKey !== REFRESH_ACTION) {
        throw new Error(`Unknown widget action: ${actionKey}`);
      }
      const unit = manager.findByDevice(params?.device);
      if (!unit) {
        throw new Error('This air conditioner is no longer configured');
      }
      await manager.refresh(unit);
      await manager.flush();
      return REFRESHED;
    },
  },

  [OVERVIEW_WIDGET]: {
    async get(manager, { units }) {
      const all = [...manager.units.values()];
      if (all.length === 0) {
        return {
          ttl_seconds: 300,
          components: [
            {
              type: 'text',
              text: {
                en: 'No Faikout unit configured yet: add them in the integration configuration.',
                fr: "Aucune unité Faikout configurée : ajoutez-les dans la configuration de l'intégration.",
              },
            },
          ],
        };
      }
      const components = [
        {
          type: 'status',
          items: all.slice(0, OVERVIEW_ROWS).map((unit) => overviewRow(manager, unit, units)),
        },
      ];
      if (all.length > OVERVIEW_ROWS) {
        const more = all.length - OVERVIEW_ROWS;
        components.push({
          type: 'text',
          variant: 'caption',
          text: { en: `And ${more} more`, fr: `Et ${more} de plus` },
        });
      }
      components.push(refreshButton());
      return { ttl_seconds: 300, components };
    },

    async action(manager, { actionKey }) {
      if (actionKey !== REFRESH_ACTION) {
        throw new Error(`Unknown widget action: ${actionKey}`);
      }
      await manager.refreshAll();
      await manager.flush();
      return REFRESHED;
    },
  },
};
