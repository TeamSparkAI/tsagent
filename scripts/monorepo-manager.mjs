#!/usr/bin/env node

/**
 * Monorepo Manager Script
 * 
 * Manages monorepo operations including:
 * - Conversion between file:// and npm dependencies for local development vs publishing
 * - Version bumping across all packages
 * - Publishing packages to npm in dependency order
 * - Dependency installation and cleanup
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import readline from 'readline';

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

// Packages to publish (excluding desktop app)
const PUBLISH_PACKAGES = [
  { name: '@tsagent/core', path: 'packages/agent-api' },
  { name: '@tsagent/server', path: 'packages/a2a-server' },
  { name: '@tsagent/orchestrator', path: 'packages/a2a-mcp' },
  { name: '@tsagent/acp-server', path: 'packages/acp-server' },
  { name: '@tsagent/agent-mcp', path: 'packages/agent-mcp' },
  { name: '@tsagent/meta-mcp', path: 'packages/meta-mcp' },
  { name: '@tsagent/cli', path: 'apps/cli' },
];

// Packages that depend ONLY on @tsagent/core (need reinstall after core is published)
// Note: apps/cli depends on multiple packages (core, server, acp-server, meta-mcp) so it's not included
const CORE_DEPENDENTS = [
  'packages/a2a-server',
  'packages/acp-server',
  'packages/agent-mcp',
  'packages/meta-mcp',
  'apps/desktop',
];

// Packages that depend on @tsagent/server (need reinstall after server is published)
const SERVER_DEPENDENTS = [
  'packages/a2a-mcp',
];

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
          // Update npm version only if different
          const targetVersion = `^${newVersion}`;
          if (pkgJson.dependencies[depName] !== targetVersion) {
            pkgJson.dependencies[depName] = targetVersion;
            modified = true;
          }
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
          // Update npm version only if different
          const targetVersion = `^${newVersion}`;
          if (pkgJson.devDependencies[depName] !== targetVersion) {
            pkgJson.devDependencies[depName] = targetVersion;
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

/**
 * Check if a package version is already published on npm
 */
function isVersionPublished(packageName, version) {
  try {
    const result = execSync(`npm view ${packageName}@${version} version`, {
      encoding: 'utf-8',
      stdio: 'pipe',
    }).trim();
    return result === version;
  } catch (error) {
    return false;
  }
}

/**
 * Wait for a package version to be available on npm registry
 */
async function waitForVersion(packageName, version, maxAttempts = 10, waitSeconds = 2) {
  console.log(`[WAIT] Checking if ${packageName}@${version} is available...`);
  
  if (isVersionPublished(packageName, version)) {
    console.log(`[WAIT] ✓ ${packageName}@${version} is already available`);
    return true;
  }
  
  console.log(`[WAIT] ${packageName}@${version} not yet available, waiting for registry propagation...`);
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (isVersionPublished(packageName, version)) {
      console.log(`[WAIT] ✓ ${packageName}@${version} is now available (attempt ${attempt})`);
      return true;
    }
    
    if (attempt < maxAttempts) {
      console.log(`[WAIT] Attempt ${attempt}/${maxAttempts}: still waiting, checking again in ${waitSeconds}s...`);
      await new Promise(resolve => setTimeout(resolve, waitSeconds * 1000));
    }
  }
  
  console.error(`[WAIT] ${packageName}@${version} is not available after ${maxAttempts} attempts`);
  return false;
}

/**
 * Wait for all internal dependencies of a package to be available
 */
async function waitForPackageDependencies(pkg, dryRun = false) {
  const pkgJson = readPackageJson(pkg.path);
  const version = pkgJson.version;
  const dependencies = { ...pkgJson.dependencies, ...pkgJson.devDependencies };
  
  const internalDeps = [];
  for (const [depName, depVersion] of Object.entries(dependencies)) {
    if (INTERNAL_PACKAGES.has(depName)) {
      // Extract version from dependency spec (could be ^1.3.3 or file:...)
      let depVersionNum = null;
      if (typeof depVersion === 'string') {
        if (depVersion.startsWith('file:')) {
          // For file: deps, read the version from the package.json
          const depPkg = PACKAGE_ORDER.find(p => p.name === depName);
          if (depPkg) {
            const depPkgJson = readPackageJson(depPkg.path);
            depVersionNum = depPkgJson.version;
          }
        } else {
          // For npm deps like ^1.3.3, extract the version
          const match = depVersion.match(/[\d]+\.[\d]+\.[\d]+/);
          if (match) {
            depVersionNum = match[0];
          }
        }
      }
      
      if (depVersionNum) {
        internalDeps.push({ name: depName, version: depVersionNum });
      }
    }
  }
  
  if (internalDeps.length === 0) {
    return;
  }
  
  console.log(`[${pkg.name}] Waiting for internal dependencies to be available...`);
  for (const dep of internalDeps) {
    if (!dryRun) {
      const available = await waitForVersion(dep.name, dep.version);
      if (!available) {
        throw new Error(`Failed to wait for ${dep.name}@${dep.version}`);
      }
    }
  }
  console.log(`[${pkg.name}] ✓ All internal dependencies are available`);
}

