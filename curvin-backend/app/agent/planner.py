"""Planner — turns a goal into plan steps (Phase 3).

The plan is a persisted RunTask list and a `plan_generated` event; steps map
1:1 onto the run_tasks table. Parsing is deliberately defensive: any failure
falls back to a single honest step (work the goal directly) instead of
guessing or failing the run.
"""
from __future__ import annotations

import json

from app.agent.gateway import ModelGateway, ModelRole

PLANNER_SYSTEM = (
    "You are CURVIN's planning module. Given the user's goal, produce a short, "
    "concrete implementation plan. Respond with JSON only — no prose, no code "
    'fences — in the exact shape {"steps": ["...", "..."]} with 1 to 6 short '
    "imperative steps."
)

MAX_STEPS = 6


def generate_plan(gateway: ModelGateway, goal: str) -> list[str]:
    """Ask the planning model for steps; always returns at least one step."""
    try:
        result = gateway.complete(
            [
                {"role": "system", "content": PLANNER_SYSTEM},
                {"role": "user", "content": f"Goal: {goal}"},
            ],
            role=ModelRole.PLANNING,
            temperature=0.2,
        )
        steps = _parse_steps(result.content or "")
    except Exception:
        # Planning is best-effort: the reasoning loop still works the goal.
        steps = []
    return steps or [goal[:500]]


def _parse_steps(text: str) -> list[str]:
    """Extract a steps list from model output; [] when unparseable."""
    candidate = _strip_fences(text.strip())
    start, end = candidate.find("{"), candidate.rfind("}")
    if start == -1 or end <= start:
        return []
    try:
        data = json.loads(candidate[start : end + 1])
    except json.JSONDecodeError:
        return []
    if not isinstance(data, dict):
        return []
    raw = data.get("steps")
    if not isinstance(raw, list):
        return []
    steps = [str(s).strip() for s in raw if str(s).strip()][:MAX_STEPS]
    return steps


def _strip_fences(text: str) -> str:
    if not text.startswith("```"):
        return text
    lines = text.splitlines()
    body = lines[1:]  # drop the opening fence (with optional language tag)
    if body and body[-1].strip() == "```":
        body = body[:-1]
    return "\n".join(body)
