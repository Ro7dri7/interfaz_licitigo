import { useState } from 'react'
import { Link, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Icon } from './components'
import { useCRM } from './crm-context'
import { api } from './api'
import { IntakeForm, ProductForm } from './Forms'
import Overview from './Overview'
import { Directory, Pipeline, Prospects } from './Collections'
import DealDetail from './DealDetail'
import { Agenda, Catalog, Quotes, SettingsPage } from './Operations'
import { initials } from './types'

const navigation = [['/', 'home', 'Mi día'], ['/prospectos', 'radar', 'Prospectos'], ['/empresas', 'company', 'Empresas'],
  ['/contactos', 'users', 'Contactos'], ['/negocios', 'deals', 'Negocios'], ['/agenda', 'calendar', 'Agenda'],
  ['/cotizaciones', 'file', 'Cotizaciones'], ['/catalogo', 'box', 'Catálogo']]

export default function App() {
  const { session, snapshot: { data } } = useCRM(), location = useLocation()
  const [modal, setModal] = useState(''), [menu, setMenu] = useState(false)
  const create = () => setModal('intake')
  const page = navigation.find(([url]) => url !== '/' && location.pathname.startsWith(url))?.[2] ?? (location.pathname === '/configuracion' ? 'Configuración' : 'Mi día')
  return <div className="app-shell"><a className="skip-link" href="#main">Saltar al contenido</a>
    <aside className={`sidebar ${menu ? 'open' : ''}`}><Link to="/" className="brand">Lici<span>.</span><small>CRM</small></Link><div className="workspace-label"><span className="workspace-icon">L</span><div><strong>Equipo comercial</strong><small>Certificaciones y servicios</small></div></div>
      <p className="nav-section">TU ESPACIO</p><nav aria-label="Navegación principal">{navigation.map(([url, icon, label]) => <NavLink key={url} to={url} end={url === '/'} onClick={() => setMenu(false)}><Icon name={icon} /><span>{label}</span>{url === '/prospectos' && <span className="nav-count">{data.prospects.filter(p => !p.dealId).length}</span>}</NavLink>)}</nav>
      <div className="sidebar-bottom"><div className="ecosystem"><Icon name="radar" /><strong>Conectado a tu proceso</strong><p>Del interés en una licitación a una relación comercial.</p></div><NavLink to="/configuracion" onClick={() => setMenu(false)}><Icon name="settings" />Espacio e integraciones</NavLink><div className="sidebar-foot">Lici CRM <span>v0.1</span></div></div></aside>
    <div className="workspace"><header className="topbar"><div className="topbar-context"><button className="icon-button mobile-menu" aria-label="Abrir navegación" aria-expanded={menu} onClick={() => setMenu(!menu)}><Icon name="list" /></button><span>Espacio comercial</span><span className="divider">/</span><strong>{page}</strong></div><div className="topbar-right"><span className={`environment ${session.mode === 'demo' ? 'demo' : ''}`}><span className="status-dot" />{session.mode === 'demo' ? 'Prueba local · datos ficticios' : 'Espacio compartido'}</span><span className="avatar">{initials(session.user.name)}</span>{session.mode === 'supabase' && <button onClick={async () => { await api('logout', {}); window.location.reload() }}>Salir</button>}</div></header>
      <main id="main"><Routes><Route path="/" element={<Overview onCreate={create} />} /><Route path="/prospectos" element={<Prospects onCreate={create} />} />
        <Route path="/empresas" element={<Directory onCreate={create} />} /><Route path="/contactos" element={<Directory contacts onCreate={create} />} />
        <Route path="/negocios" element={<Pipeline onCreate={create} />} /><Route path="/negocios/:id" element={<DealDetail />} />
        <Route path="/agenda" element={<Agenda />} /><Route path="/cotizaciones" element={<Quotes />} /><Route path="/catalogo" element={<Catalog onCreate={() => setModal('product')} />} />
        <Route path="/configuracion" element={<SettingsPage />} /><Route path="*" element={<Navigate to="/" replace />} /></Routes>
        <footer className="workspace-footer"><span>Lici · Inteligencia para tu gestión comercial</span><span>Perú · PEN · UTC−5</span></footer></main></div>
    <datalist id="owners">{[...new Set(data.deals.map(d => d.owner))].map(o => <option key={o} value={o} />)}</datalist><datalist id="services">{data.products.map(p => <option key={p.id} value={p.name} />)}</datalist>
    {modal === 'intake' && <IntakeForm onClose={() => setModal('')} />}{modal === 'product' && <ProductForm onClose={() => setModal('')} />}
  </div>
}
