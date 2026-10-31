import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from pwdlib import PasswordHash
from pwdlib.hashers.argon2 import Argon2Hasher

_hasher = PasswordHash([Argon2Hasher()])

def hash_password(plain: str) -> str:
    return _hasher.hash(plain)

def verify_password(plain: str, hashed: str) -> bool:
    return _hasher.verify(plain, hashed)

def generate_session_token() -> str:
    return secrets.token_urlsafe(32)

def hash_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode()).hexdigest()

def token_expiry(ttl_seconds: int) -> datetime:
    return datetime.now(timezone.utc) + timedelta(seconds=ttl_seconds)

def generate_csrf_token() -> str:
    return secrets.token_urlsafe(24)
