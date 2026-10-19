"""Read-only readiness check. Never executes DDL or prints credentials/customer records."""
import argparse
import asyncio
import json
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from dotenv import dotenv_values
import httpx
from backend.repository import SupabaseRepository, StorageUnavailable, AccessDenied

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--env-file', type=Path, default=ROOT / 'backend/.env')
parser.add_argument('--portal-env', action='store_true', help='Use the existing portal env for a read-only schema check')
args = parser.parse_args()
file = ROOT.parent / 'interfaz_licitigo/backend/.env' if args.portal_env else args.env_file
values = dotenv_values(file)
url = values.get('CRM_SUPABASE_URL') or values.get('SUPABASE_URL')
key = values.get('CRM_SUPABASE_SECRET_KEY') or values.get('SUPABASE_SECRET_KEY')
workspace = values.get('CRM_WORKSPACE_ID')
if not url or not key:
    parser.exit(2, 'Falta URL/clave de servidor en el archivo indicado. No se han realizado cambios.\n')
headers = {'apikey': key, 'Accept': 'application/openapi+json'}
if key.startswith('eyJ'):
    headers['Authorization'] = 'Bearer ' + key
try:
    response = httpx.get(url.rstrip('/')+'/rest/v1/', headers=headers, timeout=30)
    response.raise_for_status()
    paths = response.json().get('paths', {})
    required = ['licihub_crm_estado', 'licihub_crm_miembro', 'licihub_crm_guardar']
    missing = [name for name in required if '/rpc/'+name not in paths]
    report = {'project': url, 'connection': 'ok', 'missing_rpcs': missing, 'workspace_configured': bool(workspace)}
    if not missing and workspace:
        repo = SupabaseRepository(url, key, workspace)
        snapshot = asyncio.run(repo.load())
        report['workspace'] = {'revision': snapshot['revision'], 'counts': {k: len(v) for k,v in snapshot['data'].items() if k != 'receipts'}}
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if missing or not workspace:
        parser.exit(1, 'Preparación incompleta: revisa docs/SUPABASE_RELACIONAL.md. No se han realizado cambios.\n')
except (httpx.HTTPError, ValueError, StorageUnavailable, AccessDenied):
    parser.exit(2, 'No se pudo verificar Supabase. Revisa conexión, migraciones, espacio y credenciales locales. No se muestran secretos.\n')
