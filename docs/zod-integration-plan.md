# Zod Integration Plan for agent-api

## Goals

1. Add Zod schemas for agent serialization types (for future YAML/JSON validation)
2. Add Zod validation for API entry points (runtime validation)
3. Replace manual validation functions with Zod schemas
4. Maintain backward compatibility (no breaking changes)

---

## Types to Convert

**Important:** All types in Phase 1 must be converted together because `AgentConfig` depends on all of them. The order below is by **dependency** (leaf types first, then types that depend on them).

### Phase 1: All AgentConfig Types (Must Be Done Together)

These types are all serialized as part of `AgentConfig`. They must be converted together because `AgentConfigSchema` needs schemas for all types it references.

**Dependency Order** (convert in this order):

1. **Leaf Types** (no dependencies):
   - **Rule** | `src/types/rules.ts` | Serialization, API validation (addRule), MCP tools
   - **Reference** | `src/types/references.ts` | Serialization, API validation (addReference), MCP tools
   - **AgentSkill** | `src/types/agent.ts` | Serialization (part of AgentMetadata.skills)
   - **SessionToolPermission** | `src/types/agent.ts` | Serialization (stored in AgentSettings as 'toolPermission')
   - **ToolInputSchema** | `src/types/json-schema.ts` | Serialization (part of AgentTool.parameters)
   - **SupervisorConfig** | `src/types/supervision.ts` | Serialization (part of AgentConfig.supervisors)

2. **Types That Depend on Leaf Types**:
   - **AgentTool** | `src/types/agent.ts` | Serialization (part of AgentMetadata.tools)
     - *Depends on: ToolInputSchema*
   - **AgentSettings** | `src/types/agent.ts` | Serialization (part of AgentConfig)
     - *Depends on: SessionToolPermission*

3. **Types That Depend on Multiple Types**:
   - **AgentMetadata** | `src/types/agent.ts` | Serialization (part of AgentConfig), API validation (updateMetadata)
     - *Depends on: AgentSkill, AgentTool*

4. **Top-Level Type** (depends on all above):
   - **AgentConfig** | `src/types/agent.ts` | Serialization, API validation (create, loadConfig)
     - *Depends on: AgentMetadata, AgentSettings, SupervisorConfig*

**Note:** All of Phase 1 should be converted together in one go, following the dependency order above. You can't define `AgentConfigSchema` until all its dependencies have schemas.


---

## Validation Points

### 1. Agent Loading (`FileBasedAgentStrategy.loadConfig()`)

**Current:**
```typescript
async loadConfig(): Promise<AgentConfig> {
  const content = fs.readFileSync(this.agentFile, 'utf-8');
  return JSON.parse(content) as AgentConfig; // ❌ No validation
}
```

**After:**
```typescript
import { AgentConfigSchema } from '../types/agent.js';

async loadConfig(): Promise<AgentConfig> {
  const content = fs.readFileSync(this.agentFile, 'utf-8');
  const data = JSON.parse(content);
  return AgentConfigSchema.parse(data); // ✅ Validated
}
```

**Location:** `packages/agent-api/src/core/agent-strategy.ts`

---

### 2. Agent Creation API (`Agent.create()`)

**Current:**
```typescript
create(data?: Partial<AgentConfig>): Promise<void>;
```

**After:**
```typescript
import { AgentConfigSchema } from '../types/agent.js';

create(data?: Partial<AgentConfig>): Promise<void> {
  if (data) {
    AgentConfigSchema.partial().parse(data); // ✅ Validate partial config
  }
  // ... rest of implementation
}
```

**Location:** `packages/agent-api/src/core/agent-api.ts`

---

### 3. Rule Management APIs

**Current:**
- `Agent.addRule(rule: Rule)` - accepts Rule directly
- MCP tools use `validateRuleArgs()` manual validation

**After:**
```typescript
import { RuleSchema } from '../types/rules.js';

// In Agent interface implementation
async addRule(rule: Rule): Promise<void> {
  const validated = RuleSchema.parse(rule); // ✅ Validate
  // ... use validated
}

// Replace validateRuleArgs() with:
function validateRuleArgs(args: unknown): Rule {
  return RuleSchema.partial().parse(args); // ✅ Use Zod schema
}
```

**Locations:**
- `packages/agent-api/src/core/agent-api.ts` (Agent.addRule)
- `packages/agent-api/src/mcp/client-rules.ts` (replace validateRuleArgs)
- `packages/agent-api/src/mcp/client-supervision.ts` (replace validateRuleArgs)

---

### 4. Reference Management APIs

**Current:**
- `Agent.addReference(reference: Reference)` - accepts Reference directly
- MCP tools use `validateReferenceArgs()` manual validation

