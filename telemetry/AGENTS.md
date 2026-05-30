# AGENTS.md — telemetry/ 目录指引

> 指导 AI Agent 在 `telemetry/` 目录的工作。根级规范见 [../AGENTS.md](../AGENTS.md)（单一事实源）。
> 子系统使用文档见 [README.md](README.md)；事件结构见 [schema.md](schema.md)；度量口径见 [../docs/30-度量指南.md](../docs/30-度量指南.md)。

## 目录作用与目标
**集中式遥测管线**：让这套 Skill 分发后，所有成员使用即产生流程数据、**统一收集**用于运营报表与持续改进（[ADR-003](../docs/00-决策记录.md)）。

```
emit.sh (成员本机, shell+curl, 离线缓冲) ──▶ collector (Bun HTTP + SQLite) ──▶ report (Bun → md/json/html)
```

| 路径 | 作用 | 语言 |
|---|---|---|
| `emit.sh` | 埋点客户端，被各 SKILL.md 调用；跨 Claude/Codex；永不阻断宿主（始终 exit 0） | shell |
| `src/server.ts` | 中心收集器（`bun run collector`） | TS/Bun |
| `src/report.ts` | 报表生成（`bun run report`） | TS/Bun |
| `src/metrics.ts` | 指标聚合（纯函数，可测） | TS/Bun |
| `src/store.ts` / `src/schema.ts` | SQLite 存储 / 事件类型与校验 | TS/Bun |
| `test/` | `bun test` 单元测试 | TS/Bun |

## 在此目录工作的规范
- **语言限定**：仅 TypeScript(Bun) + shell（[ADR-002/003](../docs/00-决策记录.md)）；零外部依赖（用 Bun 内置 `bun:sqlite` 与 `Bun.serve`）。
- **客户端铁律**：`emit.sh` **绝不让宿主 Skill 失败**——未配置/离线/禁用都安全退出；网络不可达落盘缓冲、下次补传。
- **隐私**：只采流程元数据，**不采代码内容/PII**；`actor_id` 用不透明值；支持 `FPG_TELEMETRY_DISABLED=1` 退出（[ADR-012](../docs/00-决策记录.md)）。
- **不作个人考核**：指标用于发现瓶颈与验证规范，不用于绩效。
- **事件演进**：改 schema 时升 `schema_version` 并保持向后兼容；`store.ts` 是存储边界（换外部 DB 只改这里）。
- **改完必跑** `bun test`；新增指标要加测试。
- **澄清**：`actor_role`（dev/product/qa/ops/pm）是**人类成员角色**，与"不要按角色拆分 Agent"（[ADR-008](../docs/00-决策记录.md)）无关。
