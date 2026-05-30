#!/usr/bin/env python3
"""
project-state MCP Server
跨会话项目状态追踪服务，为 fullstack-project-generator 各 SKILL 提供状态持久化。

使用方式：
  直接运行（MCP stdio 模式）：python3 project_state.py
  测试模式：python3 project_state.py --test
"""

import json
import os
import sys
import tempfile
import argparse
from datetime import datetime, timezone
from pathlib import Path

# 尝试导入 fastmcp。注意：内置自测（--test）不依赖 mcp 库，因此这里不直接退出，
# 而是用一个 no-op 装饰器兜底，让 @mcp.tool() 在缺库时也能定义函数（仅供 --test 调用）。
# 真正以 MCP stdio 模式运行时若缺库才报错退出（见 __main__）。
try:
    from mcp.server.fastmcp import FastMCP

    _HAS_MCP = True
    mcp = FastMCP(
        name="project-state",
        instructions="全栈项目状态追踪服务，持久化项目阶段、Sprint 进度和 Story 完成状态",
    )
except ImportError:
    _HAS_MCP = False

    class _NoopMCP:
        """缺少 mcp 库时的占位，使 @mcp.tool() 退化为恒等装饰器。"""

        def tool(self, *args, **kwargs):
            def _decorator(func):
                return func

            return _decorator

    mcp = _NoopMCP()

STATE_FILENAME = ".project-state.json"

PHASE_NEXT_SKILL = {
    "requirements": "project-architecture",
    "architecture": "project-scaffold",
    "scaffold": "sprint-plan",
    "sprint_plan": "sprint-develop",
    "sprint_develop": "project-qa",
    "qa": "project-deploy",
    "deploy": "（项目已完成部署配置）",
}

# ─── 内部工具函数 ──────────────────────────────────────────────────────────────


def _state_file_path(project_dir: str) -> Path:
    return Path(project_dir) / STATE_FILENAME


