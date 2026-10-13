// -----------------------------------------------------------------------------
// Dashboard widgets (Gladys 5.1+).
//
// Declared in the manifest `widgets`, registered by src/app.js. The content is
// declarative (tiles, status rows, buttons): the core renders it.
//   - `unit`: one air conditioner. Live tiles and a 24 h temperature chart
//     bound to its features (they follow the published states with no
//     refresh), status rows (state, mode, fan, flaps, comfort modes, Faikout
//     auto and defrost while they run), an On or Off button bound to the power
//     feature, and a Refresh button.
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
  everywhere,
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
// temperature chart, the status rows and 2 buttons.
const TILES = [
  {
    key: 'home',
    label: { en: 'Room', fr: 'Pièce', de: 'Raum', es: 'Habitación' },
    icon: 'thermometer',
  },
  {
    key: 'temp',
    label: { en: 'Set point', fr: 'Consigne', de: 'Sollwert', es: 'Consigna' },
    icon: 'target',
  },
  {
    key: 'outside',
    label: { en: 'Outside', fr: 'Extérieur', de: 'Außen', es: 'Exterior' },
    icon: 'sun',
  },
  {
    key: 'consumption',
    label: { en: 'Power', fr: 'Puissance', de: 'Leistung', es: 'Potencia' },
    icon: 'zap',
  },
  {
    key: 'hum',
    label: { en: 'Humidity', fr: 'Humidité', de: 'Feuchte', es: 'Humedad' },
    icon: 'droplet',
  },
];
const MAX_TILES = 4;

// The curves of the chart, drawn from the history Gladys keeps of them.
const CHART_FEATURES = ['home', 'temp', 'outside'];

// Comfort options, in the order of the Faikout page. Short names: they share
// one status row (value ≤ 40 characters).
const COMFORT_LABELS = {
  econo: { en: 'Econo', fr: 'Éco', de: 'Eco', es: 'Eco' },
  powerful: { en: 'Powerful', fr: 'Puissant', de: 'Powerful', es: 'Potente' },
  comfort: { en: 'Comfort', fr: 'Confort', de: 'Komfort', es: 'Confort' },
  quiet: { en: 'Quiet', fr: 'Silence', de: 'Leise', es: 'Silencio' },
  streamer: { en: 'Streamer', fr: 'Streamer', de: 'Streamer', es: 'Streamer' },
};

function modeText(status) {
  if (status?.power === false) {
    return OFF;
  }
  return MODE_LABELS[status?.mode] ?? everywhere('–');
}

function stateRow(unit) {
  const row = { label: { en: 'State', fr: 'État', de: 'Zustand', es: 'Estado' }, icon: 'circle' };
  if (unit.link !== LINK.ONLINE || !unit.status) {
    return { ...row, value: LINK_LABELS[unit.link], color: LINK_COLORS[unit.link] };
  }
  return unit.status.power
    ? {
        ...row,
        value: {
          en: 'Running',
          fr: 'En marche',
          de: 'In Betrieb',
          es: 'En marcha',
        },
        color: WIDGET_COLORS.SUCCESS,
      }
    : {
        ...row,
        value: { en: 'Off', fr: 'Arrêtée', de: 'Aus', es: 'Apagado' },
        color: WIDGET_COLORS.NEUTRAL,
      };
}

function swingText(status) {
  const { swingh, swingv } = status;
  if (swingh && swingv) {
    return { en: 'Both ways', fr: 'Les deux', de: 'Beide', es: 'Ambas' };
  }
  if (swingv) {
    return { en: 'Vertical', fr: 'Verticaux', de: 'Vertikal', es: 'Verticales' };
  }
  if (swingh) {
    return { en: 'Horizontal', fr: 'Horizontaux', de: 'Horizontal', es: 'Horizontales' };
  }
  return { en: 'Fixed', fr: 'Fixes', de: 'Fest', es: 'Fijas' };
}

