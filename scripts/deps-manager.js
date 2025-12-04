#!/usr/bin/env node

/**
 * Dependency Manager Script
 * 
 * Manages conversion between file:// and npm dependencies for local development vs publishing.
 * Handles dependency order and npm install operations.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

// Package dependency graph - defines the order packages should be processed
const PACKAGE_ORDER = [
  // Level 1: Base package with no internal dependencies
  { name: '@tsagent/core', path: 'packages/agent-api' },
  
  // Level 2: Packages that depend on @tsagent/core
  { name: '@tsagent/server', path: 'packages/a2a-server' },
  { name: '@tsagent/acp-server', path: 'packages/acp-server' },
  { name: '@tsagent/meta-mcp', path: 'packages/meta-mcp' },
  { name: '@tsagent/agent-mcp', path: 'packages/agent-mcp' },
  
  // Level 3: Packages that depend on level 2 packages
  { name: '@tsagent/orchestrator', path: 'packages/a2a-mcp' },
  
  // Level 4: Apps that depend on packages
  { name: '@tsagent/cli', path: 'apps/cli' },
  { name: 'tsagent-foundry', path: 'apps/desktop' },
];

// Internal package names that should be converted
const INTERNAL_PACKAGES = new Set(PACKAGE_ORDER.map(p => p.name));

/**
 * Get the package.json path for a package
 */
function getPackageJsonPath(pkgPath) {
  return path.join(ROOT_DIR, pkgPath, 'package.json');
}

/**
 * Read and parse package.json
 */
function readPackageJson(pkgPath) {
  const filePath = getPackageJsonPath(pkgPath);
  const content = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(content);
}

/**
 * Write package.json
 */
function writePackageJson(pkgPath, data) {
  const filePath = getPackageJsonPath(pkgPath);
  const content = JSON.stringify(data, null, 2) + '\n';
  fs.writeFileSync(filePath, content, 'utf-8');
}

/**
 * Convert dependencies to file:// format for local development
 */
function convertToFileDeps(pkg) {
  const pkgJson = readPackageJson(pkg.path);
  let modified = false;

  // Process dependencies
  if (pkgJson.dependencies) {
    for (const [depName, depVersion] of Object.entries(pkgJson.dependencies)) {
      if (INTERNAL_PACKAGES.has(depName)) {
        // Find the package info
        const depPkg = PACKAGE_ORDER.find(p => p.name === depName);
        if (depPkg) {
          const relativePath = path.relative(
            path.join(ROOT_DIR, pkg.path),
            path.join(ROOT_DIR, depPkg.path)
          ).replace(/\\/g, '/'); // Normalize to forward slashes for file:// URLs
          const filePath = `file:${relativePath}`;
          if (pkgJson.dependencies[depName] !== filePath) {
            pkgJson.dependencies[depName] = filePath;
            modified = true;
          }
        }
      }
    }
  }

  if (modified) {
    writePackageJson(pkg.path, pkgJson);
    return true;
  }
  return false;
}

/**
 * Convert dependencies back to npm versions for publishing
 */
function convertToNpmDeps(pkg) {
  const pkgJson = readPackageJson(pkg.path);
  let modified = false;

  // Process dependencies
  if (pkgJson.dependencies) {
    for (const [depName, depVersion] of Object.entries(pkgJson.dependencies)) {
      if (INTERNAL_PACKAGES.has(depName) && typeof depVersion === 'string' && depVersion.startsWith('file:')) {
        // Find the package info and read its version from package.json
        const depPkg = PACKAGE_ORDER.find(p => p.name === depName);
        if (depPkg) {
          const depPkgJson = readPackageJson(depPkg.path);
          const version = depPkgJson.version;
          if (version) {
            pkgJson.dependencies[depName] = `^${version}`;
            modified = true;
          }
        }
      }
    }
  }

  // Process devDependencies
  if (pkgJson.devDependencies) {
    for (const [depName, depVersion] of Object.entries(pkgJson.devDependencies)) {
      if (INTERNAL_PACKAGES.has(depName) && typeof depVersion === 'string' && depVersion.startsWith('file:')) {
        const depPkg = PACKAGE_ORDER.find(p => p.name === depName);
        if (depPkg) {
          const depPkgJson = readPackageJson(depPkg.path);
          const version = depPkgJson.version;
          if (version) {
            pkgJson.devDependencies[depName] = `^${version}`;
            modified = true;
          }
        }
      }
    }
  }

  if (modified) {
    writePackageJson(pkg.path, pkgJson);
    return true;
  }
  return false;
}

/**
 * Clean up node_modules and package-lock.json
 */
