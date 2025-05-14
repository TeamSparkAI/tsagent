# TeamSpark AI Workbench - Next Gen Tool Usage

The general idea is that we want a non-developer to be able to easily install tools and to run those tools securely.

Tools need to be easily installable from catalog
- Wizard-based install (we do this with providers in a crude way now)

Tools need to run in a secure container (Docker, other OCI)
- Look at ToolHive approach (esp permissions)

Common tool use scenario - "look at my documents and the internet" (consider pre-installing, or building internal tools)
- Search and retrieve documents
  - Convert document text to plaintext
  - Maintain index (keeping it current is the fun part)? - vector index? - sparse text?
  - Locations
    - Local file system
    - Hosted docs / filesystems (Google Docs, Dropbox, etc)

- Search the web

- Retrieve web pages as plaintext (getting around robots.txt - we're not REALLY a robot)

References
- With these kinds of tools we'll by pulling a lot of things into the context history (versus more explicit reference creation)
- Ability to easily convert message (or specific tool output) to reference easily
- Maybe we automatically "remember" things that seem important (build references)
- Or maybe we ask when that happens - "Do you want to remmeber this for future chat sessions in this workspace?"

