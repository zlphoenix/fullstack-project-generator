#!/usr/bin/env bash
# fullstack-project-generator 跨工具安装/分发器（Claude Code + Codex）
#
# 职责（全部幂等、不覆盖、可 --dry-run 预览）：
#   1) 为每个 SKILL 建软链到各工具的 skills 目录（默认项目级，可选用户级）；同名不覆盖（跳过并告警）
#   2) 把 project-template/ 公共文件部署进目标项目：
#        - AGENTS.md / PROGRESS.md → 项目根（已存在则跳过，不覆盖团队文件）
#        - references/             → <项目>/.fpg/references（软链，便于更新）
#   3) 生成可 source 的遥测环境文件 ~/.fpg-telemetry/env.sh
#   无 Python、无 MCP（见 docs/00-决策记录.md ADR-013/015）。
#
# 用法：
#   bash scripts/install.sh --project-dir <项目路径> [--tools claude,codex]
#        [--scope project|user] [--telemetry-endpoint URL] [--role dev|product|qa|ops|pm] [--dry-run]
#
# 示例：
#   bash scripts/install.sh --project-dir ~/work/my-app --tools claude,codex --dry-run
#   bash scripts/install.sh --project-dir ~/work/my-app --role dev \
#        --telemetry-endpoint https://telemetry.example.com

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FPG_HOME="$(cd "$SCRIPT_DIR/.." && pwd)"

# —— 默认参数 ——
SCOPE="project"
TOOLS="claude,codex"
PROJECT_DIR="$(pwd)"
TELEMETRY_ENDPOINT=""
ROLE="dev"
DRY_RUN=0

while [ $# -gt 0 ]; do
  case "$1" in
    --scope) SCOPE="$2"; shift 2;;
    --tools) TOOLS="$2"; shift 2;;
    --project-dir) PROJECT_DIR="$2"; shift 2;;
    --telemetry-endpoint) TELEMETRY_ENDPOINT="$2"; shift 2;;
    --role) ROLE="$2"; shift 2;;
    --dry-run) DRY_RUN=1; shift;;
    -h|--help) grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0;;
    *) echo "未知参数：$1" >&2; exit 1;;
  esac
done

say()  { printf '%s\n' "$*"; }
run()  { if [ "$DRY_RUN" = "1" ]; then say "  [dry-run] $*"; else eval "$*"; fi; }
warn() { say "  ⚠️  $*"; }

PROJECT_DIR="$(cd "$PROJECT_DIR" 2>/dev/null && pwd || echo "$PROJECT_DIR")"

say "fullstack-project-generator 安装/分发器"
say "  FPG_HOME    = $FPG_HOME"
say "  scope=$SCOPE  tools=$TOOLS  project-dir=$PROJECT_DIR  dry-run=$DRY_RUN"
say ""

command -v bun  >/dev/null 2>&1 || say "  ⚠️  未找到 bun（仅遥测后端需要；客户端 emit.sh 仅需 curl）"
command -v curl >/dev/null 2>&1 || say "  ⚠️  未找到 curl（遥测 emit.sh 需要）"
say ""

# —— 各工具 skills 目标目录 ——
skills_target_dir() {
  local tool="$1"
  if [ "$SCOPE" = "user" ]; then
    case "$tool" in claude) echo "$HOME/.claude/skills";; codex) echo "$HOME/.codex/skills";; esac
  else
    case "$tool" in claude) echo "$PROJECT_DIR/.claude/skills";; codex) echo "$PROJECT_DIR/.codex/skills";; esac
  fi
}

# —— 软链单个 skill：不覆盖用户已有同名（除非本来就是指向本仓库的软链）——
link_skills() {
  local tool="$1" target; target="$(skills_target_dir "$tool")"
  say "▶ [$tool] 软链 Skills 到 $target"
  run "mkdir -p '$target'"
  local skill name dst
  for skill in "$FPG_HOME"/skills/*/; do
    [ -f "$skill/SKILL.md" ] || continue
    name="$(basename "$skill")"
    dst="$target/$name"
    if [ -L "$dst" ]; then
      # 已是软链：若指向本仓库则刷新，否则不动
      if [ "$(readlink "$dst")" = "$FPG_HOME/skills/$name" ]; then
        run "ln -snf '$FPG_HOME/skills/$name' '$dst'"
      else
        warn "跳过 $name：已存在指向他处的软链（不覆盖）"
      fi
    elif [ -e "$dst" ]; then
      warn "跳过 $name：已存在同名 skill（不覆盖用户已有）"
    else
      run "ln -snf '$FPG_HOME/skills/$name' '$dst'"
    fi
  done
}

# —— 部署 project-template 公共文件到目标项目 ——
deploy_common() {
  say "▶ 部署项目公共文件到 $PROJECT_DIR"
  # 团队文件：已存在不覆盖
  for f in AGENTS.md PROGRESS.md; do
    if [ -e "$PROJECT_DIR/$f" ]; then
      warn "跳过 $f：项目已存在（不覆盖；如需更新请手动对比 $FPG_HOME/project-template/$f）"
    else
      run "cp '$FPG_HOME/project-template/$f' '$PROJECT_DIR/$f'"
    fi
  done
  # 参考资料：软链，便于随仓库更新
  run "mkdir -p '$PROJECT_DIR/.fpg'"
  local refs="$PROJECT_DIR/.fpg/references"
  if [ -L "$refs" ] || [ ! -e "$refs" ]; then
    run "ln -snf '$FPG_HOME/project-template/references' '$refs'"
  else
    warn "跳过 .fpg/references：已存在非软链目录（不覆盖）"
  fi
}

# —— 遥测环境文件 ——
write_env_file() {
  local env_file="$HOME/.fpg-telemetry/env.sh"
  say "▶ 写入遥测环境文件 $env_file"
  run "mkdir -p '$HOME/.fpg-telemetry'"
  local content="# fullstack-project-generator 遥测环境（由 install.sh 生成）
export FPG_HOME=\"$FPG_HOME\"
export FPG_ACTOR_ROLE=\"$ROLE\"
export FPG_TELEMETRY_ENDPOINT=\"$TELEMETRY_ENDPOINT\"
# export FPG_TELEMETRY_TOKEN=\"\"          # 若收集器开启鉴权请填写
# export FPG_TELEMETRY_DISABLED=1          # 关闭埋点
"
  if [ "$DRY_RUN" = "1" ]; then
    say "  [dry-run] 写入内容："; printf '%s\n' "$content" | sed 's/^/    /'
  else
    printf '%s\n' "$content" > "$env_file"
  fi
  say "  请在 shell profile 加入：[ -f ~/.fpg-telemetry/env.sh ] && source ~/.fpg-telemetry/env.sh"
}

IFS=',' read -ra TOOL_LIST <<< "$TOOLS"
for tool in "${TOOL_LIST[@]}"; do
  case "$tool" in claude|codex) link_skills "$tool";; *) warn "未知工具：$tool（跳过）";; esac
done
deploy_common
write_env_file

say ""
say "▶ FPG_TOOL 注入提示（让遥测区分工具来源）："
say "  - Claude Code：在 .claude/settings.json 的 \"env\" 加 { \"FPG_TOOL\": \"claude\" }"
say "  - Codex：在其 env 配置设 FPG_TOOL=\"codex\""
say ""
if [ "$DRY_RUN" = "1" ]; then
  say "✅ dry-run 完成：以上为将执行的操作，未做更改。去掉 --dry-run 即真正安装。"
else
  say "✅ 安装完成。验证：(cd \"$FPG_HOME/telemetry\" && bun test)"
fi
