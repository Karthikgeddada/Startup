"""Tool registry — the bounded action surface of the agent loop (Phase 3).

Every tool has a spec (offered to the model), a permission class (read /
write / dangerous — enforced server-side BEFORE execution), and a handler.
Filesystem / terminal / git handlers execute on `curvin-runner` (Phase 4);
until the runner exists, built-in tools report `runner_unavailable` — an
honest failure, never a fabricated result.
"""
from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

from app.agent.gateway import ToolSpec

READ = "read"
WRITE = "write"
DANGEROUS = "dangerous"


@dataclass(frozen=True)
class Tool:
    spec: ToolSpec
    permission: str
    handler: Callable[[dict], dict] | None = None  # None → curvin-runner (Phase 4)


_REGISTRY: dict[str, Tool] = {}


def register(tool: Tool) -> None:
    _REGISTRY[tool.spec.name] = tool


def get_tool(name: str) -> Tool | None:
    return _REGISTRY.get(name)


def get_tool_specs() -> list[ToolSpec]:
    return [tool.spec for tool in _REGISTRY.values()]


def tool_permission(name: str) -> str:
    tool = _REGISTRY.get(name)
    # Unknown tools default to the most restrictive class.
    return tool.permission if tool is not None else DANGEROUS


def execute_tool(name: str, arguments: dict) -> dict:
    """Execute a registered tool honestly.

    Returns {ok, error?, detail?, **result}. Never raises for tool-level
    failures — the orchestrator turns the outcome into events and loop
    context.
    """
    tool = _REGISTRY.get(name)
    if tool is None:
        return {"ok": False, "error": "unknown_tool", "detail": f"no tool named {name!r}"}
    if tool.handler is None:
        return {
            "ok": False,
            "error": "runner_unavailable",
            "detail": (
                "local execution requires curvin-runner (Phase 4); "
                "nothing was executed"
            ),
        }
    try:
        result = tool.handler(arguments or {})
    except Exception as exc:  # tool failures never crash the loop
        return {"ok": False, "error": "tool_error", "detail": str(exc)}
    if isinstance(result, dict):
        return {"ok": True, **result}
    return {"ok": True, "result": result}


def _schema(*properties: str, required: bool = True) -> dict:
    return {
        "type": "object",
        "properties": {p: {"type": "string"} for p in properties},
        **({"required": list(properties)} if required else {}),
    }


def _register_builtins() -> None:
    """The core workspace tool set — all runner-backed until Phase 4."""
    register(
        Tool(
            ToolSpec(
                "fs_read",
                "Read a file from the project workspace",
                _schema("path"),
            ),
            READ,
        )
    )
    register(
        Tool(
            ToolSpec(
                "fs_list",
                "List files and directories under a path in the project workspace",
                _schema("path"),
            ),
            READ,
        )
    )
    register(
        Tool(
            ToolSpec(
                "fs_write",
                "Write or replace a file in the project workspace",
                _schema("path", "content"),
            ),
            WRITE,
        )
    )
    register(
        Tool(
            ToolSpec(
                "terminal",
                "Run a shell command in the project workspace (tests, builds, install)",
                _schema("command"),
            ),
            DANGEROUS,
        )
    )
    register(
        Tool(
            ToolSpec(
                "git_commit",
                "Commit changes on the active branch with a message",
                _schema("message"),
            ),
            WRITE,
        )
    )
    register(
        Tool(
            ToolSpec(
                "git_push",
                "Push the active branch to the remote repository",
                _schema(),
            ),
            DANGEROUS,
        )
    )


_register_builtins()
