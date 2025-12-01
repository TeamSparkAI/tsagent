// ESM runtime entrypoint: sets package root global and re-exports runtime helpers

import path from 'path';
import { fileURLToPath } from 'url';
import * as runtimeImpl from './runtime.js';

// Compute package root for ESM build:
// This file will be compiled to dist/esm/runtime-esm.js
// __dirname there will be .../packages/agent-api/dist/esm
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const agentApiRoot = path.resolve(__dirname, '..', '..'); // -> .../packages/agent-api

// Expose package root for internal consumers (e.g. ProviderFactory)
(globalThis as any).__TSAGENT_CORE_ROOT = agentApiRoot;

// Re-export the runtime helpers
export const createAgent = runtimeImpl.createAgent;
export const loadAgent = runtimeImpl.loadAgent;
export const loadAndInitializeAgent = runtimeImpl.loadAndInitializeAgent;
export const cloneAgent = runtimeImpl.cloneAgent;
export const agentExists = runtimeImpl.agentExists;


