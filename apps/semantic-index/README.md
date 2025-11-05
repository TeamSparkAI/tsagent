# TsAgent Semantic Index CLI

A CLI tool for semantic indexing and search of agent rules, references, and tools using local embeddings.

## Features

- **Local embeddings**: Uses `@xenova/transformers` for pure JavaScript embeddings (no C++ dependencies)
- **In-memory indexing**: All embeddings are computed and stored in memory at runtime
- **Brute-force cosine similarity**: Simple, pure-JS vector similarity search (no vector database required)
- **Interactive search**: Command-line interface for querying indexed items
- **Multi-scope indexing**: Indexes rules, references, and tools (MCP tools available to the agent)
- **Scope filtering**: Filter searches by scope (rules, references, tools, or all)

## Installation

```bash
npm install
npm run build
```

## Usage

```bash
npm start <agent-path> [options]
```

Or use the built binary:

```bash
./dist/main.js <agent-path> [options]
```

### Options

- `<agent-path>`: Path to the agent directory (required)
- `--verbose`: Enable verbose logging (detailed operation logs)
- `--stats`: Display performance statistics (indexing and search timing)
- `--scope <scope>`: Default search scope: `all`, `rules`, `references`, or `tools` (default: `all`)

### Examples

```bash
# Index all scopes, default to searching all
npm start -- ./my-agent

# Index all scopes, default to searching only rules
npm start -- ./my-agent --scope rules

# Index all scopes, default to searching only tools
npm start -- ./my-agent --scope tools

# Show performance statistics
npm start -- ./my-agent --stats

# Enable verbose logging and statistics
npm start -- ./my-agent --verbose --stats
```

**Note**: When using `npm start`, use `--` to pass flags to the script (e.g., `npm start -- --verbose ./my-agent`).

## How It Works

1. **Load Agent**: Loads the agent from the specified path
2. **Index All Scopes**: 
   - Indexes **rules** (by name and description)
   - Indexes **references** (by name and description)
   - Indexes **tools** (by name and description) - gets tools from MCP clients (tools the agent can use)
   - Generates embeddings for each item using `Xenova/all-MiniLM-L6-v2` model
   - Stores embeddings in memory
3. **Interactive Search**:
   - User enters search queries
   - Query can optionally include scope prefix: `scope: text` (e.g., `rules: authentication`, `tools: file system`)
   - If no scope prefix, uses the default scope from `--scope` option (or `all` if not specified)
   - Query is embedded using the same model
   - Cosine similarity is calculated between query embedding and filtered chunk embeddings
   - Top K most relevant items are returned (by name, with similarity score)

## Search Scope

The tool supports filtering searches by scope. You can specify the scope in two ways:

1. **Command-line default**: Use `--scope <scope>` to set the default scope for all searches
   ```bash
   npm start ./my-agent --scope rules
   ```

2. **Query prefix**: Use `scope: text` syntax in your search query to override the default
   ```
   > rules: authentication
   > tools: file system
   > references: database
   > all: anything
   ```

**Scope Options**:
- `all` - Search across all scopes (rules, references, and tools)
- `rules` - Search only rules
- `references` - Search only references  
- `tools` - Search only tools (MCP tools available to the agent)

**Scope Resolution**:
1. If query contains `scope: text`, use that scope
2. Otherwise, use the `--scope` command-line option (defaults to `all`)

## Technical Details

- **Embedding Model**: `Xenova/all-MiniLM-L6-v2` (quantized, ~80MB)
  - Model is automatically downloaded from Hugging Face on first use
  - Cached locally in `/models/` directory (or `~/.cache/huggingface/` depending on configuration)
  - No manual model installation required
- **Indexing Strategy**: 
  - Each item (rule, reference, or tool) is indexed by its name and description
  - No chunking - each item is embedded as a single unit
  - Items are stored with their scope (`rules`, `references`, or `tools`)
- **Similarity Metric**: Cosine similarity (normalized dot product)
- **Search**: Brute-force comparison with filtered chunks, grouped by scope and item name

## Model Caching

The `@xenova/transformers` library automatically handles model downloading and caching:

- **First Run**: The model (`Xenova/all-MiniLM-L6-v2`) will be downloaded from Hugging Face (~80MB)
- **Cache Location**: Models are stored in:
  - **Unix/Mac**: `~/.cache/transformers`
  - **Windows**: `C:\Users\<Username>\.cache\transformers`
- **Subsequent Runs**: The cached model is used, so no download is needed
- **Custom Cache Location**: You can configure the cache location by:
  1. **Environment Variable**: Set `TRANSFORMERS_CACHE` environment variable
     ```bash
     export TRANSFORMERS_CACHE=/path/to/your/cache
     ```
  2. **Programmatic**: Set `env.localModelPath` in code
     ```javascript
     import { env } from '@xenova/transformers';
     env.localModelPath = '/path/to/your/models/';
     ```
- **Cache Directory Display**: The cache directory is logged in verbose mode when the model is initialized

## Indexed Content

The tool indexes three types of content:

1. **Rules**: Agent rules (name + description)
2. **References**: Agent references (name + description)
3. **Tools**: MCP tools available to the agent (name + description from MCP clients)

Note: Tools are indexed from MCP clients (`serverTools`), representing tools the agent can **use**, not tools the agent **exports** (for Tools mode agents).

## Dependencies

- `@tsagent/core`: Core agent types and runtime
- `@xenova/transformers`: Pure JS transformer models (no native dependencies)
- `chalk`: Terminal colors
- `commander`: CLI argument parsing

## Limitations

- All embeddings are computed at runtime (can be slow for large item sets)
- No persistence - embeddings are recomputed on each run
- Simple brute-force search (not optimized for large datasets)
- Only returns item names, not full text (though preview of name + description is shown)
- Indexes only name and description (not full content for rules/references)

## Usage

The general idea is that we would use this tooling (the indexer in this project) to select relevant rules, references, and tools to include in a chat request context.

We have the concept of a rule/reference/tool that may be included by "Agent" (when the agent thinks it's relevant).  We also have the concept of a Supervisor, including a Supervisor Agent, where one of the functions is to include/exclude context elements (rules, references, and tools) based on relevance to the current user-provided context (message, possibly also including some message history).

The ideas is that on each chat message the agent includes the "always" context items (or manaully added ones, if interactive), then it searches the "agent" context items to find the most relevant K matches to the current query and includes those also.

In this way the LLM is only operating on relvant context (not overwhelmed cognitively and not overrunning input token limits).

We have observed indexer startup time of approx 120ms, and indexing time of approx 350ms per 100 documents (chunks), meaing that for a system with 100 total context items you should expect a one-time hit of approx 500ms (at agent startup).  The inference time is very fast at approx 10ms per 100 documents in the index.