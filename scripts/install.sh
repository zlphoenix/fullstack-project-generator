#!/usr/bin/env bash
# fullstack-project-generator 跨工具安装器（Claude Code + Codex）
#
# 职责（全部幂等、可 --dry-run 预览）：
#   1) 把 skills/<name>/ 软链到各工具的 skills 目录，使其可被发现
#   2) 生成可 source 的遥测环境文件 ~/.fpg-telemetry/env.sh
#   3) 打印需要加入各工具配置的 MCP 配置块（不就地改写已有 JSON/TOML，避免损坏）
#
# 用法：
#   bash scripts/install.sh [--scope user|project] [--tools claude,codex]
#        [--project-dir PATH] [--telemetry-endpoint URL] [--role dev|product|qa|ops|pm]
#        [--dry-run]
#
# 示例：
#   bash scripts/install.sh --scope user --tools claude,codex --dry-run
#   bash scripts/install.sh --scope user --tools claude --role dev \
#        --telemetry-endpoint https://telemetry.example.com

set -euo pipefail

# —— 解析自身位置 → FPG_HOME（仓库根）——
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FPG_HOME="$(cd "$SCRIPT_DIR/.." && pwd)"

# —— 默认参数 ——
SCOPE="user"
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
have() { command -v "$1" >/dev/null 2>&1; }

say "fullstack-project-generator 安装器"
say "  FPG_HOME = $FPG_HOME"
say "  scope=$SCOPE  tools=$TOOLS  dry-run=$DRY_RUN"
say ""

# —— 依赖自检（仅提示，不阻断）——
have python3 || say "⚠️  未找到 python3（project-state MCP 需要）"
have bun     || say "⚠️  未找到 bun（遥测 collector/report 需要，客户端 emit.sh 不需要）"
have curl    || say "⚠️  未找到 curl（遥测 emit.sh 需要）"
say ""

# —— 计算各工具的 skills 目标目录 ——
skills_target_dir() {
  local tool="$1"
  if [ "$SCOPE" = "project" ]; then
    case "$tool" in
      claude) echo "$PROJECT_DIR/.claude/skills";;
      codex)  echo "$PROJECT_DIR/.codex/skills";;
    esac
  else
    case "$tool" in
      claude) echo "$HOME/.claude/skills";;
      codex)  echo "$HOME/.codex/skills";;
    esac
  fi
}

link_skills() {
  local tool="$1" target; target="$(skills_target_dir "$tool")"
  say "▶ [$tool] 链接 Skills 到 $target"
  run "mkdir -p '$target'"
  for skill in "$FPG_HOME"/skills/*/; do
    [ -f "$skill/SKILL.md" ] || continue
    local name; name="$(basename "$skill")"
    run "ln -snf '$FPG_HOME/skills/$name' '$target/$name'"
  done
}

print_mcp_block() {
  local tool="$1"
  say ""
  if [ "$tool" = "claude" ]; then
    local cfg; if [ "$SCOPE" = "project" ]; then cfg="$PROJECT_DIR/.claude/settings.local.json"; else cfg="$HOME/.claude/settings.local.json"; fi
    say "▶ [claude] 将以下内容合并到 $cfg ："
    cat <<JSON
  { "mcpServers": { "project-state": {
      "command": "python3",
      "args": ["$FPG_HOME/scripts/project_state.py"],
      "type": "stdio"
  }}}
JSON
  else
    local cfg; if [ "$SCOPE" = "project" ]; then cfg="$PROJECT_DIR/.codex/config.toml"; else cfg="$HOME/.codex/config.toml"; fi
    say "▶ [codex] 将以下内容加入 $cfg ："
    cat <<TOML
  [mcp_servers.project-state]
  command = "python3"
  args = ["$FPG_HOME/scripts/project_state.py"]
TOML
  fi
}

# —— 遥测环境文件（可 source）——
write_env_file() {
  local env_dir="$HOME/.fpg-telemetry" env_file="$HOME/.fpg-telemetry/env.sh"
  say ""
  say "▶ 写入遥测环境文件 $env_file"
  run "mkdir -p '$env_dir'"
  local content="# fullstack-project-generator 遥测环境（由 install.sh 生成）
export FPG_HOME=\"$FPG_HOME\"
export FPG_ACTOR_ROLE=\"$ROLE\"
export FPG_TELEMETRY_ENDPOINT=\"$TELEMETRY_ENDPOINT\"
# export FPG_TELEMETRY_TOKEN=\"\"          # 若收集器开启鉴权请填写
# export FPG_ACTOR_ID=\"\$(echo \\\"\$USER\\\" | shasum | cut -c1-12)\"  # 不透明标识
# export FPG_TELEMETRY_DISABLED=1          # 关闭埋点
"
  if [ "$DRY_RUN" = "1" ]; then
    say "  [dry-run] 写入内容："
    printf '%s\n' "$content" | sed 's/^/    /'
  else
    printf '%s\n' "$content" > "$env_file"
  fi
  say ""
  say "  请在 shell profile（~/.zshrc 或 ~/.bashrc）中加入："
  say "    [ -f ~/.fpg-telemetry/env.sh ] && source ~/.fpg-telemetry/env.sh"
  say "  注：FPG_TOOL 由各工具分别注入（claude/codex），见下方提示。"
}

# —— 执行 ——
IFS=',' read -ra TOOL_LIST <<< "$TOOLS"
for tool in "${TOOL_LIST[@]}"; do
  case "$tool" in
    claude|codex) link_skills "$tool"; print_mcp_block "$tool";;
    *) say "⚠️  未知工具：$tool（跳过）";;
  esac
done

write_env_file

say ""
say "▶ FPG_TOOL 注入提示（让遥测能区分工具来源）："
say "  - Claude Code：在 .claude/settings.json 的 \"env\" 中加 { \"FPG_TOOL\": \"claude\" }"
say "  - Codex：在 ~/.codex/config.toml 加 [shell_environment] 或在其 env 配置中设 FPG_TOOL=\"codex\""
say ""
if [ "$DRY_RUN" = "1" ]; then
  say "✅ dry-run 完成：以上为将要执行的操作，未做任何更改。去掉 --dry-run 即真正安装。"
else
  say "✅ 安装完成。验证："
  say "   python3 \"$FPG_HOME/scripts/project_state.py\" --test"
  say "   (cd \"$FPG_HOME/telemetry\" && bun test)"
fi
