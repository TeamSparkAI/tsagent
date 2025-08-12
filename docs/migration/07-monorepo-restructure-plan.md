# Monorepo Restructure Plan

## Overview

This document outlines the step-by-step process to restructure the current `teamspark-workbench` project into a monorepo format while maintaining all existing functionality, build processes, and GitHub Actions.

## Current Structure Analysis

### Current Project Layout
```
teamspark-workbench/
├── src/                    # Main source code
├── build/                  # Build assets (icons, entitlements)
├── dist/                   # Build output
├── release/                # Electron builder output
├── docs/                   # Documentation
├── .github/workflows/      # GitHub Actions
├── package.json            # Main package.json
├── tsconfig.json           # TypeScript config
├── webpack.config.js       # Webpack config
├── electron-builder.json   # Electron builder config
└── node_modules/           # Dependencies
```

### Current Build Process
- **TypeScript Compilation**: `tsc -p tsconfig.json`
- **Webpack Bundling**: `webpack --config webpack.config.js`
- **Electron Builder**: `electron-builder`
- **GitHub Actions**: Multi-platform builds with versioning

## Target Monorepo Structure

```
teamspark-workbench/
├── apps/
│   └── desktop/            # Current Electron app
│       ├── src/            # Moved from root src/
│       ├── build/          # Moved from root build/
│       ├── dist/           # Build output
│       ├── release/        # Electron builder output
│       ├── package.json    # Desktop-specific package.json
│       ├── tsconfig.json   # Desktop-specific TypeScript config
│       ├── webpack.config.js # Desktop-specific webpack config
│       └── electron-builder.json # Desktop-specific electron-builder config
├── packages/
│   ├── shared/             # Shared types, utilities, constants
│   │   ├── src/
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── backend-api/        # Shared backend API (future)
│       ├── src/
│       ├── package.json
│       └── tsconfig.json
├── tools/                  # Build tools, scripts
├── docs/                   # Documentation (stays at root)
├── .github/workflows/      # GitHub Actions (stays at root)
├── package.json            # Root package.json (workspaces)
├── turbo.json              # Turbo configuration
├── tsconfig.json           # Root TypeScript config
└── node_modules/           # Root dependencies
```

## Step-by-Step Migration Plan

### Phase 1: Create Monorepo Foundation (No Code Extraction)

#### Step 1.1: Create New Directory Structure
```bash
# Create new directories
mkdir -p apps/desktop
mkdir -p packages/shared
mkdir -p packages/backend-api
mkdir -p tools
```

#### Step 1.2: Move Current Project to Desktop App
```bash
# Move source code
mv src apps/desktop/
mv build apps/desktop/
mv dist apps/desktop/
mv release apps/desktop/

# Move build configs
mv tsconfig.json apps/desktop/
mv webpack.config.js apps/desktop/
mv electron-builder.json apps/desktop/
```

#### Step 1.3: Create Root Package.json with Workspaces
```json
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
```

