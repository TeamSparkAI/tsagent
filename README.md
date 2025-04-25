# TeamSpark AI Workbench

## About

TeamSpark AI Workbench is a powerful development environment for AI and machine learning projects.  It is a local client
application providing a graphical interface and a command-line (terminal) interface on Mac, Linux, and Windows.

## Features

TeamSpark AI Workbench supports:
- Many LLM providers and their models (including Anthropic/Claude, OpenAI/ChatGPT, Google/Gemini, AWS Bedrock, and Ollama)
- References (memory)
- Rules (prompt guidance)
- Usage of tools via MCP (supporing thousands of available tools)
- Chat sessions where you can select and configure models, control reference and rule usage (context), and use tools.

TeamSpark AI Workbench also includes internal tools that allow models to directly interact with references and tools, meaning
the models can build and update their own references and rules (allowing them to "remember" and "learn").

## CLI

To run the command-line interface, use the `--cli` argument. You should either run the command line app in a directory
containing a workspace, or pass it a workspace location via the `--workspace` argument. To create a new workspace in 
current (or provided) workspace directory, use the `--create` argument. Running the cli without a workspace will provide
the above workspace guidance.

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

### License Terms

The CC BY-NC-ND 4.0 license allows the work to be viewed and inspected, but it is not an open source license in the traditional sense. Specifically:

- You are prohibited from modifying the work in any way (no derivatives)
- You cannot use it for primarily commercial purposes
- This license grants the right to see and review the underlying code
- It does not permit you to adapt, build upon, or redistribute modified versions

This license may change to a more permissive license in the future if there is interest.

For commercial use licensing, please contact [support@teamspark.ai](mailto:support@teamspark.ai).
