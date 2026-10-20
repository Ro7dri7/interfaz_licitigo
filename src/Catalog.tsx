import { useRef, useState } from 'react'
import { Badge, Empty, Icon, PageHead } from './components'
import { useCRM } from './crm-context'
import { money } from './types'

const categories: Record<string, string> = { initial: 'Certificación inicial', renewal: 'Recertificación', surveillance: 'Seguimiento anual' }

export default function Catalog({ onCreate }: { onCreate: () => void }) {
  const { snapshot: { data }, session, command } = useCRM()
  const [search, setSearch] = useState(''), [kind, setKind] = useState('all'), [category, setCategory] = useState('')
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const requestId = useRef(crypto.randomUUID())
  const imported = data.products.filter(p => p.sku).length, total = session.isoCatalogSize ?? 540
  const rows = data.products.filter(p => `${p.name} ${p.sku ?? ''}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())
    && (kind === 'all' || (kind === 'package' ? p.isPackage : !p.isPackage)) && (!category || p.category === category))
  return <><PageHead title="Catálogo de certificaciones" description="Certificaciones ISO individuales y paquetes, con sus modalidades y precios originales en soles.">
    {session.user.role === 'admin' && <><button disabled={busy || imported >= total} onClick={async () => {
      setBusy(true); setError('')
      try { await command('import_iso', {}, requestId.current) } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
    }}>{busy ? 'Importando…' : imported >= total ? 'Catálogo ISO cargado' : `Importar catálogo ISO (${total})`}</button>
    <button className="primary" onClick={onCreate}><Icon name="plus" /> Nuevo servicio</button></>}
  </PageHead>
    <div className="info-strip"><Icon name="file" /><span>{imported} de {total} referencias cargadas del Excel de HubSpot. Incluye certificación inicial, recertificación y seguimiento; excluye cursos, implementación y productos ajenos a ISO.</span></div>
    <div className="filters"><label className="search-field"><Icon name="search" /><input type="search" aria-label="Buscar certificación" placeholder="ISO, modalidad, tamaño de empresa o código…" value={search} onChange={e => setSearch(e.target.value)} /></label>
      <select aria-label="Tipo de producto" value={kind} onChange={e => setKind(e.target.value)}><option value="all">Individuales y paquetes</option><option value="single">Certificaciones individuales</option><option value="package">Paquetes ISO</option></select>
      <select aria-label="Tipo de certificación" value={category} onChange={e => setCategory(e.target.value)}><option value="">Todos los servicios ISO</option>{Object.entries(categories).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
    </div>
    {error && <p role="alert" className="error">{error}</p>}
    <section className="panel table-wrap"><table><thead><tr><th>Certificación / paquete</th><th>Tipo</th><th>Precio PEN · IGV incluido</th><th>Disponibilidad</th></tr></thead><tbody>{rows.map(p => <tr key={p.id}>
      <td><strong>{p.name}</strong><small>{p.sku ?? 'Registro manual'}{p.sourceRow ? ` · Excel, fila ${p.sourceRow}` : ''}</small></td><td><Badge tone={p.isPackage ? 'blue' : ''}>{p.isPackage ? 'Paquete ISO' : 'Individual'}</Badge><small>{categories[p.category ?? ''] ?? 'Servicio comercial'}</small></td>
      <td><strong>{money(p.price)}</strong></td><td><Badge tone={p.active ? 'green' : ''}>{p.active ? 'Activo' : 'Inactivo'}</Badge></td></tr>)}</tbody></table>
      {!rows.length && <Empty title="Sin certificaciones para mostrar">Importa el catálogo o ajusta los filtros.</Empty>}<div className="table-foot">{rows.length} referencias · Los paquetes conservan su precio propio; no se suman como certificaciones individuales.</div>
    </section></>
}