**After:**
```typescript
import { ReferenceSchema } from '../types/references.js';

// In Agent interface implementation
async addReference(reference: Reference): Promise<void> {
  const validated = ReferenceSchema.parse(reference); // ✅ Validate
  // ... use validated
}

// Replace validateReferenceArgs() with:
function validateReferenceArgs(args: unknown): Reference {
  return ReferenceSchema.partial().parse(args); // ✅ Use Zod schema
}
```

**Locations:**
- `packages/agent-api/src/core/agent-api.ts` (Agent.addReference)
- `packages/agent-api/src/mcp/client-references.ts` (replace validateReferenceArgs)
- `packages/agent-api/src/mcp/client-supervision.ts` (replace validateReferenceArgs)

---

### 5. Metadata Update API (`Agent.updateMetadata()`)

**Current:**
```typescript
updateMetadata(metadata: Partial<AgentMetadata>): Promise<void>;
```

**After:**
```typescript
import { AgentMetadataSchema } from '../types/agent.js';

async updateMetadata(metadata: Partial<AgentMetadata>): Promise<void> {
  AgentMetadataSchema.partial().parse(metadata); // ✅ Validate
  // ... rest of implementation
}
```

**Location:** `packages/agent-api/src/core/agent-api.ts`

---

### 6. Rule/Reference Loading (`FileBasedAgentStrategy`)

**Current:**
```typescript
// In loadRules() and loadReferences()
const metadata = yaml.load(parts[1]) as Partial<Rule>; // ❌ No validation
```

**After:**
```typescript
import { RuleSchema } from '../types/rules.js';
import { ReferenceSchema } from '../types/references.js';

// In loadRules()
const metadata = RuleSchema.partial().parse(yaml.load(parts[1])); // ✅ Validated

// In loadReferences()
const metadata = ReferenceSchema.partial().parse(yaml.load(parts[1])); // ✅ Validated
```

**Location:** `packages/agent-api/src/core/agent-strategy.ts`

---

## Implementation Steps

### Step 1: Install Zod

```bash
cd packages/agent-api
npm install zod
```

**Note:** Zod will be a runtime dependency (not just dev dependency) because schemas are used for validation.

---

### Step 2: Convert Simple Types First (Rule, Reference)

**Order:** Start with `Rule` and `Reference` because:
- They're simpler (fewer fields)
- They're used in APIs immediately
- They can be converted independently

**Files to modify:**
1. `src/types/rules.ts` - Replace interface with Zod schema, infer type
2. `src/types/references.ts` - Replace interface with Zod schema, infer type

**Pattern (Single Source of Truth - Zod Schema First):**
```typescript
import { z } from 'zod';
import type { IndexedChunk } from '../managers/semantic-indexer.js';

/**
 * Rule schema - SINGLE SOURCE OF TRUTH.
 * 
 * Structure:
 * - name: string (required)
 * - description: string (required)
 * - priorityLevel: number (0-999, integer)
 * - text: string (required)
 * - include: 'always' | 'manual' | 'agent' (required)
 * - embeddings?: IndexedChunk[] (optional)
 */
export const RuleSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string(),
  priorityLevel: z.number().int().min(0).max(999),
  text: z.string().min(1, "Text is required"),
  include: z.enum(['always', 'manual', 'agent']),
  embeddings: z.array(z.any()).optional(), // IndexedChunk would need its own schema
});

// Type inferred from schema - NO separate interface!
export type Rule = z.infer<typeof RuleSchema>;
```

**Important:** 
- ❌ NO `interface Rule { ... }` - that defeats single source of truth
- ✅ Schema is the source of truth
- ✅ Type is inferred from schema only

---

### Step 3: Replace Manual Validation Functions

**Files to modify:**
1. `src/mcp/client-rules.ts`
   - Replace `validateRuleArgs()` with `RuleSchema.partial().parse()`
   - Update all call sites

2. `src/mcp/client-references.ts`
   - Replace `validateReferenceArgs()` with `ReferenceSchema.partial().parse()`
   - Update all call sites

3. `src/mcp/client-supervision.ts`
   - Replace `validateRuleArgs()` calls
   - Replace `validateReferenceArgs()` calls

**Before:**
```typescript
export function validateRuleArgs(args?: Record<string, unknown>, requiredFields: string[] = []): RuleArgs {
  // ... 50+ lines of manual validation
}
```

**After:**
```typescript
import { RuleSchema } from '../types/rules.js';

// Simple wrapper that validates and returns partial Rule
export function validateRuleArgs(args?: unknown, requiredFields: string[] = []): Partial<Rule> {
  const result = RuleSchema.partial().parse(args || {});
  
  // Check required fields
  if (requiredFields.length > 0) {
    const missing = requiredFields.filter(field => !(field in result));
    if (missing.length > 0) {
      throw new Error(`Missing required arguments: ${missing.join(', ')}`);
    }
  }
  
  return result;
}
```

