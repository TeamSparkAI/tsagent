# TeamSpark AI Workbench

## About

TeamSpark AI Workbench is a powerful development environment for AI and machine learning projects.  It is a local client
application providing a graphical interface and a command-line (terminal) interface on Mac, Linux, and Windows.

## Features

TeamSpark AI Workbench supports:
- Many LLM providers and their models, including:
  - Anthropic/Claude
  - OpenAI/ChatGPT
  - Google/Gemini
  - AWS Bedrock
  - Ollama
- References (memory)
- Rules (prompt guidance)
- Usage of tools via MCP (supporing thousands of available tools)
- Chat sessions where you can select and configure models, control reference and rule usage (context), and use tools.

TeamSpark AI Workbench also includes internal tools that allow models to directly interact with references and tools, meaning
the models can build and update their own references and rules (allowing them to "remember" and "learn").

## CLI Mode

When building and running locally, you can launch the CLI with `npm run cli`

When running installed builds, see below...

### MacOS

On **MacOS** installed releases, there is a shell script provided to launch the CLI called `tspark.sh`.  You may run this directly,
or create a symlink to it for conveninence:

```bash
/Applications/TeamSpark\ AI\ Workbench.app/Contents/Resources/tspark.sh
```

or create a symlink:

```bash
ln -s /Applications/TeamSpark\ AI\ Workbench.app/Contents/Resources/tspark.sh ~/.local/bin/tspark
```

then just:

```bash
tspark
```

### Linux

On **Linux** installed releases, TeamSpark AI Workbench is launched via `teamspark-workbench`.  You may run in CLI mode by appending `--cli`.  

```bash
teamspark-workbench --cli
```

There is also a CLI launcher called `tspark.sh`.  You may run this directly, or create a symlink to it for convenience:

```bash
/opt/TeamSpark\ AI\ Workbench.app/tspark.sh
```

or create a symlink:

```bash
sudo ln -s /opt/TeamSpark\ AI\ Workbench.app/tspark.sh /usr/bin/tspark
```

then just:

```bash
tspark
```

### CLI Workspace

You should either run the command line app in a directory containing a workspace, or pass it a workspace location via 
the `--workspace` argument. To create a new workspace in current (or provided) workspace directory, use the `--create` 
argument. Running the cli without a workspace will provide the above workspace guidance and exit.

## Website

For more information about TeamSpark AI Workbench, visit our [official website](http://www.teamspark.ai).

## Download

Download the pre-built installer for your platform:

- [macOS (Intel)](https://storage.googleapis.com/teamspark-workbench/TeamSpark%20AI%20Workbench-latest.dmg)
- [macOS (Apple Silicon)](https://storage.googleapis.com/teamspark-workbench/TeamSpark%20AI%20Workbench-latest-arm64.dmg)
- [Linux (Debian/Ubuntu)](https://storage.googleapis.com/teamspark-workbench/teamspark-workbench_latest_amd64.deb)
- [Linux (AppImage)](https://storage.googleapis.com/teamspark-workbench/TeamSpark%20AI%20Workbench-latest.AppImage)

## License

This repository is licensed under the [Creative Commons Attribution-NonCommercial-NoDerivatives 4.0 International License](https://creativecommons.org/licenses/by-nc-nd/4.0/).

## License

This repository is licensed under the Business Software License.

License Terms: The Business Software License allows the work to be viewed and inspected, and used for personal, non-commercial purposes,
but it is not an open source license in the traditional sense. 

For more information, see the [Business Software License Agreement](LICENSE.md).

For commercial use licensing, please contact support@teamspark.ai.