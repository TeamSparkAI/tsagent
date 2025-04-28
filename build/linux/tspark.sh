#!/bin/bash

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# If we're in /usr/bin, we're probably from a .deb install
if [ "$SCRIPT_DIR" == "/usr/bin" ]; then
    SCRIPT_DIR="/opt/TeamSpark AI Workbench"
fi

# Always run with --no-sandbox and --cli
exec "$SCRIPT_DIR/teamspark-workbench.bin" --no-sandbox --cli "$@" 