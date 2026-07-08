import pytest
from httpx import AsyncClient, ASGITransport
from main import app


@pytest.fixture
async def async_client():
    """提供 httpx AsyncClient 用于测试 FastAPI 端点"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client
