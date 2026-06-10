# CLAUDE.md

This file provides Claude-Code-specific guidance. **The canonical, cross-tool guidance lives in [AGENTS.md](AGENTS.md)** — read it first for repo structure, the Skill pipeline, commands, and behavioral rules. This file only adds what's specific to Claude Code.

## Quick reference (see AGENTS.md for full detail)

- This repo is a collection of **Skills** (`skills/<name>/SKILL.md`) guiding AI-assisted fullstack development. No application code, **no Python** (see [ADR-013](docs/00-决策记录.md)).
- Pipeline: `project-requirements → project-architecture → project-scaffold → sprint-plan → sprint-develop → project-qa → project-deploy`.
- Verify telemetry: `cd telemetry && bun test`.

## Claude-Code-specific setup

Run the cross-tool installer (configures both Claude Code and Codex):

```bash
bash scripts/install.sh --project-dir <your-project> --tools claude --dry-run   # preview
bash scripts/install.sh --project-dir <your-project> --tools claude             # apply
```

What it configures for Claude Code:
- **Skills**: symlinks each `skills/<name>/` into `<project>/.claude/skills/` (default, project scope) or `~/.claude/skills/` (optional user scope). Existing same-named skills are **not overwritten** (skipped with a warning).
- **Project common files**: deploys `project-template/` into your project (the project-level `AGENTS.md` + platform references all Skills assume).
- **Telemetry env** (`FPG_HOME`, `FPG_TELEMETRY_ENDPOINT`, `FPG_ACTOR_ROLE`, `FPG_TOOL=claude`) sourced from `~/.fpg-telemetry/env.sh`.

Dependencies: `bash` + `curl` (Skills & telemetry client; **no Python**). Bun ≥ 1.1 only for the telemetry collector/report backend.

## Cross-session progress (no MCP, no state file)

There is **no `.project-state.json` and no MCP**. Each Skill derives "where the project is" from real artifacts — `docs/PRD.md`, `docs/sprint-N.md`, `PROGRESS.md`, and `git log` — and emits a telemetry event (user/role/time/skill/milestone/phase) via `telemetry/emit.sh`. Observability is centralized in `telemetry/`.

## Skill authoring conventions (Claude Code)

- Frontmatter `name` + `description` drive trigger matching — keep descriptions specific, third-person, with trigger terms.
- Keep `SKILL.md` body < 500 lines; split into `references/` and keep references one level deep.
- Each Skill starts with a 前置检查 that reads project artifacts (not an MCP) and ends by updating those artifacts + `PROGRESS.md`.
- `sprint-develop` is scoped to **1 context slice (= 1 platform/context boundary, may bundle multiple同边界 Tasks)** per invocation to avoid context overload.
- **Progressive disclosure for governance**: planning-phase skills load `iteration-governance.md` in full; execution-phase skills load only `execution-card.md` (~40 lines). Hard rules are enforced by `.fpg/bin/fpg-check.sh`, not by prose repetition inside SKILL bodies.
- **Measurements are instrumentation-only**: token/duration come from tool hooks (`telemetry/hooks/`), never from model self-reporting. Skills only write/remove the `.fpg/current-task` attribution marker. Dashboards: collector `GET /report`.
- Universal conventions all Skills assume live in the **project-level `AGENTS.md`** (deployed from `project-template/`); platform guides are project-level references.
