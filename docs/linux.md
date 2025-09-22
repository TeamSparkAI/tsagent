# TsAgent on linux

Because of a sandboxing issue on linux:

https://github.com/electron/electron/issues/17972

https://github.com/electron-userland/electron-builder/issues/3872

We have to use an afterPath script to:
- Rename our app to .bin
- Create a shell script with the app name that runs the .bin with the --no-sandbox flag