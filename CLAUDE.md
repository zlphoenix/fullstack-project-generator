# CLAUDE.md

This file provides Claude-Code-specific guidance. **The canonical, cross-tool guidance lives in [AGENTS.md](AGENTS.md)** — read it first for repo structure, the Skill pipeline, commands, and behavioral rules. This file only adds what's specific to Claude Code.

## Quick reference (see AGENTS.md for full detail)

- This repo is a collection of **Skills** (`skills/<name>/SKILL.md`) guiding AI-assisted fullstack development. No application code.
- Pipeline: `project-requirements → project-architecture → project-scaffold → sprint-plan → sprint-develop → project-qa → project-deploy`.
- Verify the MCP service: `python3 scripts/project_state.py --test` → expect `✅ 所有测试通过！`
- Verify telemetry: `cd telemetry && bun test`.

## Claude-Code-specific setup

Run the cross-tool installer (configures both Claude Code and Codex):

```bash
bash scripts/install.sh --scope user --tools claude --dry-run   # preview
bash scripts/install.sh --scope user --tools claude             # apply
```

What it configures for Claude Code:
- **Skills**: symlinks each `skills/<name>/` into `~/.claude/skills/` (user scope) or `<project>/.claude/skills/` (project scope).
- **MCP** (`project-state`) in `.claude/settings.local.json`:
  ```json
  { "mcpServers": { "project-state": {
    "command": "python3",
    "args": ["$FPG_HOME/scripts/project_state.py"],
    "type": "stdio"
  }}}
  ```
- **Telemetry env** (`FPG_HOME`, `FPG_TELEMETRY_ENDPOINT`, `FPG_ACTOR_ROLE`, `FPG_TOOL=claude`) sourced from `~/.fpg-telemetry/env.sh`.

Dependencies: `pip install mcp` (for the Python MCP) and Bun ≥ 1.1 (only for the telemetry collector/report, server side).

## Skill authoring conventions (Claude Code)

- Frontmatter `name` + `description` drive trigger matching — keep descriptions specific, third-person, with trigger terms.
- Keep `SKILL.md` body < 500 lines; split into `references/` and keep references one level deep.
- Each Skill starts with a 前置检查 (reads `project-state` MCP) and ends with `write_project_state`.
- `sprint-develop` is scoped to **1 Story × 1 platform** per invocation to avoid context overload.
- Reference docs under `skills/shared/references/` load conditionally (only platforms involved).
