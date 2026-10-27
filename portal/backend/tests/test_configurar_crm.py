from pathlib import Path
import tempfile
import unittest

from dotenv import dotenv_values
from app.configurar_crm import configurar


class ConfigurarCRMTests(unittest.TestCase):
    def test_connects_both_envs_and_preserves_other_secrets_and_existing_key(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            portal,crm = root/'portal',root/'crm'
            for file in [portal/'backend/app/config.py',crm/'backend/main.py']:
                file.parent.mkdir(parents=True,exist_ok=True)
                file.write_text('# fixture',encoding='utf-8')
            (portal/'backend/.env').write_text('SUPABASE_SECRET_KEY=private-portal\nCRM_INGEST_KEY=existing-portal-key\n',encoding='utf-8')
            (crm/'backend/.env').write_text('CRM_SUPABASE_SECRET_KEY=private-crm\nCRM_INGEST_KEY=\n',encoding='utf-8')
            configurar(portal,crm)
            p,c=dotenv_values(portal/'backend/.env'),dotenv_values(crm/'backend/.env')
            self.assertEqual(p['CRM_INGEST_KEY'],c['CRM_INGEST_KEY'])
            self.assertEqual(c['CRM_INGEST_KEY'],'existing-portal-key')
            self.assertEqual(p['SUPABASE_SECRET_KEY'],'private-portal')
            self.assertEqual(c['CRM_SUPABASE_SECRET_KEY'],'private-crm')
            self.assertEqual(p['CRM_API_URL'],'http://127.0.0.1:8001')
            configurar(portal,crm)
            self.assertEqual(dotenv_values(crm/'backend/.env')['CRM_INGEST_KEY'],c['CRM_INGEST_KEY'])
            original_portal=(portal/'backend/.env').read_text(encoding='utf-8')
            (portal/'backend/.env').write_text(original_portal.replace('http://127.0.0.1:8001','https://crm.example.com'),encoding='utf-8')
            remote_portal=(portal/'backend/.env').read_text(encoding='utf-8')
            with self.assertRaises(ValueError):
                configurar(portal,crm)
            self.assertEqual((portal/'backend/.env').read_text(encoding='utf-8'),remote_portal)

    def test_invalid_target_does_not_change_portal(self):
        with tempfile.TemporaryDirectory() as tmp:
            portal=Path(tmp)/'portal'
            (portal/'backend').mkdir(parents=True)
            file=portal/'backend/.env'
            file.write_text('SUPABASE_SECRET_KEY=original\n',encoding='utf-8')
            with self.assertRaises(ValueError):
                configurar(portal,Path(tmp)/'unknown')
            self.assertEqual(file.read_text(encoding='utf-8'),'SUPABASE_SECRET_KEY=original\n')
