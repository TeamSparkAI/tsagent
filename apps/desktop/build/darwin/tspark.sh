#!/bin/bash

# Get the actual path of the app bundle
APP_BUNDLE="/Applications/TeamSpark AI Workbench.app/Contents/MacOS/TeamSpark AI Workbench"

# Run the app in CLI mode with any passed arguments, redirecting stderr to /dev/null to suppress warnings
"$APP_BUNDLE" --cli --ignore-certificate-errors "$@"  2> /dev/null