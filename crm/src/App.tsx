import { useState } from 'react'
import { Link, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Icon } from './components'
import { useCRM } from './crm-context'
import { api } from './api'
import { IntakeForm, ProductForm } from './Forms'
import Overview from './Overview'
import Admin from './Admin'
import AdminProperties from './AdminProperties'
import AdminTeam from './AdminTeam'
import { Pipeline } from './Collections'
import Directory from './Directory'
import Contacts from './Contacts'
import ContactDetail from './ContactDetail'
import CompanyDetail from './CompanyDetail'
import DealDetail from './DealDetail'
import { Agenda, Catalog, Quotes, SettingsPage } from './Operations'
import { initials } from './types'
import { CRM_BASE, crmPath } from './paths'

const navigation = [['/', 'home', 'Mi día'], ['/directorio', 'company', 'Directorio'], ['/contactos', 'users', 'Contactos'],
  ['/negocios', 'deals', 'Negocios'], ['/agenda', 'calendar', 'Agenda'],
  ['/cotizaciones', 'file', 'Cotizaciones'], ['/catalogo', 'box', 'Catálogo']]

// Administración: su inicio es el panel con gráficos; «Mi día» sigue disponible en /mi-dia.
const adminNavigation = [['/admin', 'chart', 'Panel admin'], ['/admin/equipo', 'users', 'Equipo'], ['/mi-dia', 'home', 'Mi día'], ...navigation.slice(1)]

function LegacyDirectory() {
  const location = useLocation(), params = new URLSearchParams(location.search)
  params.delete('vista')
  return <Navigate replace to={crmPath(`/directorio${params.size ? '?' + params.toString() : ''}${location.hash}`)} />
}

export default function App() {
  const { session, snapshot: { data } } = useCRM(), location = useLocation()
  const [modal, setModal] = useState(''), [menu, setMenu] = useState(false)
  const create = () => setModal('intake'), admin = session.user.role === 'admin'
  const home = crmPath('/')
  const links = (admin ? adminNavigation : navigation).map(([url, icon, label]) => [crmPath(url), icon, label])
  const page = links.filter(([url]) => url !== home && (location.pathname === url || location.pathname.startsWith(`${url}/`)))
    .sort((a, b) => b[0].length - a[0].length)[0]?.[2] ?? (location.pathname === crmPath('/configuracion') ? 'Configuración' : 'Mi día')
  return <div className="app-shell"><a className="skip-link" href="#main">Saltar al contenido</a>
    <aside className={`sidebar ${menu ? 'open' : ''}`}><Link to={crmPath("/")} className="brand">LiciHub<span>.</span><small>CRM</small></Link><div className="workspace-label"><span className="workspace-icon">L</span><div><strong>Equipo comercial</strong><small>Certificaciones y servicios</small></div></div>
      <p className="nav-section">TU ESPACIO</p><nav aria-label="Navegación principal">{links.map(([url, icon, label]) => <NavLink key={url} to={url} end={url === home} onClick={() => setMenu(false)}><Icon name={icon} /><span>{label}</span></NavLink>)}</nav>
      <div className="sidebar-bottom"><div className="ecosystem"><Icon name="radar" /><strong>Conectado a tu proceso</strong><p>Del interés en una licitación a una relación comercial.</p></div><NavLink to={crmPath("/configuracion")} onClick={() => setMenu(false)}><Icon name="settings" />Espacio e integraciones</NavLink>{CRM_BASE && <a href="/">Portal de licitaciones</a>}<div className="sidebar-foot">LiciHub CRM <span>v0.1</span></div></div></aside>
    <div className="workspace"><header className="topbar"><div className="topbar-context"><button className="icon-button mobile-menu" aria-label="Abrir navegación" aria-expanded={menu} onClick={() => setMenu(!menu)}><Icon name="list" /></button><span>Espacio comercial</span><span className="divider">/</span><strong>{page}</strong></div><div className="topbar-right"><span className={`environment ${session.mode === 'demo' ? 'demo' : ''}`}><span className="status-dot" />{session.mode === 'demo' ? 'Prueba local · datos ficticios' : 'Espacio compartido'}</span><span className="avatar">{initials(session.user.name)}</span>{session.mode === 'supabase' && <button onClick={async () => {
          try { await api('logout', {}) } catch { /* si CRM_ORIGIN no coincide, igual limpiamos el cliente */ }
          if (CRM_BASE) {
            await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {})
            localStorage.removeItem('lici.sesion')
            localStorage.removeItem('lici.onboarding')
            window.location.assign('/ingresar')
          } else window.location.reload()
        }}>Salir</button>}</div></header>
      <main id="main"><Routes><Route path="/" element={admin ? <Navigate replace to={crmPath("/admin")} /> : <Overview onCreate={create} />} /><Route path="/mi-dia" element={<Overview onCreate={create} />} />
        <Route path="/admin" element={admin ? <Admin onCreate={create} /> : <Navigate replace to={crmPath("/")} />} /><Route path="/admin/equipo" element={admin ? <AdminTeam /> : <Navigate replace to={crmPath("/")} />} /><Route path="/admin/propiedades" element={admin ? <AdminProperties /> : <Navigate replace to={crmPath("/")} />} /><Route path="/prospectos" element={<Navigate replace to={crmPath("/negocios")} />} />
        <Route path="/directorio" element={<Directory onCreate={create} />} /><Route path="/directorio/empresas/:id" element={<CompanyDetail />} />
        <Route path="/empresas" element={<LegacyDirectory />} /><Route path="/contactos" element={<Contacts onCreate={create} />} /><Route path="/contactos/:id" element={<ContactDetail />} />
        <Route path="/negocios" element={<Pipeline onCreate={create} />} /><Route path="/negocios/:id" element={<DealDetail />} />
        <Route path="/agenda" element={<Agenda />} /><Route path="/cotizaciones" element={<Quotes />} /><Route path="/catalogo" element={<Catalog onCreate={() => setModal('product')} />} />
        <Route path="/configuracion" element={<SettingsPage />} /><Route path="*" element={<Navigate to={crmPath("/")} replace />} /></Routes>
        <footer className="workspace-footer"><span>LiciHub · Inteligencia para tu gestión comercial</span><span>Perú · PEN · UTC−5</span></footer></main></div>
    <datalist id="owners">{[...new Set(data.deals.map(d => d.owner))].map(o => <option key={o} value={o} />)}</datalist><datalist id="services">{data.products.map(p => <option key={p.id} value={p.name} />)}</datalist>
    {modal === 'intake' && <IntakeForm onClose={() => setModal('')} />}{modal === 'product' && <ProductForm onClose={() => setModal('')} />}
  </div>
}
