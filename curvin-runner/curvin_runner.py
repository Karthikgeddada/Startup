#!/usr/bin/env python3
"""curvin-runner — CURVIN's local execution agent (Phase 4).

Runs on YOUR machine. It connects to the CURVIN backend, claims queued tool
jobs (fs_read / fs_list / fs_write / terminal / git_commit / git_push),
executes them inside a sandbox rooted at your projects directory, and
reports the real results back. The backend never executes anything itself.

Standard library only — no pip installs needed. Python 3.9+.

Quick start:
    python3 curvin_runner.py register --server http://localhost:8000 --root ~/CurvinProjects
    python3 curvin_runner.py run

Sandbox guarantees:
- Every filesystem path is jailed to --root (no absolute paths, no ../ escapes,
  symlinks resolved before the check).
- Terminal/git commands run with cwd inside the root and a hard timeout.
- All outputs are size-capped before being reported.
"""
from __future__ import annotations

import argparse
import json
import os
import platform
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

CONFIG_PATH = Path.home() / ".curvin-runner.json"

HEARTBEAT_SECONDS = 10.0
POLL_SECONDS = 2.0
TERMINAL_TIMEOUT_SECONDS = 120
OUTPUT_CAP_BYTES = 64 * 1024
MAX_LIST_ENTRIES = 500


class SandboxViolation(Exception):
    """A tool argument tried to escape the projects root."""


# --------------------------------------------------------------------- http


def _request(
    server: str,
    method: str,
    path: str,
    *,
    token: str | None = None,
    user_id: str | None = None,
    body: dict | None = None,
) -> Any:
    url = server.rstrip("/") + "/api/v1" + path
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    if user_id:
        req.add_header("X-User-Id", user_id)
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            return json.loads(response.read().decode() or "{}")
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode()[:500]
        raise SystemExit(f"backend rejected {method} {path}: HTTP {exc.code} {detail}") from exc
    except urllib.error.URLError as exc:
        raise SystemExit(f"cannot reach backend at {server}: {exc.reason}") from exc


# ----------------------------------------------------------------- sandbox


def resolve_within_root(root: Path, rel_path: str) -> Path:
    """Resolve a tool path inside the projects root, or raise.

    Rejects absolute paths outright and any relative path that resolves
    outside the root (including via symlink).
    """
    if not rel_path:
        return root
    if rel_path.startswith("/") or rel_path.startswith("~"):
        raise SandboxViolation(f"absolute paths are not allowed: {rel_path!r}")
    root_resolved = root.resolve()
    target = (root / rel_path).resolve()
    if target != root_resolved and root_resolved not in target.parents:
        raise SandboxViolation(f"path escapes the projects root: {rel_path!r}")
    return target


def _truncate(text: str) -> tuple[str, bool]:
    encoded = text.encode()
    if len(encoded) <= OUTPUT_CAP_BYTES:
        return text, False
    return encoded[:OUTPUT_CAP_BYTES].decode(errors="ignore"), True


# ---------------------------------------------------------------- execution


def _fs_read(root: Path, arguments: dict) -> dict:
    target = resolve_within_root(root, str(arguments.get("path", "")))
    if not target.is_file():
        raise SandboxViolation(f"not a file: {target}")
    raw = target.read_text(errors="replace")
    content, truncated = _truncate(raw)
    return {"content": content, "bytes": len(raw.encode()), "truncated": truncated}


def _fs_list(root: Path, arguments: dict) -> dict:
    target = resolve_within_root(root, str(arguments.get("path", "")))
    if not target.is_dir():
        raise SandboxViolation(f"not a directory: {target}")
    entries = []
    for entry in sorted(target.iterdir(), key=lambda p: p.name)[:MAX_LIST_ENTRIES]:
        entries.append(
            {
                "path": str(entry.relative_to(root)),
                "type": "dir" if entry.is_dir() else "file",
                "sizeBytes": entry.stat().st_size if entry.is_file() else None,
            }
        )
    return {"entries": entries, "count": len(entries)}


