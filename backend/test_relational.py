import asyncio
from contextlib import closing
from copy import deepcopy
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

from backend.domain import apply_command, empty_state
from backend.relational import RelationalRepository, sqlite_schema
from backend.repository import Conflict, StorageUnavailable
from backend.seed import demo_state


class RelationalStorageTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = Path(self.tmp.name) / 'crm.sqlite3'
        self.repo = RelationalRepository(self.path, empty_state())

    def tearDown(self):
        self.tmp.cleanup()

    def load(self):
        return asyncio.run(self.repo.load())

    def command(self, operation, payload):
        before = self.load()
        data = apply_command(before['data'], operation, payload, 'Asesor', str(before['revision']))
        return asyncio.run(self.repo.save(data, before['revision'], before=before))

    def intake(self):
        return self.command('intake', {'company': 'Empresa relacional', 'ruc': '20995544332', 'service': 'ISO 9001', 'kind': 'quote'})

    def test_persists_typed_rows_and_foreign_keys_instead_of_workspace_document(self):
        snapshot = self.intake()
        with closing(sqlite3.connect(self.path)) as db:
            columns = [row[1] for row in db.execute('pragma table_info(workspaces)')]
            self.assertNotIn('data', columns)
            self.assertEqual(db.execute('select count(*) from companies').fetchone()[0], 1)
            self.assertEqual(db.execute('select company_id from deals').fetchone()[0], snapshot['data']['companies'][0]['id'])
        restarted = RelationalRepository(self.path, empty_state())
        self.assertEqual(asyncio.run(restarted.load()), snapshot)

    def test_quotes_have_header_and_frozen_line_and_completion_updates_only_task(self):
        self.intake()
        self.command('product', {'name': 'ISO 9001', 'price': '100.05'})
        data = self.load()['data']
        self.command('quote', {'dealId': data['deals'][0]['id'], 'productId': data['products'][0]['id'], 'quantity': 3,
                               'discount': '10', 'tax': '18', 'validUntil': '2027-12-31'})
        with closing(sqlite3.connect(self.path)) as db:
            self.assertEqual(db.execute('select total from quotes').fetchone()[0], 31875)
            self.assertEqual(db.execute('select unit_price,quantity from quote_items').fetchone(), (10005, 3))
            db.executescript("create trigger detect_company_write before update on companies begin select raise(abort,'Unrelated write'); end;")
        self.command('complete_task', {'taskId': data['tasks'][0]['id']})
        self.assertTrue(self.load()['data']['tasks'][0]['done'])

    def test_conflict_does_not_overwrite_and_failed_fk_rolls_back_entire_change(self):
        before = self.intake()
        changed = deepcopy(before['data'])
        changed['companies'][0]['name'] = 'Must roll back'
        changed['tasks'][0]['dealId'] = 'missing-business'
        changed['receipts'].append({'id': 'rollback', 'digest': 'a' * 64})
        with self.assertRaises(StorageUnavailable):
            asyncio.run(self.repo.save(changed, before['revision'], before=before))
        self.assertEqual(self.load(), before)
        with self.assertRaises(Conflict):
            asyncio.run(self.repo.save(before['data'], 0, before=before))

    def test_imports_legacy_json_once_without_modifying_original(self):
        source = Path(self.tmp.name) / 'legacy.json'
        seed = {'revision': 42, 'data': demo_state()}
        source.write_text(json.dumps(seed), encoding='utf-8')
        original = source.read_bytes()
        migrated = RelationalRepository(Path(self.tmp.name) / 'migrated.sqlite3', empty_state(), legacy_path=source)
        snapshot = asyncio.run(migrated.load())
        self.assertEqual(snapshot['revision'], 42)
        for collection in seed['data']:
            self.assertEqual(len(snapshot['data'][collection]), len(seed['data'][collection]))
        self.assertEqual(snapshot['data'], seed['data'])
        self.assertEqual(source.read_bytes(), original)
        RelationalRepository(migrated.path, empty_state(), legacy_path=source)
        self.assertEqual(asyncio.run(migrated.load()), snapshot)

    def test_invalid_legacy_source_is_never_silently_reset(self):
        source = Path(self.tmp.name) / 'broken.json'
        source.write_text('{broken', encoding='utf-8')
        with self.assertRaises(StorageUnavailable):
            RelationalRepository(Path(self.tmp.name) / 'bad.sqlite3', demo_state(), legacy_path=source)
        self.assertEqual(source.read_text(), '{broken')

    def test_multiple_inclusive_items_and_status_events_survive_restart(self):
        self.intake()
        self.command('product', {'name': 'ISO 9001', 'price': '100.05'})
        self.command('product', {'name': 'Pack ISO', 'price': '200.10'})
        data = self.load()['data']
        state = self.command('quote', {'dealId': data['deals'][0]['id'], 'items': [
            {'productId': p['id'], 'quantity': 1} for p in data['products']], 'tax': '18',
            'taxIncluded': True, 'validUntil': '2099-12-31', 'terms': 'Pago según propuesta.'})
        quote_id = state['data']['quotes'][0]['id']
        self.command('quote_status', {'quoteId': quote_id, 'status': 'sent', 'recipient': 'Ana', 'note': 'Correo enviado.'})
        saved = self.command('quote_status', {'quoteId': quote_id, 'status': 'accepted', 'recipient': 'Ana', 'note': 'Correo de aceptación.'})
        restarted = RelationalRepository(self.path, empty_state())
        self.assertEqual(asyncio.run(restarted.load()), saved)
        q = saved['data']['quotes'][0]
        self.assertEqual(q['total'], 30015)
        self.assertEqual(q['taxAmount'], 4579)
        self.assertEqual(q['status'], 'accepted')
        self.assertEqual(len(q['items']), 2)
        with closing(sqlite3.connect(self.path)) as db:
            self.assertEqual(db.execute('select count(*) from quote_events').fetchone()[0], 2)
            with self.assertRaises(sqlite3.IntegrityError):
                db.execute("update quote_events set note='Cambio'")

    def test_upgrading_old_quote_check_preserves_rows_foreign_keys_and_backup(self):
        path = Path(self.tmp.name) / 'old.sqlite3'
        old_sql = sqlite_schema().replace(
            'total = subtotal - discount_amount + case when coalesce(tax_included,0) then 0 else tax_amount end',
            'total = subtotal - discount_amount + tax_amount')
        with patch('backend.relational.sqlite_schema', return_value=old_sql), \
                patch.object(RelationalRepository, 'upgrade_quote_constraint'):
            old = RelationalRepository(path, demo_state())
        before = asyncio.run(old.load())
        migrated = RelationalRepository(path, empty_state())
        self.assertEqual(asyncio.run(migrated.load()), before)
        backup = path.with_name('old.before-multiple-quotes.sqlite3')
        self.assertTrue(backup.exists())
        with closing(sqlite3.connect(backup)) as saved, closing(sqlite3.connect(path)) as current:
            self.assertIn('total = subtotal - discount_amount + tax_amount', saved.execute(
                "select sql from sqlite_master where name='quotes'").fetchone()[0])
            self.assertIsNone(current.execute('pragma foreign_key_check').fetchone())
            self.assertEqual(saved.execute('select * from quotes').fetchall(), current.execute('select * from quotes').fetchall())
            with self.assertRaises(sqlite3.IntegrityError):
                current.execute("update quotes set terms='No debe reescribir el historial'")
