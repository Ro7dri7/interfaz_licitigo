"""Enlaza dos instalaciones locales sin mostrar claves ni sustituir la configuración de Supabase."""
import argparse
from pathlib import Path
import secrets
from urllib.parse import urlparse

from dotenv import dotenv_values, set_key

from .config import BACKEND_DIR, Settings


def configurar(portal: Path, crm: Path) -> None:
    portal,crm=portal.resolve(),crm.resolve()
    portal_env,crm_env=portal/'backend/.env',crm/'backend/.env'
    if (portal == crm or not (portal/'backend/app/config.py').is_file() or not (crm/'backend/main.py').is_file()
            or not portal_env.is_file() or not crm_env.is_file()):
        raise ValueError('Indica las carpetas del portal y del CRM, ambas con su backend/.env existente. No se modificó la configuración.')
    p,c=dotenv_values(portal_env),dotenv_values(crm_env)
    api_url=Settings.crm_url_segura(p.get('CRM_API_URL') or 'http://127.0.0.1:8001')
    if urlparse(api_url).hostname not in ('127.0.0.1','localhost','::1'):
        raise ValueError('La herramienta enlaza proyectos locales. Configura por separado la clave del servidor remoto.')
    key=c.get('CRM_INGEST_KEY') or p.get('CRM_INGEST_KEY') or secrets.token_urlsafe(32)
    previous={path:path.read_text(encoding='utf-8') for path in [portal_env,crm_env]}
    try:
        set_key(crm_env,'CRM_INGEST_KEY',key)
        set_key(portal_env,'CRM_INGEST_KEY',key)
        set_key(portal_env,'CRM_API_URL',api_url)
    except OSError:
        for path,text in previous.items():
            path.write_text(text,encoding='utf-8')
        raise


if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--crm',default=BACKEND_DIR.parent.parent / 'crm',type=Path,help='Carpeta raíz del CRM; por defecto usa crm/ del mismo repositorio.')
    args=parser.parse_args()
    try:
        configurar(BACKEND_DIR.parent,args.crm)
    except (ValueError,OSError):
        parser.exit(1,'No se pudo enlazar la configuración. Revisa la ruta del CRM y los permisos de sus archivos .env. No se muestran claves.\n')
    print('Configuración enlazada. Reinicia la API del CRM, la API del portal y el bot. Las claves permanecen privadas.')