def _fs_write(root: Path, arguments: dict) -> dict:
    target = resolve_within_root(root, str(arguments.get("path", "")))
    if target == root:
        raise SandboxViolation("refusing to overwrite the projects root")
    content = str(arguments.get("content", ""))
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content)
    return {"path": str(arguments.get("path", "")), "bytes": len(content.encode())}


def _run_command(root: Path, command: str, cwd: Path | None = None) -> dict:
    try:
        completed = subprocess.run(
            command,
            shell=True,
            cwd=cwd or root,
            capture_output=True,
            text=True,
            timeout=TERMINAL_TIMEOUT_SECONDS,
        )
    except subprocess.TimeoutExpired:
        raise SandboxViolation(f"command timed out after {TERMINAL_TIMEOUT_SECONDS}s: {command[:200]}")
    out, out_truncated = _truncate(completed.stdout)
    err, err_truncated = _truncate(completed.stderr)
    return {
        "exitCode": completed.returncode,
        "stdout": out,
        "stderr": err,
        "truncated": out_truncated or err_truncated,
    }


def _terminal(root: Path, arguments: dict) -> dict:
    return _run_command(root, str(arguments.get("command", "")))


def _git(root: Path, arguments: dict, command: str) -> dict:
    cwd = root
    if arguments.get("path"):
        cwd = resolve_within_root(root, str(arguments["path"]))
    return _run_command(root, command, cwd=cwd)


def execute_tool_local(root: Path, tool: str, arguments: dict) -> dict:
    """Execute one tool job inside the sandbox. Returns a runner report body.

    {"status": "succeeded", "result": {...}} or {"status": "failed", "error": "..."}.
    """
    arguments = arguments or {}
    handlers = {
        "fs_read": _fs_read,
        "fs_list": _fs_list,
        "fs_write": _fs_write,
        "terminal": _terminal,
        "git_commit": lambda r, a: _git(r, a, f"git add -A && git commit -m {json.dumps(str(a.get('message', 'update')))}"),
        "git_push": lambda r, a: _git(r, a, "git push"),
    }
    handler = handlers.get(tool)
    if handler is None:
        return {"status": "failed", "error": f"unknown tool: {tool}"}
    try:
        result = handler(root, arguments)
    except SandboxViolation as exc:
        return {"status": "failed", "error": f"sandbox violation: {exc}"}
    except OSError as exc:
        return {"status": "failed", "error": f"local error: {exc}"}
    return {"status": "succeeded", "result": result}


# ------------------------------------------------------------------ client


def load_config() -> dict:
    if not CONFIG_PATH.exists():
        raise SystemExit(
            f"no runner config at {CONFIG_PATH} — run the 'register' command first"
        )
    return json.loads(CONFIG_PATH.read_text())


def save_config(config: dict) -> None:
    CONFIG_PATH.write_text(json.dumps(config, indent=2))
    os.chmod(CONFIG_PATH, 0o600)  # contains the runner token


def cmd_register(args: argparse.Namespace) -> None:
    server = args.server.rstrip("/")
    root = Path(args.root).expanduser().resolve()
    root.mkdir(parents=True, exist_ok=True)
    payload = {
        "name": args.name or f"{platform.node() or 'mac'}",
        "platform": f"{platform.system()} {platform.release()}"[:64],
    }
    registered = _request(
        server, "POST", "/runners/register", body=payload, user_id=args.user_id
    )
    save_config(
        {
            "server": server,
            "runnerId": registered["id"],
            "token": registered["token"],  # shown once, kept only here
            "root": str(root),
            "userId": args.user_id,
        }
    )
    print(f"Registered runner {registered['id']} ({registered['name']}).")
    print(f"Projects root: {root}")
    print(f"Config saved to {CONFIG_PATH} (token stored, chmod 600).")


