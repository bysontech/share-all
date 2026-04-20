# Claude Operating Rules (base)

This repository uses a layered rule system:
- CLAUDE.md (this file): base rules shared across projects
- CLAUDE.local.md: project-specific overrides (MUST be updated per project)
- AGENTS.md: collaboration workflow and roles
- docs/: specs, tasks, decisions

## Non-negotiables
- Never exfiltrate secrets. Do not print or request API keys, tokens, private URLs, or credentials.
- Do not modify deployment/infra/security-critical config unless explicitly requested.
- Prefer small, reversible changes. If unsure, propose a plan first.

## Workflow
- Use a feature branch (no direct pushes to main).
- Make atomic commits with clear messages.
- Prefer PRs; include how-to-test, risks, and rollback notes.

## Change policy
- Keep scope tight: only change what is required for the task.
- If you need to introduce a new dependency, justify it briefly and keep it minimal.
- Do not refactor unrelated areas unless it directly reduces risk for the task.

## Quality gates
- Run the project’s standard commands defined in CLAUDE.local.md.
- If tests are not available, add at least a smoke-check step and document it.

## Output format (when finishing a task)
- Summary (what changed, why)
- How to test (commands + manual steps)
- Risks / follow-ups
- Files changed (high-level)
