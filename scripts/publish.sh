#!/bin/bash

# Publish script for TsAgent monorepo
# Handles dependency order, building, and publishing

set -e  # Exit on error

# Check for dry-run flag
DRY_RUN=false
if [[ "$1" == "--dry-run" ]] || [[ "$1" == "-n" ]]; then
  DRY_RUN=true
fi

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Packages to publish in dependency order
# Format: "package-dir:package-name"
PACKAGES=(
  "packages/agent-api:@tsagent/core"
  "packages/a2a-server:@tsagent/server"
  "packages/a2a-mcp:@tsagent/orchestrator"
  "packages/acp-server:@tsagent/acp-server"
  "packages/agent-mcp:@tsagent/agent-mcp"
  "packages/meta-mcp:@tsagent/meta-mcp"
  "apps/cli:@tsagent/cli"
)

# Packages that depend ONLY on @tsagent/core (need reinstall after core is published)
# Note: a2a-mcp depends on server, so it's handled after server is published
CORE_DEPENDENTS=(
  "packages/a2a-server"
  "packages/acp-server"
  "packages/agent-mcp"
  "packages/meta-mcp"
  "apps/cli"
  "apps/desktop"
)

# Packages that depend on @tsagent/server (need reinstall after server is published)
# These also get core, so we reinstall them after server
SERVER_DEPENDENTS=(
  "packages/a2a-mcp"
)

log() {
  echo -e "${GREEN}[PUBLISH]${NC} $1"
}

warn() {
  echo -e "${YELLOW}[WARN]${NC} $1"
}

error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check if a specific package version is already published
is_version_published() {
  local package_name=$1
  local version=$2
  
  # Check if the specific version exists
  local version_exists
  version_exists=$(npm view "${package_name}@${version}" version 2>/dev/null || echo "")
  
  [ "$version_exists" == "$version" ]
}

# Function to publish a single package
# Sets PUBLISHED_VERSION global variable with the version
publish_package() {
  local package_dir=$1
  local package_name=$2
  
  log "[${package_name}] Starting publish process..."
  
  cd "${package_dir}" || exit 1
  
  # Get version from package.json
  local version
  version=$(node -p "require('./package.json').version" 2>/dev/null || echo "")
  
  if [ -z "$version" ]; then
    error "[${package_name}] Could not read version from package.json"
    cd - > /dev/null || exit 1
    exit 1
  fi
  
  log "[${package_name}] Version: ${version}"
  
  # Check if this version is already published
  log "[${package_name}] Checking if ${version} is already published..."
  if is_version_published "${package_name}" "${version}"; then
    warn "[${package_name}] ${version} is already published, skipping publish"
    cd - > /dev/null || exit 1
    PUBLISHED_VERSION="$version"
    return 0
  fi
  
  # Install dependencies
  log "[${package_name}] Step 1/3: Installing dependencies..."
  npm install > /dev/null 2>&1 || {
    error "[${package_name}] Failed to install dependencies"
    cd - > /dev/null || exit 1
    exit 1
  }
  
  # Build
  log "[${package_name}] Step 2/3: Building..."
  npm run build > /dev/null 2>&1 || {
    error "[${package_name}] Build failed"
    cd - > /dev/null || exit 1
    exit 1
  }
  
  # Publish
  if [ "$DRY_RUN" = true ]; then
    log "[${package_name}] Step 3/3: Would publish ${version} (DRY RUN)"
  else
    log "[${package_name}] Step 3/3: Publishing ${version}..."
    npm publish > /dev/null 2>&1 || {
      error "[${package_name}] Publish failed"
      cd - > /dev/null || exit 1
      exit 1
    }
    log "[${package_name}] ✓ Successfully published ${version}"
  fi
  
  PUBLISHED_VERSION="$version"
  cd - > /dev/null || exit 1
}

