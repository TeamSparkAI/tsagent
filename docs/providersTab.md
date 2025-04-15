I want to add another tab called Providers that will be immediately to the right of the Workspace tab and shown whenever a workspace is active (just as the rest of the tabs).

This will be modelled after the list / config tabs like rules, references, and tools, where there will be an Add button, and About entry, and a list of installed providers.

When a provider is selected, its details will be shown in the content pane on the right.  There will be Configure and Delete buttons.

The Provider header will consist of all of the information we have about the provider, and below that, we will fetch and display the models for that provider.

This should all be modelled after the ModelPickerPanel.tsx implementation (in terms of style, content, and functionality where applicable).

A provider will be considered "installed" if the workspaceManager isProviderInstalled returns true.  Providers can be removed by using the workspaceManager removeProvider.  They can be added using addProvider or by setting any provider setting value.

The list of providers that can be added will be the total provider list minus any installed providers.

The Add Provider should allow the user to select from a list of available providers, showing provider information as in the ModelPickerPanel (image, name, url, required config elements, etc)


Provider currently exposes:

      requiresApiKey: true,
      configKeys: ['BEDROCK_ACCESS_KEY_ID', 'BEDROCK_SECRET_ACCESS_KEY']

configKeys: {
    caption: "Bedrock API access key",
    hint: "xxxxxx"
    default: "localhost:xxxx",
    key: "BEDROCK_API_ACCESS_KEY",
    secret: true,
    required: true
}
