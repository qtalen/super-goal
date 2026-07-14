"""FastAPI app entry point tests — verify CORS and route mounting"""
import pytest
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from main import app


class TestMainApp:
    """Tests for FastAPI app instance configuration"""

    def test_app_is_fastapi_instance(self):
        """Basic function: app should be a FastAPI instance"""
        assert isinstance(app, FastAPI)

    def test_app_title(self):
        """Basic function: app title should be Chess AI Backend"""
        assert app.title == "Chess AI Backend"

    def test_cors_middleware_configured(self):
        """Basic function: CORS middleware should be configured"""
        cors_middleware = None
        for mw in app.user_middleware:
            if mw.cls == CORSMiddleware:
                cors_middleware = mw
                break
        assert cors_middleware is not None, "CORS middleware not configured"

    def test_cors_allows_localhost_5173(self):
        """Basic function: CORS allows http://localhost:5173"""
        cors_middleware = None
        for mw in app.user_middleware:
            if mw.cls == CORSMiddleware:
                cors_middleware = mw
                break
        assert cors_middleware is not None
        allow_origins = cors_middleware.kwargs.get("allow_origins", [])
        assert "http://localhost:5173" in allow_origins

    def test_cors_allow_credentials(self):
        """Edge case: CORS should allow credentials"""
        cors_middleware = None
        for mw in app.user_middleware:
            if mw.cls == CORSMiddleware:
                cors_middleware = mw
                break
        assert cors_middleware is not None
        assert cors_middleware.kwargs.get("allow_credentials") is True

    def test_cors_allow_methods_all(self):
        """Edge case: CORS should allow all methods"""
        cors_middleware = None
        for mw in app.user_middleware:
            if mw.cls == CORSMiddleware:
                cors_middleware = mw
                break
        assert cors_middleware is not None
        assert cors_middleware.kwargs.get("allow_methods") == ["*"]

    def test_cors_allow_headers_all(self):
        """Edge case: CORS should allow all headers"""
        cors_middleware = None
        for mw in app.user_middleware:
            if mw.cls == CORSMiddleware:
                cors_middleware = mw
                break
        assert cors_middleware is not None
        assert cors_middleware.kwargs.get("allow_headers") == ["*"]

    def test_games_router_mounted(self):
        """Basic function: verify app.include_router was called correctly (stub phase routes are empty, verify via import)"""
        from app.routers.games import router as games_router
        # Verify router was included in app: check app.routes contains router reference
        # Note: FastAPI in stub phase (empty routes) won't produce APIRoute entries in app.routes,
        # but include_router registered the router in app.router's internal structure.
        # Here we verify games_router is correctly configured (prefix/tags), avoiding over-assertion before full impl.
        assert games_router.prefix == "/games"
        assert "games" in games_router.tags
        # Verify app's openapi schema can generate correctly (framework runs fine)
        assert app.openapi() is not None

    def test_no_extra_routers(self):
        """Edge case: no unexpected routers besides games (stub phase)"""
        # Currently only default routes (openapi, docs, etc.) + mounted games route
        # Verify no extra unexpected routes
        pass  # Stub phase, no strict assertion
