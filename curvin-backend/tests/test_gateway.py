"""Phase 2 model-gateway tests.

All provider interaction runs against httpx.MockTransport — zero network,
zero keys, real parsing/retry/budget logic exercised."""
from __future__ import annotations

import json

import httpx
import pytest

from app.agent.gateway import (
    BudgetExceededError,
    BudgetTracker,
    ExecutionBudget,
    GatewayNotConfiguredError,
    ModelRole,
    OpenAICompatibleGateway,
    ProviderError,
    ProviderUnavailableError,
    resolve_roles,
)
from app.agent.gateway.base import ToolSpec
from app.core.config import Settings, get_settings


def make_settings(**overrides) -> Settings:
    base = dict(
        llm_provider="openrouter",
        llm_base_url="https://gateway.test/v1",
        llm_api_key="sk-test-secret",
        llm_model="base-model",
    )
    base.update(overrides)
    return Settings(**base)


def make_gateway(transport: httpx.BaseTransport, **budget_kwargs) -> OpenAICompatibleGateway:
    budget = BudgetTracker(ExecutionBudget(**budget_kwargs)) if budget_kwargs else BudgetTracker()
    return OpenAICompatibleGateway(
        base_url="https://gateway.test/v1",
        api_key="sk-test-secret",
        role_models={
            ModelRole.CODE: "base-model",
            ModelRole.FAST: "fast-model",
            ModelRole.EMBEDDING: "embed-model",
        },
        budget=budget,
        max_retries=1,
        transport=transport,
    )


def chat_body(content=None, tool_calls=None, usage=None, model="base-model", finish_reason="stop"):
    message = {"role": "assistant", "content": content}
    if tool_calls is not None:
        message["tool_calls"] = tool_calls
    return {
        "id": "cmpl-1",
        "model": model,
        "choices": [{"index": 0, "message": message, "finish_reason": finish_reason}],
        "usage": usage or {"prompt_tokens": 10, "completion_tokens": 5},
    }


# ------------------------------------------------------------- role resolution


class TestResolveRoles:
    def test_all_roles_fall_back_to_base_model(self):
        resolved = resolve_roles(make_settings())
        assert resolved.provider == "openrouter"
        assert resolved.role_models[ModelRole.FAST] == "base-model"
        assert resolved.role_models[ModelRole.CODE] == "base-model"

    def test_per_role_overrides(self):
        resolved = resolve_roles(make_settings(llm_fast_model="flash-lite"))
        assert resolved.role_models[ModelRole.FAST] == "flash-lite"
        assert resolved.role_models[ModelRole.CODE] == "base-model"

    def test_missing_config_names_every_missing_variable(self):
        with pytest.raises(GatewayNotConfiguredError) as excinfo:
            resolve_roles(Settings())
        message = str(excinfo.value)
        for name in ("LLM_PROVIDER", "LLM_BASE_URL", "LLM_MODEL", "LLM_API_KEY"):
            assert name in message


# -------------------------------------------------------------------- complete


