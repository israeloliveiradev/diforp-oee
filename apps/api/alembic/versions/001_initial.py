"""schema inicial — create_all equivalente

Revision ID: 001_initial
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import text

revision = "001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
    from oee.infrastructure.db.models import Base

    bind = op.get_bind()
    Base.metadata.create_all(bind=bind)
    try:
        op.execute(
            text(
                "CREATE INDEX IF NOT EXISTS chunks_embedding_hnsw "
                "ON chunks_manual USING hnsw (embedding vector_cosine_ops)"
            )
        )
    except Exception:
        pass


def downgrade() -> None:
    pass
