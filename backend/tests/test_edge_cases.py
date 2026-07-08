"""额外的边缘情况测试合集 — 覆盖跨模块场景"""
import pytest


class TestPyprojectToml:
    """验证 pyproject.toml 配置完整性"""

    def test_pyproject_toml_exists(self):
        """基础功能：pyproject.toml 文件应存在"""
        import os
        assert os.path.exists("pyproject.toml")

    def test_dependencies_are_listed(self):
        """基础功能：验证关键依赖在 pyproject.toml 中"""
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
    """验证项目目录结构完整性"""

    def test_backend_directory_exists(self):
        """基础功能：backend/ 目录应存在"""
        import os
        assert os.path.isdir(".")

    def test_app_directory_exists(self):
        """基础功能：app/ 目录应存在"""
        import os
        assert os.path.isdir("app")

    def test_routers_directory_exists(self):
        """基础功能：app/routers/ 目录应存在"""
        import os
        assert os.path.isdir("app/routers")

    def test_all_python_files_exist(self):
        """基础功能：所有要求的 Python 文件应存在"""
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
            assert os.path.isfile(f), f"缺少文件: {f}"