#### Step 1.4: Create Desktop App Package.json
```json
{
  "name": "desktop",
  "version": "1.1.0",
  "main": "dist/main.js",
  "scripts": {
    "start": "npm run build && electron . --ignore-certificate-errors",
    "cli": "npm run build && node dist/main.js --cli",
    "build": "rm -rf dist && tsc -p tsconfig.json && webpack --config webpack.config.js && cp src/renderer/index.html dist/",
    "watch": "tsc -w -p tsconfig.json & webpack --watch --config webpack.config.js",
    "test": "jest",
    "pack": "electron-builder --dir",
    "dist": "npm run build && electron-builder",
    "clean": "rm -rf dist release"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.39.0",
    "@aws-sdk/client-bedrock": "^3.787.0",
    "@aws-sdk/client-bedrock-runtime": "^3.785.0",
    "@google/genai": "^0.9.0",
    "@modelcontextprotocol/sdk": "^1.7.0",
    "@types/react": "^19.0.12",
    "@types/react-dom": "^19.0.4",
    "@types/uuid": "^10.0.0",
    "chalk": "^4.1.2",
    "dotenv": "^16.4.7",
    "electron-log": "^5.3.2",
    "js-yaml": "^4.1.0",
    "ollama": "^0.5.14",
    "openai": "^4.89.0",
    "ora": "^5.4.1",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-markdown": "^10.1.0",
    "read": "^4.1.0",
    "remark-gfm": "^4.0.1",
    "uuid": "^11.1.0"
  },
  "devDependencies": {
    "@types/jest": "^29.5.14",
    "@types/js-yaml": "^4.0.9",
    "@types/node": "^20.10.0",
    "css-loader": "^7.1.2",
    "electron": "^28.0.0",
    "electron-builder": "^25.1.8",
    "style-loader": "^4.0.0",
    "ts-loader": "^9.5.2",
    "typescript": "^5.3.0",
    "webpack": "^5.98.0",
    "webpack-cli": "^6.0.1"
  },
  "build": {
    "appId": "ai.teamspark.workbench",
    "productName": "TeamSpark AI Workbench",
    "afterPack": "./build/afterPack.js",
    "mac": {
      "category": "public.app-category.developer-tools",
      "target": [
        {
          "target": "dmg",
          "arch": ["x64", "arm64"]
        },
        {
          "target": "zip",
          "arch": ["x64", "arm64"]
        }
      ],
      "icon": "build/icon.icns",
      "hardenedRuntime": true,
      "gatekeeperAssess": false,
      "entitlements": "build/entitlements.mac.plist",
      "entitlementsInherit": "build/entitlements.mac.plist"
    },
    "win": {
      "target": [
        {
          "target": "nsis",
          "arch": ["x64"]
        },
        {
          "target": "portable",
          "arch": ["x64"]
        }
      ],
      "icon": "build/icon.ico"
    },
    "linux": {
      "target": [
        {
          "target": "AppImage",
          "arch": ["x64"]
        },
        {
          "target": "deb",
          "arch": ["x64"]
        }
      ],
      "icon": "build/icon.png",
      "category": "Development",
      "executableName": "teamspark-workbench"
    },
    "files": [
      "dist/**/*",
      "package.json",
      "LICENSE.md"
    ],
    "directories": {
      "output": "release"
    }
  }
}
```

#### Step 1.5: Update Desktop App Configs

**apps/desktop/tsconfig.json**:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "moduleResolution": "node",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "jsx": "react",
    "outDir": "./dist",
    "rootDir": "./src",
    "sourceMap": true,
    "typeRoots": [
      "./node_modules/@types",
      "src/shared"
    ]
  },
  "include": [
    "src/**/*"
  ],
  "exclude": ["node_modules"]
}
```

**apps/desktop/webpack.config.js**:
```javascript
const path = require('path');
const webpack = require('webpack');
const TerserPlugin = require('terser-webpack-plugin');

const commonConfig = {
  mode: 'production',
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/
      },
      {
        test: /\.(png|jpg|jpeg|gif|svg)$/i,
        type: 'asset/resource',
        generator: {
          filename: 'assets/images/[hash][ext][query]'
        }
      }
    ]
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js', '.css']
  },
  optimization: {
    minimize: true,
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          format: {
            comments: false
          }
        },
        extractComments: false
      })
    ]
  }
};

const mainConfig = {
  ...commonConfig,
  target: 'electron-main',
  entry: './src/main/main.ts',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'main.js'
  },
  externals: {
    electron: 'commonjs electron'
  },
  plugins: [
    new webpack.DefinePlugin({
      'process.env.NODE_ENV': JSON.stringify('production')
    })
  ]
};

const rendererConfig = {
  ...commonConfig,
  target: 'web',
  entry: './src/renderer/renderer.tsx',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'renderer.js',
    assetModuleFilename: 'assets/[hash][ext][query]'
  },
  module: {
    rules: [
      ...commonConfig.module.rules,
      {
        test: /\.css$/,
        use: [
          'style-loader',
          'css-loader'
        ]
      }
    ]
  },
  performance: {
    hints: false
  }
};

