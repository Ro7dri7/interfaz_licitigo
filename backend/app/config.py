from functools import lru_cache
from pathlib import Path
from urllib.parse import urlparse

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BACKEND_DIR / ".env", env_file_encoding="utf-8", extra="ignore")

    # Supabase (service role: el backend es el único que escribe; el navegador nunca ve esta clave)
    supabase_url: str
    supabase_secret_key: str

    # API MIGO (https://api.migo.pe) — ficha SUNAT en tiempo real por RUC
    apimigo_token: str
    apimigo_base_url: str = "https://api.migo.pe/api/v2"

    # Telegram (token de @BotFather). Vacío = el bot y el endpoint de suscripción quedan deshabilitados.
    telegram_bot_token: str = ""
    alert_interval_min: int = 10
    alert_max_por_envio: int = 5

    # Webhook del flujo n8n "Analizador ISO Licitaciones" (bases + ISO + recomendación con IA).
    # Vacío = el desbloqueo igual muestra las bases, pero sin análisis de IA.
    n8n_webhook_url: str = ""
    n8n_timeout_sec: int = 300

    # Segundos que se cachean en memoria las sugerencias de keywords por CIIU
    cache_ttl_sec: int = 300

    cors_origins: str = "http://localhost:5173"

    crm_api_url: str = ""
    crm_ingest_key: str = ""
    crm_outbox_file: Path = BACKEND_DIR / 'data' / 'asesorias.sqlite3'

    @field_validator('crm_api_url')
    @classmethod
    def crm_url_segura(cls, value: str) -> str:
        if not value:
            return value
        url = urlparse(value)
        if (not url.hostname or url.username or url.password or url.query or url.fragment
                or url.path not in ('', '/') or not (url.scheme == 'https' or
                    (url.scheme == 'http' and url.hostname in ('127.0.0.1', 'localhost', '::1')))):
            raise ValueError('CRM_API_URL debe ser un origen HTTPS, o HTTP local, sin credenciales ni parámetros.')
        return value.rstrip('/')


@lru_cache
def get_settings() -> Settings:
    return Settings()
