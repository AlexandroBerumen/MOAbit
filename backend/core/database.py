from typing import Generator

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from core.config import settings

connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}

engine = create_engine(settings.database_url, connect_args=connect_args)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def ensure_saved_protocols_column() -> None:
    if not settings.database_url.startswith("sqlite"):
        return

    inspector = inspect(engine)
    if "saved_hypotheses" not in inspector.get_table_names():
        return

    column_names = {column["name"] for column in inspector.get_columns("saved_hypotheses")}
    if "selected_protocols_json" in column_names:
        return

    with engine.begin() as connection:
        connection.execute(
            text('ALTER TABLE saved_hypotheses ADD COLUMN selected_protocols_json TEXT NOT NULL DEFAULT "[]"')
        )