function cleanPackage(pkgPath) {
  const pkgDir = path.join(ROOT_DIR, pkgPath);
  const nodeModulesPath = path.join(pkgDir, 'node_modules');
  const lockFilePath = path.join(pkgDir, 'package-lock.json');

  if (fs.existsSync(nodeModulesPath)) {
    console.log(`  Removing node_modules from ${pkgPath}`);
    fs.rmSync(nodeModulesPath, { recursive: true, force: true });
  }

  if (fs.existsSync(lockFilePath)) {
    console.log(`  Removing package-lock.json from ${pkgPath}`);
    fs.unlinkSync(lockFilePath);
  }
}

/**
 * Run npm install for a package
 */
function installPackage(pkgPath) {
  const pkgDir = path.join(ROOT_DIR, pkgPath);
  const displayPath = pkgPath === '.' ? 'root' : pkgPath;
  console.log(`  Installing dependencies for ${displayPath}...`);
  try {
    execSync('npm install', {
      cwd: pkgDir,
      stdio: 'inherit',
    });
  } catch (error) {
    console.error(`  Error installing dependencies for ${displayPath}:`, error.message);
    throw error;
  }
}

/**
 * Convert all packages to file:// dependencies
 */
function convertToFileMode() {
  console.log('Converting dependencies to file:// format for local development...\n');
  
  for (const pkg of PACKAGE_ORDER) {
    console.log(`Processing ${pkg.name}...`);
    const modified = convertToFileDeps(pkg);
    if (modified) {
      console.log(`  ✓ Updated dependencies to file:// format`);
    } else {
      console.log(`  - No changes needed`);
    }
  }
  
  console.log('\n✓ All packages converted to file:// dependencies\n');
}

/**
 * Convert all packages back to npm versions
 */
function convertToNpmMode() {
  console.log('Converting dependencies back to npm versions for publishing...\n');
  
  for (const pkg of PACKAGE_ORDER) {
    console.log(`Processing ${pkg.name}...`);
    const modified = convertToNpmDeps(pkg);
    if (modified) {
      console.log(`  ✓ Updated dependencies to npm versions`);
    } else {
      console.log(`  - No changes needed`);
    }
  }
  
  console.log('\n✓ All packages converted to npm dependencies\n');
}

/**
 * Install dependencies in the correct order
 */
function installDependencies(includeRoot = false) {
  console.log('Installing dependencies in dependency order...\n');
  
  if (includeRoot) {
    console.log('Installing root dependencies...');
    installPackage('.');
    console.log('  ✓ Root installed\n');
  }
  
  for (const pkg of PACKAGE_ORDER) {
    console.log(`Installing ${pkg.name}...`);
    installPackage(pkg.path);
    console.log(`  ✓ ${pkg.name} installed\n`);
  }
  
  console.log('✓ All dependencies installed\n');
}

/**
 * Clean all packages (remove node_modules and package-lock.json)
 */
function cleanAllPackages() {
  console.log('Cleaning all packages...\n');
  
  for (const pkg of PACKAGE_ORDER) {
    console.log(`Cleaning ${pkg.name}...`);
    cleanPackage(pkg.path);
  }
  
  // Also clean root if it has node_modules
  const rootNodeModules = path.join(ROOT_DIR, 'node_modules');
  const rootLockFile = path.join(ROOT_DIR, 'package-lock.json');
  
  if (fs.existsSync(rootNodeModules)) {
    console.log('  Removing root node_modules...');
    fs.rmSync(rootNodeModules, { recursive: true, force: true });
  }
  
  if (fs.existsSync(rootLockFile)) {
    console.log('  Removing root package-lock.json...');
    fs.unlinkSync(rootLockFile);
  }
  
  console.log('\n✓ All packages cleaned\n');
}

/**
 * Update version in a package.json file
 */
function updatePackageVersion(pkgPath, newVersion) {
  const pkgJson = readPackageJson(pkgPath);
  const oldVersion = pkgJson.version;
  if (oldVersion !== newVersion) {
    pkgJson.version = newVersion;
    writePackageJson(pkgPath, pkgJson);
    return true;
  }
  return false;
}

/**
 * Update internal dependency versions in a package.json
 */
