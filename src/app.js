// -----------------------------------------------------------------------------
// Wiring of the SDK to the Faikout units (no protocol logic here).
//
// Kept apart from index.js so the tests run the very same wiring against the
// SDK's fake Gladys, with fake Faikout units behind it.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { normalizeConfig } from './config.js';
import { connectionSummary, testConnection } from './connection.js';
import { FaikoutClient } from './faikout/client.js';
import { UnitManager } from './faikout/manager.js';
import { DEFAULT_DATA_DIR, createUnitStore } from './faikout/store.js';
import { SCENE_ACTIONS } from './scenes.js';
import { WIDGETS } from './widgets.js';

const logger = createLogger({ name: 'app' });

/**
 * Register every handler on `gladys`. Call it before `gladys.connect()`.
 * @param {import('@gladysassistant/integration-sdk').GladysIntegration} gladys
 * @param {object} [options]
 * @param {(host: string, options: { password: string }) => FaikoutClient} [options.clientFactory] (tests)
 * @param {{ load(): object, save(units: object): void }} [options.store] (tests)
 */
export function createApp(gladys, options = {}) {
  const manager = new UnitManager(gladys, {
    clientFactory:
      options.clientFactory ?? ((host, clientOptions) => new FaikoutClient(host, clientOptions)),
    store: options.store ?? createUnitStore(process.env.FAIKOUT_DATA_DIR || DEFAULT_DATA_DIR),
    widgetKeys: Object.keys(WIDGETS),
  });
  let lastSummary = null;

  // The Configuration screen badge, sent only when it changes.
  async function reportConnection() {
    const summary = connectionSummary(manager);
    const serialized = JSON.stringify(summary);
    if (serialized === lastSummary) {
      return;
    }
    lastSummary = serialized;
    try {
      await gladys.setConnectionStatus(summary.connected, summary.message);
    } catch (err) {
      lastSummary = null;
      logger.error('Publishing the connection status failed', err);
    }
  }

  async function applyConfig(rawConfig) {
    manager.configure(normalizeConfig(rawConfig));
    await manager.start(reportConnection);
  }

  // Run something, then publish what it changed whatever its outcome (a
  // command that failed may have found the unit unreachable).
  async function andFlush(run) {
    try {
      return await run();
    } finally {
      await manager.flush();
      await reportConnection();
    }
  }

  gladys.onScanRequest(() =>
    andFlush(async () => {
      await manager.refreshAll();
      manager.invalidate();
    }),
  );

  gladys.onSetValue((device, feature, value) =>
    andFlush(async () => {
      logger.info(`onSetValue <- ${feature.external_id} = ${value}`);
      await manager.setValue(feature.external_id, value);
    }),
  );

  // A device the user just created gets its states and its badge at once,
  // not at the next reading.
  gladys.onDeviceCreated(async (device) => {
    const unit = manager.findByDevice(device.external_id);
    if (unit) {
      await manager.publishStates(unit);
      manager.invalidate(['transports']);
      await manager.flush();
    }
  });

  gladys.onAction('test_connection', () => andFlush(() => testConnection(manager)));

  for (const [key, handler] of Object.entries(SCENE_ACTIONS)) {
    gladys.onSceneAction(key, (fields) => andFlush(() => handler(manager, fields)));
  }

  for (const [key, widget] of Object.entries(WIDGETS)) {
    gladys.onWidgetGet(key, (request) => widget.get(manager, request));
    gladys.onWidgetAction(key, (actionKey, params) =>
      widget.action(manager, { actionKey, params }),
    );
  }

  gladys.onConfigUpdated(async (rawConfig) => {
    logger.info('Configuration updated');
    await applyConfig(rawConfig);
  });

  gladys.on('connected', async () => {
    try {
      // Everything is sent again: what was published while disconnected was lost.
      manager.invalidate();
      lastSummary = null;
      await applyConfig(await gladys.getConfig());
    } catch (err) {
      logger.error('Post-connection initialization failed', err);
      await gladys
        .setConnectionStatus(false, {
          en: 'Initialization failed, check the integration logs.',
          fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
        })
        .catch(() => {});
    }
  });

  gladys.on('disconnected', () => manager.stop());

  gladys.handleShutdown((signal) => {
    logger.info(`Received ${signal} -> graceful shutdown`);
    manager.close();
  });

  return { manager };
}
