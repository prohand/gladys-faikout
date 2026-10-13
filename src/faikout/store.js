// -----------------------------------------------------------------------------
// What the integration remembers about each unit, across restarts.
//
// A unit switched off when the integration starts must still be published to
// Gladys with its usual id and features, or Gladys would show it gone: its MAC
// address (the device id) and the fields it reported are kept in
// `/data/faikout-units.json`, `/data` being the one writable path of the
// container.
// -----------------------------------------------------------------------------

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createLogger } from '@gladysassistant/integration-sdk';

const logger = createLogger({ name: 'store' });

export const DEFAULT_DATA_DIR = '/data';
const FILE_NAME = 'faikout-units.json';

/**
 * @param {string} dir directory of the file
 * @returns {{ load(): Record<string, object>, save(units: Record<string, object>): void }}
 */
export function createUnitStore(dir = DEFAULT_DATA_DIR) {
  const file = join(dir, FILE_NAME);
  return {
    load() {
      try {
        const data = JSON.parse(readFileSync(file, 'utf8'));
        return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
      } catch (err) {
        if (err.code !== 'ENOENT') {
          logger.warn(`Cannot read ${file}, starting afresh: ${err.message}`);
        }
        return {};
      }
    },
    save(units) {
      try {
        mkdirSync(dir, { recursive: true });
        // Written aside then renamed: a crash mid-write never leaves half a file.
        writeFileSync(`${file}.tmp`, `${JSON.stringify(units, null, 2)}\n`);
        renameSync(`${file}.tmp`, file);
      } catch (err) {
        logger.warn(`Cannot write ${file}: ${err.message}`);
      }
    },
  };
}

/** A store that keeps nothing (tests). */
export function createMemoryStore(initial = {}) {
  let data = structuredClone(initial);
  return {
    load: () => structuredClone(data),
    save: (units) => {
      data = structuredClone(units);
    },
    get data() {
      return data;
    },
  };
}
