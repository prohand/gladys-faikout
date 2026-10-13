// -----------------------------------------------------------------------------
// What the Configuration screen says: the connection status badge, and the
// answer of the "Test the connection" button.
// -----------------------------------------------------------------------------

import { LINK } from './faikout/manager.js';
import { MODE_LABELS, OFF, formatTemperature, translate } from './labels.js';

const NO_UNIT = {
  en: 'No Faikout unit configured yet: fill in the "Faikout units" field.',
  fr: 'Aucune unité Faikout configurée : remplissez le champ « Unités Faikout ».',
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
  if (answering.length === 0) {
    return {
      connected: false,
      message: {
        en: 'No Faikout unit answers: check their addresses and that they are on.',
        fr: 'Aucune unité Faikout ne répond : vérifiez leurs adresses et qu’elles sont allumées.',
      },
    };
  }
  return { connected: true };
}

function unitLine(manager, unit) {
  const name = `${manager.displayName(unit)} (${unit.host})`;
  const status = unit.status;
  if (unit.link === LINK.UNREACHABLE || !status) {
    const reason = unit.lastError ?? '?';
    return {
      en: `✗ ${name}: no answer (${reason}).`,
      fr: `✗ ${name} : pas de réponse (${reason}).`,
    };
  }
  const protocol = status.protocol ? ` ${status.protocol}` : '';
  const model = unit.model ? `${unit.model}, ` : '';
  if (unit.link === LINK.AIRCON) {
    return {
      en: `⚠ ${name}: the Faikout answers, but not the air conditioner (${model}protocol${protocol || ' unknown'}). Check the cable.`,
      fr: `⚠ ${name} : le Faikout répond, mais pas la climatisation (${model}protocole${protocol || ' inconnu'}). Vérifiez le câble.`,
    };
  }
  const mode = status.power === false ? OFF : (MODE_LABELS[status.mode] ?? { en: '?', fr: '?' });
  const room = formatTemperature(status.home);
  return translate((language) =>
    language === 'fr'
      ? `✓ ${name} : OK (${model}protocole${protocol}) — ${mode.fr}, pièce ${room}.`
      : `✓ ${name}: OK (${model}protocol${protocol}) — ${mode.en}, room ${room}.`,
  );
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
    });
  }
  if (lines.length === 0) {
    return NO_UNIT;
  }
  return translate((language) => lines.map((line) => line[language]).join('\n'));
}
