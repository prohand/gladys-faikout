// -----------------------------------------------------------------------------
// Entry point of the Faikout integration for Gladys Assistant.
//
// The SDK reads the variables the Gladys supervisor gives the container
// (GLADYS_HOST_API_URL, GLADYS_INTEGRATION_TOKEN, GLADYS_INTEGRATION_SELECTOR)
// and handles the connection, the authentication and the reconnections. The
// handlers live in src/app.js; they are registered before connect().
// -----------------------------------------------------------------------------

import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { createApp } from './src/app.js';

const gladys = new GladysIntegration();
createApp(gladys);

// An unexpected rejection is logged, it does not stop the integration.
process.on('unhandledRejection', (err) => logger.error('Unhandled promise rejection', err));

logger.info('Starting the Faikout integration...');
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
