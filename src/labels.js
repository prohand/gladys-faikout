// -----------------------------------------------------------------------------
// User-facing words, in English and French, shared by the widgets and the
// Configuration screen messages.
// -----------------------------------------------------------------------------

import { LINK } from './faikout/manager.js';

export const LANGUAGES = ['en', 'fr'];

export const MODE_LABELS = {
  A: { en: 'Auto', fr: 'Auto' },
  C: { en: 'Cooling', fr: 'Froid' },
  H: { en: 'Heating', fr: 'Chauffage' },
  D: { en: 'Dry', fr: 'Déshumidification' },
  F: { en: 'Fan only', fr: 'Ventilation' },
};

export const FAN_LABELS = {
  A: { en: 'Auto', fr: 'Auto' },
  1: { en: 'Speed 1', fr: 'Vitesse 1' },
  2: { en: 'Speed 2', fr: 'Vitesse 2' },
  3: { en: 'Speed 3', fr: 'Vitesse 3' },
  4: { en: 'Speed 4', fr: 'Vitesse 4' },
  5: { en: 'Speed 5', fr: 'Vitesse 5' },
  Q: { en: 'Quiet', fr: 'Silencieux' },
};

export const LINK_LABELS = {
  [LINK.UNKNOWN]: { en: 'Waiting', fr: 'En attente' },
  [LINK.ONLINE]: { en: 'Online', fr: 'En ligne' },
  [LINK.AIRCON]: { en: 'AC not answering', fr: 'Clim muette' },
  [LINK.UNREACHABLE]: { en: 'Unreachable', fr: 'Injoignable' },
};

export const OFF = { en: 'Off', fr: 'Arrêt' };

/** Build a multi-language text from one function of the language. */
export const translate = (build) =>
  Object.fromEntries(LANGUAGES.map((language) => [language, build(language)]));

/** A Celsius value as the viewer reads it: `21.5 °C` or `70.7 °F`. */
export function formatTemperature(celsius, units = 'metric') {
  if (typeof celsius !== 'number' || !Number.isFinite(celsius)) {
    return '–';
  }
  if (units === 'imperial') {
    return `${Math.round((celsius * 9) / 5 + 32)} °F`;
  }
  return `${Math.round(celsius * 10) / 10} °C`;
}
