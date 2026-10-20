"""Nombres de PostgreSQL en español; el contrato React y la demo existente se conservan."""
import re

TABLAS = {
    'workspaces': 'espacios', 'members': 'miembros', 'companies': 'empresas',
    'contacts': 'contactos', 'products': 'productos', 'deals': 'negocios',
    'prospects': 'prospectos', 'tasks': 'tareas', 'activities': 'actividades',
    'quotes': 'cotizaciones', 'quote_items': 'partidas_cotizacion',
    'receipts': 'recibos', 'stage_history': 'historial_etapas',
    'quote_events': 'eventos_cotizacion',
}
COLUMNAS = {
    'workspace_id': 'espacio_id', 'user_id': 'usuario_id', 'name': 'nombre',
    'display_name': 'nombre_visible', 'role': 'rol', 'active': 'activo',
    'created_at': 'creado_en', 'provider_ruc': 'ruc_proveedor', 'origin': 'origen',
    'sort_order': 'orden', 'company_id': 'empresa_id', 'email': 'correo',
    'phone': 'telefono', 'portal_profile_id': 'perfil_portal_id', 'price': 'precio',
    'currency': 'moneda', 'contact_id': 'contacto_id', 'service': 'servicio',
    'owner_label': 'responsable_nombre', 'owner_user_id': 'responsable_usuario_id',
    'stage': 'etapa', 'amount': 'importe', 'updated_at': 'actualizado_en',
    'closed_at': 'cerrado_en', 'loss_reason': 'motivo_perdida', 'deal_id': 'negocio_id',
    'kind': 'tipo', 'evidence': 'evidencia', 'tender': 'licitacion',
    'analysis_id': 'analisis_id', 'deadline': 'fecha_limite', 'notes': 'notas',
    'title': 'titulo', 'due_at': 'vence_en', 'done': 'completada',
    'completed_at': 'completada_en', 'body': 'contenido', 'actor_label': 'actor_nombre',
    'actor_user_id': 'actor_usuario_id', 'number': 'numero',
    'discount_percent': 'descuento_porcentaje', 'discount_amount': 'descuento_importe',
    'tax_percent': 'impuesto_porcentaje', 'tax_amount': 'impuesto_importe',
    'status': 'estado', 'valid_until': 'vigente_hasta', 'terms': 'condiciones',
    'quote_id': 'cotizacion_id', 'line_number': 'numero_partida',
    'product_id': 'producto_id', 'product_name': 'producto_nombre',
    'unit_price': 'precio_unitario', 'quantity': 'cantidad',
    'request_id': 'solicitud_id', 'digest': 'huella', 'from_stage': 'etapa_anterior',
    'to_stage': 'etapa_nueva', 'reason': 'motivo',
    'issuer_name': 'emisor_nombre', 'issuer_ruc': 'emisor_ruc', 'issuer_address': 'emisor_direccion',
    'customer_name': 'cliente_nombre', 'customer_ruc': 'cliente_ruc', 'contact_name': 'contacto_nombre',
    'contact_email': 'contacto_correo', 'recipient': 'destinatario', 'channel': 'canal', 'note': 'nota',
    'tax_included': 'impuesto_incluido',
}


def fila_sql(fila):
    return {COLUMNAS.get(clave, clave): valor for clave, valor in fila.items()}


def tablas_internas(tablas):
    nombres = {valor: clave for clave, valor in TABLAS.items()}
    columnas = {valor: clave for clave, valor in COLUMNAS.items()}
    return {nombres[tabla]: [{columnas.get(clave, clave): valor for clave, valor in fila.items()} for fila in filas]
            for tabla, filas in tablas.items()}


def cambios_sql(cambios):
    return [{'tabla': TABLAS[cambio['table']], 'fila': fila_sql(cambio['row']), 'insertar': cambio['insert']}
            for cambio in cambios]


def esquema_sqlite_compatible(sql):
    # SQLite conserva sus nombres anteriores para abrir la demo sin migrar ni copiar datos.
    nombres = {valor: clave for clave, valor in (TABLAS | COLUMNAS).items()}
    return re.sub(r'\b[a-z_]+\b', lambda coincidencia: nombres.get(coincidencia[0], coincidencia[0]), sql)