const preloadConfig = {
  ...commonConfig,
  target: 'electron-preload',
  entry: './src/preload/preload.ts',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'preload.js'
  },
  externals: {
    electron: 'commonjs electron'
  }
};

module.exports = [mainConfig, rendererConfig, preloadConfig];
```

#### Step 1.6: No Turbo Needed (Yet)
We'll skip Turbo for now. It's a build system that can optimize monorepo builds, but we don't need it for the initial restructure. We can add it later when we have multiple packages that need coordinated building.

### Phase 2: Skip for Now - No Code Extraction Yet

We're not extracting any code in this phase. The goal is just to get the new directory structure in place without breaking anything. We'll extract shared code later when we're ready to create the web app.

### Phase 3: Update GitHub Actions

#### Step 3.1: Update Build Workflow
**/.github/workflows/build.yml**:
```yaml
name: Build

on:
  workflow_dispatch:
    inputs:
      version:
        description: 'Version number (e.g., 1.0.0)'
        required: true
        type: string

jobs:
  update-version:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    outputs:
      version_commit: ${{ steps.version.outputs.commit }}
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Update version
        id: version
        run: |
          npm version ${{ github.event.inputs.version }} --no-git-tag-version
          git config --global user.email "github-actions@github.com"
          git config --global user.name "GitHub Actions"
          git add package.json
          git commit -m "Update version to ${{ github.event.inputs.version }}"
          git push
          echo "commit=$(git rev-parse HEAD)" >> $GITHUB_OUTPUT

  build-mac:
    needs: update-version
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ needs.update-version.outputs.version_commit }}

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build desktop app
        run: npm run build --workspace=desktop

      - name: Import certificates
        env:
          MAC_CERTIFICATE: ${{ secrets.MAC_CERTIFICATE }}
          MAC_CERTIFICATE_PASSWORD: ${{ secrets.MAC_CERTIFICATE_PASSWORD }}
        run: |
          echo -n "$MAC_CERTIFICATE" | base64 --decode > certificate.p12
          security create-keychain -p "$MAC_CERTIFICATE_PASSWORD" build.keychain
          security default-keychain -s build.keychain
          security unlock-keychain -p "$MAC_CERTIFICATE_PASSWORD" build.keychain
          security import certificate.p12 -k build.keychain -P "$MAC_CERTIFICATE_PASSWORD" -T /usr/bin/codesign
          security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$MAC_CERTIFICATE_PASSWORD" build.keychain
          rm certificate.p12

      - name: Build Electron app for Mac
        run: npm run dist --workspace=desktop -- --mac --publish never
        env:
          CSC_LINK: ${{ secrets.MAC_CERTIFICATE }}
          CSC_KEY_PASSWORD: ${{ secrets.MAC_CERTIFICATE_PASSWORD }}
          CSC_NAME: "TeamSpark LLC (YB487TSKXW)"
          APPLE_ID: ${{ vars.APPLE_ID }}
          APPLE_APP_SPECIFIC_PASSWORD: ${{ secrets.APPLE_APP_SPECIFIC_PASSWORD }}
          APPLE_TEAM_ID: ${{ vars.APPLE_TEAM_ID }}

      - name: Upload Mac artifacts
        uses: actions/upload-artifact@v4
        with:
          name: mac-build
          path: |
            apps/desktop/release/*.dmg
            apps/desktop/release/*.zip

  build-linux:
    needs: update-version
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ needs.update-version.outputs.version_commit }}

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build desktop app
        run: npm run build --workspace=desktop

      - name: Build Electron app for Linux
        run: npm run dist --workspace=desktop -- --linux --publish never

      - name: Upload Linux artifacts
        uses: actions/upload-artifact@v4
        with:
          name: linux-build
          path: |
            apps/desktop/release/*.AppImage
            apps/desktop/release/*.deb

  upload-artifacts:
    needs: [build-mac, build-linux]
    runs-on: ubuntu-latest
    steps:
      - name: Download Mac artifacts
        uses: actions/download-artifact@v4
        with:
          name: mac-build
          path: release

      - name: Download Linux artifacts
        uses: actions/download-artifact@v4
        with:
          name: linux-build
          path: release

      - name: Create current versions
        run: |
          # Create current versions of all files
          for f in release/*; do
            if [[ $f =~ [0-9]+\.[0-9]+\.[0-9]+ ]]; then
              # Create a copy with 'latest' instead of version number
              new_name=$(echo $f | sed 's/[0-9]\+\.[0-9]\+\.[0-9]\+/latest/')
              cp "$f" "$new_name"
            fi
          done

      - name: Authenticate to Google Cloud
        uses: google-github-actions/auth@v2
        with:
          credentials_json: ${{ secrets.GCS_CREDENTIALS }}

      - name: Upload /release files
        uses: google-github-actions/upload-cloud-storage@v2
        with:
          path: release
          destination: teamspark-workbench
          parent: false
```

### Phase 4: Skip for Now - No Dependencies to Update

Since we're not extracting any code yet, there are no dependencies to update. The desktop app will continue to work exactly as it does now.

### Phase 5: Testing and Validation

#### Step 5.1: Test Build Process
```bash
# Install dependencies
npm install

# Build desktop app
npm run build --workspace=desktop

# Test desktop app
npm run start --workspace=desktop
```

#### Step 5.2: Test GitHub Actions
- Push changes to a test branch
- Manually trigger the build workflow
- Verify all platforms build successfully
- Verify artifacts are uploaded correctly

## Migration Checklist

### Pre-Migration
- [ ] Create backup of current project
- [ ] Ensure all changes are committed
- [ ] Test current build process works

### Phase 1: Foundation
- [ ] Create new directory structure
- [ ] Move source code to `apps/desktop/`
- [ ] Create root `package.json` with workspaces
- [ ] Create desktop app `package.json`
- [ ] Update TypeScript and Webpack configs
- [ ] Create Turbo configuration
- [ ] Test basic build process

### Phase 2: Skip for Now
- [ ] (No shared packages yet)

### Phase 3: GitHub Actions
- [ ] Update build workflow for monorepo
- [ ] Test workflow on all platforms
- [ ] Verify artifact paths are correct

### Phase 4: Skip for Now
- [ ] (No dependencies to update yet)

### Phase 5: Validation
- [ ] Test local development workflow
- [ ] Test production build process
- [ ] Test GitHub Actions workflow
- [ ] Verify all existing functionality works
- [ ] Update documentation

## Rollback Plan

If issues arise during migration:

1. **Keep original backup**: Don't delete the original project until fully validated
2. **Incremental commits**: Make small, testable changes
3. **Branch strategy**: Work on a feature branch, merge only when validated
4. **Quick rollback**: If needed, can quickly revert to original structure

## Success Criteria

- [ ] All existing functionality works exactly as before
- [ ] Build process produces identical artifacts
- [ ] GitHub Actions work correctly
- [ ] Development workflow is smooth
- [ ] No breaking changes for users
- [ ] Shared code is properly isolated
- [ ] Ready for future web app development

## What This Achieves

This simple restructure gives us:

1. **Monorepo Foundation**: The directory structure is ready for future packages
2. **Zero Breaking Changes**: Everything works exactly as before
3. **Future-Ready**: Easy to add web app and shared packages later
4. **Clean Separation**: Desktop app is isolated in its own directory

## Next Steps (Later)

1. **Add Turbo**: When we have multiple packages that need coordinated building
2. **Extract Shared Code**: When we're ready to create the web app
3. **Create Web App**: Add `apps/web/` with Next.js
4. **Create Backend API**: Extract backend logic to `packages/backend-api/`

This migration maintains 100% backward compatibility while setting up the foundation for the future monorepo structure.