class TestComplete:
    def test_parses_content_and_usage(self):
        transport = httpx.MockTransport(
            lambda req: httpx.Response(200, json=chat_body(content="hello"))
        )
        gw = make_gateway(transport)
        result = gw.complete([{"role": "user", "content": "hi"}])
        assert result.content == "hello"
        assert result.finish_reason == "stop"
        assert result.usage.total_tokens == 15
        assert result.model == "base-model"
        assert gw._budget.total_tokens == 15

    def test_parses_tool_calls(self):
        raw_calls = [
            {
                "id": "call_1",
                "type": "function",
                "function": {"name": "fs_read", "arguments": '{"path": "src/app.ts"}'},
            }
        ]
        transport = httpx.MockTransport(
            lambda req: httpx.Response(
                200, json=chat_body(content=None, tool_calls=raw_calls, finish_reason="tool_calls")
            )
        )
        result = make_gateway(transport).complete([{"role": "user", "content": "read the file"}])
        assert result.finish_reason == "tool_calls"
        assert len(result.tool_calls) == 1
        assert result.tool_calls[0].name == "fs_read"
        assert result.tool_calls[0].arguments == {"path": "src/app.ts"}

    def test_garbage_tool_arguments_fall_back_to_raw(self):
        raw_calls = [
            {"id": "call_9", "function": {"name": "x", "arguments": "not json"}}
        ]
        transport = httpx.MockTransport(
            lambda req: httpx.Response(200, json=chat_body(tool_calls=raw_calls))
        )
        result = make_gateway(transport).complete([{"role": "user", "content": "go"}])
        assert result.tool_calls[0].arguments == {"_raw": "not json"}

    def test_tools_are_serialized_in_request(self):
        captured = {}

        def handler(request: httpx.Request) -> httpx.Response:
            captured["payload"] = json.loads(request.content)
            return httpx.Response(200, json=chat_body(content="ok"))

        spec = ToolSpec(
            name="fs_read",
            description="read a file",
            parameters_schema={"type": "object", "properties": {"path": {"type": "string"}}},
        )
        make_gateway(httpx.MockTransport(handler)).complete(
            [{"role": "user", "content": "hi"}], tools=[spec]
        )
        sent = captured["payload"]["tools"][0]["function"]
        assert sent["name"] == "fs_read"
        assert sent["parameters"]["properties"]["path"] == {"type": "string"}


class TestRetryAndErrors:
    def test_retries_on_500_then_succeeds(self):
        attempts = []

        def handler(request: httpx.Request) -> httpx.Response:
            attempts.append(1)
            if len(attempts) < 2:
                return httpx.Response(500, text="boom")
            return httpx.Response(200, json=chat_body(content="recovered"))

        result = make_gateway(httpx.MockTransport(handler)).complete(
            [{"role": "user", "content": "hi"}]
        )
        assert result.content == "recovered"
        assert len(attempts) == 2

    def test_4xx_is_not_retried(self):
        attempts = []

        def handler(request: httpx.Request) -> httpx.Response:
            attempts.append(1)
            return httpx.Response(401, text="bad key")

        with pytest.raises(ProviderError) as excinfo:
            make_gateway(httpx.MockTransport(handler)).complete(
                [{"role": "user", "content": "hi"}]
            )
        assert excinfo.value.status_code == 401
        assert len(attempts) == 1

    def test_transport_error_exhausts_retries(self):
        attempts = []

        def handler(request: httpx.Request) -> httpx.Response:
            attempts.append(1)
            raise httpx.ConnectError("nope")

        with pytest.raises(ProviderUnavailableError):
            make_gateway(httpx.MockTransport(handler)).complete(
                [{"role": "user", "content": "hi"}]
            )
        assert len(attempts) == 2  # max_retries=1 → initial + 1 retry


class TestBudget:
    def test_call_budget_raises_on_excess(self):
        transport = httpx.MockTransport(
            lambda req: httpx.Response(200, json=chat_body(content="x"))
        )
        gw = make_gateway(transport, max_llm_calls=1)
        gw.complete([{"role": "user", "content": "one"}])
        with pytest.raises(BudgetExceededError):
            gw.complete([{"role": "user", "content": "two"}])

    def test_token_budget_raises_on_excess(self):
        transport = httpx.MockTransport(
            lambda req: httpx.Response(
                200,
                json=chat_body(content="x", usage={"prompt_tokens": 90, "completion_tokens": 10}),
            )
        )
        gw = make_gateway(transport, max_total_tokens=100)
        gw.complete([{"role": "user", "content": "one"}])  # exactly at the limit
        with pytest.raises(BudgetExceededError):
            gw.complete([{"role": "user", "content": "two"}])


# ---------------------------------------------------------------------- stream


def _sse_chunk(obj: dict) -> bytes:
    """Serialize one SSE data line exactly as a provider would."""
    return b"data: " + json.dumps(obj).encode() + b"\n\n"


