// -----------------------------------------------------------------------------
// User-facing words, in English, French, German and Spanish, shared by the
// widgets and the
// Configuration screen messages.
// -----------------------------------------------------------------------------

import { LINK } from './faikout/manager.js';

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

export const MODE_LABELS = {
  A: { en: 'Auto', fr: 'Auto', de: 'Auto', es: 'Auto' },
  C: { en: 'Cooling', fr: 'Froid', de: 'Kühlen', es: 'Frío' },
  H: { en: 'Heating', fr: 'Chauffage', de: 'Heizen', es: 'Calor' },
  D: { en: 'Dry', fr: 'Déshumidification', de: 'Entfeuchten', es: 'Deshumidificación' },
  F: { en: 'Fan only', fr: 'Ventilation', de: 'Nur Lüften', es: 'Solo ventilación' },
};

export const FAN_LABELS = {
  A: { en: 'Auto', fr: 'Auto', de: 'Auto', es: 'Auto' },
  1: { en: 'Speed 1', fr: 'Vitesse 1', de: 'Stufe 1', es: 'Velocidad 1' },
  2: { en: 'Speed 2', fr: 'Vitesse 2', de: 'Stufe 2', es: 'Velocidad 2' },
  3: { en: 'Speed 3', fr: 'Vitesse 3', de: 'Stufe 3', es: 'Velocidad 3' },
  4: { en: 'Speed 4', fr: 'Vitesse 4', de: 'Stufe 4', es: 'Velocidad 4' },
  5: { en: 'Speed 5', fr: 'Vitesse 5', de: 'Stufe 5', es: 'Velocidad 5' },
  Q: { en: 'Quiet', fr: 'Silencieux', de: 'Leise', es: 'Silencioso' },
};

export const LINK_LABELS = {
  [LINK.UNKNOWN]: { en: 'Waiting', fr: 'En attente', de: 'Warten', es: 'En espera' },
  [LINK.ONLINE]: { en: 'Online', fr: 'En ligne', de: 'Online', es: 'En línea' },
  [LINK.AIRCON]: {
    en: 'AC not answering',
    fr: 'Clim muette',
    de: 'Klima antwortet nicht',
    es: 'El aire no responde',
  },
  [LINK.UNREACHABLE]: {
    en: 'Unreachable',
    fr: 'Injoignable',
    de: 'Nicht erreichbar',
    es: 'Inaccesible',
  },
};

export const OFF = { en: 'Off', fr: 'Arrêt', de: 'Aus', es: 'Apagado' };

/** Build a multi-language text from one function of the language. */
export const translate = (build) =>
  Object.fromEntries(LANGUAGES.map((language) => [language, build(language)]));

/** The same text in every language: a symbol, a number, a placeholder. */
export const everywhere = (text) => translate(() => text);

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
