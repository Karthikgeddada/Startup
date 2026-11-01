"""Integration tests for the Phase 1 API — real persistence, no mocks."""
from __future__ import annotations

import json


class TestService:
    def test_service_info(self, client):
        r = client.get("/")
        assert r.status_code == 200
        assert r.json()["api"] == "/api/v1"

    def test_request_id_header(self, client):
        r = client.get("/api/v1/health")
        assert r.headers["X-Request-Id"]


class TestHealth:
    def test_health_ok(self, client):
        r = client.get("/api/v1/health")
        assert r.status_code == 200
        body = r.json()
        assert body["status"] == "ok"
        assert body["database"] == "ok"


class TestProjects:
    def test_create_and_get_project(self, client):
        r = client.post(
            "/api/v1/projects",
            json={"name": "Atlas Analytics", "description": "Dashboards", "mode": "blank"},
        )
        assert r.status_code == 201
        body = r.json()
        assert body["id"].startswith("proj_")
        assert body["status"] == "active"
        assert body["repository"] is None
        assert body["techStack"] == []
        assert body["createdAt"]

        r = client.get(f"/api/v1/projects/{body['id']}")
        assert r.status_code == 200
        assert r.json()["name"] == "Atlas Analytics"

    def test_github_mode_is_honestly_importing(self, client):
        r = client.post(
            "/api/v1/projects",
            json={"name": "Billing", "description": "", "mode": "github", "githubRepoId": "repo-1"},
        )
        assert r.status_code == 201
        body = r.json()
        assert body["status"] == "importing"
        assert "not yet implemented" in (body["currentTask"] or "")

    def test_project_404_envelope(self, client):
        r = client.get("/api/v1/projects/proj_missing")
        assert r.status_code == 404
        body = r.json()
        assert body["error"]["code"] == "not_found"
        assert body["error"]["request_id"]

    def test_projects_are_user_scoped(self, client):
        client.post(
            "/api/v1/projects",
            json={"name": "Mine", "description": "", "mode": "blank"},
            headers={"X-User-Id": "user_a"},
        )
        client.post(
            "/api/v1/projects",
            json={"name": "Theirs", "description": "", "mode": "blank"},
            headers={"X-User-Id": "user_b"},
        )
        mine = client.get("/api/v1/projects", headers={"X-User-Id": "user_a"}).json()
        theirs = client.get("/api/v1/projects", headers={"X-User-Id": "user_b"}).json()
        assert [p["name"] for p in mine] == ["Mine"]
        assert [p["name"] for p in theirs] == ["Theirs"]
        # Cross-user access is 404, not 403 (no enumeration).
        foreign_id = theirs[0]["id"]
        r = client.get(f"/api/v1/projects/{foreign_id}", headers={"X-User-Id": "user_a"})
        assert r.status_code == 404

    def test_project_files_empty_until_indexed(self, client):
        r = client.post(
            "/api/v1/projects",
            json={"name": "P", "description": "", "mode": "blank"},
        )
        project_id = r.json()["id"]
        r = client.get(f"/api/v1/projects/{project_id}/files")
        assert r.status_code == 200
        assert r.json() == []

    def test_validation_error_envelope(self, client):
        r = client.post("/api/v1/projects", json={"name": "", "mode": "blank"})
        assert r.status_code == 422
        assert r.json()["error"]["code"] == "validation_error"


class TestConversationsAndRuns:
    def _create_conversation(self, client, title="Retention widget"):
        r = client.post("/api/v1/conversations", json={"title": title})
        assert r.status_code == 201
        return r.json()["id"]

    def test_message_creates_persisted_run(self, client):
        conv_id = self._create_conversation(client)
        r = client.post(
            f"/api/v1/conversations/{conv_id}/messages",
            json={"content": "Add a retention widget"},
        )
        assert r.status_code == 201
        body = r.json()
        assert body["message"]["role"] == "user"
        assert body["message"]["content"] == "Add a retention widget"
        assert body["run"]["status"] == "created"
        assert body["run"]["goal"] == "Add a retention widget"

        # Persistence: the run is retrievable and the conversation shows the message.
        run_id = body["run"]["id"]
        r = client.get(f"/api/v1/runs/{run_id}")
        assert r.status_code == 200
        assert r.json()["status"] == "created"

        r = client.get(f"/api/v1/conversations/{conv_id}")
        assert r.status_code == 200
        messages = r.json()["messages"]
        assert len(messages) == 1
        assert messages[0]["role"] == "user"

        # run_created event is in the persisted log.
        r = client.get("/api/v1/runs", params={"conversation_id": conv_id})
        assert r.status_code == 200
        assert r.json()[0]["id"] == run_id

    def test_cancel_and_terminal_rejection(self, client):
        conv_id = self._create_conversation(client)
        run_id = client.post(
            f"/api/v1/conversations/{conv_id}/messages",
            json={"content": "do the thing"},
        ).json()["run"]["id"]

        r = client.post(f"/api/v1/runs/{run_id}/cancel")
        assert r.status_code == 200
        assert r.json()["status"] == "cancelled"

        r = client.post(f"/api/v1/runs/{run_id}/cancel")
        assert r.status_code == 409
        assert "invalid run state transition" in r.json()["error"]["message"]

        r = client.post(f"/api/v1/runs/{run_id}/resume")
        assert r.status_code == 409


