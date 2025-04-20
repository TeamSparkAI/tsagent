# TeamSpark AI Workbench

## Chat UX

Allow user to @mention a rule or reference to add them to the chat context (interactively, as you type, maybe with lookup/matching)
- @ref:[referenceName]
- @rule:[ruleName]

Allow user to pick any chat element and store it as a reference

Clone chat tab

Chat import/export
- JSON file
  - Messages/replies
  - Context (references and rules)
  - Settings (if any override workspace defaults)

Edit chat
- Truncate makes sense
- Arbitrary message/reply removal?

Chat Debug
- Show full details of chat history (everything we sent/received on every call, including prior message context, rules, tools, references, etc)
- Maybe this is better as a specific log category/file

## Workspaces Issues

Workspace metadata (name/desc) would be nice in UX

Clone Workspace would be nice.

For find/open workspace, it currently replaces workspace (if any) in current window.
- Should it set workspace if current window doesn't have one, else open in new window?

How many previous workspaces, what happens in UX if they overflow

If not workspace history, show explainer for workspaces?

## Before Release

Package for dist
- Verify app icon (including in app)

Top-level menus?

Option to "register" command line app on first run (and from menu later)

## Dist

Why do package names have previous version?

In install/run, wants access to Documents?

Post downloads to Google storage bucket

Update website to point to downloads

Verify download / install of Mac/Linux

Make real website
- Branding (icon, etc)
- Screen shots
- Video (Youtube demo?)

