# AGENTS.md — scripts/ 目录指引

> 指导 AI Agent 在 `scripts/` 目录的工作。根级规范见 [../AGENTS.md](../AGENTS.md)（单一事实源）。

## 目录作用与目标
存放仓库级脚本（不属于某个具体 Skill）。目标：提供跨会话状态服务与跨工具安装能力。

| 文件 | 作用 | 语言 | 验证 |
|---|---|---|---|
| `project_state.py` | `project-state` MCP（跨会话状态，FastMCP stdio）；记"项目当前是什么"。**遥测独立于此**（见 `telemetry/`） | Python | `python3 scripts/project_state.py --test` → `✅ 所有测试通过！` |
| `install.sh` | 跨工具安装器：软链 Skill、生成遥测环境文件、打印 MCP 配置块；幂等、支持 `--dry-run` | shell | `bash scripts/install.sh --tools claude --dry-run` |

## 在此目录工作的规范
- **语言限定**：仅 Python / TypeScript(Bun) / shell（[ADR-002 边界](../docs/00-决策记录.md)），不引入其他开发语言。
- **可读性**：显式错误处理、无 voodoo 常量（魔数要有注释依据）、参数自文档化。
- **安全**：修改用户环境的脚本（如 install.sh）必须**幂等**、支持 `--dry-run`，不就地改写已有 JSON/TOML（避免损坏，改为打印待并入块）。
- **不要把遥测埋进 `project_state.py`**（[ADR-003](../docs/00-决策记录.md)：遥测与状态解耦）。
- **改完必跑**对应自测；新增脚本要带或更新测试。
- `project_state.py` 的 `--test` 不依赖 `mcp` 库即可运行（缺库时仅真实 stdio 模式报错退出）。
