# TeamSpark doesn't start on linux

Installing our Electron app on linux via an AppImage and then trying to launch fails (generates crash log with no useful information).

When subsequently running from the command line:

will@will-SER:~$ teamspark-workbench 
[3209596:0422/141025.472805:FATAL:setuid_sandbox_host.cc(158)] The SUID sandbox helper binary was found, but is not configured correctly. Rather than run without sandboxing I'm aborting now. You need to make sure that /opt/TeamSpark AI Workbench/chrome-sandbox is owned by root and has mode 4755.
Trace/breakpoint trap (core dumped)

Ran this command:

sudo chmod 4755 /opt/TeamSpark\ AI\ Workbench/chrome-sandbox

Ran again and got:

will@will-SER:~$ teamspark-workbench 
LaunchProcess: failed to execvp:
/opt/TeamSpark
[3225886:0422/141637.419738:FATAL:zygote_host_impl_linux.cc(201)] Check failed: . : Invalid argument (22)
Trace/breakpoint trap (core dumped)

Ran with --no-sandbox and the app ran properly


https://github.com/electron/electron/issues/17972

https://github.com/electron-userland/electron-builder/issues/3872