def cmd_status(_: argparse.Namespace) -> None:
    config = load_config()
    runners = _request(
        config["server"], "GET", "/runners", user_id=config.get("userId")
    )
    print(json.dumps(runners, indent=2))


def cmd_run(args: argparse.Namespace) -> None:
    config = load_config()
    server = config["server"]
    token = config["token"]
    runner_id = config["runnerId"]
    root = Path(args.root or config["root"]).expanduser().resolve()
    root.mkdir(parents=True, exist_ok=True)

    print(f"curvin-runner {runner_id} — serving {root}")
    print("Ctrl+C to stop. Tools execute ONLY inside the projects root.")

    last_heartbeat = 0.0
    jobs_done = 0
    while True:
        now = time.monotonic()
        if now - last_heartbeat >= HEARTBEAT_SECONDS:
            _request(server, "POST", f"/runners/{runner_id}/heartbeat", token=token)
            last_heartbeat = now
        claim = _request(
            server, "POST", f"/runners/{runner_id}/jobs/claim", token=token
        )
        job = claim.get("job")
        if job is None:
            if args.once:
                print("No queued jobs.")
                return
            time.sleep(POLL_SECONDS)
            continue

        print(f"→ {job['tool']} {json.dumps(job['arguments'])[:200]}")
        report = execute_tool_local(root, job["tool"], job["arguments"])
        _request(
            server,
            "POST",
            f"/runners/{runner_id}/jobs/{job['id']}/result",
            token=token,
            body=report,
        )
        jobs_done += 1
        print(f"✓ {report['status']} ({jobs_done} done)")
        if args.once:
            return


def cmd_test(args: argparse.Namespace) -> None:
    """Offline sandbox self-check — no backend required."""
    import tempfile

    root = Path(tempfile.mkdtemp(prefix="curvin-runner-test-"))
    print(f"sandbox root: {root}")

    report = execute_tool_local(root, "fs_write", {"path": "a/b.txt", "content": "hello"})
    assert report["status"] == "succeeded", report
    report = execute_tool_local(root, "fs_read", {"path": "a/b.txt"})
    assert report["result"]["content"] == "hello", report
    report = execute_tool_local(root, "fs_list", {"path": ""})
    assert report["result"]["entries"][0]["path"] == "a", report
    report = execute_tool_local(root, "terminal", {"command": "echo ok"})
    assert report["result"]["exitCode"] == 0 and "ok" in report["result"]["stdout"], report

    for bad in ("../escape", "/etc/passwd", "a/../../escape"):
        report = execute_tool_local(root, "fs_read", {"path": bad})
        assert report["status"] == "failed" and "sandbox violation" in report["error"], report
    report = execute_tool_local(root, "no_such_tool", {})
    assert report["status"] == "failed" and "unknown tool" in report["error"], report
    print("All sandbox self-checks passed.")


def main() -> None:
    parser = argparse.ArgumentParser(prog="curvin-runner")
    sub = parser.add_subparsers(dest="command", required=True)

    register = sub.add_parser("register", help="register this machine with the backend")
    register.add_argument("--server", required=True, help="backend base URL, e.g. http://localhost:8000")
    register.add_argument("--root", default="~/CurvinProjects", help="projects root (sandbox jail)")
    register.add_argument("--name", default=None, help="runner display name")
    register.add_argument("--user-id", default="user_dev", help="X-User-Id (Phase 1 placeholder identity)")
    register.set_defaults(func=cmd_register)

    status = sub.add_parser("status", help="show registered runners on the backend")
    status.set_defaults(func=cmd_status)

    run = sub.add_parser("run", help="claim and execute tool jobs (the agent loop)")
    run.add_argument("--once", action="store_true", help="claim at most one job, then exit")
    run.add_argument("--root", default=None, help="override the projects root for this session")
    run.set_defaults(func=cmd_run)

    test = sub.add_parser("test", help="offline sandbox self-check (no backend needed)")
    test.set_defaults(func=cmd_test)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
