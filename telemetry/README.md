# telemetry — 集中式遥测管线

让这套 Skill 分发给所有成员后**使用即产生度量数据、统一收集**，用于组织级分析与运营报表。
技术栈：**Bun/TypeScript + shell**，零外部依赖（Bun 内置 SQLite 与 HTTP）。

```
emit.sh (各成员本机, shell+curl)  ──POST events──▶  collector (Bun HTTP + SQLite)  ──▶  report (Bun → md/json/html)
        │ 离线时本地缓冲，恢复后补传
```

## 组成

| 路径 | 作用 |
|---|---|
| `schema.md` | 事件 schema（v1）定义 |
| `emit.sh` | 埋点客户端，被各 SKILL.md 调用；跨 Claude/Codex；离线缓冲 |
| `src/server.ts` | 中心收集器（`bun run collector`） |
| `src/report.ts` | 报表生成（`bun run report`） |
| `src/metrics.ts` | 指标聚合（纯函数，被 report 与 collector 复用） |
| `src/store.ts` / `src/schema.ts` | SQLite 存储 / 事件类型与校验 |
| `test/` | `bun test` 单元测试 |

## 快速开始

### 1) 起一个收集器（团队自托管或本地）

```bash
cd telemetry
FPG_TELEMETRY_PORT=8787 \
FPG_TELEMETRY_DB=./data/events.db \
FPG_TELEMETRY_TOKEN=optional-secret \
bun run collector
```

健康检查：`curl http://localhost:8787/health` → `{"status":"ok","events":N}`

### 2) 让成员上报（配置环境变量）

在每位成员的 shell profile 或工具配置中：

```bash
export FPG_HOME="/path/to/fullstack-project-generator"   # 由 scripts/install.sh 自动设置
export FPG_TELEMETRY_ENDPOINT="https://telemetry.example.com"  # 团队收集器地址
export FPG_TELEMETRY_TOKEN="optional-secret"             # 若收集器开启鉴权
export FPG_ACTOR_ROLE="dev"      # dev|product|qa|ops|pm
export FPG_TOOL="claude"         # claude|codex（install.sh 按工具分别写入）
# 关闭埋点：export FPG_TELEMETRY_DISABLED=1
```

各 SKILL.md 会在关键时机自动调用 `emit.sh`（best-effort，绝不阻断开发）。

### 3) 看结果

**度量看板**（浏览器）：`http://localhost:8787/report[?project=my-app]` —— token 按阶段/Skill/E-S-T、活跃耗时、skill 命中、返工率等。

命令行报表：

```bash
cd telemetry
bun run report --db ./data/events.db --format md                 # Markdown 到 stdout
bun run report --db ./data/events.db --format html --out report.html  # 同看板的 HTML
bun run report --db ./data/events.db --project my-app --format json
```

也可直接查收集器即时指标：`curl http://localhost:8787/stats`

> token/耗时为**真实测量值**，由工具 hook 自动采集（见 [hooks/README.md](hooks/README.md)），模型不自报。

## API

- `GET /health` → `{status, events}`
- `GET /report?project=<id>` → 度量看板（HTML）
- `GET /stats?project=<id>` → 聚合指标 JSON
- `POST /events`（单条或数组）→ `{accepted, rejected}`；若设置了 `FPG_TELEMETRY_TOKEN` 需带 `Authorization: Bearer <token>`

## 隐私

只采集**流程元数据**（阶段、Story 状态、时长、角色），**不采集代码内容或 PII**。
`actor_id` 建议传入哈希后的不透明标识；可用 `FPG_TELEMETRY_DISABLED=1` 完全关闭。

## 部署建议

- 收集器是无状态 HTTP + 单文件 SQLite，可用 systemd / Docker / 任意 PaaS 托管；放在内网即可。
- 大规模可把 SQLite 换为外部数据库（`store.ts` 是唯一需要改的边界）。
- 报表可定时（cron）生成并发布到团队看板。
