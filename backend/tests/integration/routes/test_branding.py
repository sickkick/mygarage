"""Integration tests for instance branding endpoints."""

from io import BytesIO

import pytest
from httpx import AsyncClient
from PIL import Image
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.settings import Setting


def _png_bytes(size: int = 64) -> bytes:
    buf = BytesIO()
    Image.new("RGB", (size, size), color=(20, 80, 160)).save(buf, format="PNG")
    return buf.getvalue()


@pytest.mark.integration
@pytest.mark.asyncio
async def test_public_settings_include_branding_keys(
    client: AsyncClient, db_session: AsyncSession
):
    for key, value in (
        ("app_name", "MyGarage"),
        ("custom_logo", "false"),
        ("custom_favicon", "false"),
        ("auth_mode", "none"),
    ):
        result = await db_session.execute(select(Setting).where(Setting.key == key))
        existing = result.scalar_one_or_none()
        if existing:
            existing.value = value
        else:
            db_session.add(Setting(key=key, value=value, category="general"))
    await db_session.commit()

    response = await client.get("/api/settings/public")
    assert response.status_code == 200
    keys = {s["key"] for s in response.json()["settings"]}
    assert keys == {"auth_mode", "app_name", "custom_logo", "custom_favicon"}
    assert "theme" not in keys


@pytest.mark.integration
@pytest.mark.asyncio
async def test_logo_upload_get_delete(
    client: AsyncClient,
    auth_headers: dict,
    db_session: AsyncSession,
):
    missing = await client.get("/api/branding/logo")
    assert missing.status_code == 404

    upload = await client.post(
        "/api/branding/logo",
        headers=auth_headers,
        files={"file": ("logo.png", _png_bytes(), "image/png")},
    )
    assert upload.status_code == 201

    served = await client.get("/api/branding/logo")
    assert served.status_code == 200
    assert served.headers["content-type"].startswith("image/")

    result = await db_session.execute(select(Setting).where(Setting.key == "custom_logo"))
    flag = result.scalar_one()
    assert flag.value == "true"

    deleted = await client.delete("/api/branding/logo", headers=auth_headers)
    assert deleted.status_code == 200
    assert (await client.get("/api/branding/logo")).status_code == 404


@pytest.mark.integration
@pytest.mark.asyncio
async def test_favicon_upload_generates_pwa_icons(
    client: AsyncClient,
    auth_headers: dict,
):
    upload = await client.post(
        "/api/branding/favicon",
        headers=auth_headers,
        files={"file": ("icon.png", _png_bytes(128), "image/png")},
    )
    assert upload.status_code == 201
    assert (settings.branding_dir / "icon-192.png").is_file()
    assert (settings.branding_dir / "icon-512.png").is_file()

    served = await client.get("/api/branding/favicon")
    assert served.status_code == 200
