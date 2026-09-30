from functools import lru_cache
from pathlib import Path

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


@lru_cache
def get_settings() -> Settings:
    return Settings()
