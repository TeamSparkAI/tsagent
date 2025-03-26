import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import log from 'electron-log';

interface ConfigFile {
  config: Record<string, string>;
}

let configFile: ConfigFile | null = null;

export function getDataDirectory(): string {
  if (app.isPackaged) {
    return app.getPath('userData');
  } else {
    return process.cwd();
  }
}

function getConfigPath(): string {
  const dataDir = getDataDirectory();
  const configDir = path.join(dataDir, 'config');
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
  return path.join(configDir, 'config.json');
}

function loadConfig(): ConfigFile {
  const configPath = getConfigPath();
  
  // Create default config if it doesn't exist
  if (!fs.existsSync(configPath)) {
    const defaultConfig: ConfigFile = {
      config: {}
    };
    fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
    return defaultConfig;
  }

  try {
    const data = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    log.error('Error loading config:', error);
    throw new Error('Failed to load config.json');
  }
}

export function getConfigValue(key: string): string {
  if (!configFile) {
    configFile = loadConfig();
  }
  const value = configFile.config[key];
  if (!value) {
    throw new Error(`${key} not set in config.json`);
  }
  return value;
}

export function updateConfigValue(key: string, value: string): void {
  if (!configFile) {
    configFile = loadConfig();
  }
  
  configFile.config[key] = value;
  const configPath = getConfigPath();
  fs.writeFileSync(configPath, JSON.stringify(configFile, null, 2));
} 