from fastapi import APIRouter, Depends

from app.controllers.auth_controller import get_me, google_auth, login, register, update_api_key
from app.middleware.auth import auth_middleware

router = APIRouter(prefix="/api/auth")

router.add_api_route("/register", register, methods=["POST"])
router.add_api_route("/login", login, methods=["POST"])
router.add_api_route("/google", google_auth, methods=["POST"])
router.add_api_route("/me", get_me, methods=["GET"], dependencies=[Depends(auth_middleware)])
router.add_api_route("/api-key", update_api_key, methods=["PATCH"], dependencies=[Depends(auth_middleware)])
