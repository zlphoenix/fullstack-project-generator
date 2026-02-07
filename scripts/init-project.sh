#!/bin/bash
set -euo pipefail

# =============================================================================
# Fullstack Project Generator - 全栈项目初始化脚本
#
# 用法: bash scripts/init-project.sh <project-name> [选项]
#
# 选项:
#   --platforms <list>   逗号分隔的平台列表 (默认: all)
#                        可选: web,backend,android,ios,docker
#   --author <name>      作者名称 (默认: Developer)
#
# 示例:
#   bash scripts/init-project.sh my-app
#   bash scripts/init-project.sh my-app --platforms web,backend --author "Zhang San"
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ASSETS_DIR="$SKILL_DIR/assets"

# ---- 默认值 ----
PROJECT_NAME=""
PLATFORMS="web,backend,android,ios,docker"
AUTHOR="Developer"
ALL_PLATFORMS=("web" "backend" "android" "ios" "docker")

# ---- 颜色输出 ----
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC} $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1" >&2; exit 1; }

# ---- 参数解析 ----
parse_args() {
    if [ $# -lt 1 ]; then
        echo "用法: bash scripts/init-project.sh <project-name> [--platforms web,backend] [--author \"Author\"]"
        exit 1
    fi

    PROJECT_NAME="$1"
    shift

    while [ $# -gt 0 ]; do
        case "$1" in
            --platforms)
                PLATFORMS="$2"
                shift 2
                ;;
            --author)
                AUTHOR="$2"
                shift 2
                ;;
            *)
                error "未知参数: $1"
                ;;
        esac
    done

    # 验证项目名 (kebab-case)
    if ! echo "$PROJECT_NAME" | grep -qE '^[a-z][a-z0-9-]*$'; then
        error "项目名必须为 kebab-case 格式 (如: my-app)，当前: $PROJECT_NAME"
    fi
}

# ---- 变量派生 ----
# kebab-case -> PascalCase: my-awesome-app -> MyAwesomeApp
to_pascal_case() {
    echo "$1" | sed 's/-/ /g' | awk '{for(i=1;i<=NF;i++) $i=toupper(substr($i,1,1)) substr($i,2)}1' | sed 's/ //g'
}

# kebab-case -> Title Case: my-awesome-app -> My Awesome App
to_title_case() {
    echo "$1" | sed 's/-/ /g' | awk '{for(i=1;i<=NF;i++) $i=toupper(substr($i,1,1)) substr($i,2)}1'
}

derive_variables() {
    VAR_PROJECT_NAME="$PROJECT_NAME"                  # kebab-case
    VAR_PASCAL_NAME="$(to_pascal_case "$PROJECT_NAME")" # PascalCase
    VAR_DISPLAY_NAME="$(to_title_case "$PROJECT_NAME")" # Title Case
    VAR_AUTHOR="$AUTHOR"
    VAR_DATE="$(date +%Y-%m-%d)"

    info "变量派生结果:"
    echo "  project-name  = $VAR_PROJECT_NAME"
    echo "  ProjectName   = $VAR_PASCAL_NAME"
    echo "  PROJECT_NAME  = $VAR_DISPLAY_NAME"
    echo "  AUTHOR        = $VAR_AUTHOR"
    echo "  DATE          = $VAR_DATE"
}

# ---- 解析平台列表 ----
parse_platforms() {
    if [ "$PLATFORMS" = "all" ]; then
        SELECTED_PLATFORMS=("${ALL_PLATFORMS[@]}")
    else
        IFS=',' read -ra SELECTED_PLATFORMS <<< "$PLATFORMS"
    fi

    # 验证平台名称
    for p in "${SELECTED_PLATFORMS[@]}"; do
        local valid=false
        for ap in "${ALL_PLATFORMS[@]}"; do
            if [ "$p" = "$ap" ]; then valid=true; break; fi
        done
        if [ "$valid" = false ]; then
            error "不支持的平台: $p (可选: ${ALL_PLATFORMS[*]})"
        fi
    done

    info "选定平台: ${SELECTED_PLATFORMS[*]}"
}

# ---- 变量替换 (兼容 macOS 和 Linux) ----
replace_in_file() {
    local file="$1"
    if [[ "$(uname)" == "Darwin" ]]; then
        sed -i '' \
            -e "s/{{ProjectName}}/$VAR_PASCAL_NAME/g" \
            -e "s/{{project-name}}/$VAR_PROJECT_NAME/g" \
            -e "s/{{PROJECT_NAME}}/$VAR_DISPLAY_NAME/g" \
            -e "s/{{AUTHOR}}/$VAR_AUTHOR/g" \
            -e "s/{{DATE}}/$VAR_DATE/g" \
            "$file"
    else
        sed -i \
            -e "s/{{ProjectName}}/$VAR_PASCAL_NAME/g" \
            -e "s/{{project-name}}/$VAR_PROJECT_NAME/g" \
            -e "s/{{PROJECT_NAME}}/$VAR_DISPLAY_NAME/g" \
            -e "s/{{AUTHOR}}/$VAR_AUTHOR/g" \
            -e "s/{{DATE}}/$VAR_DATE/g" \
            "$file"
    fi
}

