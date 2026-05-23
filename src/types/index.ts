export type Severity = "low" | "medium" | "high" | "critical";

export type StepRole = "system" | "user" | "assistant" | "tool";

export type TargetRole = StepRole | "any";

export interface ScenarioStep {
  id?: string;
  role: StepRole;
  content: string;
}

export interface ScenarioExpectation {
  id?: string;
  type: "contains" | "not_contains" | "regex";
  value: string;
  target?: TargetRole;
  severity?: Severity;
  description?: string;
}

export interface Scenario {
  name: string;
  description?: string;
  steps: ScenarioStep[];
  expectations?: ScenarioExpectation[];
}

export interface PolicyRule {
  id: string;
  description: string;
  severity: Severity;
  pattern: string;
  target?: TargetRole;
  message?: string;
}

export interface Policy {
  id: string;
  name: string;
  version?: string;
  rules: PolicyRule[];
}

export interface FileScanMatch {
  ruleId: string;
  ruleName: string;
  severity: Severity;
  line: number;
  column: number;
  match: string;
  context: string;
}

export interface FileScanResult {
  filePath: string;
  matches: FileScanMatch[];
  scanned: boolean;
  error?: string;
}

export interface ScanSummary {
  totalFiles: number;
  scannedFiles: number;
  matchedFiles: number;
  totalMatches: number;
  bySeverity: Record<Severity, number>;
}

export interface AgentFenceConfig {
  version: string;
  policyPath?: string;
  hooksEnabled: boolean;
  hookPath?: string;
  builtinPolicies: string[];
  createdAt: string;
}

export interface HookStatus {
  installed: boolean;
  managed: boolean;
  path?: string;
  healthy?: boolean;
}

export interface ProjectStatus {
  initialized: boolean;
  config?: AgentFenceConfig;
  hookStatus: HookStatus;
  policyPath?: string;
  scenarioCount: number;
  runCount: number;
}

export interface Trace {
  steps: ScenarioStep[];
}

export interface Violation {
  id: string;
  ruleId?: string;
  expectationId?: string;
  severity: Severity;
  message: string;
  stepIndex?: number;
  excerpt?: string;
}

export interface ExpectationResult {
  id: string;
  type: ScenarioExpectation["type"];
  passed: boolean;
  message: string;
  severity: Severity;
}

export interface RunReport {
  runId: string;
  scenarioPath: string;
  policyPath?: string;
  scenarioName: string;
  status: "passed" | "failed";
  startedAt: string;
  completedAt: string;
  summary: {
    steps: number;
    expectations: number;
    passedExpectations: number;
    failedExpectations: number;
    violations: number;
  };
  expectations: ExpectationResult[];
  violations: Violation[];
}
