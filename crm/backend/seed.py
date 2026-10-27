"""Synthetic examples only. Never loaded in Supabase mode."""
from datetime import date, datetime, timedelta, timezone
from .domain import apply_command, empty_state


def demo_state():
    state = empty_state()
    counter = 0

    def run(operation, payload):
        nonlocal state, counter
        counter += 1
        state = apply_command(state, operation, payload, 'Equipo Lici · ejemplo', f'seed-{counter}')

    for name, price in [('Certificación ISO 9001', '2400'), ('Pack ISO 9001 + 14001 + 45001', '5600'),
                        ('Certificación ISO 37001', '2800'), ('Diagnóstico de certificación', '450')]:
        run('product', dict(name=name, price=price))
    companies = ['Andes Ingeniería', 'Grupo Horizonte', 'Suministros del Pacífico', 'Constructora Altura',
                 'Servicios Terranova', 'Logística Norte', 'Soluciones del Sur', 'Consultora Prisma']
    people = ['Valeria Torres', 'Diego Salazar', 'Camila Ríos', 'Martín Vega', 'Lucía Prado', 'Daniel Costa', 'Ana Molina', 'Pablo León']
    stages = ['new', 'new', 'contacted', 'qualified', 'quoted', 'followup', 'won', 'lost']
    for i, company in enumerate(companies):
        run('intake', dict(company=company, ruc=f'209900000{i:02d}', contact=people[i], email=f'contacto{i}@example.com',
                           kind='quote' if i % 2 == 0 else 'advice', service='ISO 9001' if i % 2 == 0 else 'Pack de certificaciones',
                           origin=['Lici', 'Referido', 'WhatsApp'][i % 3], owner=['María López', 'Carlos Ruiz'][i % 2],
                           evidence='required' if i % 3 == 0 else 'none', tender=f'LP-EJEMPLO-{i + 1:03d}' if i % 3 == 0 else '',
                           deadline=(date.today() + timedelta(days=7 + i)).isoformat() if i % 3 == 0 else None,
                           notes='Ejemplo ficticio para recorrer el flujo comercial.'))
        deal = state['deals'][-1]
        if i > 1:
            run('quote', dict(dealId=deal['id'], productId=state['products'][i % 2]['id'], quantity=1,
                              discount=0, tax=18, validUntil=(date.today() + timedelta(days=15)).isoformat(), terms='Pago único. Sujeto a evaluación del alcance.'))
        if stages[i] != 'new':
            run('stage', dict(dealId=deal['id'], stage=stages[i], reason='Proyecto postergado' if stages[i] == 'lost' else ''))
        if i in [0, 4]:
            state['tasks'][-1]['dueAt'] = (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()
        if i >= 6:
            state['tasks'][-1]['done'] = True
    for i, kind in enumerate(['required', 'recommended', 'pending']):
        run('intake', dict(company=['Operaciones Alerce', 'Industrial Mar Abierto', 'Ingeniería Cumbre'][i],
                           ruc=f'209900001{i:02d}', contact=['Elena Díaz', 'Luis Soto', 'Sofía Campos'][i],
                           kind='signal', origin='Lici', service=['ISO 9001', 'ISO 14001', 'Por evaluar'][i],
                           evidence=kind, tender=f'LP-EJEMPLO-{20 + i}', owner='Sin asignar',
                           deadline=(date.today() + timedelta(days=4 + i)).isoformat()))
    return state
