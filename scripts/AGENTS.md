# AGENTS.md — scripts/ 目录指引

> 指导 AI Agent 在 `scripts/` 目录的工作。根级规范见 [../AGENTS.md](../AGENTS.md)（单一事实源）。

## 目录作用与目标
存放仓库级脚本（不属于某个具体 Skill）。目标：跨工具安装与分发。

| 文件 | 作用 | 语言 | 验证 |
|---|---|---|---|
| `install.sh` | 跨工具安装/分发：为每个 SKILL 建软链（默认项目级、不覆盖同名）、部署 `project-template/` 公共文件、生成遥测环境文件；幂等、支持 `--dry-run` | shell | `bash scripts/install.sh --project-dir <proj> --tools claude --dry-run` |

> **无 Python**（[ADR-013](../docs/00-决策记录.md)）：已移除 `project_state.py`。跨会话进展由项目产物派生 + 遥测事件统一收集。工具脚本（`init_project.py`/`generate_api_contract.py`，仍在各 SKILL 下）的移植推迟 M2（[ADR-014](../docs/00-决策记录.md)）。

## 在此目录工作的规范
- **语言限定**：仅 TypeScript(Bun) / shell；**不再引入 Python**（[ADR-013](../docs/00-决策记录.md)）。
- **可读性**：显式错误处理、无 voodoo 常量（魔数要有注释依据）、参数自文档化。
- **安全**：修改用户环境的脚本（如 install.sh）必须**幂等**、支持 `--dry-run`，不就地改写已有 JSON/TOML，**不覆盖**用户已有同名 skill（跳过并告警）。
- **改完必跑**对应自测；新增脚本要带或更新测试。
