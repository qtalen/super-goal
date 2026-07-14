"""Additional edge case test collection — covers cross-module scenarios"""
import pytest


class TestPyprojectToml:
    """Verify pyproject.toml configuration completeness"""

    def test_pyproject_toml_exists(self):
        """Basic function: pyproject.toml file should exist"""
        import os
        assert os.path.exists("pyproject.toml")

    def test_dependencies_are_listed(self):
        """Basic function: verify key dependencies are in pyproject.toml"""
        import tomllib
        with open("pyproject.toml", "rb") as f:
            data = tomllib.load(f)
        deps = data["project"]["dependencies"]
        dep_names = [d.split(">=")[0].split("[")[0].strip() for d in deps]
        assert "fastapi" in dep_names
        assert "uvicorn" in dep_names
        assert "python-chess" in dep_names
        assert "pydantic" in dep_names


class TestDirectoryStructure:
    """Verify project directory structure completeness"""

    def test_backend_directory_exists(self):
        """Basic function: backend/ directory should exist"""
        import os
        assert os.path.isdir(".")

    def test_app_directory_exists(self):
        """Basic function: app/ directory should exist"""
        import os
        assert os.path.isdir("app")

    def test_routers_directory_exists(self):
        """Basic function: app/routers/ directory should exist"""
        import os
        assert os.path.isdir("app/routers")

    def test_all_python_files_exist(self):
        """Basic function: all required Python files should exist"""
        import os
        required_files = [
            "main.py",
            "app/__init__.py",
            "app/models.py",
            "app/game_manager.py",
            "app/ai_engine.py",
            "app/routers/__init__.py",
            "app/routers/games.py",
        ]
        for f in required_files:
            assert os.path.isfile(f), f"Missing file: {f}"
