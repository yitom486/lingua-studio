import { GatewayServer } from './server.js';

export * from './server.js';
export * from './session/session-manager.js';
export * from './context/context-builder.js';
export * from './router/tool-router.js';

const server = new GatewayServer();
console.log('Study Studio Gateway initialized successfully.');
