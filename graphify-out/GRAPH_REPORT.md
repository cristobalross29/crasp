# Graph Report - .  (2026-05-22)

## Corpus Check
- Corpus is ~10,449 words - fits in a single context window. You may not need a graph.

## Summary
- 360 nodes · 679 edges · 28 communities (16 shown, 12 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 30 edges (avg confidence: 0.86)
- Token cost: 7,120 input · 2,880 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Scan Output & Redaction|Scan Output & Redaction]]
- [[_COMMUNITY_Package Config & Dependencies|Package Config & Dependencies]]
- [[_COMMUNITY_Hook Management|Hook Management]]
- [[_COMMUNITY_Test Fixtures & Core Tests|Test Fixtures & Core Tests]]
- [[_COMMUNITY_CLI Dispatcher|CLI Dispatcher]]
- [[_COMMUNITY_Engine & Evaluator Core|Engine & Evaluator Core]]
- [[_COMMUNITY_Init & Report Commands|Init & Report Commands]]
- [[_COMMUNITY_Run Command & Storage|Run Command & Storage]]
- [[_COMMUNITY_Validate & Zod Schemas|Validate & Zod Schemas]]
- [[_COMMUNITY_Docs & Agent Collab|Docs & Agent Collab]]
- [[_COMMUNITY_Config & Pre-commit Hooks|Config & Pre-commit Hooks]]
- [[_COMMUNITY_Scenario Definitions|Scenario Definitions]]
- [[_COMMUNITY_TypeScript Compiler Config|TypeScript Compiler Config]]
- [[_COMMUNITY_Expectations & Violations|Expectations & Violations]]
- [[_COMMUNITY_Schema Primitives|Schema Primitives]]
- [[_COMMUNITY_Smoke Tests|Smoke Tests]]
- [[_COMMUNITY_Report Builder|Report Builder]]
- [[_COMMUNITY_Vitest Root|Vitest Root]]
- [[_COMMUNITY_Smoke Test Entry|Smoke Test Entry]]
- [[_COMMUNITY_Shared Types|Shared Types]]
- [[_COMMUNITY_Evaluator Module|Evaluator Module]]
- [[_COMMUNITY_Patterns Module|Patterns Module]]
- [[_COMMUNITY_Scenario Step Schema|Scenario Step Schema]]
- [[_COMMUNITY_Expectation Schema|Expectation Schema]]
- [[_COMMUNITY_Step Role Schema|Step Role Schema]]
- [[_COMMUNITY_Scanner Options|Scanner Options]]
- [[_COMMUNITY_Prompt Injection Scenario|Prompt Injection Scenario]]

## God Nodes (most connected - your core abstractions)
1. `loadConfig()` - 15 edges
2. `Policy` - 14 edges
3. `runScenario()` - 14 edges
4. `program` - 10 edges
5. `RunReport` - 9 edges
6. `scanDirectory()` - 9 edges
7. `loadPolicy()` - 9 edges
8. `policyExists()` - 9 edges
9. `printTerminalScanResults()` - 9 edges
10. `checkCommand()` - 9 edges

## Surprising Connections (you probably didn't know these)
- `runScenario()` --calls--> `nanoid`  [INFERRED]
  src/core/engine.ts → package.json
- `Local-first design (no cloud required)` --rationale_for--> `runScenario()`  [INFERRED]
  package.json → src/core/engine.ts
- `Default Safety Policy (agentfence.policy.yml)` --semantically_similar_to--> `Example Default Safety Policy YAML`  [INFERRED] [semantically similar]
  agentfence.policy.yml → examples/policies/default-safety.yml
- `Scenario: safe-refusal-demo` --semantically_similar_to--> `Example Scenario: safe-refusal-demo`  [INFERRED] [semantically similar]
  scenarios/safe-refusal-demo.yml → examples/scenarios/safe-refusal-demo.yml
- `run-scenario.test.ts (runScenario integration test)` --references--> `runScenario()`  [EXTRACTED]
  tests/integration/run-scenario.test.ts → src/core/engine.ts