---

### Step 4: Convert AgentConfig Types

**Order:** Convert nested types first, then compose them:

1. `AgentSkill` (simple, part of AgentMetadata)
2. `AgentTool` (uses ToolInputSchema - can use `z.any()` for now)
3. `AgentMetadata` (composes AgentSkill, AgentTool)
4. `AgentSettings` (simple key-value pairs)
5. `SupervisorConfig` (simple, part of AgentConfig)
6. `AgentConfig` (composes all above)

**File to modify:** `src/types/agent.ts`

---

### Step 5: Add Validation to Agent Loading

**File:** `src/core/agent-strategy.ts`

**Changes:**
- `loadConfig()` - Validate AgentConfig
- `loadRules()` - Validate Rule metadata
- `loadReferences()` - Validate Reference metadata
- `addRule()` - Validate Rule before saving
- `addReference()` - Validate Reference before saving

---

### Step 6: Add Validation to Agent APIs

**File:** `src/core/agent-api.ts`

**Changes:**
- `AgentImpl.create()` - Validate Partial<AgentConfig>
- `AgentImpl.addRule()` - Validate Rule
- `AgentImpl.addReference()` - Validate Reference
- `AgentImpl.updateMetadata()` - Validate Partial<AgentMetadata>

---

### Step 7: Export Schemas (Optional)

If other packages want to use schemas for validation:

**File:** `src/index.ts`

```typescript
// Export schemas for runtime validation
export { 
  RuleSchema,
  ReferenceSchema,
  AgentConfigSchema,
  AgentMetadataSchema,
  AgentSettingsSchema
} from './types/agent.js';
```

---

## Type Conversion Checklist

### Phase 1: All AgentConfig Types (Must Be Done Together)

**Convert in dependency order** (all must be done before you can complete AgentConfigSchema):

