"""Instance branding assets (logo, favicon, PWA icons) and display name helpers."""

from __future__ import annotations

import asyncio
import logging
import re
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path

from fastapi import HTTPException, UploadFile, status
from PIL import Image, UnidentifiedImageError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.services.settings_service import SettingsService
from app.utils.file_validation import validate_file_magic_bytes
from app.utils.path_validation import validate_path_within_base

logger = logging.getLogger(__name__)

DEFAULT_APP_NAME = "MyGarage"
MAX_BRANDING_BYTES = 2 * 1024 * 1024  # 2 MB

LOGO_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".svg"}
LOGO_MIMES = {
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/svg+xml",
}

FAVICON_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".ico"}
FAVICON_MIMES = {
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/x-icon",
    "image/vnd.microsoft.icon",
}

ICON_192_NAME = "icon-192.png"
ICON_512_NAME = "icon-512.png"

_MIME_BY_EXT = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
}


@dataclass(frozen=True)
class PdfBranding:
    """Branding values for PDF header/footer rendering."""

    app_name: str
    logo_path: Path | None


class BrandingService:
    """Manage custom instance branding files under branding_dir."""

    @staticmethod
    def branding_dir() -> Path:
        path = settings.branding_dir
        path.mkdir(parents=True, exist_ok=True)
        return path

    @staticmethod
    def find_logo_path() -> Path | None:
        return BrandingService._find_stem("logo", LOGO_EXTENSIONS)

    @staticmethod
    def find_favicon_path() -> Path | None:
        original = BrandingService._find_stem("favicon", FAVICON_EXTENSIONS)
        if original:
            return original
        for name in (ICON_512_NAME, ICON_192_NAME):
            candidate = BrandingService.branding_dir() / name
            if candidate.is_file():
                return candidate
        return None

    @staticmethod
    def find_icon_path(size: int) -> Path | None:
        name = ICON_192_NAME if size == 192 else ICON_512_NAME if size == 512 else None
        if not name:
            return None
        candidate = BrandingService.branding_dir() / name
        return candidate if candidate.is_file() else None

    @staticmethod
    def media_type_for(path: Path) -> str:
        return _MIME_BY_EXT.get(path.suffix.lower(), "application/octet-stream")

    @staticmethod
    def _find_stem(stem: str, extensions: set[str]) -> Path | None:
        base = BrandingService.branding_dir()
        for ext in sorted(extensions):
            candidate = base / f"{stem}{ext}"
            if candidate.is_file():
                return candidate
        return None

    @staticmethod
    def _clear_stem(stem: str, extensions: set[str]) -> None:
        base = BrandingService.branding_dir()
        for ext in extensions:
            path = base / f"{stem}{ext}"
            if path.is_file():
                path.unlink()

    @staticmethod
    async def get_app_name(db: AsyncSession) -> str:
        setting = await SettingsService.get(db, "app_name")
        if setting and setting.value and setting.value.strip():
            return setting.value.strip()
        return settings.app_name or DEFAULT_APP_NAME

    @staticmethod
    async def get_pdf_branding(db: AsyncSession) -> PdfBranding:
        app_name = await BrandingService.get_app_name(db)
        logo = BrandingService.find_logo_path()
        # ReportLab cannot draw SVG; fall back to MG tile for vector logos
        if logo and logo.suffix.lower() == ".svg":
            logo = None
        return PdfBranding(app_name=app_name, logo_path=logo)

    @staticmethod
    async def set_flag(db: AsyncSession, key: str, enabled: bool) -> None:
        await SettingsService.set(
            db,
            key,
            "true" if enabled else "false",
            category="general",
        )

    @staticmethod
    async def sync_flags_from_disk(db: AsyncSession) -> None:
        await BrandingService.set_flag(db, "custom_logo", BrandingService.find_logo_path() is not None)
        has_favicon = (
            BrandingService.find_favicon_path() is not None
            or BrandingService.find_icon_path(192) is not None
            or BrandingService.find_icon_path(512) is not None
        )
        await BrandingService.set_flag(db, "custom_favicon", has_favicon)

    @staticmethod
    async def upload_logo(db: AsyncSession, file: UploadFile) -> Path:
        contents, ext = await BrandingService._validate_upload(
            file,
            allowed_extensions=LOGO_EXTENSIONS,
            allowed_mimes=LOGO_MIMES,
            allow_svg=True,
        )
        BrandingService._clear_stem("logo", LOGO_EXTENSIONS)
        dest = BrandingService.branding_dir() / f"logo{ext}"
        validate_path_within_base(dest, settings.branding_dir, raise_error=True)
        await asyncio.to_thread(dest.write_bytes, contents)
        await BrandingService.set_flag(db, "custom_logo", True)
        await db.commit()
        logger.info("Saved custom logo: %s", dest)
        return dest

    @staticmethod
    async def upload_favicon(db: AsyncSession, file: UploadFile) -> Path:
        contents, ext = await BrandingService._validate_upload(
            file,
            allowed_extensions=FAVICON_EXTENSIONS,
            allowed_mimes=FAVICON_MIMES,
            allow_svg=False,
        )
        BrandingService._clear_stem("favicon", FAVICON_EXTENSIONS)
        # Remove prior generated PWA icons
        for name in (ICON_192_NAME, ICON_512_NAME):
            path = BrandingService.branding_dir() / name
            if path.is_file():
                path.unlink()

        dest = BrandingService.branding_dir() / f"favicon{ext}"
        validate_path_within_base(dest, settings.branding_dir, raise_error=True)
        await asyncio.to_thread(dest.write_bytes, contents)

        # Generate PWA PNG icons when the source is a raster image
        if ext != ".ico":
            await asyncio.to_thread(BrandingService._write_pwa_icons, contents)
        else:
            # Try decoding ICO via Pillow; if it fails, skip PWA icons
            try:
                await asyncio.to_thread(BrandingService._write_pwa_icons, contents)
            except (UnidentifiedImageError, OSError) as exc:
                logger.warning("Could not generate PWA icons from ICO: %s", exc)

        await BrandingService.set_flag(db, "custom_favicon", True)
        await db.commit()
        logger.info("Saved custom favicon: %s", dest)
        return dest

    @staticmethod
    async def delete_logo(db: AsyncSession) -> None:
        BrandingService._clear_stem("logo", LOGO_EXTENSIONS)
        await BrandingService.set_flag(db, "custom_logo", False)
        await db.commit()

    @staticmethod
    async def delete_favicon(db: AsyncSession) -> None:
        BrandingService._clear_stem("favicon", FAVICON_EXTENSIONS)
        for name in (ICON_192_NAME, ICON_512_NAME):
            path = BrandingService.branding_dir() / name
            if path.is_file():
                path.unlink()
        await BrandingService.set_flag(db, "custom_favicon", False)
        await db.commit()

    @staticmethod
    def _write_pwa_icons(contents: bytes) -> None:
        base = BrandingService.branding_dir()
        with Image.open(BytesIO(contents)) as img:
            rgba = img.convert("RGBA")
            for size, name in ((192, ICON_192_NAME), (512, ICON_512_NAME)):
                resized = rgba.resize((size, size), Image.Resampling.LANCZOS)
                out = base / name
                validate_path_within_base(out, settings.branding_dir, raise_error=True)
                resized.save(out, format="PNG")

    @staticmethod
    async def _validate_upload(
        file: UploadFile,
        *,
        allowed_extensions: set[str],
        allowed_mimes: set[str],
        allow_svg: bool,
    ) -> tuple[bytes, str]:
        if not file.filename:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Filename required")

        ext = Path(file.filename).suffix.lower()
        if ext not in allowed_extensions:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid file extension. Allowed: {', '.join(sorted(allowed_extensions))}",
            )

        content_type = (file.content_type or "").lower()
        if content_type not in allowed_mimes:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid file type. Allowed: {', '.join(sorted(allowed_mimes))}",
            )

        file.file.seek(0, 2)
        size = file.file.tell()
        file.file.seek(0)
        if size > MAX_BRANDING_BYTES:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail="File size exceeds maximum of 2.0MB",
            )

        contents = await file.read()
        if not contents:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File is empty")

        if allow_svg and ext == ".svg":
            text = contents.decode("utf-8", errors="ignore").lstrip()
            if not (text.startswith("<?xml") or text.startswith("<svg") or text.startswith("<!DOCTYPE svg")):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid SVG content",
                )
            # Basic script injection guard
            if re.search(r"<script", text, re.IGNORECASE):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="SVG must not contain scripts",
                )
            return contents, ext

        if ext == ".ico":
            # ICO: 00 00 01 00 or PNG-in-ICO
            if not (contents.startswith(b"\x00\x00\x01\x00") or contents.startswith(b"\x89PNG")):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid ICO content",
                )
            return contents, ext

        ok, err = validate_file_magic_bytes(contents, file.filename, content_type, strict=True)
        if not ok:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=err or "File content does not match declared type",
            )

        return contents, ext
