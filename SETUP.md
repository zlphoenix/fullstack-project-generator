# 安装与使用手册

> 本文是**从零装好 → 用 Skill 开发 → 看度量结果**的一站式手册。
> 更深入的内容：能力总览 → [README.md](README.md)；分发/版本管理细节 → [docs/40-分发与部署指南.md](docs/40-分发与部署指南.md)；跨工具单一事实源 → [AGENTS.md](AGENTS.md)；遥测内部设计 → [telemetry/README.md](telemetry/README.md)。

## 0. 依赖

| 组件 | 要求 |
|---|---|
| Skill 与遥测客户端 | `bash` + `curl`（**无 Python、无 MCP**） |
| 遥测收集器/看板（可选，团队一台机器跑即可） | Bun ≥ 1.1 |
| AI 工具 | Claude Code 和/或 Codex |

## 1. 安装（装进你的项目）

```bash
# 推荐：一键初始化。Codex/Claude 可直接执行。
# 自动推断 project-id/user/name，探测本机 collector(http://localhost:10000)，
# 写入 hooks/env，并同步已有 docs/iteration/epics/E*/plan.md。
bash scripts/install.sh --project-dir <你的项目> --init --dry-run
bash scripts/install.sh --project-dir <你的项目> --init

# 团队 collector 不在本机时，只需要显式补 endpoint。
bash scripts/install.sh --project-dir <你的项目> --tools claude,codex \
  --telemetry-endpoint http://<收集器主机>:10000 \
  --init
```

安装器做了什么（全部幂等、同名不覆盖）：

| 动作 | 落点 |
|---|---|
| Skill 软链 | `<项目>/.claude/skills/`（Claude Code）、`<项目>/.codex/skills/`（Codex） |
| 项目公共文件 | `<项目>/AGENTS.md`、`<项目>/PROGRESS.md`（已存在则跳过） |
| 平台/治理参考（软链，随仓库更新） | `<项目>/.fpg/references/` |
| 机械校验脚本（软链） | `<项目>/.fpg/bin/`（含 `fpg-check.sh`） |
| 遥测环境 | `~/.fpg-telemetry/env.sh`（`FPG_HOME`/`FPG_TELEMETRY_ENDPOINT`/`FPG_ACTOR_ROLE`/`FPG_ACTOR_ID`） |
| `--wire-hooks` | 工具侧自动埋点：`<项目>/.codex/hooks.json` + `<项目>/.claude/settings.json` |
| `--wire-env` | `~/.zshenv` 可逆标记块（让非交互 shell 也能读到遥测 env） |
| `--sync-plans` / `--init` | 扫描并同步 `<项目>/docs/iteration/epics/E*/plan.md` 到看板 |

推断规则：

| 内容 | 默认推断 | 推断不合适时 |
|---|---|---|
| `project_id` | git 顶层目录名；无 git 时用项目目录名 | 加 `--project-id <稳定项目ID>` |
| `actor_id` | `$USER`，无值时 `anonymous` | 加 `--user <你的稳定ID>` |
| 显示名 | 非交互默认 `Allen`，交互安装会询问 | 加 `--name <显示名>` |
| collector | 先探测 `http://localhost:10000/health`，否则使用 `FPG_TELEMETRY_ENDPOINT`，再否则默认 `http://localhost:10000` | 加 `--telemetry-endpoint <URL>` |

卸载：`bash scripts/install.sh --project-dir <你的项目> --uninstall`（只删本工具写入的软链与标记块，保留可能含你改动的文件并提示清理方法）。

建议把 `.fpg/current-task` 加进项目 `.gitignore`（它是度量归因的临时标记，见 §3）。

## 2. 使用 Skill（开发流水线）

在你的项目里打开 Claude Code / Codex，按阶段用自然语言触发：

```
project-requirements → project-architecture → project-scaffold
  → sprint-plan → sprint-develop（循环）→ project-qa → project-deploy
```

| 阶段 | 说一句什么 | 产出 |
|---|---|---|
| 需求 | “我想做一个XX应用” | `docs/PRD.md` |
| 架构 | “设计架构 / 生成API契约” | `docs/architecture.md` + `api/openapi.yaml` |
| 脚手架 | “初始化项目” | 各平台项目骨架 |
| 规划 | “规划第一个Sprint” | `docs/iteration/epics/E###/sprints/S###/plan.md`（含终止契约、Task 清单、依赖图） |
| 开发 | “实现登录”（每次 1 个上下文切片＝1 平台/上下文边界） | 功能代码 + 测试 |
| QA | “写测试策略” | 各平台测试文件 |
| 部署 | “配置Docker部署” | docker/ + CI |

几条使用要点：