/**
 * Publish a single package
 */
async function publishPackage(pkg, dryRun = false) {
  const pkgDir = path.join(ROOT_DIR, pkg.path);
  const pkgJson = readPackageJson(pkg.path);
  const version = pkgJson.version;
  
  console.log(`[${pkg.name}] Starting publish process...`);
  console.log(`[${pkg.name}] Version: ${version}`);
  
  // Check if already published
  console.log(`[${pkg.name}] Checking if ${version} is already published...`);
  if (isVersionPublished(pkg.name, version)) {
    console.log(`[${pkg.name}] ⚠ ${version} is already published, skipping publish`);
    return version;
  }
  
  // Wait for all internal dependencies to be available before installing
  await waitForPackageDependencies(pkg, dryRun);
  
  try {
    // Install dependencies
    console.log(`[${pkg.name}] Step 1/3: Installing dependencies...`);
    execSync('npm install', {
      cwd: pkgDir,
      stdio: 'pipe',
    });
    
    // Build
    console.log(`[${pkg.name}] Step 2/3: Building...`);
    execSync('npm run build', {
      cwd: pkgDir,
      stdio: 'pipe',
    });
    
    // Publish
    if (dryRun) {
      console.log(`[${pkg.name}] Step 3/3: Would publish ${version} (DRY RUN)`);
    } else {
      console.log(`[${pkg.name}] Step 3/3: Publishing ${version}...`);
      execSync('npm publish', {
        cwd: pkgDir,
        stdio: 'pipe',
      });
      console.log(`[${pkg.name}] ✓ Successfully published ${version}`);
    }
    
    return version;
  } catch (error) {
    console.error(`[${pkg.name}] ✗ Error: ${error.message}`);
    throw error;
  }
}

/**
 * Reinstall dependencies for packages that depend on a published package
 */
async function reinstallDependents(publishedPackage, publishedVersion, dependents, dryRun = false) {
  if (dependents.length === 0) {
    return;
  }
  
  console.log(`[REINSTALL] Processing dependents of ${publishedPackage}@${publishedVersion}...`);
  
  // Wait for version to be available (if not dry-run)
  if (publishedVersion && !dryRun) {
    const available = await waitForVersion(publishedPackage, publishedVersion);
    if (!available) {
      throw new Error(`Failed to wait for ${publishedPackage}@${publishedVersion}`);
    }
  }
  
  console.log(`[REINSTALL] Reinstalling dependencies in dependent packages...`);
  
  for (const dependentPath of dependents) {
    const dependentDir = path.join(ROOT_DIR, dependentPath);
    if (fs.existsSync(dependentDir)) {
      const dependentName = path.basename(dependentPath);
      console.log(`[REINSTALL] Reinstalling in ${dependentName}...`);
      try {
        execSync('npm install', {
          cwd: dependentDir,
          stdio: 'pipe',
        });
        console.log(`[REINSTALL] ✓ ${dependentName} dependencies updated`);
      } catch (error) {
        console.error(`[REINSTALL] ✗ Failed to install in ${dependentName}: ${error.message}`);
        throw error;
      }
    }
  }
}

/**
 * Prompt for user confirmation
 */
function promptConfirmation(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y' || answer.trim().toLowerCase() === 'yes');
    });
  });
}

/**
 * Main publish process
 */
