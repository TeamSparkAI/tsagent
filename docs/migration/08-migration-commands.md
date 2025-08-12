# Migration Commands - Step by Step

## Prerequisites

Before starting, ensure you have:
- All changes committed to git
- A backup of your current project (optional but recommended)

## Phase 1: Create New Directory Structure

### Step 1: Create the new directories
```bash
# Create the new monorepo structure
mkdir -p apps/desktop
mkdir -p packages/shared
mkdir -p packages/backend-api
mkdir -p tools
```

### Step 2: Move the current project to desktop app
```bash
# Move all source code and build artifacts
mv src apps/desktop/
mv build apps/desktop/
mv dist apps/desktop/
mv release apps/desktop/

# Move build configuration files
mv tsconfig.json apps/desktop/
mv webpack.config.js apps/desktop/
mv electron-builder.json apps/desktop/
```

### Step 3: Create the new root package.json
```bash
# Backup the current package.json
cp package.json package.json.backup

# Create the new root package.json
cat > package.json << 'EOF'
{
  "name": "teamspark-workbench",
  "version": "1.1.0",
  "private": true,
  "workspaces": [
    "apps/*",
    "packages/*",
    "tools"
  ],
  "scripts": {
    "desktop": "npm run start --workspace=desktop",
    "desktop:build": "npm run build --workspace=desktop",
    "desktop:dist": "npm run dist --workspace=desktop",
    "build": "npm run build --workspace=desktop",
    "start": "npm run start --workspace=desktop"
  }
}
EOF
```

### Step 4: Create the desktop app package.json
```bash
# Move the original package.json content to desktop
mv package.json.backup apps/desktop/package.json

# Update the desktop package.json name
sed -i '' 's/"name": "teamspark-workbench"/"name": "desktop"/' apps/desktop/package.json
```

## Phase 2: Update GitHub Actions

### Step 5: Update the build workflow paths
```bash
# Update the GitHub Actions workflow to use the new paths
sed -i '' 's|release/\*\.dmg|apps/desktop/release/*.dmg|g' .github/workflows/build.yml
sed -i '' 's|release/\*\.zip|apps/desktop/release/*.zip|g' .github/workflows/build.yml
sed -i '' 's|release/\*\.AppImage|apps/desktop/release/*.AppImage|g' .github/workflows/build.yml
sed -i '' 's|release/\*\.deb|apps/desktop/release/*.deb|g' .github/workflows/build.yml
```

## Phase 3: Test the Migration

### Step 6: Install dependencies and test
```bash
# Clean install dependencies
rm -rf node_modules package-lock.json
npm install

# Test the build process
npm run desktop:build

# Test running the app
npm run desktop
```

### Step 7: Verify the structure
```bash
# Check the new directory structure
tree -L 3 -I 'node_modules'

# Should show something like:
# teamspark-workbench/
# ├── apps/
# │   └── desktop/
# │       ├── build/
# │       ├── dist/
# │       ├── release/
# │       ├── src/
# │       ├── electron-builder.json
# │       ├── package.json
# │       ├── tsconfig.json
# │       └── webpack.config.js
# ├── packages/
# │   ├── backend-api/
# │   └── shared/
# ├── tools/
# ├── .github/
# ├── docs/
# ├── package.json
# └── node_modules/
```

## Phase 4: Clean Up

### Step 8: Remove old files (if any)
```bash
# Check if there are any leftover files from the old structure
ls -la | grep -E '^(src|build|dist|release|tsconfig\.json|webpack\.config\.js|electron-builder\.json)$'

# If any exist, they should be moved or removed
```

### Step 9: Update .gitignore if needed
```bash
# Check if .gitignore needs updates for the new structure
cat .gitignore

# If it references old paths, update them
# For example, if it has "dist/" change to "apps/desktop/dist/"
```

## Complete Migration Script

Here's a complete script that does everything:

