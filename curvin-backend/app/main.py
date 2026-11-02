"""CURVIN backend — FastAPI application factory.

Cross-cutting concerns live here: request IDs, CORS, structured errors, router
mounting, and the dev-database lifespan hook. The agent engine and runners attach through /api/v1 only.
"""
from __future__ import annotations

import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request as StarletteRequest

from app.api.v1 import approvals, conversations, health, models, projects, runs
from app.core.config import get_settings


class RequestIDMiddleware(BaseHTTPMiddleware):
    """Attach a request id to every request and echo it in the response."""

    async def dispatch(self, request: StarletteRequest, call_next):
        request_id = request.headers.get("X-Request-Id") or uuid.uuid4().hex
        request.state.request_id = request_id
        response = await call_next(request)
        response.headers["X-Request-Id"] = request_id
        return response


def _error_body(request: StarletteRequest, code: str, message: str) -> dict:
    return {
        "error": {
            "code": code,
            "message": message,
            "request_id": getattr(request.state, "request_id", None),
        }
    }


def create_app() -> FastAPI:
    settings = get_settings()

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        # SQLite (local dev/tests): create tables directly. Postgres: use Alembic.
        if settings.database_url.startswith("sqlite"):
            from app.core.database import init_db

            init_db()
        yield

    app = FastAPI(
        title=settings.app_name,
        version=settings.api_version,
        lifespan=lifespan,
    )

    app.add_middleware(RequestIDMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=settings.cors_allow_credentials,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ---------------------------------------------------- structured errors

    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(request: Request, exc: StarletteHTTPException):
        code = {
            404: "not_found",
            409: "conflict",
            422: "validation_error",
            400: "bad_request",
        }.get(exc.status_code, f"http_{exc.status_code}")
        detail = exc.detail if isinstance(exc.detail, str) else "request failed"
        return JSONResponse(
            status_code=exc.status_code,
            content=_error_body(request, code, detail),
        )

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError):
        return JSONResponse(
            status_code=422,
            content=_error_body(request, "validation_error", str(exc.errors()[:5])),
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception):
        # Last-resort envelope. The exception is still logged by the server.
        return JSONResponse(
            status_code=500,
            content=_error_body(request, "internal_error", "unexpected server error"),
        )

    # --------------------------------------------------------------- routes

    app.include_router(health.router, prefix="/api/v1")
    app.include_router(models.router, prefix="/api/v1")
    app.include_router(projects.router, prefix="/api/v1")
    app.include_router(conversations.router, prefix="/api/v1")
    app.include_router(runs.router, prefix="/api/v1")
    app.include_router(approvals.router, prefix="/api/v1")

    @app.get("/", tags=["service"])
    def service_info():
        return {
            "service": settings.app_name,
            "version": settings.api_version,
            "environment": settings.environment,
            "docs": "/docs",
            "api": "/api/v1",
        }

    return app


app = create_app()
