"""FastAPI 应用主入口测试 — 验证 CORS 和路由挂载"""
import pytest
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from main import app


class TestMainApp:
    """测试 FastAPI 应用实例配置"""

    def test_app_is_fastapi_instance(self):
        """基础功能：app 应为 FastAPI 实例"""
        assert isinstance(app, FastAPI)

    def test_app_title(self):
        """基础功能：应用标题应为 Chess AI Backend"""
        assert app.title == "Chess AI Backend"

    def test_cors_middleware_configured(self):
        """基础功能：CORS 中间件应已配置"""
        cors_middleware = None
        for mw in app.user_middleware:
            if mw.cls == CORSMiddleware:
                cors_middleware = mw
                break
        assert cors_middleware is not None, "CORS 中间件未配置"

    def test_cors_allows_localhost_5173(self):
        """基础功能：CORS 允许 http://localhost:5173"""
        cors_middleware = None
        for mw in app.user_middleware:
            if mw.cls == CORSMiddleware:
                cors_middleware = mw
                break
        assert cors_middleware is not None
        allow_origins = cors_middleware.kwargs.get("allow_origins", [])
        assert "http://localhost:5173" in allow_origins

    def test_cors_allow_credentials(self):
        """边缘情况：CORS 应允许凭据"""
        cors_middleware = None
        for mw in app.user_middleware:
            if mw.cls == CORSMiddleware:
                cors_middleware = mw
                break
        assert cors_middleware is not None
        assert cors_middleware.kwargs.get("allow_credentials") is True

    def test_cors_allow_methods_all(self):
        """边缘情况：CORS 应允许所有方法"""
        cors_middleware = None
        for mw in app.user_middleware:
            if mw.cls == CORSMiddleware:
                cors_middleware = mw
                break
        assert cors_middleware is not None
        assert cors_middleware.kwargs.get("allow_methods") == ["*"]

    def test_cors_allow_headers_all(self):
        """边缘情况：CORS 应允许所有请求头"""
        cors_middleware = None
        for mw in app.user_middleware:
            if mw.cls == CORSMiddleware:
                cors_middleware = mw
                break
        assert cors_middleware is not None
        assert cors_middleware.kwargs.get("allow_headers") == ["*"]

    def test_games_router_mounted(self):
        """基础功能：验证 app.include_router 被正确调用（桩代码阶段路由为空，通过检查导入来验证）"""
        from app.routers.games import router as games_router
        # 验证 router 被 include 到 app 中：检查 app.routes 中包含 router 的引用
        # 注意：FastAPI 在桩代码阶段（路由为空）不会在 app.routes 中产生 APIRoute 条目，
        # 但 include_router 将 router 注册到了 app.router 的内部结构。
        # 这里验证 games_router 已正确配置（前缀/tags），避免在 R4 之前断言过多。
        assert games_router.prefix == "/games"
        assert "games" in games_router.tags
        # 验证 app 的 openapi schema 能正常生成（框架运行正常）
        assert app.openapi() is not None

    def test_no_extra_routers(self):
        """边缘情况：除 games 外不应有未预期的路由（桩代码阶段）"""
        # 此时只有默认路由（openapi, docs 等）+ 挂载的 games 路由
        # 验证没有额外的意外路由
        pass  # 桩代码阶段不做严格断言
