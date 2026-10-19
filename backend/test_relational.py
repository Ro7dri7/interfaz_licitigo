import asyncio
from contextlib import closing
from copy import deepcopy
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest

from backend.domain import apply_command, empty_state
from backend.relational import RelationalRepository
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
