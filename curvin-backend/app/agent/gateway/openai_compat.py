"""OpenAI-compatible provider gateway.

Works with any /chat/completions + /embeddings endpoint (OpenAI, OpenRouter,
Groq, Together, vLLM, llama.cpp server, …). Uses httpx directly — no vendor
SDK — with an injectable transport so tests run without any network.
"""
from __future__ import annotations

import json
import time
from collections.abc import Iterator, Sequence

import httpx

from app.agent.gateway.base import (
    BudgetTracker,
    CompletionResult,
    EmbeddingResult,
    Message,
    ModelGateway,
    ModelRole,
    ProviderError,
    ProviderUnavailableError,
    StreamEvent,
    ToolCallRequest,
    ToolSpec,
    Usage,
)

_RETRYABLE_STATUS = {429, 500, 502, 503, 504}


def _serialize_tools(tools: Sequence[ToolSpec]) -> list[dict]:
    return [
        {
            "type": "function",
            "function": {
                "name": t.name,
                "description": t.description,
                "parameters": t.parameters_schema or {"type": "object", "properties": {}},
            },
        }
        for t in tools
    ]


def _parse_tool_calls(raw_calls: list[dict]) -> list[ToolCallRequest]:
    calls: list[ToolCallRequest] = []
    for raw in raw_calls or []:
        function = raw.get("function", {})
        arguments_raw = function.get("arguments") or "{}"
        try:
            arguments = json.loads(arguments_raw)
        except json.JSONDecodeError:
            arguments = {"_raw": arguments_raw}
        calls.append(
            ToolCallRequest(
                id=raw.get("id") or f"call_{len(calls)}",
                name=function.get("name") or "",
                arguments=arguments if isinstance(arguments, dict) else {"_raw": arguments},
            )
        )
    return calls


def _parse_usage(payload: dict) -> Usage:
    raw = payload.get("usage") or {}
    return Usage(
        prompt_tokens=int(raw.get("prompt_tokens", 0) or 0),
        completion_tokens=int(raw.get("completion_tokens", 0) or 0),
    )


