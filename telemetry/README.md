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
FPG_TELEMETRY_PORT=10000 \
FPG_TELEMETRY_DB=./data/events.db \
FPG_TELEMETRY_TOKEN=optional-secret \
bun run collector
```

健康检查：`curl http://localhost:10000/health` → `{"status":"ok","events":N}`

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

**新版统计看板**（浏览器）：`http://localhost:10000/report[?project=my-app][&actor=<actor_id>]`

`/report` 不是离线静态文件；collector 每次收到请求都会从 SQLite 读取事件并即时调用 `buildStats()` 聚合。新增事件或 `plan_sync` 后刷新浏览器即可看到；只有修改了 collector/dashboard 代码或换了 `.env` 启动配置，才需要重启 collector。

看板读取 `GET /stats`，展示项目 → Epic → Sprint → Task 下钻、计划/实际/偏差、状态疑似过期徽标、并行甘特（时/天/周）、Agent/Skill/Tool 三维度、开发者维度，以及按 `actor_id` 持久化的关注项目/视角。

说明：
- 下钻里的 E/S/T 名称优先来自 `plan-sync.sh` 解析到的 plan；若只有历史 instrumentation 归因而没有 plan 快照，名称为空，不用 ID 猜。
- `.fpg/current-task` 可选写 `epic_name` / `sprint_name` / `task_name`，用于无 plan 快照时补充明确记录过的中文短名。
- 项目元数据会记录到 `/stats.projects[].meta.root_dir`；`.fpg/current-task` 可选写 `epic_path` / `sprint_path` / `task_path`（相对项目根目录），无 plan 快照时来源列可据此生成本地文件链接。
- 计划列 `0 / —` 表示该节点没有匹配到计划估算基线；运行对应项目的 `plan-sync.sh` 后才会出现计划值。
- 状态旁的“⚠ 状态疑似过期”表示有实测活动但 plan 状态仍是未开始/空，或父子状态不一致；看板只提示，不自动改 plan。
- Tool 维度的“未调用 MCP”对应 `/stats` JSON 里的键 `"无"`，表示该 turn 没记录到 MCP 工具调用。
- 开发者数量按 `actor_id` 去重；同一个人如果用了不同 `FPG_ACTOR_ID`，会显示为多个开发者。

### 4) 重启 collector 并打开新版看板

如果已有旧 collector 在运行，先停止它：

```bash
# 前台运行时：在 collector 终端按 Ctrl+C

# 后台运行时：查端口并停止对应 PID
lsof -nP -iTCP:10000 -sTCP:LISTEN
kill <PID>
```

重新启动：

```bash
cd telemetry
cp .env.example .env
# 编辑 .env：FPG_TELEMETRY_PORT / FPG_TELEMETRY_DB / FPG_TELEMETRY_TOKEN
bun run collector:restart
```

也可以使用短命令：

```bash
cd telemetry
bun run restart          # 等同 collector:restart
bun run collector:status
bun run collector:config # 打印当前默认配置，token 只显示是否已设置
```

如需让新版看板出现计划侧 E/S/T 树，先在仓库根同步 plan：

```bash
cd /path/to/fullstack-project-generator
bash telemetry/plan-sync.sh \
  --epic-dir docs/iteration/epics/E002-metrics-refinement \
  --project fullstack-project-generator \
  --endpoint http://localhost:10000
```

打开看板：

```bash
open "http://localhost:10000/report?actor=${USER}"
# 或限定项目
open "http://localhost:10000/report?project=fullstack-project-generator&actor=${USER}"
```

排查时可直接看 JSON：

```bash
curl "http://localhost:10000/stats?actor=${USER}"
curl "http://localhost:10000/api/prefs?actor=${USER}"
```

命令行报表：

```bash
cd telemetry
bun run report --db ./data/events.db --format md                 # Markdown 到 stdout
bun run report --db ./data/events.db --format html --out report.html  # 同看板的 HTML
bun run report --db ./data/events.db --project my-app --format json
```

也可直接查收集器即时指标：`curl http://localhost:10000/stats`

> token/耗时为**真实测量值**，由工具 hook 自动采集（见 [hooks/README.md](hooks/README.md)），模型不自报。

## API

- `GET /health` → `{status, events}`
- `GET /report?project=<id>&actor=<id>` → 新版统计看板（HTML）
- `GET /stats?project=<id>&actor=<id>` → 看板数据源 JSON（计划/实际 join、甘特、漂移、维度、开发者）
- `GET /api/actors` → actor 列表
- `PUT /api/actors/:id` → 更新显示名/角色（若设置 token 需 Bearer）
- `GET /api/prefs?actor=<id>` → 关注项目/视角偏好
- `PUT /api/prefs?actor=<id>` → 保存关注项目/视角（若设置 token 需 Bearer）
- `POST /events`（单条或数组）→ `{accepted, rejected}`；若设置了 `FPG_TELEMETRY_TOKEN` 需带 `Authorization: Bearer <token>`

## 隐私

只采集**流程元数据**（阶段、Story 状态、时长、角色），**不采集代码内容或 PII**。
`actor_id` 建议传入哈希后的不透明标识；可用 `FPG_TELEMETRY_DISABLED=1` 完全关闭。

## 部署建议

- 收集器是无状态 HTTP + 单文件 SQLite，可用 systemd / Docker / 任意 PaaS 托管；放在内网即可。
- 大规模可把 SQLite 换为外部数据库（`store.ts` 是唯一需要改的边界）。
- 报表可定时（cron）生成并发布到团队看板。
