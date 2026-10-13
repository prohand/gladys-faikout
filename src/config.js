// -----------------------------------------------------------------------------
// Integration configuration.
//
// Filled in by the user from the `config_schema` of
// `gladys-assistant-integration.json`; DEFAULT_CONFIG mirrors its defaults
// (test/manifest.test.js checks it). normalizeConfig() turns the raw form
// values into the typed object the rest of the code reads.
// -----------------------------------------------------------------------------

export const DEFAULT_CONFIG = {
  // The Faikout units, as typed by the user: "Living room=192.168.1.50, ...".
  units: '',
  // Web password set on the units (Faikout settings), '' when there is none.
  password: '',
  // Seconds between two reads of every unit.
  poll_frequency: 30,
};

export const POLL_FREQUENCY_MIN = 5;
export const POLL_FREQUENCY_MAX = 600;

// A host name or an IPv4 address, optionally with a port; or a bracketed IPv6.
const HOST_PATTERN =
  /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*|\[[0-9a-f:.%a-z]+\])(?::\d{1,5})?$/i;

/**
 * Read one address as typed: `192.168.1.50`, `guestac.local`,
 * `http://192.168.1.50/` (copied from the browser) or `192.168.1.50:8080`.
 * @returns {string | null} the lowercased host[:port], null when unusable
 */
export function normalizeHost(text) {
  const host = String(text ?? '')
    .trim()
    .replace(/^[a-z]+:\/\//i, '')
    .replace(/[/?#].*$/, '')
    .toLowerCase();
  if (!HOST_PATTERN.test(host)) {
    return null;
  }
  const port = host.match(/:(\d+)$/)?.[1];
  if (port !== undefined && (Number(port) < 1 || Number(port) > 65535)) {
    return null;
  }
  return host;
}

/**
 * Parse the `units` field: entries separated by commas, semicolons or new
 * lines, each one an address optionally preceded by a name and `=`.
 * @param {string} text the field as typed
 * @returns {{ units: { host: string, label: string | null }[], invalid: string[] }}
 */
export function parseUnits(text) {
  const units = [];
  const invalid = [];
  const seen = new Set();
  for (const raw of String(text ?? '').split(/[,;\n]/)) {
    const entry = raw.trim();
    if (!entry) {
      continue;
    }
    const separator = entry.indexOf('=');
    const label = separator >= 0 ? entry.slice(0, separator).trim() : '';
    const host = normalizeHost(separator >= 0 ? entry.slice(separator + 1) : entry);
    if (!host) {
      invalid.push(entry);
      continue;
    }
    if (seen.has(host)) {
      continue;
    }
    seen.add(host);
    units.push({ host, label: label || null });
  }
  return { units, invalid };
}

/**
 * Merge the user config with the defaults and type it.
 * @param {Record<string, unknown>} raw config returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const pollFrequency = Number(raw.poll_frequency ?? DEFAULT_CONFIG.poll_frequency);
  return {
    ...DEFAULT_CONFIG,
    ...raw,
    units: typeof raw.units === 'string' ? raw.units : DEFAULT_CONFIG.units,
    // Pasted passwords often carry a stray space or new line, and a header
    // value cannot hold a new line.
    password: typeof raw.password === 'string' ? raw.password.trim() : DEFAULT_CONFIG.password,
    poll_frequency: Number.isFinite(pollFrequency)
      ? Math.min(POLL_FREQUENCY_MAX, Math.max(POLL_FREQUENCY_MIN, pollFrequency))
      : DEFAULT_CONFIG.poll_frequency,
  };
}