class TestApprovals:
    def _make_run(self, client):
        conv_id = client.post(
            "/api/v1/conversations", json={"title": "Approvals"}
        ).json()["id"]
        run_id = client.post(
            f"/api/v1/conversations/{conv_id}/messages",
            json={"content": "change the code"},
        ).json()["run"]["id"]
        return run_id

    def test_approve_flows_run_back_to_running(self, client):
        run_id = self._make_run(client)
        r = client.post(
            f"/api/v1/runs/{run_id}/approvals",
            json={"title": "Apply diff to src/app.tsx", "description": "3 files"},
        )
        assert r.status_code == 201
        approval_id = r.json()["id"]

        r = client.get(f"/api/v1/runs/{run_id}")
        assert r.json()["status"] == "waiting_for_approval"

        r = client.post(f"/api/v1/approvals/{approval_id}/approve")
        assert r.status_code == 200
        body = r.json()
        assert body["approval"]["status"] == "approved"
        assert body["run"]["status"] == "running"

        # Double resolution is rejected.
        r = client.post(f"/api/v1/approvals/{approval_id}/approve")
        assert r.status_code == 409

    def test_reject_cancels_run(self, client):
        run_id = self._make_run(client)
        approval_id = client.post(
            f"/api/v1/runs/{run_id}/approvals",
            json={"title": "Risky change"},
        ).json()["id"]
        r = client.post(f"/api/v1/approvals/{approval_id}/reject")
        assert r.status_code == 200
        body = r.json()
        assert body["approval"]["status"] == "rejected"
        assert body["run"]["status"] == "cancelled"


class TestEventStream:
    def test_sse_replays_persisted_log_for_terminal_run(self, client):
        conv_id = client.post(
            "/api/v1/conversations", json={"title": "SSE"}
        ).json()["id"]
        run_id = client.post(
            f"/api/v1/conversations/{conv_id}/messages",
            json={"content": "stream me"},
        ).json()["run"]["id"]
        approval_id = client.post(
            f"/api/v1/runs/{run_id}/approvals",
            json={"title": "Gate"},
        ).json()["id"]
        client.post(f"/api/v1/approvals/{approval_id}/reject")  # terminal: cancelled

        with client.stream(
            "GET", f"/api/v1/runs/{run_id}/events?last_event_id=0"
        ) as resp:
            assert resp.status_code == 200
            assert resp.headers["content-type"].startswith("text/event-stream")
            text = "".join(line for line in resp.iter_lines())

        assert "event: run_created" in text
        assert "event: run_status_changed" in text
        assert "event: approval_required" in text
        assert "event: approval_rejected" in text
        assert "event: stream_end" in text
        # Replayed payloads parse as JSON.
        data_lines = [l for l in text.splitlines() if l.startswith("data: ")]
        for line in data_lines:
            json.loads(line[len("data: "):])

    def test_sse_respects_cursor(self, client):
        conv_id = client.post(
            "/api/v1/conversations", json={"title": "Cursor"}
        ).json()["id"]
        run_id = client.post(
            f"/api/v1/conversations/{conv_id}/messages",
            json={"content": "cursor test"},
        ).json()["run"]["id"]
        client.post(f"/api/v1/runs/{run_id}/cancel")

        # Skip seq 1 (run_created): replay must start from seq 2.
        with client.stream(
            "GET", f"/api/v1/runs/{run_id}/events?last_event_id=1"
        ) as resp:
            text = "".join(line for line in resp.iter_lines())
        assert "run_created" not in text
        assert "run_status_changed" in text
        assert "run_cancelled" in text