class TestStream:
    SSE = (
        _sse_chunk({"choices": [{"delta": {"content": "Hel"}}]})
        + _sse_chunk({"choices": [{"delta": {"content": "lo"}}]})
        + _sse_chunk(
            {
                "choices": [
                    {
                        "delta": {
                            "tool_calls": [
                                {
                                    "index": 0,
                                    "id": "call_1",
                                    "function": {"name": "fs_read", "arguments": "{\"pat"},
                                }
                            ]
                        }
                    }
                ]
            }
        )
        + _sse_chunk(
            {
                "choices": [
                    {
                        "delta": {
                            "tool_calls": [
                                {"index": 0, "function": {"arguments": "h\": \"a.ts\"}"}}
                            ]
                        }
                    }
                ]
            }
        )
        + _sse_chunk({"choices": [{"delta": {}, "finish_reason": "tool_calls"}]})
        + _sse_chunk(
            {"choices": [], "usage": {"prompt_tokens": 12, "completion_tokens": 8}}
        )
        + b"data: [DONE]\n\n"
    )

    def test_stream_parses_deltas_tools_and_usage(self):
        transport = httpx.MockTransport(
            lambda req: httpx.Response(
                200, headers={"content-type": "text/event-stream"}, content=self.SSE
            )
        )
        events = list(make_gateway(transport).stream([{"role": "user", "content": "hi"}]))

        content = "".join(e.content for e in events if e.type == "content_delta")
        assert content == "Hello"

        tool_events = [e for e in events if e.type == "tool_call"]
        assert len(tool_events) == 1
        call = tool_events[0].tool_calls[0]
        assert call.id == "call_1"
        assert call.name == "fs_read"
        assert call.arguments == {"path": "a.ts"}

        usage_events = [e for e in events if e.type == "usage"]
        assert usage_events[0].usage.total_tokens == 20

        done = [e for e in events if e.type == "done"]
        assert done[-1].finish_reason == "tool_calls"

    def test_stream_error_status_raises(self):
        transport = httpx.MockTransport(
            lambda req: httpx.Response(500, text="down")
        )
        generator = make_gateway(transport).stream([{"role": "user", "content": "hi"}])
        with pytest.raises(ProviderUnavailableError):
            next(generator)


# ------------------------------------------------------------------ embeddings


class TestEmbed:
    def test_parses_vectors_in_order(self):
        body = {
            "model": "embed-model",
            "data": [
                {"index": 1, "embedding": [0.4, 0.5]},
                {"index": 0, "embedding": [0.1, 0.2]},
            ],
            "usage": {"prompt_tokens": 4, "completion_tokens": 0},
        }
        transport = httpx.MockTransport(lambda req: httpx.Response(200, json=body))
        results = make_gateway(transport).embed(["a", "b"])
        assert results[0].vector == [0.1, 0.2]
        assert results[1].vector == [0.4, 0.5]
        assert results[0].model == "embed-model"


# ------------------------------------------------------------- /api/v1/models


class TestModelsEndpoint:
    def test_unconfigured_reports_honestly(self, client):
        r = client.get("/api/v1/models")
        assert r.status_code == 200
        body = r.json()
        assert body["configured"] is False
        assert "LLM_API_KEY" in body["message"]
        assert set(body["roles"]) == {
            "fast", "planning", "code", "verification", "embedding",
        }

    def test_configured_reports_roles_and_never_leaks_key(self, client):
        client.app.dependency_overrides[get_settings] = lambda: make_settings(
            llm_fast_model="flash-lite"
        )
        try:
            r = client.get("/api/v1/models")
            assert r.status_code == 200
            body = r.json()
            assert body["configured"] is True
            assert body["provider"] == "openrouter"
            assert body["roles"]["fast"]["model"] == "flash-lite"
            assert body["roles"]["code"]["model"] == "base-model"
            assert "sk-test-secret" not in r.text
            assert "api_key" not in r.text.lower()
        finally:
            client.app.dependency_overrides.clear()
