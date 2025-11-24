import { z } from 'zod';

/**
 * JSON Schema Type Definitions for MCP Tool Parameters
 * 
 * These types provide a discriminated union for JSON Schema parameter definitions
 * used in MCP tool descriptions. They ensure type safety without relying on
 * `any` or `unknown`, and are specifically tailored for MCP tool usage.
 */

// Shared base for all schemas
type SchemaBase = {
  title?: string;
  description?: string;
};

// String
type StringSchema = SchemaBase & {
  type: 'string';
  enum?: string[];
  default?: string;
  examples?: string[];
  minLength?: number;
  maxLength?: number;
};

// Number | Integer (single type; discriminate via `type`)
type NumericSchema = SchemaBase & {
  type: 'number' | 'integer';
  enum?: number[];
  default?: number;
  examples?: number[];
  minimum?: number;
  maximum?: number;
};

// Boolean
type BooleanSchema = SchemaBase & {
  type: 'boolean';
  default?: boolean;
};

// Array
type ArraySchema = SchemaBase & {
  type: 'array';
  items: JsonSchemaDefinition | JsonSchemaDefinition[]; // type or types of array members
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
};

// Object (root for MCP tools)
type ObjectSchema = SchemaBase & {
  type: 'object';
  properties?: Record<string, JsonSchemaDefinition>;
  required?: string[];
  additionalProperties?: boolean | JsonSchemaDefinition; // boolean or type of allowed additional properties
  minProperties?: number;
  maxProperties?: number;
};

// Union
export type JsonSchemaDefinition =
  | StringSchema
  | NumericSchema
  | BooleanSchema
  | ArraySchema
  | ObjectSchema;

// For MCP tools (inputSchema root must be an object)
export type ToolInputSchema = ObjectSchema;

/**
 * ToolInputSchema schema - single source of truth.
 * 
 * Note: JSON Schema is complex with discriminated unions, so we use a flexible validation
 * that requires type: 'object' and validates basic structure. Full validation of nested
 * JSON Schema structures can be enhanced later if needed.
 */
export const ToolInputSchemaSchema = z.object({
  type: z.literal('object'),
  title: z.string().optional(),
  description: z.string().optional(),
  properties: z.record(z.string(), z.any()).optional(),
  required: z.array(z.string()).optional(),
  additionalProperties: z.union([z.boolean(), z.any()]).optional(),
  minProperties: z.number().int().optional(),
  maxProperties: z.number().int().optional(),
}).passthrough() as z.ZodType<ToolInputSchema>; // Allow additional JSON Schema properties

// Type is already defined above, but we validate against it