# Function to wait for a package version to be available on npm registry
wait_for_version() {
  local package_name=$1
  local version=$2
  local max_attempts=10
  local attempt=1
  local wait_seconds=2
  
  log "[WAIT] Checking if ${package_name}@${version} is available..."
  
  # Check if already available
  if is_version_published "${package_name}" "${version}"; then
    log "[WAIT] ✓ ${package_name}@${version} is already available"
    return 0
  fi
  
  log "[WAIT] ${package_name}@${version} not yet available, waiting for registry propagation..."
  
  while [ $attempt -le $max_attempts ]; do
    if is_version_published "${package_name}" "${version}"; then
      log "[WAIT] ✓ ${package_name}@${version} is now available (attempt ${attempt})"
      return 0
    fi
    
    if [ $attempt -lt $max_attempts ]; then
      log "[WAIT] Attempt ${attempt}/${max_attempts}: still waiting, checking again in ${wait_seconds}s..."
      sleep $wait_seconds
    fi
    
    attempt=$((attempt + 1))
  done
  
  error "[WAIT] ${package_name}@${version} is not available after ${max_attempts} attempts"
  return 1
}

# Function to reinstall dependencies for packages that depend on a published package
reinstall_dependents() {
  local published_package=$1
  local published_version=$2
  shift 2
  local dependents=("$@")
  
  if [ ${#dependents[@]} -eq 0 ]; then
    return
  fi
  
  log "[REINSTALL] Processing dependents of ${published_package}@${published_version}..."
  
  # Wait for the version to be available (if not in dry-run and version was provided)
  if [ -n "$published_version" ] && [ "$DRY_RUN" = false ]; then
    wait_for_version "${published_package}" "${published_version}"
  fi
  
  log "[REINSTALL] Reinstalling dependencies in dependent packages..."
  
  for dependent_dir in "${dependents[@]}"; do
    if [ -d "${dependent_dir}" ]; then
      local dependent_name
      dependent_name=$(basename "${dependent_dir}")
      log "[REINSTALL] Reinstalling in ${dependent_name}..."
      cd "${dependent_dir}" || continue
      npm install > /dev/null 2>&1 || {
        error "[REINSTALL] Failed to install in ${dependent_name}"
        cd - > /dev/null || exit 1
        exit 1
      }
      log "[REINSTALL] ✓ ${dependent_name} dependencies updated"
      cd - > /dev/null || exit 1
    fi
  done
}

# Main publish process
main() {
  if [ "$DRY_RUN" = true ]; then
    warn "DRY RUN MODE - No packages will be published"
  fi
  log "Starting publish process..."
  
  # Check if we're in the right directory
  if [ ! -f "package.json" ]; then
    error "Must be run from repository root"
    exit 1
  fi
  
  # Update root package-lock.json (root has no deps, but version should be updated)
  log "Updating root package-lock.json..."
  npm install
  
  # Confirm before proceeding (skip in dry-run)
  if [ "$DRY_RUN" = false ]; then
    warn "This will publish all packages to npm. Continue? (y/N)"
    read -r response
    if [[ ! "$response" =~ ^[Yy]$ ]]; then
      log "Publish cancelled"
      exit 0
    fi
  fi
  
  # Process packages in order
  local package_num=0
  for package_entry in "${PACKAGES[@]}"; do
    package_num=$((package_num + 1))
    IFS=':' read -r package_dir package_name <<< "${package_entry}"
    
    log ""
    log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    log "Package ${package_num}/${#PACKAGES[@]}: ${package_name}"
    log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    PUBLISHED_VERSION=""
    publish_package "${package_dir}" "${package_name}"
    
    # Reinstall dependents after publishing core
    if [ "${package_name}" == "@tsagent/core" ]; then
      reinstall_dependents "@tsagent/core" "$PUBLISHED_VERSION" "${CORE_DEPENDENTS[@]}"
    fi
    
    # Reinstall dependents after publishing server
    if [ "${package_name}" == "@tsagent/server" ]; then
      reinstall_dependents "@tsagent/server" "$PUBLISHED_VERSION" "${SERVER_DEPENDENTS[@]}"
    fi
  done
  
  if [ "$DRY_RUN" = true ]; then
    log "✓ Dry run completed - no packages were published"
  else
    log "✓ All packages published successfully!"
  fi
}

# Run main function
main "$@"