function statusRows(unit, units) {
  const status = unit.status ?? {};
  const rows = [stateRow(unit)];
  if (unit.link === LINK.UNREACHABLE || !unit.status) {
    return rows;
  }
  const active = status.power ? WIDGET_COLORS.PRIMARY : WIDGET_COLORS.NEUTRAL;
  if (MODE_LABELS[status.mode]) {
    rows.push({
      label: { en: 'Mode', fr: 'Mode', de: 'Modus', es: 'Modo' },
      icon: 'sliders',
      value: MODE_LABELS[status.mode],
      color: active,
    });
  }
  if (FAN_LABELS[status.fan]) {
    rows.push({
      label: { en: 'Fan', fr: 'Ventilation', de: 'Lüfter', es: 'Ventilador' },
      icon: 'wind',
      value: FAN_LABELS[status.fan],
      color: active,
    });
  }
  if (typeof status.swingh === 'boolean' || typeof status.swingv === 'boolean') {
    rows.push({
      label: { en: 'Flaps', fr: 'Volets', de: 'Lamellen', es: 'Lamas' },
      icon: 'move',
      value: swingText(status),
      color: status.swingh || status.swingv ? active : WIDGET_COLORS.NEUTRAL,
    });
  }
  const comfortKeys = Object.keys(COMFORT_LABELS).filter((key) => key in status);
  if (comfortKeys.length > 0) {
    const on = comfortKeys.filter((key) => status[key] === true);
    rows.push({
      label: {
        en: 'Comfort modes',
        fr: 'Modes confort',
        de: 'Komfortmodi',
        es: 'Modos de confort',
      },
      icon: 'star',
      value:
        on.length > 0
          ? translate((language) =>
              on
                .map((key) => COMFORT_LABELS[key][language])
                .join(', ')
                .slice(0, 40),
            )
          : { en: 'None', fr: 'Aucun', de: 'Keine', es: 'Ninguno' },
      color: on.length > 0 ? active : WIDGET_COLORS.NEUTRAL,
    });
  }
  if (typeof status.autor === 'number' && status.autor > 0) {
    rows.push({
      label: everywhere('Faikout auto'),
      icon: 'crosshair',
      value: `${formatTemperature(status.autot, units)} ± ${status.autor}`,
      color: WIDGET_COLORS.PRIMARY,
    });
  }
  if (status.antifreeze) {
    rows.push({
      label: { en: 'Defrost', fr: 'Dégivrage', de: 'Abtauen', es: 'Desescarche' },
      icon: 'cloud-snow',
      value: { en: 'In progress', fr: 'En cours', de: 'Läuft', es: 'En curso' },
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
  label: { en: 'Refresh', fr: 'Actualiser', de: 'Aktualisieren', es: 'Actualizar' },
  icon: 'refresh-cw',
  style: 'secondary',
  action: { key: REFRESH_ACTION, ...(params ? { params } : {}) },
});

const REFRESHED = { en: 'Refreshed', fr: 'Actualisé', de: 'Aktualisiert', es: 'Actualizado' };

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
                de: 'Wähle in den Widget-Einstellungen ein Faikout-Klimagerät.',
                es: 'Elija un aire acondicionado Faikout en la configuración del widget.',
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
      const components = [...tiles];
      const curves = CHART_FEATURES.filter((key) => unit.capabilities.has(key));
      if (curves.length > 0) {
        components.push({
          type: 'chart',
          title: {
            en: 'Temperatures, 24 h',
            fr: 'Températures, 24 h',
            de: 'Temperaturen, 24 h',
            es: 'Temperaturas, 24 h',
          },
          chart_type: 'line',
          device_features: curves.map((key) => ids.feature(key)),
          interval: 'last-day',
        });
      }
      components.push({ type: 'status', items: statusRows(unit, units) });
      if (unit.capabilities.has('power')) {
        // One button, the opposite of the current state (8 components at
        // most). Bound to the power feature: the core runs it through
        // onSetValue, and the power change nudges the widget.
        const on = unit.status?.power === true;
        components.push({
          type: 'button',
          label: on
            ? { en: 'Off', fr: 'Éteindre', de: 'Ausschalten', es: 'Apagar' }
            : { en: 'On', fr: 'Allumer', de: 'Einschalten', es: 'Encender' },
          icon: 'power',
          style: on ? 'secondary' : 'primary',
          device_feature: ids.feature('power'),
          value: on ? 0 : 1,
        });
      }
      components.push(refreshButton({ device: ids.device }));
      // Every change the rows show nudges the widget: the TTL is a safety net.
      return { ttl_seconds: 300, components };
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
                de: 'Noch kein Faikout-Gerät konfiguriert: Füge sie in der Konfiguration der Integration hinzu.',
                es: 'Aún no hay ninguna unidad Faikout configurada: añádalas en la configuración de la integración.',
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
          text: {
            en: `And ${more} more`,
            fr: `Et ${more} de plus`,
            de: `Und ${more} weitere`,
            es: `Y ${more} más`,
          },
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