## Hyperedges (group relationships)
- **Scenario Evaluation Pipeline: Scenario + Policy → evaluateScenario → EvaluationResult → RunReport** — types_scenario, types_policy, core_evaluator_evaluatescenario, core_evaluator_evaluationresult, types_runreport [EXTRACTED 1.00]
- **Built-in Policy Merge Flow: BUILTIN_POLICY + user Policy → mergeWithBuiltin → merged Policy** — core_patterns_builtin_policy, types_policy, core_patterns_mergewithbuiltin [EXTRACTED 1.00]
- **Config Lifecycle: DEFAULT_CONFIG + AgentFenceConfig → writeConfig / loadConfig → .agentfence/config.json** — core_config_default_config, types_agentfenceconfig, core_config_writeconfig, core_config_loadconfig [EXTRACTED 1.00]
- **File Scan Pipeline: scanDirectory -> scanFiles -> scanFile -> scanContent** — scanner_index_scan_directory, scanner_index_scan_files, scanner_index_scan_file, scanner_index_scan_content [EXTRACTED 1.00]
- **Merged Policy used across check, scan, policy commands** — commands_check_check_command, commands_scan_scan_command, commands_policy_policy_command, concept_merged_policy, policy_loader_load_policy [INFERRED 0.90]
- **CLI program dispatches all subcommands** — cli_index_program, commands_check_check_command, commands_scan_scan_command, commands_hook_hook_command, commands_setup_setup_command, commands_status_status_command, commands_validate_validate_command, commands_policy_policy_command, commands_report_report_command, commands_init_init_command [EXTRACTED 1.00]
- **Reporter Dispatch: renderReport selects terminal/json/html renderer** — commands_run_renderreport, reporters_terminal_renderterminalreport, reporters_json_renderjsonreport, reporters_html_renderhtmlreport [EXTRACTED 1.00]
- **Storage Run Lifecycle: save, load, list run reports via defaultStorageDir** — storage_index_saverunreport, storage_index_loadrunreport, storage_index_listrunreports, storage_index_defaultstoragedir [EXTRACTED 1.00]
- **Agent Skill Workflows: new-scenario, new-policy, run-fence, audit-safety used by Claude Code and Codex** — skills_new_scenario_skill, skills_new_policy_skill, skills_run_fence_skill, skills_audit_safety_skill, concept_claude_code_agent [EXTRACTED 1.00]
- **Safe Scenario Expectation Evaluation Flow** — scenarios_safe_assistant_scenario, scenarios_safe_assistant_step_assistant, scenarios_safe_assistant_expectation_gives_defensive_guidance [INFERRED 0.95]

## Communities (28 total, 12 thin omitted)

### Community 0 - "Scan Output & Redaction"
Cohesion: 0.06
Nodes (61): formatMatch(), printTerminalScanResults(), redactSecret(), redactSensitiveMatch(), redactSensitiveScanResults(), redactValue(), TerminalScanOutputOptions, log (+53 more)

### Community 1 - "Package Config & Dependencies"
Cohesion: 0.06
Nodes (33): bin, agentfence, dependencies, chalk, cli-table3, commander, js-yaml, micromatch (+25 more)

### Community 2 - "Hook Management"
Cohesion: 0.13
Nodes (28): exists(), getHookStatus(), hookCommand(), installHook(), uninstallHook(), ensureGitignoreEntry(), exists(), markHooksEnabled() (+20 more)

### Community 3 - "Test Fixtures & Core Tests"
Cohesion: 0.12
Nodes (20): policy, result, scenario, merged, policy, result, evaluateScenario(), EvaluationResult (+12 more)

### Community 4 - "CLI Dispatcher"
Cohesion: 0.09
Nodes (31): program, checkCommand, getHookStatus, hookCommand, installHook, initCommand, policyCommand, renderReport (+23 more)

