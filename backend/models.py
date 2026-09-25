from datetime import datetime

from sqlalchemy import DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from database import Base


class Convocatoria(Base):
    __tablename__ = "convocatorias"

    nomenclatura_norm: Mapped[str] = mapped_column(String, primary_key=True)
    nomenclatura: Mapped[str | None] = mapped_column(String, nullable=True)
    entidad: Mapped[str | None] = mapped_column(String, nullable=True)
    objeto: Mapped[str | None] = mapped_column(String, nullable=True)
    descripcion: Mapped[str | None] = mapped_column(String, nullable=True)
    ficha_url: Mapped[str | None] = mapped_column(String, nullable=True)
    estado: Mapped[str | None] = mapped_column(String, nullable=True)
    fecha_publicacion: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    monto: Mapped[str | None] = mapped_column(String, nullable=True)
    etapa_seace: Mapped[str | None] = mapped_column(String, nullable=True)
    fecha_integracion: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    fecha_presentacion: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
