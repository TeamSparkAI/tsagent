#!/bin/bash

# Get the directory where the script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# If we're in /usr/bin, we're probably from a .deb install
if [ "$SCRIPT_DIR" == "/usr/bin" ]; then
    SCRIPT_DIR="/opt/${params.packager.appInfo.productName}"
fi

# Always run with --no-sandbox
exec "$SCRIPT_DIR/${params.packager.executableName}.bin" --no-sandbox "$@"