```bash
#!/bin/bash
set -e  # Exit on any error

echo "Starting monorepo migration..."

# Step 1: Create directories
echo "Creating directory structure..."
mkdir -p apps/desktop
mkdir -p packages/shared
mkdir -p packages/backend-api
mkdir -p tools

# Step 2: Move files
echo "Moving project files..."
mv src apps/desktop/ 2>/dev/null || echo "src already moved or doesn't exist"
mv build apps/desktop/ 2>/dev/null || echo "build already moved or doesn't exist"
mv dist apps/desktop/ 2>/dev/null || echo "dist already moved or doesn't exist"
mv release apps/desktop/ 2>/dev/null || echo "release already moved or doesn't exist"

# Step 3: Move config files
echo "Moving configuration files..."
mv tsconfig.json apps/desktop/ 2>/dev/null || echo "tsconfig.json already moved or doesn't exist"
mv webpack.config.js apps/desktop/ 2>/dev/null || echo "webpack.config.js already moved or doesn't exist"
mv electron-builder.json apps/desktop/ 2>/dev/null || echo "electron-builder.json already moved or doesn't exist"

# Step 4: Create root package.json
echo "Creating root package.json..."
cat > package.json << 'EOF'
{
  "name": "teamspark-workbench",
  "version": "1.1.0",
  "private": true,
  "workspaces": [
    "apps/*",
    "packages/*",
    "tools"
  ],
  "scripts": {
    "desktop": "npm run start --workspace=desktop",
    "desktop:build": "npm run build --workspace=desktop",
    "desktop:dist": "npm run dist --workspace=desktop",
    "build": "npm run build --workspace=desktop",
    "start": "npm run start --workspace=desktop"
  }
}
EOF

# Step 5: Update desktop package.json
echo "Updating desktop package.json..."
if [ -f "apps/desktop/package.json" ]; then
  sed -i '' 's/"name": "teamspark-workbench"/"name": "desktop"/' apps/desktop/package.json
else
  echo "Warning: apps/desktop/package.json not found"
fi

# Step 6: Update GitHub Actions
echo "Updating GitHub Actions..."
if [ -f ".github/workflows/build.yml" ]; then
  sed -i '' 's|release/\*\.dmg|apps/desktop/release/*.dmg|g' .github/workflows/build.yml
  sed -i '' 's|release/\*\.zip|apps/desktop/release/*.zip|g' .github/workflows/build.yml
  sed -i '' 's|release/\*\.AppImage|apps/desktop/release/*.AppImage|g' .github/workflows/build.yml
  sed -i '' 's|release/\*\.deb|apps/desktop/release/*.deb|g' .github/workflows/build.yml
else
  echo "Warning: .github/workflows/build.yml not found"
fi

# Step 7: Clean install
echo "Installing dependencies..."
rm -rf node_modules package-lock.json
npm install

echo "Migration complete!"
echo ""
echo "Next steps:"
echo "1. Test the build: npm run desktop:build"
echo "2. Test the app: npm run desktop"
echo "3. Commit the changes: git add . && git commit -m 'Restructure to monorepo'"
```

## Rollback Commands

If something goes wrong, here's how to rollback:

```bash
# Move everything back to root
mv apps/desktop/* .
rmdir apps/desktop
rmdir apps
rmdir packages
rmdir tools

# Restore original package.json (if you have a backup)
# cp package.json.backup package.json

# Clean install
rm -rf node_modules package-lock.json
npm install
```

## Verification Commands

After migration, verify everything works:

```bash
# Check structure
ls -la apps/desktop/

# Test build
npm run desktop:build

# Test start
npm run desktop

# Check that the old commands still work
npm run build
npm run start
```

## Expected Results

After running these commands, you should have:

1. **New structure**: Everything moved to `apps/desktop/`
2. **Working builds**: `npm run build` still works
3. **Working app**: `npm run start` still works
4. **GitHub Actions**: Updated to use new paths
5. **Zero breaking changes**: Everything functions identically

The key is that we're just moving files around without changing any code or functionality!

