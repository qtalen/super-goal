"""Import tests — verify all modules can be correctly imported"""
import pytest


class TestImports:
    """Tests for all module imports (edge cases: empty modules, modules with dependencies)"""

    def test_import_app_init(self):
        """Edge case: empty __init__.py file should be importable"""
        import app  # noqa: F401

    def test_import_models(self):
        """Basic function: models module should import correctly"""
        from app.models import GameSession  # noqa: F811
        assert GameSession is not None

    def test_import_game_manager(self):
        """Basic function: game_manager module should import correctly"""
        from app.game_manager import GameManager  # noqa: F811
        assert GameManager is not None

    def test_import_ai_engine(self):
        """Basic function: ai_engine module should import correctly"""
        from app.ai_engine import select_move  # noqa: F811
        assert select_move is not None

    def test_import_routers_init(self):
        """Edge case: empty routers/__init__.py file should be importable"""
        import app.routers  # noqa: F401

    def test_import_routers_games(self):
        """Basic function: games router module should import correctly"""
        from app.routers.games import router  # noqa: F811
        assert router is not None

    def test_import_main(self):
        """Basic function: main module (FastAPI app entry) should import correctly"""
        from main import app  # noqa: F811
        assert app is not None
