# Contributing to TSAgent

Thank you for your interest in contributing to TSAgent! This document provides guidelines and information for contributors.

## Code of Conduct

This project adheres to a code of conduct. By participating, you are expected to uphold this code.

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn
- Git

### Development Setup

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/your-username/tsagent.git
   cd tsagent
   ```

3. Install dependencies:
   ```bash
   npm install
   ```

4. Build the project:
   ```bash
   npm run build
   ```

## Development Workflow

### Running in Development Mode

```bash
# Desktop app
npm run dev:desktop

# CLI tool
npm run dev:cli

# Build all packages
npm run build
```

### Testing

```bash
# Run tests for all packages
npm test

# Run tests for specific package
cd packages/agent-api && npm test
```

## Making Changes

### Branch Naming

Use descriptive branch names:
- `feature/agent-orchestration`
- `fix/mcp-server-bug`
- `docs/update-readme`

### Commit Messages

Follow conventional commits:
- `feat: add new LLM provider support`
- `fix: resolve agent loading issue`
- `docs: update installation guide`
- `test: add unit tests for agent-api`

### Pull Request Process

1. Create a feature branch from `main`
2. Make your changes
3. Add tests if applicable
4. Update documentation if needed
5. Ensure all tests pass
6. Submit a pull request

## Package Structure

- `packages/agent-api/` - Core TypeScript library
- `packages/a2a-server/` - A2A protocol server
- `packages/a2a-mcp/` - MCP server for orchestration
- `apps/desktop/` - Electron desktop application
- `apps/cli/` - Command-line interface

## Coding Standards

### TypeScript
- Use strict TypeScript configuration
- Prefer interfaces over types when possible
- Use meaningful variable and function names
- Add JSDoc comments for public APIs

### Code Style
- Follow existing code patterns
- Use consistent indentation (2 spaces)
- Prefer const/let over var
- Use async/await over Promises

## Documentation

- Update README.md for user-facing changes
- Add JSDoc comments for new APIs
- Update package.json descriptions when needed
- Include examples for new features

## Reporting Issues

When reporting issues, please include:
- TSAgent version
- Operating system
- Steps to reproduce
- Expected vs actual behavior
- Relevant error messages

## Feature Requests

For feature requests:
- Check existing issues first
- Provide clear use case
- Consider implementation complexity
- Discuss in GitHub Discussions if needed

## License

By contributing to TSAgent, you agree that your contributions will be licensed under the MIT License.

## Questions?

- Join our [GitHub Discussions](https://github.com/TeamSparkAI/tsagent/discussions)
- Open an [issue](https://github.com/TeamSparkAI/tsagent/issues)
