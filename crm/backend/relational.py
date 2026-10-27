"""Relational local storage, with a one-time, non-destructive import of the old JSON demo."""
from contextlib import closing, contextmanager
import json
from pathlib import Path
import re
import sqlite3

from .domain import empty_state
from .relational_codec import WRITE_ORDER, TABLE_FIELDS, QUOTE_DOCUMENT_FIELDS, encode_state, decode_state, changes_between, receipt_added, stage_events
from .repository import Conflict, StorageUnavailable
from .sql_names import esquema_sqlite_compatible

DEMO_WORKSPACE = '00000000-0000-0000-0000-000000000001'
MIGRATION = Path(__file__).parent / 'migrations' / '002_relational_tables.sql'


def sqlite_schema():
    # Reuse the frozen table definitions; only dialect types and external portal fixtures differ.
    sql = MIGRATION.read_text(encoding='utf-8').split('-- INICIO TABLAS')[1].split('-- FIN TABLAS')[0]
    sql = sql[sql.index('create table'):].replace('licihub_crm.', '')
    sql = esquema_sqlite_compatible(sql)
    sql = sql.replace("'Lici','WhatsApp'", "'Lici','Telegram','WhatsApp'")
    sql = sql.replace('create table if not exists quotes (', 'create table if not exists quotes (\n  tax_included boolean,')
    sql = sql.replace('total = subtotal - discount_amount + tax_amount',
                      'total = subtotal - discount_amount + case when coalesce(tax_included,0) then 0 else tax_amount end')
    for source, target in [('contactos_identidad_correo', 'contacts_email_identity'),
                           ('negocios_necesidad_abierta_unica', 'one_open_need'),
                           ('negocios_por_responsable_etapa', 'deals_by_owner_stage'),
                           ('tareas_por_vencimiento', 'tasks_due'), ('prospectos_por_contexto', 'prospects_context'),
                           ('actividades_por_negocio', 'activities_by_deal')]:
        sql = sql.replace(source, target)
    for source, target in [('auth.users', 'portal_users'), ('public.proveedores', 'portal_proveedores'),
                           ('public.perfiles', 'portal_perfiles'), ('public.convocatorias', 'portal_convocatorias'),
                           ('public.analisis_empresa_licitacion', 'portal_analisis')]:
        sql = sql.replace(source, target)
    sql = re.sub(r'\buuid\b|\btimestamptz\b', 'text', sql)
    sql = sql.replace("ruc ~ '^[0-9]{11}$'", "ruc REGEXP '^[0-9]{11}$'")
    return ('create table if not exists portal_users(id text primary key);'
            'create table if not exists portal_proveedores(ruc text primary key);'
            'create table if not exists portal_perfiles(id text primary key);'
            'create table if not exists portal_convocatorias(id integer primary key);'
            'create table if not exists portal_analisis(id integer primary key);') + sql


