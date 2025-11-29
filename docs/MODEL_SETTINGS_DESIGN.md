# Model Settings Management Design

## Overview

This document outlines the design for refactoring model selection UX and settings management. The goal is to improve how models are selected, displayed, and managed across the application.

## Goals

- Rename `mostRecentModel` to `model` for clarity
- Extract model picker into reusable modal component
- Add model selection to settings UI (both global and session)
- Enable "Save to Defaults" functionality in chat session settings
- Improve UX for model management across the application

## Current State Analysis

### Model Settings

**Current Implementation:**
- Model stored as `settings.mostRecentModel` in format `"provider:modelId"` (e.g., `"gemini:gemini-2.0-flash"`)
- Model selection UI embedded in `ChatTab` component
- `ModelPickerPanel` component exists but is embedded in chat tab
- No model selection in settings UI
- No "Save to Defaults" functionality

**Current Model Selection Flow:**
1. User clicks "Model" button in chat tab
2. `ModelPickerPanel` slides in from side
3. User selects provider and model
4. Selection saved to `settings.mostRecentModel`
5. Model used for subsequent chat messages

**Current Settings Comparison:**
- `areSettingsDefault()` in `ChatSettingsForm.tsx` compares all settings except model
- Model is not part of settings comparison logic

**Current Code References:**
- `packages/agent-api/src/types/agent.ts`: `mostRecentModel: z.string().optional()`
- `packages/agent-api/src/types/agent.ts`: `populateModelFromSettings()` uses `mostRecentModel`
- `apps/desktop/src/renderer/components/ChatTab.tsx`: Model selection UI
- `apps/desktop/src/renderer/components/ModelPickerPanel.tsx`: Model picker component
- `apps/cli/src/cli.ts`: Uses `mostRecentModel` when updating settings

## Design

### 2.1 Rename `mostRecentModel` to `model`

**Schema Update:**
```typescript
// In packages/agent-api/src/types/agent.ts

export const AgentSettingsSchema = z.object({
  maxChatTurns: z.number().int().default(20).optional(),
  maxOutputTokens: z.number().int().default(1000).optional(),
  temperature: z.number().default(0.5).optional(),
  topP: z.number().default(0.5).optional(),
  theme: z.string().default('light').optional(),
  systemPath: z.string().optional(),
  model: z.string().optional(), // Changed from mostRecentModel
  contextTopK: z.number().int().default(20).optional(),
  contextTopN: z.number().int().default(5).optional(),
  contextIncludeScore: z.number().default(0.7).optional(),
  toolPermission: SessionToolPermissionSchema.default('tool').optional(),
});
```

**Migration:**
- Update `populateModelFromSettings()` to use `settings.model`
- Add migration logic in `FileBasedAgentStrategy` to rename `mostRecentModel` → `model` in existing YAML files
- Update all references throughout codebase:
  - `packages/agent-api/src/types/agent.ts`
  - `apps/desktop/src/renderer/components/ChatTab.tsx`
  - `apps/cli/src/cli.ts`
  - `packages/agent-api/README.md`
  - Any other references

### 2.2 Create Model Picker Modal Component

**New Component: `ModelPickerModal.tsx`**

```typescript
interface ModelPickerModalProps {
  currentModel?: string; // Format: "provider:modelId" or undefined
  onSelect: (model: string | undefined) => void; // Returns "provider:modelId" or undefined
  onCancel: () => void;
  isOpen: boolean;
}

export const ModelPickerModal: React.FC<ModelPickerModalProps> = ({
  currentModel,
  onSelect,
  onCancel,
  isOpen
}) => {
  // Extract current provider and model from currentModel
  // Reuse existing ModelPickerPanel logic
  // Return selected model in "provider:modelId" format
};
```

**Implementation:**
- Extract model picker logic from `ChatTab` into reusable modal
- Modal wraps `ModelPickerPanel` or reuses its logic
- Returns model in `"provider:modelId"` format
- Can be used from settings, chat tab, or anywhere else
- Modal should be centered overlay with backdrop

### 2.3 Add Model to Settings UI

**Global Settings (SettingsTab.tsx):**
- Add "Model" setting section
- Display current model with logo and name
- "Change Model" button opens `ModelPickerModal`
- Model selection saved to `agent.updateSettings({ model: selectedModel })`

**Session Settings (ChatSettingsForm.tsx):**
- Add "Model" setting item
- Display current session model with logo and name
- "Change Model" button opens `ModelPickerModal`
- Model selection saved to session settings
- Include model in `areSettingsDefault()` comparison

### 2.4 Update `areSettingsDefault()` Logic

**In ChatSettingsForm.tsx:**
```typescript
const areSettingsDefault = () => {
  return (
    settings.maxChatTurns === agentSettings.maxChatTurns &&
    settings.maxOutputTokens === agentSettings.maxOutputTokens &&
    settings.temperature === agentSettings.temperature &&
    settings.topP === agentSettings.topP &&
    settings.toolPermission === agentSettings.toolPermission &&
    settings.contextTopK === agentSettings.contextTopK &&
    settings.contextTopN === agentSettings.contextTopN &&
    settings.contextIncludeScore === agentSettings.contextIncludeScore &&
    settings.model === agentSettings.model // Add model comparison
  );
};
```

