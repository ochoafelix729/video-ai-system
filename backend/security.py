from dataclasses import dataclass

import jwt
from fastapi import Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient

from backend.config import Settings, get_settings


bearer_scheme = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class AuthenticatedUser:
    user_id: str


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    x_dev_user_id: str | None = Header(default=None),
    settings: Settings = Depends(get_settings),
) -> AuthenticatedUser:
    if settings.auth_disabled:
        return AuthenticatedUser(x_dev_user_id or settings.dev_user_id)

    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Bearer token required")
    if not settings.cognito_user_pool_id or not settings.cognito_app_client_id:
        raise HTTPException(status_code=500, detail="Cognito authentication is not configured")

    try:
        jwks_client = PyJWKClient(f"{settings.cognito_issuer}/.well-known/jwks.json")
        signing_key = jwks_client.get_signing_key_from_jwt(credentials.credentials)
        claims = jwt.decode(
            credentials.credentials,
            signing_key.key,
            algorithms=["RS256"],
            issuer=settings.cognito_issuer,
            options={"verify_aud": False},
        )
        if claims.get("client_id") != settings.cognito_app_client_id:
            raise jwt.InvalidAudienceError("Unexpected Cognito app client")
        subject = claims.get("sub")
        if not isinstance(subject, str) or not subject:
            raise jwt.InvalidTokenError("Token has no subject")
    except jwt.PyJWTError as error:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token") from error

    return AuthenticatedUser(subject)
