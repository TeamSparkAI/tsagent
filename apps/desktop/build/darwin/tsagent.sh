#!/bin/bash

# Get the actual path of the app bundle
APP_BUNDLE="/Applications/${params.packager.appInfo.productName}.app/Contents/MacOS/${params.packager.executableName}"

# Run the app in CLI mode with any passed arguments, redirecting stderr to /dev/null to suppress warnings
"$APP_BUNDLE" --cli --ignore-certificate-errors "$@"  2> /dev/null