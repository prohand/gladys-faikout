// -----------------------------------------------------------------------------
// What the Configuration screen says: the connection status badge, and the
// answer of the "Test the connection" button.
// -----------------------------------------------------------------------------

import { LINK } from './faikout/manager.js';
import { MODE_LABELS, OFF, everywhere, formatTemperature, translate } from './labels.js';

const NO_UNIT = {
  en: 'No Faikout unit configured yet: fill in the "Faikout units" field.',
  fr: 'Aucune unité Faikout configurée : remplissez le champ « Unités Faikout ».',
  de: 'Noch kein Faikout-Gerät konfiguriert: Fülle das Feld „Faikout-Geräte“ aus.',
  es: 'Aún no hay ninguna unidad Faikout configurada: rellene el campo «Unidades Faikout».',
};

/**
 * The connection status of the integration: connected while at least one
 * unit answers (the badge of each device tells which one does not).
 * @returns {{ connected: boolean, message?: Record<string, string> }}
 */
export function connectionSummary(manager) {
  const units = [...manager.units.values()];
  if (units.length === 0) {
    return { connected: false, message: NO_UNIT };
  }
  const answering = units.filter((unit) => unit.link !== LINK.UNREACHABLE);
  if (answering.length === 0 && units.some((unit) => unit.loginRequired)) {
    return {
      connected: false,
      message: {
        en: 'The Faikout asks for a web password: fill in the "Web password" field, or check it.',
        fr: 'Le Faikout demande un mot de passe web : remplissez le champ « Mot de passe web », ou vérifiez-le.',
        de: 'Der Faikout verlangt ein Web-Passwort: Fülle das Feld „Web-Passwort“ aus oder prüfe es.',
        es: 'El Faikout pide una contraseña web: rellene el campo «Contraseña web» o compruébela.',
      },
    };
  }
  if (answering.length === 0) {
    return {
      connected: false,
      message: {
        en: 'No Faikout unit answers: check their addresses and that they are on.',
        fr: 'Aucune unité Faikout ne répond : vérifiez leurs adresses et qu’elles sont allumées.',
        de: 'Kein Faikout-Gerät antwortet: Prüfe ihre Adressen und ob sie eingeschaltet sind.',
        es: 'Ninguna unidad Faikout responde: compruebe sus direcciones y que estén encendidas.',
      },
    };
  }
  return { connected: true };
}

function unitLine(manager, unit) {
  const name = `${manager.displayName(unit)} (${unit.host})`;
  const status = unit.status;
  if (unit.link === LINK.UNREACHABLE && unit.loginRequired) {
    return {
      en: `✗ ${name}: web password missing or wrong. Fill in the "Web password" field with the one set in the Faikout settings.`,
      fr: `✗ ${name} : mot de passe web absent ou faux. Remplissez le champ « Mot de passe web » avec celui défini dans les réglages du Faikout.`,
      de: `✗ ${name}: Web-Passwort fehlt oder ist falsch. Trage im Feld „Web-Passwort“ das in den Faikout-Einstellungen festgelegte ein.`,
      es: `✗ ${name}: falta la contraseña web o es incorrecta. Rellene el campo «Contraseña web» con la definida en los ajustes del Faikout.`,
    };
  }
  if (unit.link === LINK.UNREACHABLE || !status) {
    const reason = unit.lastError ?? '?';
    return {
      en: `✗ ${name}: no answer (${reason}).`,
      fr: `✗ ${name} : pas de réponse (${reason}).`,
      de: `✗ ${name}: keine Antwort (${reason}).`,
      es: `✗ ${name}: sin respuesta (${reason}).`,
    };
  }
  const protocol = status.protocol ? ` ${status.protocol}` : '';
  const model = unit.model ? `${unit.model}, ` : '';
  if (unit.link === LINK.AIRCON) {
    return {
      en: `⚠ ${name}: the Faikout answers, but not the air conditioner (${model}protocol${protocol || ' unknown'}). Check the cable.`,
      fr: `⚠ ${name} : le Faikout répond, mais pas la climatisation (${model}protocole${protocol || ' inconnu'}). Vérifiez le câble.`,
      de: `⚠ ${name}: Der Faikout antwortet, aber nicht das Klimagerät (${model}Protokoll${protocol || ' unbekannt'}). Prüfe das Kabel.`,
      es: `⚠ ${name}: el Faikout responde, pero no el aire acondicionado (${model}protocolo${protocol || ' desconocido'}). Compruebe el cable.`,
    };
  }
  const mode = status.power === false ? OFF : (MODE_LABELS[status.mode] ?? everywhere('?'));
  const room = formatTemperature(status.home);
  return {
    en: `✓ ${name}: OK (${model}protocol${protocol}) — ${mode.en}, room ${room}.`,
    fr: `✓ ${name} : OK (${model}protocole${protocol}) — ${mode.fr}, pièce ${room}.`,
    de: `✓ ${name}: OK (${model}Protokoll${protocol}) — ${mode.de}, Raum ${room}.`,
    es: `✓ ${name}: OK (${model}protocolo${protocol}) — ${mode.es}, habitación ${room}.`,
  };
}

/**
 * Handler of the `test_connection` manifest action: read every unit now and
 * say, for each one, what answered.
 */
export async function testConnection(manager) {
  await manager.refreshAll();
  await manager.flush();
  const units = [...manager.units.values()];
  const lines = units.map((unit) => unitLine(manager, unit));
  if (manager.invalid.length > 0) {
    const entries = manager.invalid.join(', ');
    lines.push({
      en: `Ignored, not an address: ${entries}.`,
      fr: `Ignoré, ce n'est pas une adresse : ${entries}.`,
      de: `Ignoriert, keine Adresse: ${entries}.`,
      es: `Ignorado, no es una dirección: ${entries}.`,
    });
  }
  if (lines.length === 0) {
    return NO_UNIT;
  }
  return translate((language) => lines.map((line) => line[language]).join('\n'));
}
