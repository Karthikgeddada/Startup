# curvin-runner

CURVIN's local execution agent (Phase 4). It runs **on your machine**, connects
to the CURVIN backend, and executes the agent's tool jobs — filesystem reads
and writes, terminal commands, and git operations — inside a sandbox rooted
at your projects directory. The backend never executes anything itself.

## Requirements

Python 3.9+ (standard library only — no pip installs).

## Setup

```sh
# 1. Start the backend (in curvin-backend/)
python -m uvicorn app.main:app --reload

# 2. Register this machine (creates ~/.curvin-runner.json, chmod 600)
python3 curvin_runner.py register --server http://localhost:8000 --root ~/CurvinProjects

# 3. Offline sandbox self-check (no backend needed)
python3 curvin_runner.py test

# 4. Serve tool jobs
python3 curvin_runner.py run
```

`register` prints the runner id once and stores the per-runner bearer token
locally (`~/.curvin-runner.json`); the backend keeps only its SHA-256 hash.

## Sandbox

- **Path jail**: every filesystem path resolves inside the projects root.
  Absolute paths and `../` escapes are rejected (symlinks resolved first).
- **Command timeout**: terminal/git commands are killed after 120 s.
- **Output caps**: all reported output is truncated at 64 KB; listings at 500
  entries.
- **User isolation**: a runner only ever claims jobs belonging to the user
  who registered it.

Write/dangerous tools (fs_write, git_commit, terminal, git_push) still pause
the agent run for an approval **before** the job is queued — approval gating
lives in the backend orchestrator, not the runner.

## Commands

| Command | Purpose |
| --- | --- |
| `register --server URL --root DIR [--name N] [--user-id ID]` | Register this machine; save token + root |
| `status` | List registered runners and their online state |
| `run [--once] [--root DIR]` | Heartbeat, claim jobs, execute, report (loop) |
| `test` | Offline sandbox self-check (path jail, tools, truncation) |

## What the backend does with jobs

Jobs live in `runner_jobs` (`queued → claimed → succeeded | failed | timeout`).
The orchestrator waits for the result up to `RUNNER_JOB_TIMEOUT_SECONDS`
(default 120 s) and records the outcome as a `tool_result` run event — a run
whose runner dies mid-job fails honestly with `runner_timeout`, never a
fabricated result.