replace_in_dir() {
    local dir="$1"
    find "$dir" -type f \( -name "*.swift" -o -name "*.kt" -o -name "*.kts" -o -name "*.java" \
        -o -name "*.xml" -o -name "*.json" -o -name "*.yml" -o -name "*.yaml" \
        -o -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" \
        -o -name "*.css" -o -name "*.md" -o -name "*.mjs" \
        -o -name "pom.xml" -o -name "Dockerfile" -o -name "*.conf" \
        -o -name "*.env*" -o -name "*.properties" \) | while read -r file; do
        replace_in_file "$file"
    done
}

# ---- 平台复制 ----
copy_platform() {
    local platform="$1"
    local src_dir=""
    local dest_dir=""

    case "$platform" in
        web)
            src_dir="$ASSETS_DIR/web-template"
            dest_dir="$TARGET_DIR/web"
            ;;
        backend)
            src_dir="$ASSETS_DIR/backend-template"
            dest_dir="$TARGET_DIR/backend"
            ;;
        android)
            src_dir="$ASSETS_DIR/android-template"
            dest_dir="$TARGET_DIR/android"
            ;;
        ios)
            src_dir="$ASSETS_DIR/ios-template"
            dest_dir="$TARGET_DIR/ios"
            ;;
        docker)
            src_dir="$ASSETS_DIR/docker"
            dest_dir="$TARGET_DIR/docker"
            ;;
    esac

    if [ ! -d "$src_dir" ]; then
        warn "模板目录不存在，跳过: $src_dir"
        return
    fi

    info "复制 $platform 模板 -> $dest_dir"
    cp -r "$src_dir" "$dest_dir"
    replace_in_dir "$dest_dir"
}

# ---- 复制文档模板 ----
copy_docs() {
    local docs_src="$ASSETS_DIR/docs-templates"
    local docs_dest="$TARGET_DIR/docs"

    if [ -d "$docs_src" ]; then
        info "复制文档模板 -> $docs_dest"
        cp -r "$docs_src" "$docs_dest"
        replace_in_dir "$docs_dest"
    fi
}

# ---- 生成项目元数据 ----
write_meta() {
    cat > "$TARGET_DIR/.project-meta.json" << EOF
{
  "projectName": "$VAR_PROJECT_NAME",
  "pascalName": "$VAR_PASCAL_NAME",
  "displayName": "$VAR_DISPLAY_NAME",
  "author": "$VAR_AUTHOR",
  "createdAt": "$VAR_DATE",
  "platforms": "$(IFS=,; echo "${SELECTED_PLATFORMS[*]}")"
}
EOF
    info "项目元数据 -> $TARGET_DIR/.project-meta.json"
}

# ---- 输出项目结构摘要 ----
print_summary() {
    echo ""
    echo "============================================"
    info "项目创建完成: $VAR_DISPLAY_NAME"
    echo "============================================"
    echo ""
    echo "项目目录: $TARGET_DIR"
    echo ""
    echo "已创建平台:"
    for p in "${SELECTED_PLATFORMS[@]}"; do
        echo "  - $p/"
    done
    echo "  - docs/"
    echo ""
    echo "下一步操作:"
    echo "  cd $VAR_PROJECT_NAME"
    for p in "${SELECTED_PLATFORMS[@]}"; do
        case "$p" in
            web)     echo "  cd web && npm install && npm run dev    # 启动前端" ;;
            backend) echo "  cd backend && mvn spring-boot:run       # 启动后端" ;;
            docker)  echo "  cd docker && docker compose up -d       # 启动全部服务" ;;
        esac
    done
    echo ""
}

# ---- 主流程 ----
main() {
    parse_args "$@"
    derive_variables
    parse_platforms

    TARGET_DIR="$(pwd)/$PROJECT_NAME"

    if [ -d "$TARGET_DIR" ]; then
        error "目录已存在: $TARGET_DIR"
    fi

    mkdir -p "$TARGET_DIR"
    info "创建项目目录: $TARGET_DIR"

    for platform in "${SELECTED_PLATFORMS[@]}"; do
        copy_platform "$platform"
    done

    copy_docs
    write_meta
    print_summary
}

main "$@"