1. **Leaf Types** (no dependencies):
   - [ ] **Rule** (`src/types/rules.ts`)
     - [ ] Replace interface with RuleSchema (source of truth)
     - [ ] Infer type: `export type Rule = z.infer<typeof RuleSchema>`
     - [ ] Add JSDoc comment documenting structure
     - [ ] Add validation to `Agent.addRule()`
     - [ ] Add validation to `AgentStrategy.addRule()`
     - [ ] Replace `validateRuleArgs()`

   - [ ] **Reference** (`src/types/references.ts`)
     - [ ] Replace interface with ReferenceSchema (source of truth)
     - [ ] Infer type: `export type Reference = z.infer<typeof ReferenceSchema>`
     - [ ] Add JSDoc comment documenting structure
     - [ ] Add validation to `Agent.addReference()`
     - [ ] Add validation to `AgentStrategy.addReference()`
     - [ ] Replace `validateReferenceArgs()`

   - [ ] **AgentSkill** (`src/types/agent.ts`)
     - [ ] Replace interface with AgentSkillSchema (source of truth)
     - [ ] Infer type: `export type AgentSkill = z.infer<typeof AgentSkillSchema>`

   - [ ] **SessionToolPermission** (`src/types/agent.ts`)
     - [ ] Create SessionToolPermissionSchema: `z.enum(['always', 'never', 'tool'])`
     - [ ] Keep type alias (can't infer from enum directly, but type is simple)

   - [ ] **ToolInputSchema** (`src/types/json-schema.ts`)
     - [ ] Create ToolInputSchemaSchema (JSON Schema is complex - may use `z.any()` or detailed schema)
     - [ ] Note: This is a discriminated union type, validation may be complex

   - [ ] **SupervisorConfig** (`src/types/supervision.ts`)
     - [ ] Replace interface with SupervisorConfigSchema (source of truth)
     - [ ] Infer type: `export type SupervisorConfig = z.infer<typeof SupervisorConfigSchema>`
     - [ ] Note: `config: any` field can use `z.any()` for now

2. **Types That Depend on Leaf Types**:
   - [ ] **AgentTool** (`src/types/agent.ts`)
     - [ ] Replace interface with AgentToolSchema (source of truth)
     - [ ] Uses ToolInputSchemaSchema for `parameters` field
     - [ ] Infer type: `export type AgentTool = z.infer<typeof AgentToolSchema>`

   - [ ] **AgentSettings** (`src/types/agent.ts`)
     - [ ] Replace interface with AgentSettingsSchema (source of truth)
     - [ ] Uses SessionToolPermissionSchema for optional `toolPermission` field
     - [ ] Note: Settings are mostly key-value pairs (Record<string, string>)
     - [ ] Infer type: `export type AgentSettings = z.infer<typeof AgentSettingsSchema>`

3. **Types That Depend on Multiple Types**:
   - [ ] **AgentMetadata** (`src/types/agent.ts`)
     - [ ] Replace interface with AgentMetadataSchema (source of truth)
     - [ ] Uses AgentSkillSchema for optional `skills` array
     - [ ] Uses AgentToolSchema for optional `tools` array
     - [ ] Infer type: `export type AgentMetadata = z.infer<typeof AgentMetadataSchema>`
     - [ ] Add validation to `Agent.updateMetadata()`

4. **Top-Level Type** (depends on all above):
   - [ ] **AgentConfig** (`src/types/agent.ts`)
     - [ ] Replace interface with AgentConfigSchema (source of truth)
     - [ ] Uses AgentMetadataSchema for `metadata` field
     - [ ] Uses AgentSettingsSchema for `settings` field
     - [ ] Uses SupervisorConfigSchema for optional `supervisors` array
     - [ ] Note: `providers` and `mcpServers` can remain `z.record(z.string(), z.any())` for now
     - [ ] Infer type: `export type AgentConfig = z.infer<typeof AgentConfigSchema>`
     - [ ] Add validation to `AgentStrategy.loadConfig()`
     - [ ] Add validation to `Agent.create()`

---

## File-by-File Change Summary

### New Dependencies

1. **`package.json`**
   - Add `"zod": "^3.22.0"` to dependencies

### Files to Create/Modify

1. **`src/types/rules.ts`**
   - Add `RuleSchema` with hybrid approach
   - Keep existing `Rule` interface

2. **`src/types/references.ts`**
   - Add `ReferenceSchema` with hybrid approach
   - Keep existing `Reference` interface

3. **`src/types/agent.ts`**
   - Add schemas for AgentSkill, AgentTool, AgentMetadata, AgentSettings, AgentConfig
   - Keep existing interfaces

4. **`src/types/supervision.ts`**
   - Add `SupervisorConfigSchema`
   - Keep existing `SupervisorConfig` interface

5. **`src/core/agent-strategy.ts`**
   - Add validation to `loadConfig()`
   - Add validation to `loadRules()`, `loadReferences()`
   - Add validation to `addRule()`, `addReference()`

6. **`src/core/agent-api.ts`**
   - Add validation to `AgentImpl.create()`
   - Add validation to `AgentImpl.addRule()`
   - Add validation to `AgentImpl.addReference()`
   - Add validation to `AgentImpl.updateMetadata()`

7. **`src/mcp/client-rules.ts`**
   - Replace `validateRuleArgs()` with Zod-based validation
   - Update all call sites

8. **`src/mcp/client-references.ts`**
   - Replace `validateReferenceArgs()` with Zod-based validation
   - Update all call sites

9. **`src/mcp/client-supervision.ts`**
   - Update to use new validation functions

10. **`src/index.ts`** (Optional)
    - Export schemas for external use

---

## Testing Strategy

1. **Unit Tests**
   - Test schemas with valid data
   - Test schemas with invalid data
   - Test validation error messages

2. **Integration Tests**
   - Test agent loading with valid config
   - Test agent loading with invalid config
   - Test API methods with valid/invalid inputs

3. **Backward Compatibility**
   - Existing agents should load without errors
   - Existing API calls should continue to work

---

## Migration Notes

1. **Single Source of Truth**
   - Zod schema is the source of truth
   - TypeScript types are inferred from schemas using `z.infer<typeof Schema>`
   - Replace existing interfaces with inferred types
   - Add JSDoc comments for type visibility/documentation

2. **Backward Compatibility**
   - Inferred types should match existing interfaces (TypeScript will error if not)
   - Only add validation, don't change behavior
   - Use `z.parse()` (throws) for strict validation
   - Consider `z.safeParse()` for optional validation points

2. **Error Handling**
   - Validation errors should be clear and actionable
   - Use custom error messages in schemas
   - Log validation errors with context

3. **Performance**
   - Zod validation is fast, but avoid validating on every access
   - Validate at API boundaries only
   - Cache validated results where appropriate

---

## Estimated Effort

- **Phase 1 (All AgentConfig Types):** 6-9 hours
- **Testing:** 2-3 hours
- **Total:** 8-12 hours

---

## Success Criteria

- ✅ All serialization types have Zod schemas
- ✅ All API entry points validate inputs
- ✅ Manual validation functions replaced
- ✅ No breaking changes to existing code
- ✅ Clear error messages for invalid data
- ✅ All tests pass

---

## Next Steps (Post-Migration)

1. **YAML Support:** Use schemas for YAML validation
2. **Migration Tool:** Use schemas to validate migrated agents
3. **API Documentation:** Generate docs from schemas
4. **Type Safety:** Gradually remove `any` types where schemas can help

