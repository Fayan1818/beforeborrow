from sqlalchemy.orm import DeclarativeBase

class Base(DeclarativeBase):
    pass

from app.models import identity, finance, decisions  # noqa: F401, E402
