const path = require('path');
const fs = require('fs').promises;
const log = require('electron-log');

const afterPackHook = async params => {
    if (params.electronPlatformName == 'linux') {
        log.info('Creating launcher scripts for linux target');

        // Linux sandboxing workaround:
        // Because of a sandboxing issue on Linux (see https://github.com/electron/electron/issues/17972
        // and https://github.com/electron-userland/electron-builder/issues/3872), we need to:
        // 1. Rename the original executable to .bin
        // 2. Create a shell script with the app name that runs the .bin with the --no-sandbox flag
        // This allows the app to run properly on Linux systems with sandboxing restrictions.

        const executable = path.join(
            params.appOutDir,
            params.packager.executableName
        );

        // Read the launcher script content
        const launcherScriptPath = path.join(__dirname, 'linux/tsagent-launcher.sh');
        let launcherScript;
        try {
            launcherScript = await fs.readFile(launcherScriptPath, 'utf8');
            // Replace the placeholders with actual values
            launcherScript = launcherScript
                .replace('${params.packager.appInfo.productName}', params.packager.appInfo.productName)
                .replace('${params.packager.executableName}', params.packager.executableName);
        } catch (e) {
            log.error('Failed to read launcher script: ' + e.message);
            throw new Error('Failed to read launcher script');
        }

        try {
            // Rename the original executable
            await fs.rename(executable, executable + '.bin');
            
            // Write the GUI launcher script
            await fs.writeFile(executable, launcherScript);
            await fs.chmod(executable, 0o755);
                        
            log.info('Linux launcher script created successfully');
        } catch (e) {
            log.error('failed to create launcher scripts: ' + e.message);
            throw new Error('Failed to create launcher scripts');
        }
    } else if (params.electronPlatformName == 'darwin') {
        log.info('Creating MacOS CLI script');
        
        // Copy CLI script to Resources directory
        const cliScriptPath = path.join(params.appOutDir, `${params.packager.appInfo.productName}.app/Contents/Resources/tsagent.sh`);
        const cliScriptSource = path.join(__dirname, 'darwin/tsagent.sh');

        try {
            // Read and modify the source script first
            let cliScriptContents = await fs.readFile(cliScriptSource, 'utf8');
            // Replace the placeholders with actual values
            cliScriptContents = cliScriptContents
                .replace('${params.packager.appInfo.productName}', params.packager.appInfo.productName)
                .replace('${params.packager.executableName}', params.packager.executableName);
            
            // Write the modified content to destination
            await fs.writeFile(cliScriptPath, cliScriptContents);
            await fs.chmod(cliScriptPath, 0o755);            
            log.info('MacOS CLI script installed at %s', cliScriptPath);
        } catch (e) {
            log.error('Failed to install CLI script: %s', e.message);
            throw new Error('Failed to install CLI script');
        }
    }
};

module.exports = afterPackHook;