class RelationalRepository:
    def __init__(self, path: Path, initial, *, legacy_path: Path | None = None, workspace=DEMO_WORKSPACE):
        self.path, self.workspace = path, workspace
        path.parent.mkdir(parents=True, exist_ok=True)
        try:
            with self.connect() as db:
                db.execute('pragma journal_mode=WAL')
                db.executescript(sqlite_schema())
                existing = {row['name'] for row in db.execute('pragma table_info(quotes)')}
                for column in QUOTE_DOCUMENT_FIELDS.values():
                    if column not in existing:
                        db.execute(f'alter table quotes add column {column} {"boolean" if column == "tax_included" else "text"}')
                self.upgrade_quote_constraint(db)
                self.upgrade_telegram_origin(db)
                db.executescript('''create table if not exists quote_events (
                    workspace_id text not null, id text not null, quote_id text not null,
                    status text not null check(status in ('sent','accepted','rejected')),
                    recipient text not null, channel text not null check(channel in ('email','whatsapp','other')),
                    note text not null, actor_label text not null, actor_user_id text references portal_users(id),
                    created_at text not null, sort_order integer not null,
                    primary key(workspace_id,id), unique(workspace_id,quote_id,sort_order),
                    foreign key(workspace_id,quote_id) references quotes(workspace_id,id));''')
                for table in ['quotes', 'quote_items', 'quote_events', 'activities', 'receipts', 'stage_history']:
                    for operation in ['update', 'delete']:
                        db.execute(f'''create trigger if not exists immutable_{table}_{operation} before {operation} on {table}
                            begin select raise(abort,'Historical records are immutable'); end''')
                db.execute('begin immediate')
                if db.execute('select 1 from workspaces where id=?', (workspace,)).fetchone():
                    return
                snapshot = {'revision': 0, 'data': initial}
                if legacy_path and legacy_path.exists():
                    snapshot = json.loads(legacy_path.read_text(encoding='utf-8'))
                self.validate_snapshot(snapshot)
                db.execute('insert into workspaces(id,name,revision) values(?,?,?)',
                           (workspace, 'LiciHub · prueba local', snapshot['revision']))
                tables = encode_state(snapshot['data'], workspace)
                for table in [*WRITE_ORDER, 'receipts']:
                    for row in tables[table]:
                        self.write_row(db, table, row, insert=True)
                for event in stage_events(empty_state(), snapshot['data'], workspace, 'legacy-import', None, 'Importación de prueba'):
                    self.write_row(db, 'stage_history', event, insert=True)
                self.validate_quotes(db)
        except (sqlite3.Error, ValueError, KeyError, TypeError) as error:
            raise StorageUnavailable('No se pudo inicializar el almacenamiento relacional; se conserva el archivo original.') from error

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        db.create_function('regexp', 2, lambda pattern, value: None if value is None else bool(re.fullmatch(pattern, value)))
        db.execute('pragma foreign_keys=ON')
        try:
            with db:
                yield db
        finally:
            db.close()

    def upgrade_quote_constraint(self, db):
        schema = db.execute("select sql from sqlite_master where type='table' and name='quotes'").fetchone()['sql']
        previous = 'total = subtotal - discount_amount + tax_amount'
        if previous not in schema:
            return
        # SQLite no permite reemplazar CHECK: respaldo consistente y reconstrucción transaccional.
        backup = self.path.with_name(self.path.stem + '.before-multiple-quotes.sqlite3')
        if not backup.exists():
            with closing(sqlite3.connect(backup)) as target:
                db.backup(target)
        db.execute('pragma foreign_keys=OFF')
        try:
            db.execute('begin immediate')
            upgraded = schema.replace(previous, 'total = subtotal - discount_amount + case when coalesce(tax_included,0) then 0 else tax_amount end')
            upgraded = re.sub(r'(?i)create table\s+"?quotes"?', 'create table quotes_upgrade', upgraded, count=1)
            db.execute(upgraded)
            db.execute('insert into quotes_upgrade select * from quotes')
            db.execute('drop table quotes')
            db.execute('alter table quotes_upgrade rename to quotes')
            if db.execute('pragma foreign_key_check').fetchone():
                raise sqlite3.IntegrityError('Relaciones inválidas después de actualizar cotizaciones.')
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.execute('pragma foreign_keys=ON')

    def upgrade_telegram_origin(self, db):
        tables = [(table, db.execute("select sql from sqlite_master where type='table' and name=?", (table,)).fetchone()['sql'])
                  for table in ['companies', 'deals', 'prospects']]
        pending = [(table, schema) for table, schema in tables if "'Telegram'" not in schema]
        if not pending:
            return
        backup = self.path.with_name(self.path.stem + '.before-telegram.sqlite3')
        if not backup.exists():
            with closing(sqlite3.connect(backup)) as target:
                db.backup(target)
        db.execute('pragma foreign_keys=OFF')
        try:
            db.execute('begin immediate')
            for table, schema in pending:
                indexes = [r['sql'] for r in db.execute("select sql from sqlite_master where tbl_name=? and type in ('index','trigger') and sql is not null", (table,))]
                upgraded = schema.replace("'Lici','WhatsApp'", "'Lici','Telegram','WhatsApp'")
                upgraded = re.sub(r'(?i)create table\s+"?' + table + r'"?', 'create table ' + table + '_upgrade', upgraded, count=1)
                db.execute(upgraded)
                db.execute(f'insert into {table}_upgrade select * from {table}')
                db.execute(f'drop table {table}')
                db.execute(f'alter table {table}_upgrade rename to {table}')
                for index in indexes:
                    db.execute(index)
            if db.execute('pragma foreign_key_check').fetchone():
                raise sqlite3.IntegrityError('Relaciones inválidas después de habilitar Telegram.')
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.execute('pragma foreign_keys=ON')

    @staticmethod
    def validate_snapshot(snapshot):
        if not isinstance(snapshot['revision'], int) or snapshot['revision'] < 0:
            raise ValueError('Revisión inválida.')
        if set(snapshot['data']) != set(TABLE_FIELDS) or not all(isinstance(v, list) for v in snapshot['data'].values()):
            raise ValueError('Formato de datos incompleto.')

    def write_row(self, db, table, row, *, insert):
        if table not in [*WRITE_ORDER, 'receipts', 'stage_history']:
            raise ValueError('Tabla no permitida.')
        row = dict(row)
        if row['workspace_id'] != self.workspace:
            raise ValueError('Espacio inválido.')
        if table == 'companies':
            provider = db.execute('select ruc from portal_proveedores where ruc=?', (row['ruc'],)).fetchone()
            row['provider_ruc'] = provider['ruc'] if provider else None
        columns = list(row)
        if not all(re.fullmatch('[a-z_]+', column) for column in columns):
            raise ValueError('Columna inválida.')
        if insert:
            placeholders = ','.join('?' for _ in columns)
            db.execute(f'insert into {table} ({",".join(columns)}) values ({placeholders})', [row[c] for c in columns])
        else:
            mutable = [c for c in columns if c not in ['workspace_id', 'id']]
            changed = db.execute(f'update {table} set {",".join(c+"=?" for c in mutable)} where workspace_id=? and id=?',
                                 [row[c] for c in mutable] + [self.workspace, row['id']])
            if changed.rowcount != 1:
                raise Conflict()

    def validate_quotes(self, db):
        invalid = db.execute('''select q.id from quotes q left join quote_items i
            on i.workspace_id=q.workspace_id and i.quote_id=q.id
            where q.workspace_id=? group by q.id, q.subtotal
            having count(i.line_number) not between 1 and 50 or sum(i.unit_price*i.quantity)<>q.subtotal limit 1''', (self.workspace,)).fetchone()
        if invalid:
            raise ValueError('Las partidas no coinciden con el subtotal.')

    def read(self, db, request_id=None):
        workspace = db.execute('select revision from workspaces where id=?', (self.workspace,)).fetchone()
        tables = {}
        for table in [*WRITE_ORDER, 'receipts']:
            query, params = f'select * from {table} where workspace_id=?', [self.workspace]
            if table == 'receipts' and request_id is not None:
                query += ' and request_id=?'
                params.append(request_id)
            tables[table] = [dict(r) for r in db.execute(query, params)]
        return {'revision': workspace['revision'], 'data': decode_state(tables), 'schemaVersion': 2}

    async def load(self, request_id=None):
        try:
            with self.connect() as db:
                db.execute('begin')
                return self.read(db, request_id)
        except sqlite3.Error as error:
            raise StorageUnavailable() from error

    async def save(self, data, revision, *, before, actor=None, integration=False):
        try:
            with self.connect() as db:
                db.execute('begin immediate')
                current_revision = db.execute('select revision from workspaces where id=?', (self.workspace,)).fetchone()['revision']
                if current_revision != revision:
                    raise Conflict()
                receipt = receipt_added(before['data'], data)
                actor_id, actor_label = (actor or {}).get('id'), (actor or {}).get('name', 'Equipo de prueba')
                for change in changes_between(before['data'], data, self.workspace):
                    row = change['row']
                    if change['table'] in ['activities', 'quote_events']:
                        row['actor_user_id'] = actor_id
                    self.write_row(db, change['table'], row, insert=change['insert'])
                for row in stage_events(before['data'], data, self.workspace, receipt['id'], actor_id, actor_label):
                    self.write_row(db, 'stage_history', row, insert=True)
                self.validate_quotes(db)
                self.write_row(db, 'receipts', dict(workspace_id=self.workspace, request_id=receipt['id'], digest=receipt['digest'],
                                                    actor_user_id=actor_id, sort_order=revision+1), insert=True)
                db.execute('update workspaces set revision=revision+1 where id=?', (self.workspace,))
                return self.read(db)
        except (sqlite3.Error, ValueError) as error:
            raise StorageUnavailable() from error
