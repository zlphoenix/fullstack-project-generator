# project-template/

> 目录指引（本目录的 `AGENTS.md` 是**交付载荷**，不是本目录的工作指南，故用本 README 说明）。

这里是**部署进用户项目的公共文件**——由 `scripts/install.sh` 安装到目标项目：

| 文件 | 部署到目标项目 | 性质 |
|---|---|---|
| `AGENTS.md` | 项目根 `AGENTS.md` | 团队文件（已存在则不覆盖） |
| `PROGRESS.md` | 项目根 `PROGRESS.md` | 团队文件（已存在则不覆盖） |
| `references/*.md` | `<项目>/.fpg/references/`（软链） | 生成器管理，随仓库更新 |

`AGENTS.md` 承载**所有 SKILL 通用**的约定（行为准则、契约先行、多 Agent 拆分、验收分层、遥测埋点、进度从产物派生）。SKILL 专属内容放在各自 `skills/<name>/references/`。
平台指南/方法论/API 设计放在 `references/`，被多个 SKILL 以 `.fpg/references/...` 引用。

修改约定见仓库根 [../CONTRIBUTING.md](../CONTRIBUTING.md) 与 [../AGENTS.md](../AGENTS.md)。
