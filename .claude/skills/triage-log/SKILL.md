---
name: triage-log
description: Use when the user wants to review real Crasp hook activity and tune the policy — analyzes the accumulated .crasp/events.ndjson log to surface most-fired rules, paths that keep hitting ask dialogs (exception candidates), denied spikes, and dead rules that never fire, then recommends concrete crasp.policy.yml edits. Closes the test→observe→tune loop that /test-hook starts.
---

# Skill: triage-log

Read the real hook activity Crasp has logged and turn it into concrete policy/exception tuning recommendations. Where `/test-hook` tests one hypothetical payload, this analyzes what has *actually* happened.

## When this skill is invoked

The user types `/triage-log` optionally followed by a window, e.g.:
- `/triage-log` — analyze the default window (30 days)
- `/triage-log --days 7`

## Steps

1. **Ensure the project is built**:
   ```sh
   pnpm build 2>/dev/null || true
   ```

2. **Pull the summary and recent activity** — Use the CLI rather than parsing the file by hand:
   ```sh
   node dist/index.js hook-log --summary       # 30-day stats
   node dist/index.js hook-log --days 7         # recent detail
   ```
   If `.crasp/events.ndjson` does not exist or is empty, tell the user there's no activity yet (Crasp may not be wired into a project, or nothing has triggered it) and stop.

3. **Aggregate the signals** — From the events, compute:
   - **Outcome mix** — counts of `clean` / `advisory` / `ask` / `denied` / `exception` / `inbound-flagged`.
   - **Most-fired rules** — which `ruleId`s trigger most often.
   - **Ask-dialog repeat offenders** — the same `filePath` or command shape hitting `ask` many times. These are the strongest **exception candidates** — a real workflow the user keeps approving.
   - **Denied spikes** — any `denied` outcomes, with the rule and what was blocked.
   - **Dead rules** — builtin/bash rules that never appear. Candidates to tighten or reconsider (possibly too narrow, possibly fine).

4. **Report** — Output a structured summary:

   ```
   Hook Activity — last <N> days
   Total events: X   (clean A / advisory B / ask C / denied D / exception E)

   Top rules:
     <ruleId>: N hits
     ...

   Ask-dialog repeat offenders (exception candidates):
     <path or command>: N asks — <ruleId>
     ...

   Denied:
     <ruleId>: blocked <what> (N×)

   Recommendations:
     - <specific action>
   ```

5. **Recommend concrete tuning** — For each repeat offender that's clearly a legitimate workflow, propose the exact `crasp.policy.yml` exception:
   ```yaml
   exceptions:
     - path: "<path>"
       ops: [write, edit]
       reason: "<why this is safe — approved N times>"
   ```
   For noisy rules causing false positives, recommend tightening the pattern (and offer to run `/new-rule` or edit the builtin rule). For a `denied` that was legitimate, explain the bypass options. Hand off policy edits to `/new-policy` where appropriate.

## Rules

- Never invent activity — if the log is empty, say so and stop. Recommendations must trace to real events.
- An `ask` that the user approves repeatedly is a workflow signal, not a failure — surface it as an exception candidate, not a problem.
- Treat every `denied` as worth a close look: confirm it was a true positive, or recommend the exception if it wasn't.
- Do not recommend loosening a `critical`/security rule just because it's noisy — recommend a scoped exception or a tighter pattern instead.
- The log may contain real secret values (Crasp logs what it scanned). Do not echo raw matched content into your summary — report rule IDs, paths, and counts only.