**In SettingsTab.tsx:**
- Similar logic for global settings comparison (if needed)

### 2.5 Add "Save to Defaults" Button

**In ChatSettingsForm.tsx:**
- Add "Save to Defaults" button next to "Restore Agent Defaults"
- Only visible when `!areSettingsDefault()` (same condition as restore button)
- When clicked:
  1. Save current session settings to agent default settings: `agent.updateSettings(settings)`
  2. Update `agentSettings` state to match current `settings`
  3. Button disappears (settings now match defaults)

**Implementation:**
```typescript
const handleSaveToDefaults = async () => {
  try {
    await window.api.updateSettings(settings);
    setAgentSettings(settings); // Update local state
    // Button will disappear because areSettingsDefault() now returns true
  } catch (error) {
    log.error('Failed to save settings to defaults:', error);
    // Show error message to user
  }
};
```

### 2.6 Update Chat Tab Model Display

**In ChatTab.tsx:**
- Keep model display (logo + name) as is
- Remove inline model picker panel
- Add "Change Model" button that opens `ModelPickerModal`
- Model changes saved to session settings (not global settings)
- Model display updates when session model changes

### 2.7 Update Model Helper Functions

**Create helper functions in `packages/agent-api/src/types/agent.ts`:**
```typescript
export function parseModelString(modelString: string | undefined): { provider: ProviderType, modelId: string } | null {
  if (!modelString) return null;
  const colonIndex = modelString.indexOf(':');
  if (colonIndex === -1) return null;
  const providerId = modelString.substring(0, colonIndex);
  const modelId = modelString.substring(colonIndex + 1);
  const provider = getProviderByName(providerId);
  if (!provider) return null;
  return { provider, modelId };
}

export function formatModelString(provider: ProviderType, modelId: string): string {
  return `${provider}:${modelId}`;
}
```

**Update `populateModelFromSettings()`:**
```typescript
export function populateModelFromSettings(agent: Agent, chatSessionOptions: ChatSessionOptions): void {
  if (chatSessionOptions.modelProvider && chatSessionOptions.modelId) {
    return;
  }

  const settings = agent.getSettings();
  const model = settings.model; // Changed from mostRecentModel
  const parsed = parseModelString(model);
  if (parsed && agent.isProviderInstalled(parsed.provider)) {
    chatSessionOptions.modelProvider = parsed.provider;
    chatSessionOptions.modelId = parsed.modelId;
  }
}
```

## Implementation Plan

1. **Rename `mostRecentModel` to `model`**
   - Update `AgentSettingsSchema`
   - Update `populateModelFromSettings()`
   - Add migration logic in `FileBasedAgentStrategy`
   - Update all code references

2. **Create ModelPickerModal component**
   - Extract logic from `ChatTab`
   - Create reusable modal component
   - Test modal in isolation

3. **Add model to settings UI**
   - Update `SettingsTab.tsx` (global settings)
   - Update `ChatSettingsForm.tsx` (session settings)
   - Add model comparison to `areSettingsDefault()`

4. **Add "Save to Defaults" button**
   - Implement in `ChatSettingsForm.tsx`
   - Test button visibility logic
   - Test save functionality

5. **Update ChatTab model display**
   - Replace inline picker with modal
   - Update model change handling
   - Test model display updates

## Testing Strategy

1. **Migration**
   - Load agent with `mostRecentModel` in YAML
   - Verify it's migrated to `model`
   - Verify agent still works correctly

2. **Model Selection**
   - Select model in global settings
   - Verify it's saved to `settings.model`
   - Select model in session settings
   - Verify it's saved to session settings

3. **Save to Defaults**
   - Modify session settings (including model)
   - Click "Save to Defaults"
   - Verify settings are saved to agent defaults
   - Verify button disappears

4. **Settings Comparison**
   - Modify session model
   - Verify "Restore Agent Defaults" button appears
   - Verify "Save to Defaults" button appears
   - Restore defaults
   - Verify buttons disappear

## Migration Notes

- **Breaking Change**: `mostRecentModel` → `model` rename
- **Migration Required**: Existing YAML files need migration
- **Automatic Migration**: Migration happens on agent load (similar to JSON→YAML migration)

## Open Questions

1. **Model Format**: Should we keep `"provider:modelId"` format or use structured object?
   - **Decision**: Keep string format for simplicity, but add helper functions

2. **Settings Comparison**: Should we compare all settings or only user-visible ones?
   - **Decision**: Compare all settings including model

3. **Modal vs Panel**: Should model picker be a modal or keep as side panel?
   - **Decision**: Modal for reusability and consistency

## Success Criteria

- ✅ `mostRecentModel` renamed to `model` everywhere
- ✅ Model picker is reusable modal component
- ✅ Model appears in settings UI (global and session)
- ✅ "Save to Defaults" button works correctly
- ✅ Settings comparison includes model
- ✅ Migration handles existing agents