function updateInternalDependencyVersions(pkg, newVersion) {
  const pkgJson = readPackageJson(pkg.path);
  let modified = false;

  // Process dependencies
  if (pkgJson.dependencies) {
    for (const [depName, depVersion] of Object.entries(pkgJson.dependencies)) {
      if (INTERNAL_PACKAGES.has(depName)) {
        // Update to new version (preserve file:// if present, otherwise use ^version)
        const currentValue = pkgJson.dependencies[depName];
        if (typeof currentValue === 'string' && currentValue.startsWith('file:')) {
          // Keep file:// format but we'll update it when converting to npm
          // For now, we only update npm versions
        } else {
          // Update npm version
          pkgJson.dependencies[depName] = `^${newVersion}`;
          modified = true;
        }
      }
    }
  }

  // Process devDependencies
  if (pkgJson.devDependencies) {
    for (const [depName, depVersion] of Object.entries(pkgJson.devDependencies)) {
      if (INTERNAL_PACKAGES.has(depName)) {
        const currentValue = pkgJson.devDependencies[depName];
        if (typeof currentValue === 'string' && currentValue.startsWith('file:')) {
          // Keep file:// format
        } else {
          // Update npm version
          pkgJson.devDependencies[depName] = `^${newVersion}`;
          modified = true;
        }
      }
    }
  }

  if (modified) {
    writePackageJson(pkg.path, pkgJson);
    return true;
  }
  return false;
}

/**
 * Bump version across all packages
 */
function bumpVersion(newVersion) {
  // Validate version format (basic check)
  if (!/^\d+\.\d+\.\d+/.test(newVersion)) {
    console.error(`Error: Invalid version format "${newVersion}". Expected format: X.Y.Z (e.g., 1.4.0)`);
    process.exit(1);
  }

  console.log(`Bumping version to ${newVersion}...\n`);

  // Update root package.json version
  console.log('Updating root package.json version...');
  const rootModified = updatePackageVersion('.', newVersion);
  if (rootModified) {
    console.log(`  ✓ Root version updated to ${newVersion}`);
  } else {
    console.log(`  - Root version already ${newVersion}`);
  }

  // Update all package versions
  console.log('\nUpdating package versions...');
  for (const pkg of PACKAGE_ORDER) {
    console.log(`  Updating ${pkg.name}...`);
    const modified = updatePackageVersion(pkg.path, newVersion);
    if (modified) {
      console.log(`    ✓ Version updated to ${newVersion}`);
    } else {
      console.log(`    - Version already ${newVersion}`);
    }
  }

  // Update internal dependency versions
  console.log('\nUpdating internal dependency versions...');
  for (const pkg of PACKAGE_ORDER) {
    console.log(`  Updating dependencies in ${pkg.name}...`);
    const modified = updateInternalDependencyVersions(pkg, newVersion);
    if (modified) {
      console.log(`    ✓ Dependencies updated to ^${newVersion}`);
    } else {
      console.log(`    - No npm dependency versions to update`);
    }
  }

  console.log(`\n✓ Version bumped to ${newVersion}\n`);
}

// Main execution
const command = process.argv[2];

switch (command) {
  case 'to-file':
    convertToFileMode();
    break;
  
  case 'to-npm':
    convertToNpmMode();
    break;
  
  case 'install':
    installDependencies();
    break;
  
  case 'clean':
    cleanAllPackages();
    break;
  
  case 'dev':
    // Complete dev workflow: clean, convert to file://, and install
    console.log('=== Switching to DEV mode ===\n');
    cleanAllPackages();
    convertToFileMode();
    installDependencies(true); // Include root
    console.log('=== DEV mode ready ===\n');
    break;
  
  case 'publish':
    // Complete publish workflow: convert to npm, clean, and install
    console.log('=== Switching to PUBLISH mode ===\n');
    convertToNpmMode();
    cleanAllPackages();
    installDependencies(true); // Include root
    console.log('=== PUBLISH mode ready ===\n');
    break;
  
  case 'bump-version':
    const newVersion = process.argv[3];
    if (!newVersion) {
      console.error('Error: Version required for bump-version command');
      console.error('Usage: node scripts/deps-manager.js bump-version <version>');
      console.error('Example: node scripts/deps-manager.js bump-version 1.4.0');
      process.exit(1);
    }
    bumpVersion(newVersion);
    // Install dependencies including root to update package-lock.json files
    installDependencies(true);
    break;
  
  default:
    console.error(`
Usage: node scripts/deps-manager.js <command> [args]

Commands:
  dev            - Complete dev workflow: clean, convert to file://, install (for local development)
  publish        - Complete publish workflow: convert to npm, clean, install (for publishing)
  
  to-file        - Convert all internal dependencies to file:// format (granular)
  to-npm         - Convert all internal dependencies back to npm versions (granular)
  install        - Install dependencies in dependency order (granular)
  clean          - Remove all node_modules and package-lock.json files (granular)
  
  bump-version   - Bump version across all packages and update dependencies
                   Usage: bump-version <version>
                   Example: bump-version 1.4.0
`);
    process.exit(1);
}

