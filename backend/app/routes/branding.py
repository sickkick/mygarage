"""Instance branding API (logo, favicon)."""

import logging

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.services.auth import get_current_admin_user
from app.services.branding_service import BrandingService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/branding", tags=["Branding"])


@router.get("/logo")
async def get_logo():
    """Serve the custom logo (public; used on login before auth)."""
    path = BrandingService.find_logo_path()
    if path is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No custom logo")
    return FileResponse(
        path,
        media_type=BrandingService.media_type_for(path),
        headers={"Cache-Control": "no-cache"},
    )


@router.get("/favicon")
async def get_favicon():
    """Serve the custom favicon (public)."""
    path = BrandingService.find_favicon_path()
    if path is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No custom favicon")
    return FileResponse(
        path,
        media_type=BrandingService.media_type_for(path),
        headers={"Cache-Control": "no-cache"},
    )


@router.post("/logo", status_code=201)
async def upload_logo(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    _admin: User | None = Depends(get_current_admin_user),
):
    """Upload a custom logo (admin only)."""
    path = await BrandingService.upload_logo(db, file)
    return {"ok": True, "filename": path.name, "url": "/api/branding/logo"}


@router.post("/favicon", status_code=201)
async def upload_favicon(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    _admin: User | None = Depends(get_current_admin_user),
):
    """Upload a custom favicon (admin only). Generates 192/512 PWA icons when possible."""
    path = await BrandingService.upload_favicon(db, file)
    return {"ok": True, "filename": path.name, "url": "/api/branding/favicon"}


@router.delete("/logo")
async def delete_logo(
    db: AsyncSession = Depends(get_db),
    _admin: User | None = Depends(get_current_admin_user),
):
    """Remove the custom logo and restore the default mark."""
    await BrandingService.delete_logo(db)
    return {"ok": True}


@router.delete("/favicon")
async def delete_favicon(
    db: AsyncSession = Depends(get_db),
    _admin: User | None = Depends(get_current_admin_user),
):
    """Remove the custom favicon and restore default PWA icons."""
    await BrandingService.delete_favicon(db)
    return {"ok": True}
