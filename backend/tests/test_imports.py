"""Import 测试 — 验证所有模块可正确导入"""
import pytest


class TestImports:
    """测试所有模块能否正常导入（边缘情况：空模块、有依赖的模块）"""

    def test_import_app_init(self):
        """边缘情况：空 __init__.py 文件应能导入"""
        import app  # noqa: F401

    def test_import_models(self):
        """基础功能：models 模块应能正常导入"""
        from app.models import GameSession  # noqa: F811
        assert GameSession is not None

    def test_import_game_manager(self):
        """基础功能：game_manager 模块应能正常导入"""
        from app.game_manager import GameManager  # noqa: F811
        assert GameManager is not None

    def test_import_ai_engine(self):
        """基础功能：ai_engine 模块应能正常导入"""
        from app.ai_engine import select_move  # noqa: F811
        assert select_move is not None

    def test_import_routers_init(self):
        """边缘情况：空 routers/__init__.py 文件应能导入"""
        import app.routers  # noqa: F401

    def test_import_routers_games(self):
        """基础功能：games 路由模块应能正常导入"""
        from app.routers.games import router  # noqa: F811
        assert router is not None

    def test_import_main(self):
        """基础功能：main 模块（FastAPI 应用入口）应能正常导入"""
        from main import app  # noqa: F811
        assert app is not None