### Community 5 - "Engine & Evaluator Core"
Cohesion: 0.11
Nodes (28): scan-output.test.ts (printTerminalScanResults + redact tests), 10 Built-in Security Rule Categories, engine.ts (runScenario orchestrator), evaluateScenario(), EvaluationResult interface, evaluator.test.ts (evaluateScenario unit tests), patterns/builtin.ts (BUILTIN_POLICY), BUILTIN_POLICY (10 built-in security rules) (+20 more)

### Community 6 - "Init & Report Commands"
Cohesion: 0.22
Nodes (16): exists(), initCommand(), InitOptions, writeStarterFile(), renderReport(), reportCommand(), ReportOptions, renderReport() (+8 more)

### Community 7 - "Run Command & Storage"
Cohesion: 0.17
Nodes (16): listCommand(), resolvePolicyPath(), runScenario(), RunScenarioOptions, run-scenario.test.ts (runScenario integration test), scenarioPath, storageDir, BuildReportInput (+8 more)

### Community 8 - "Validate & Zod Schemas"
Cohesion: 0.16
Nodes (13): validateCommand(), ParsedPolicy, policyRuleSchema, policySchema, ParsedScenario, scenarioExpectationSchema, scenarioSchema, scenarioStepSchema (+5 more)

### Community 9 - "Docs & Agent Collab"
Cohesion: 0.19
Nodes (16): Default Safety Policy (agentfence.policy.yml), AgentFence README, AgentFence Agent Collaboration Guide, AgentFence Project CLAUDE.md Instructions, Claude Code Agent Role, Codex Agent Role, Credential Theft Policy Rule, Local-First AI Safety Testing (+8 more)

### Community 10 - "Config & Pre-commit Hooks"
Cohesion: 0.21
Nodes (12): Local-first design (no cloud required), Pre-commit hook integration, DEFAULT_CONFIG constant, config/index.ts (loadConfig, writeConfig), loadConfig(), config.test.ts (config read/write tests), writeConfig(), check.test.ts (checkCommand integration tests) (+4 more)

### Community 11 - "Scenario Definitions"
Cohesion: 0.31
Nodes (9): Contains Expectation Type, Defensive Security Guidance, Expectation: gives-defensive-guidance, Multi-Factor Authentication, Safe Policy Baseline (No Policy Violations Expected), safe-assistant Scenario, Severity: Low, Assistant Step: Defensive Guidance Response (+1 more)

### Community 12 - "TypeScript Compiler Config"
Cohesion: 0.22
Nodes (8): compilerOptions, module, moduleResolution, outDir, rootDir, strict, target, include

### Community 13 - "Expectations & Violations"
Cohesion: 0.40
Nodes (5): buildExpectationMessage, collectTargetText, evaluateExpectation, evaluateExpectations, detectViolations

### Community 14 - "Schema Primitives"
Cohesion: 0.67
Nodes (3): policyRuleSchema, severitySchema, targetRoleSchema

## Knowledge Gaps
- **119 isolated node(s):** `name`, `version`, `description`, `type`, `agentfence` (+114 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **12 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `runScenario()` connect `Run Command & Storage` to `Scan Output & Redaction`, `Package Config & Dependencies`, `Test Fixtures & Core Tests`, `Engine & Evaluator Core`, `Init & Report Commands`, `Config & Pre-commit Hooks`?**
  _High betweenness centrality (0.296) - this node is a cross-community bridge._
- **Why does `nanoid` connect `Package Config & Dependencies` to `Run Command & Storage`?**
  _High betweenness centrality (0.138) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `runScenario()` (e.g. with `nanoid` and `Local-first design (no cloud required)`) actually correct?**
  _`runScenario()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `name`, `version`, `description` to the rest of the system?**
  _123 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Scan Output & Redaction` be split into smaller, more focused modules?**
  _Cohesion score 0.062111801242236024 - nodes in this community are weakly interconnected._
- **Should `Package Config & Dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.058823529411764705 - nodes in this community are weakly interconnected._
- **Should `Hook Management` be split into smaller, more focused modules?**
  _Cohesion score 0.13368983957219252 - nodes in this community are weakly interconnected._