- **进度从产物派生**：新会话不需要交接话术，Skill 会读 `PROGRESS.md` + 最新 `plan.md` + `git log` 自行恢复上下文。
- **治理分层披露**：规划期才加载治理规范全文；开发期只用 ~40 行的 [执行卡](project-template/references/execution-card.md)。
- **硬规则机械校验**：止损/预算/计划结构由脚本判定，不靠模型自觉——
  ```bash
  bash .fpg/bin/fpg-check.sh plan-lint docs/iteration/epics/E001-*/plan.md   # 计划结构
  bash .fpg/bin/fpg-check.sh gate      docs/iteration/epics/E001-*           # 止损闸门（STOP=停，升级人类）
  bash .fpg/bin/fpg-check.sh budget    docs/iteration/epics/E001-*           # 预算消耗
  ```
  `sprint-plan` 收尾、`sprint-develop` 起步会自动跑；你也可以随时手动跑。

## 3. 度量：怎么采、存在哪、怎么看

### 3.1 起收集器（团队一台机器，或本机）

```bash
cd <FPG_HOME>/telemetry
FPG_TELEMETRY_PORT=10000 FPG_TELEMETRY_DB=./data/events.db bun run collector
# 健康检查：curl http://localhost:10000/health
```

### 3.2 数据怎么来（自动，模型零记账）

- **测量值（token 用量、耗时）全部由工具 hook 自动采集**（`--wire-hooks` 写入的配置）：会话开始 / 每回合结束自动上报，Codex 的真实 token 用量从其会话日志自动提取。模型**不估算、不自报、不回填**——plan.md 里没有任何手工 token 字段。
- **E/S/T 归因**：Skill 在切片开始时写 `<项目>/.fpg/current-task`（结束删除），hook 自动把 epic/sprint/task/platform 附到每条事件上。
- **业务里程碑**（Story 完成、契约变更、验证结果）由 Skill best-effort 调 `emit.sh` 发出。
- 一切遥测**绝不阻断开发**：未配置、离线、`FPG_TELEMETRY_DISABLED=1` 都安全跳过。

### 3.3 数据存在哪

| 数据 | 位置 | 说明 |
|---|---|---|
| **事件库（真源）** | 收集器机器上的 `<FPG_HOME>/telemetry/data/events.db` | SQLite 单文件；可用 `FPG_TELEMETRY_DB` 改路径；备份/迁移拷这个文件即可 |
| 离线缓冲 | 各成员本机 `~/.fpg-telemetry/queue/*.json` | 收集器不可达时落盘，下次自动补传 |
| token 增量状态 | 各成员本机 `~/.fpg-telemetry/state/` | 用于计算每回合 token 增量，可随时删（只影响下一回合差值） |
| 遥测环境 | `~/.fpg-telemetry/env.sh` | 删除即彻底停用客户端 |
| 归因标记（临时） | `<项目>/.fpg/current-task` | Skill 写/删；建议 .gitignore |

> 隐私：只采流程元数据（阶段/状态/时长/角色/token 量），不采代码内容或 PII；度量用于改进，不作个人考核。

### 3.4 怎么看结果

**度量看板（推荐）**：浏览器打开

```
http://<收集器主机>:10000/report            # 全部项目
http://<收集器主机>:10000/report?project=my-app
```

看板内容：token 总量与**按阶段 / 按 Skill / 按 Epic-Sprint-Task 的 token 用量**、各阶段**活跃耗时**（同会话相邻回合间隔，>30 分钟空闲自动剔除）、会话/回合数、**skill 命中分布**、阶段周期时间、Story 交付时长、返工率、AC 通过率。

**命令行报表**（适合归档/定时发布）：

```bash
cd <FPG_HOME>/telemetry
bun run report --db ./data/events.db --format md                  # Markdown
bun run report --db ./data/events.db --format html --out report.html
bun run report --db ./data/events.db --project my-app --format json
```

**即时 JSON**：`curl http://localhost:10000/stats?project=my-app`

### 3.5 安装后自检（一次性）

安装后立即检查：

```bash
curl http://localhost:10000/stats?project=<project_id>
```

能看到项目和 E/S/T 计划节点，说明 `plan_sync` 已经成功。跑完第一个会话后再打开 `/report`，确认 ① 有 `turn_complete` 事件；② token 列非 0（若为 0 说明 hook 没接上，或你机器上 Codex/Claude 会话日志格式与解析不匹配，见 [telemetry/hooks/README.md](telemetry/hooks/README.md)）；③ 用 Skill 跑过切片后 E/S/T 归因表有数据。

## 4. 常见问题

| 问题 | 处理 |
|---|---|
| 看板 token 全为 0 | hook 没接上（重跑 `--wire-hooks`），或日志解析不匹配（§3.5）。Codex 与 Claude Code 均已支持 token 采集 |
| 事件一条都没有 | 确认 `~/.fpg-telemetry/env.sh` 存在且 endpoint 可达；离线事件在 `~/.fpg-telemetry/queue/` 等待补传 |
| 想暂时关掉度量 | `export FPG_TELEMETRY_DISABLED=1` |
| Skill 没被触发 | 确认 `<项目>/.claude/skills/`（或 `.codex/skills/`）软链存在；说出 SKILL.md description 里的触发词 |
| fpg-check 报 STOP | 这是止损设计：按输出提示升级人类 re-baseline，不要绕过 |
