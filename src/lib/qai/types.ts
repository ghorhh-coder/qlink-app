/**
 * Q-AI Autonomous Agent Orchestration Framework
 * Production Type Definitions & Execution Protocol
 */

export type QAISwarmType = 
  | "router"
  | "communications"
  | "directory"
  | "emergency"
  | "security"
  | "system";

export type AgentExecutionStatus = 
  | "idle"
  | "planning"
  | "executing_tool"
  | "synthesizing"
  | "completed"
  | "failed";

export interface QAIToolParameter {
  name: string;
  type: "string" | "number" | "boolean" | "object" | "array";
  description: string;
  required: boolean;
  default?: any;
}

export interface QAIToolDefinition {
  id: string;
  name: string;
  description: string;
  swarm: QAISwarmType;
  requiresPermission: boolean;
  isMutating: boolean;
  parameters: QAIToolParameter[];
  handler: (params: Record<string, any>, context: QAIAgentContext) => Promise<QAIToolResult>;
}

export interface QAIToolResult {
  success: boolean;
  data?: any;
  error?: string;
  executionMs: number;
}

export interface QAIAgentContext {
  userId?: string;
  userHandle?: string;
  activeScreen?: string;
  isEmergencyActive?: boolean;
  clientTimestamp: number;
  metadata?: Record<string, any>;
}

export interface QAIAgentStep {
  stepIndex: number;
  swarm: QAISwarmType;
  action: string;
  toolId?: string;
  parameters?: Record<string, any>;
  result?: QAIToolResult;
  reasoning: string;
  durationMs: number;
}

export interface QAIAgentTelemetry {
  orchestrationId: string;
  totalDurationMs: number;
  stepsCount: number;
  toolsInvoked: string[];
  status: AgentExecutionStatus;
  tokenUsageEstimate?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface QAIAgentExecutionPlan {
  orchestrationId: string;
  intent: string;
  confidenceScore: number;
  assignedSwarm: QAISwarmType;
  steps: QAIAgentStep[];
  finalOutput: string;
  telemetry: QAIAgentTelemetry;
}
