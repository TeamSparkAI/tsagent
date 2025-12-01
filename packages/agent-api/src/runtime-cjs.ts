// CJS runtime entrypoint: sets package root global and re-exports runtime helpers

import path from 'path';
import * as runtimeImpl from './runtime.js';

// This file will be compiled to dist/cjs/runtime-cjs.js
// __dirname there will be .../packages/agent-api/dist/cjs
const agentApiRoot = path.resolve(__dirname, '..', '..'); // -> .../packages/agent-api

// Expose package root for internal consumers (e.g. ProviderFactory)
(globalThis as any).__TSAGENT_CORE_ROOT = agentApiRoot;

// Re-export the runtime helpers
export const createAgent = runtimeImpl.createAgent;
export const loadAgent = runtimeImpl.loadAgent;
export const loadAndInitializeAgent = runtimeImpl.loadAndInitializeAgent;
export const cloneAgent = runtimeImpl.cloneAgent;
export const agentExists = runtimeImpl.agentExists;