class OpenAICompatibleGateway(ModelGateway):
    """One instance per run; role_configs maps ModelRole → (model, endpoint).

    ``transport`` is exposed for dependency-injected tests (httpx.MockTransport).
    Budget accounting and bounded retries are enforced for every call.
    """

    def __init__(
        self,
        *,
        base_url: str,
        api_key: str,
        role_models: dict[ModelRole, str],
        budget: BudgetTracker | None = None,
        timeout_seconds: float = 60.0,
        max_retries: int = 2,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
        self._role_models = role_models
        self._budget = budget or BudgetTracker()
        self._timeout = timeout_seconds
        self._max_retries = max_retries
        self._client = httpx.Client(
            base_url=self._base_url,
            headers=self._headers,
            timeout=self._timeout,
            transport=transport,
        )

    # ------------------------------------------------------------- internals

    def _request(self, path: str, payload: dict) -> dict:
        """POST with bounded retry on 5xx/429/transport errors; no retry on 4xx."""
        attempts = self._max_retries + 1
        last_error: Exception | None = None
        for attempt in range(attempts):
            if attempt:
                time.sleep(min(0.5 * (2 ** (attempt - 1)), 4.0))
            try:
                response = self._client.post(path, json=payload)
            except httpx.TransportError as exc:
                last_error = exc
                continue
            if response.status_code in _RETRYABLE_STATUS:
                last_error = ProviderUnavailableError(
                    f"provider returned {response.status_code}"
                )
                continue
            if response.status_code >= 400:
                raise ProviderError(
                    response.status_code,
                    response.text[:500],
                )
            return response.json()
        raise ProviderUnavailableError(f"provider unreachable after retries: {last_error}")

    def _model_for(self, role: ModelRole) -> str:
        try:
            return self._role_models[role]
        except KeyError as exc:
            raise ProviderError(0, f"no model configured for role {role.value}") from exc

    def _chat_payload(
        self,
        messages: Sequence[Message],
        *,
        model: str,
        tools: Sequence[ToolSpec] | None,
        temperature: float | None,
        stream: bool,
    ) -> dict:
        payload: dict = {"model": model, "messages": [dict(m) for m in messages]}
        if tools:
            payload["tools"] = _serialize_tools(tools)
        if temperature is not None:
            payload["temperature"] = temperature
        if stream:
            payload["stream"] = True
        return payload

    # ------------------------------------------------------------------ API

    def complete(
        self,
        messages: Sequence[Message],
        *,
        role: ModelRole = ModelRole.CODE,
        tools: Sequence[ToolSpec] | None = None,
        temperature: float | None = None,
    ) -> CompletionResult:
        self._budget.record_call()
        payload = self._chat_payload(
            messages,
            model=self._model_for(role),
            tools=tools,
            temperature=temperature,
            stream=False,
        )
        data = self._request("/chat/completions", payload)
        usage = _parse_usage(data)
        self._budget.record_usage(usage)
        choices = data.get("choices") or [{}]
        message = choices[0].get("message", {})
        return CompletionResult(
            content=message.get("content"),
            tool_calls=_parse_tool_calls(message.get("tool_calls") or []),
            finish_reason=choices[0].get("finish_reason"),
            usage=usage,
            model=data.get("model", self._model_for(role)),
        )

    def stream(
        self,
        messages: Sequence[Message],
        *,
        role: ModelRole = ModelRole.CODE,
        tools: Sequence[ToolSpec] | None = None,
        temperature: float | None = None,
    ) -> Iterator[StreamEvent]:
        """Yield content deltas; assemble tool-call fragments; end with usage/done."""
        self._budget.record_call()
        payload = self._chat_payload(
            messages,
            model=self._model_for(role),
            tools=tools,
            temperature=temperature,
            stream=True,
        )

        tool_fragments: dict[int, dict] = {}
        finish_reason: str | None = None
        usage = Usage()

        with self._client.stream(
            "POST", "/chat/completions", json=payload
        ) as response:
            if response.status_code in _RETRYABLE_STATUS:
                raise ProviderUnavailableError(
                    f"provider returned {response.status_code}"
                )
            if response.status_code >= 400:
                raise ProviderError(response.status_code, response.read().decode()[:500])
            for line in response.iter_lines():
                line = line.strip()
                if not line or not line.startswith("data:"):
                    continue
                data_raw = line[len("data:"):].strip()
                if data_raw == "[DONE]":
                    break
                chunk = json.loads(data_raw)
                usage = _parse_usage(chunk) if chunk.get("usage") else usage
                for choice in chunk.get("choices") or []:
                    if choice.get("finish_reason"):
                        finish_reason = choice["finish_reason"]
                    delta = choice.get("delta", {})
                    content = delta.get("content")
                    if content:
                        yield StreamEvent(type="content_delta", content=content)
                    for tc in delta.get("tool_calls") or []:
                        index = int(tc.get("index", 0))
                        fragment = tool_fragments.setdefault(
                            index, {"id": None, "name": None, "arguments": ""}
                        )
                        if tc.get("id"):
                            fragment["id"] = tc["id"]
                        function = tc.get("function") or {}
                        if function.get("name"):
                            fragment["name"] = function["name"]
                        if function.get("arguments"):
                            fragment["arguments"] += function["arguments"]

        self._budget.record_usage(usage)
        if tool_fragments:
            assembled = []
            for _, frag in sorted(tool_fragments.items()):
                try:
                    arguments = json.loads(frag["arguments"] or "{}")
                except json.JSONDecodeError:
                    arguments = {"_raw": frag["arguments"]}
                assembled.append(
                    ToolCallRequest(
                        id=frag["id"] or "call_stream",
                        name=frag["name"] or "",
                        arguments=arguments,
                    )
                )
            yield StreamEvent(type="tool_call", tool_calls=assembled, finish_reason=finish_reason)
        yield StreamEvent(type="usage", usage=usage)
        yield StreamEvent(type="done", finish_reason=finish_reason)

    def embed(
        self, texts: Sequence[str], *, role: ModelRole = ModelRole.EMBEDDING
    ) -> list[EmbeddingResult]:
        self._budget.record_call()
        model = self._model_for(role)
        data = self._request(
            "/embeddings", {"model": model, "input": list(texts)}
        )
        usage = _parse_usage(data)
        self._budget.record_usage(usage)
        results: list[EmbeddingResult] = []
        for item in sorted(data.get("data", []), key=lambda d: d.get("index", 0)):
            results.append(
                EmbeddingResult(
                    vector=list(item.get("embedding", [])),
                    usage=usage,
                    model=data.get("model", model),
                )
            )
        return results
