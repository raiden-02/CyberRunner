import { PLAYTEST_FUNCTION_TOOLS, PLAYTEST_TOOL_NAMES } from "./playtest-agent.js";

export type AnthropicToolSchema = {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties?: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };
};

type LogicalFunctionTool = {
  name: string;
  description: string;
  parameters: {
    type?: string;
    properties?: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };
};

export function anthropicToolsFromPlaytest(): AnthropicToolSchema[] {
  return (PLAYTEST_FUNCTION_TOOLS as LogicalFunctionTool[]).map((tool) =>
    openaiFunctionToAnthropicTool(tool),
  );
}

export function openaiFunctionToAnthropicTool(tool: LogicalFunctionTool): AnthropicToolSchema {
  const parameters = tool.parameters ?? { type: "object" };
  return {
    name: tool.name,
    description: tool.description,
    input_schema: {
      type: "object",
      properties: parameters.properties,
      required: parameters.required,
      additionalProperties: parameters.additionalProperties,
    },
  };
}

export function playtestToolNames(): readonly string[] {
  return PLAYTEST_TOOL_NAMES;
}
