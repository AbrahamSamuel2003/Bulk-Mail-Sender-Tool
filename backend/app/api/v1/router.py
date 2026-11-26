from fastapi import APIRouter

from app.api.v1 import (
    auth,
    campaigns,
    dashboard,
    emails,
    health,
    history,
    imports,
    leads,
    replies,
    sending,
    settings,
    suppression,
)

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(dashboard.router)
api_router.include_router(campaigns.router)
api_router.include_router(imports.router)
api_router.include_router(leads.router)
api_router.include_router(emails.router)
api_router.include_router(history.router)
api_router.include_router(replies.router)
api_router.include_router(sending.router)
api_router.include_router(suppression.router)
api_router.include_router(settings.router)
