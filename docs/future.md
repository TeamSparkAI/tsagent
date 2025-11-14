# TsAgent Foundry Future

## Chat

Support multi-modal (non-text) types - images, videos?

## Model abstraction

It would be great to have it pluggable, maybe later.

## Chat usage / pricing

Build db of provider/model pricing
- Complicated as this is constantly changes, no automated way to get prices
- Allow user to set/override (they may have more current data or specialized pricing)

Compute price per session (running total) and most recent message

Collect token usage over time (maybe by session) so you can see monthly or lifetime totals.

Assuming different models from different providers are used, will need to show that

This can be trick on a given chat session if you switch models mid-session
- Maybe we don't allow that, or maybe we spawn a cloned session for the new model?

## Tool functionality

Support for other MCP functionality:
- Resources
- Resource templates
- Prompts

"History" for each tool call that shows JSON request (tool name, params) and response

## LLM Providers

Need better default model for switch to provider without specifying model
- Maybe LLM provides it (if not first one)?
- Currently uses first one, which isn't ideal for Gemini (2.5 has no non-metered quota and fails)

## Bedrock

Add support for inference profile and provisioned models

## CLI

No way to install/uninstall providers or tools

## Dynamic References

OK, so we're not trying to be a coding tool, but...

Instead of all file access being via tool, maybe we can improve upon that:
- The model doesn't generally understand that files change through external forces, or to tell if they've changed (unless you tell it)
- If the model is repeatedly reading the same files, it's going to have many versions in the chat session history (confusing and cluttering context)
- If we had a reference type that was a file reference - that pointed to a file
  - When building context on each message we can get the current version of the file (maybe we cache it and update if changed)
  - This way, there will only be one instance of the file in context and it will be current

Or maybe file context is it's own thing separate from references?
- The model has tools to include/exclude files from context

We probably need a medium complexity coding-type use case to validate these approaches

Similar argument could be made for web page text (via fetch) - where the reference is a cached version of the text of a web page (which we can update on usage when it has changed)
- This changes the model from "make the text of this web page into a reference" (which will never change), to "make this web page a reference"

## Tools

### Tool library

List of installable tools
- name
- description
- icon
- url
- defaultConfig

### Add Tool

Show available tools to install (icon/name/desc), with "Custom" as the first option

Filter edit control

When one is picked, go to add/edit modal in add mode populated with metadata

### Tool config

Installed tool maintains link to metadata tool it was installed from
- Can get icon/url from there (display only, default icon if no icon)