def _read_state(project_dir: str) -> dict:
    """读取状态文件；若不存在返回空默认值。"""
    state_path = _state_file_path(project_dir)
    if not state_path.exists():
        return {}
    try:
        with open(state_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return {}


def _write_state(project_dir: str, state: dict) -> None:
    """原子写入状态文件（tmp 文件 + rename 模式，防止写入中断导致文件损坏）。"""
    state_path = _state_file_path(project_dir)
    state_path.parent.mkdir(parents=True, exist_ok=True)

    state["updated_at"] = datetime.now(timezone.utc).isoformat()

    # 写入同目录的临时文件，然后原子替换
    fd, tmp_path = tempfile.mkstemp(
        dir=str(state_path.parent), suffix=".tmp", prefix=".project-state-"
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(state, f, ensure_ascii=False, indent=2)
        os.replace(tmp_path, str(state_path))
    except Exception:
        os.unlink(tmp_path)
        raise


# ─── MCP Tools ────────────────────────────────────────────────────────────────


@mcp.tool()
def read_project_state(project_dir: str) -> dict:
    """
    读取项目当前状态。

    Args:
        project_dir: 项目根目录的绝对路径（.project-state.json 所在目录）

    Returns:
        包含项目阶段、Sprint 编号、Story 完成状态等信息的字典。
        若状态文件不存在，返回空字典 {}（不报错）。
    """
    return _read_state(project_dir)


@mcp.tool()
def write_project_state(project_dir: str, updates: dict) -> dict:
    """
    更新并持久化项目状态（合并更新，不覆盖未修改字段）。

    Args:
        project_dir: 项目根目录的绝对路径
        updates: 需要更新的字段字典，例如：
            {"phase": "scaffold", "platforms": ["ios", "backend"]}
            {"current_sprint": 2}
            {"story_status": {"US-1-001": "completed"}}

    Returns:
        更新后的完整状态字典。
    """
    state = _read_state(project_dir)

    # 对 story_status 和 sprint_stories 做深度合并，其余字段直接覆盖
    for key, value in updates.items():
        if key in ("story_status", "sprint_stories") and isinstance(value, dict):
            existing = state.get(key, {})
            existing.update(value)
            state[key] = existing
        else:
            state[key] = value

    # 首次写入时记录创建时间
    if "created_at" not in state:
        state["created_at"] = datetime.now(timezone.utc).isoformat()

    _write_state(project_dir, state)
    return state


@mcp.tool()
def get_current_phase(project_dir: str) -> dict:
    """
    获取当前项目阶段和下一步建议的 SKILL。

    Args:
        project_dir: 项目根目录的绝对路径

    Returns:
        {
            "phase": "scaffold",           # 当前阶段（若无状态则为 "unknown"）
            "project_name": "MyApp",       # 项目名称
            "next_skill": "sprint-plan",   # 建议使用的下一个 SKILL
            "current_sprint": 1            # 当前 Sprint 编号（若已进入迭代阶段）
        }
    """
    state = _read_state(project_dir)
    phase = state.get("phase", "unknown")
    next_skill = PHASE_NEXT_SKILL.get(phase, "project-requirements（从头开始）")

    return {
        "phase": phase,
        "project_name": state.get("project_name", "（未知）"),
        "platforms": state.get("platforms", []),
        "next_skill": next_skill,
        "current_sprint": state.get("current_sprint", 0),
    }


@mcp.tool()
def list_open_stories(project_dir: str, sprint: int) -> dict:
    """
    列出指定 Sprint 中未完成的 User Stories。

    Args:
        project_dir: 项目根目录的绝对路径
        sprint: Sprint 编号（从 1 开始）

    Returns:
        {
            "sprint": 1,
            "open": ["US-1-002"],          # 未完成（in_progress 或 未开始）
            "completed": ["US-1-001"],     # 已完成
            "all_stories": ["US-1-001", "US-1-002"]
        }
    """
    state = _read_state(project_dir)
    sprint_key = f"sprint-{sprint}"
    all_stories = state.get("sprint_stories", {}).get(sprint_key, [])
    story_status = state.get("story_status", {})

    completed = [s for s in all_stories if story_status.get(s) == "completed"]
    open_stories = [s for s in all_stories if story_status.get(s) != "completed"]

    return {
        "sprint": sprint,
        "open": open_stories,
        "completed": completed,
        "all_stories": all_stories,
    }


# ─── CLI 测试模式 ──────────────────────────────────────────────────────────────


def _run_tests():
    """简单的功能验证（非 MCP 模式）。"""
    import tempfile

    print("=== project_state.py 功能测试 ===\n")

    with tempfile.TemporaryDirectory() as tmpdir:
        # 测试 1：空状态
        state = _read_state(tmpdir)
        assert state == {}, f"空状态应为 {{}}，实际：{state}"
        print("✓ 测试1：空状态文件返回 {}")

        # 测试 2：写入状态
        _write_state(
            tmpdir,
            {
                "project_name": "TestApp",
                "phase": "scaffold",
                "platforms": ["ios", "backend"],
                "current_sprint": 0,
                "created_at": datetime.now(timezone.utc).isoformat(),
            },
        )
        state = _read_state(tmpdir)
        assert state["project_name"] == "TestApp", "项目名称不匹配"
        assert state["phase"] == "scaffold", "阶段不匹配"
        print("✓ 测试2：写入并读取状态")

        # 测试 3：深度合并 story_status（通过 MCP tool 函数验证合并逻辑）
        write_project_state(tmpdir, {
            "story_status": {"US-1-001": "completed"},
            "sprint_stories": {"sprint-1": ["US-1-001", "US-1-002"]},
        })
        write_project_state(tmpdir, {
            "story_status": {"US-1-002": "in_progress"},
        })
        final = read_project_state(tmpdir)
        assert final["story_status"]["US-1-001"] == "completed", "US-1-001 应为 completed"
        assert final["story_status"]["US-1-002"] == "in_progress", "US-1-002 应为 in_progress"
        print("✓ 测试3：story_status 深度合并")

        # 测试 4：get_current_phase 逻辑
        phase_result = get_current_phase(tmpdir)
        assert phase_result["next_skill"] == "sprint-plan", f"期望 sprint-plan，实际 {phase_result['next_skill']}"
        assert phase_result["project_name"] == "TestApp", "项目名称不匹配"
        print("✓ 测试4：阶段到下一 SKILL 映射")

        # 测试 5：list_open_stories
        open_result = list_open_stories(tmpdir, 1)
        assert "US-1-002" in open_result["open"], "US-1-002 应为 open"
        assert "US-1-001" in open_result["completed"], "US-1-001 应已完成"
        print("✓ 测试5：open stories 筛选")

        # 测试 6：原子写入（状态文件存在）
        state_file = _state_file_path(tmpdir)
        assert state_file.exists(), "状态文件应已存在"
        print("✓ 测试6：原子写入文件存在")

    print("\n✅ 所有测试通过！")


# ─── 入口 ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="project-state MCP Server — 全栈项目状态追踪"
    )
    parser.add_argument(
        "--test",
        action="store_true",
        help="运行内置功能测试（非 MCP 模式）",
    )
    args = parser.parse_args()

    if args.test:
        _run_tests()
    elif not _HAS_MCP:
        print(
            "错误：未安装 mcp 库。请运行：pip install mcp\n"
            "或使用完整包：pip install 'anthropic[mcp]'",
            file=sys.stderr,
        )
        sys.exit(1)
    else:
        # 正常 MCP stdio 模式
        mcp.run()