async function publishAll(dryRun = false) {
  if (dryRun) {
    console.log('⚠ DRY RUN MODE - No packages will be published\n');
  }
  console.log('Starting publish process...\n');
  
  // Update root package-lock.json
  console.log('Updating root package-lock.json...');
  try {
    execSync('npm install', {
      cwd: ROOT_DIR,
      stdio: 'pipe',
    });
    console.log('✓ Root package-lock.json updated\n');
  } catch (error) {
    console.error('✗ Failed to update root package-lock.json');
    throw error;
  }
  
  // Confirm before proceeding (skip in dry-run)
  if (!dryRun) {
    const confirmed = await promptConfirmation('This will publish all packages to npm. Continue? (y/N): ');
    if (!confirmed) {
      console.log('Publish cancelled');
      process.exit(0);
    }
  }
  
  // Process packages in order
  for (let i = 0; i < PUBLISH_PACKAGES.length; i++) {
    const pkg = PUBLISH_PACKAGES[i];
    console.log('\n' + '━'.repeat(60));
    console.log(`Package ${i + 1}/${PUBLISH_PACKAGES.length}: ${pkg.name}`);
    console.log('━'.repeat(60) + '\n');
    
    const publishedVersion = await publishPackage(pkg, dryRun);
    
    // Reinstall dependents after publishing core
    if (pkg.name === '@tsagent/core' && !dryRun) {
      await reinstallDependents('@tsagent/core', publishedVersion, CORE_DEPENDENTS, dryRun);
    }
    
    // Reinstall dependents after publishing server
    if (pkg.name === '@tsagent/server' && !dryRun) {
      await reinstallDependents('@tsagent/server', publishedVersion, SERVER_DEPENDENTS, dryRun);
    }
  }
  
  if (dryRun) {
    console.log('\n✓ Dry run completed - no packages were published');
  } else {
    console.log('\n✓ All packages published successfully!');
  }
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
    // Complete publish workflow: convert to npm, clean (no install - publish script handles it)
    // Note: This cleans all packages including desktop to remove old package-lock.json files
    console.log('=== Switching to PUBLISH mode ===\n');
    convertToNpmMode();
    cleanAllPackages();
    console.log('=== PUBLISH mode ready (run npm run publish:all to publish packages) ===\n');
    console.log('NOTE: Desktop and other apps have been cleaned. Their package-lock.json files');
    console.log('      will be regenerated by CI/CD or when dependencies are installed.\n');
    break;
  
  case 'bump-version':
    const newVersion = process.argv[3];
    if (!newVersion) {
      console.error('Error: Version required for bump-version command');
      console.error('Usage: node scripts/monorepo-manager.mjs bump-version <version>');
      console.error('Example: node scripts/monorepo-manager.mjs bump-version 1.4.0');
      process.exit(1);
    }
    bumpVersion(newVersion);
    // Note: No install here - packages don't exist in registry yet
    // Workflow: Run 'deps:publish' first to convert to npm, then 'version:bump', then 'publish:all'
    break;
  
  case 'publish-all':
    (async () => {
      // Parse arguments: version can be in argv[3] or argv[4] depending on --dry-run position
      let version = null;
      let dryRun = false;
      
      // Check for --dry-run flag in either position
      for (let i = 3; i < process.argv.length; i++) {
        const arg = process.argv[i];
        if (arg === '--dry-run' || arg === '-n') {
          dryRun = true;
        } else if (arg && !arg.startsWith('--') && !arg.startsWith('-')) {
          // First non-flag argument is the version
          if (!version) {
            version = arg;
          }
        }
      }
      
      if (!version) {
        console.error('Error: Version required for publish-all command');
        console.error('Usage: node scripts/monorepo-manager.mjs publish-all <version> [--dry-run]');
        console.error('Example: node scripts/monorepo-manager.mjs publish-all 1.4.0');
        console.error('Example: node scripts/monorepo-manager.mjs publish-all 1.4.0 --dry-run');
        console.error('Or via npm: npm run publish:all 1.4.0');
        process.exit(1);
      }
      
      try {
        console.log('=== Publishing workflow ===\n');
        
        // Step 1: Convert to npm format
        console.log('Step 1: Converting to npm dependencies...\n');
        convertToNpmMode();
        
        // Step 1b: Clean all packages (including desktop) to remove old package-lock.json files
        console.log('Step 1b: Cleaning all packages (including apps)...\n');
        cleanAllPackages();
        
        // Step 2: Bump version
        console.log('Step 2: Bumping version...\n');
        bumpVersion(version);
        
        // Step 3: Publish
        console.log('Step 3: Publishing packages...\n');
        await publishAll(dryRun);
        
        console.log('\n=== Publishing workflow complete ===\n');
      } catch (error) {
        console.error('Publish failed:', error.message);
        process.exit(1);
      }
    })();
    break;
  
  default:
    console.error(`
Usage: node scripts/monorepo-manager.mjs <command> [args]

Commands:
  dev            - Complete dev workflow: clean, convert to file://, install (for local development)
  publish        - Complete publish workflow: convert to npm, clean (for publishing)
  publish-all    - Complete publishing workflow: convert to npm, bump version, publish
                   Usage: publish-all <version> [--dry-run]
                   Example: publish-all 1.4.0
                   Example: publish-all 1.4.0 --dry-run
                   Or via npm: npm run publish:all 1.4.0
  
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

