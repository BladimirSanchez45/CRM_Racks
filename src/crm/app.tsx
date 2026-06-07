// ============================================================
//  APP SHELL — sidebar, topbar, routing, tweaks
// ============================================================
import * as React from 'react'
import { StoreProvider, useStore } from './core/data'
import { signOut } from './core/api'
import { ProjectDetail, ProjectForm } from './views/projects/project_views'
import { Icon, type IconName } from './core/icons'
import { useTweaks, TweaksPanel, TweakSection, TweakSlider, TweakToggle, TweakRadio, TweakColor } from './core/tweaks-panel'
import { DashboardPage } from './views/dashboard/dashboard'
import { ProjectsPage } from './views/projects/projects'
import { SuppliersPage } from './views/suppliers/suppliers'
import { OrdersPage } from './views/orders/orders'
import { PaymentsPage } from './views/payments/payments'
import { CobranzaPage } from './views/cobranza/cobranza'
import { ClientsPage } from './views/clients/clients'
import { CommissionsPage } from './views/commissions/commissions'
import { AdminPage } from './views/admin/admin'
import { LoginPage } from './views/login/login'
import type { Project } from './core/types'
import strakkLogo from '../assets/logos/strakk_logo.png'
import strakkLogoBlanco from '../assets/logos/strakk_logo_blanco.png'

type Route = 'dashboard' | 'projects' | 'suppliers' | 'orders' | 'payments' | 'cobranza' | 'clients' | 'commissions' | 'admin'
type CountKey = 'activeProjects' | 'suppliers' | 'orders' | 'payments' | 'clients'

const NAV: { id: Route; label: string; icon: IconName; countKey?: CountKey; adminOnly?: boolean }[] = [
  { id: 'dashboard',   label: 'Panel',        icon: 'dashboard' },
  { id: 'projects',    label: 'Proyectos',    icon: 'kanban' },
  { id: 'suppliers',   label: 'Proveedores',  icon: 'suppliers'},
  { id: 'orders',      label: 'Órdenes de Compra', icon: 'orders'},
  { id: 'payments',    label: 'Pagos',        icon: 'money' },
  { id: 'cobranza',    label: 'Cobranza',     icon: 'download' },
  { id: 'clients',     label: 'Clientes',     icon: 'clients' },
  { id: 'commissions', label: 'Comisiones',   icon: 'commissions' },
]
const TITLES: Record<Route, string> = {
  dashboard: 'Panel general', projects: 'Proyectos', suppliers: 'Proveedores',
  orders: 'Órdenes de Compra', payments: 'Pagos', cobranza: 'Cobranza', clients: 'Clientes', commissions: 'Comisiones',
  admin: 'Administración',
}

/* ---- accent helpers ---- */
function adjust(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16)
  let r = (n >> 16) + amt, g = ((n >> 8) & 255) + amt, b = (n & 255) + amt
  r = Math.max(0, Math.min(255, r)); g = Math.max(0, Math.min(255, g)); b = Math.max(0, Math.min(255, b))
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)
}
const alphaHex = (a: number) => Math.round(a * 255).toString(16).padStart(2, '0')

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": "#2f6feb",
  "density": "cómodo",
  "blueprint": 0,
  "light": true
}/*EDITMODE-END*/

type Tweaks = typeof TWEAK_DEFAULTS
type SetTweak = (keyOrEdits: keyof Tweaks | Partial<Tweaks>, val?: Tweaks[keyof Tweaks]) => void

function Sidebar({ route, setRoute }: { route: Route; setRoute: (r: Route) => void }) {
  const { state, dispatch } = useStore()
  const me = state.currentUser
  const counts: Record<CountKey, number> = {
    activeProjects: state.projects.filter(p => p.stage !== 'finalizado').length,
    suppliers: state.suppliers.filter(s => s.active).length,
    orders: state.orders.length,
    payments: state.payments.length,
    clients: state.clients.length,
  }
  const nav = NAV.filter(n => !n.adminOnly || me?.role === 'admin')
  return (
    <aside className="sidebar">
      <div className="brand flex-col items-stretch gap-2">
        <div className="flex items-center justify-center px-1.5 pt-1">
          <img src={strakkLogo} alt="STRAKK CRM" className="brand-logo brand-logo-dark" />
          <img src={strakkLogoBlanco} alt="STRAKK CRM" className="brand-logo brand-logo-light" />
        </div>
      </div>
      <nav className="nav">
        <div className="nav-sec">Operación</div>
        {nav.map(n => (
          <div key={n.id} className={'nav-item' + (route === n.id ? ' active' : '')} onClick={() => setRoute(n.id)} title={n.label}>
            <Icon name={n.icon} size={18} />
            <span className="nav-label">{n.label}</span>
            {n.countKey && counts[n.countKey] != null && <span className="nav-count">{counts[n.countKey]}</span>}
          </div>
        ))}
      </nav>
      <div className="sidebar-foot">
        <div className="user-chip">
          <span className="avatar">{me?.initials ?? '?'}</span>
          <div className="brand-text flex-1 min-w-0">
            <div className="text-[12.5px] font-semibold truncate">{me?.name ?? 'Invitado'}</div>
            <div className="meta text-[10.5px] truncate">{me?.title || (me?.role === 'admin' ? 'Administrador' : 'Ventas')}</div>
          </div>
          <button className="icon-btn shrink-0" title="Cerrar sesión" onClick={() => { void signOut(); dispatch({ type: 'LOGOUT' }) }}><Icon name="logout" size={16} /></button>
        </div>
      </div>
    </aside>
  )
}

function Shell({ t, setTweak }: { t: Tweaks; setTweak: SetTweak }) {
  const { state } = useStore()
  const me = state.currentUser
  const [route, setRoute] = React.useState<Route>('dashboard')
  const [collapsed, setCollapsed] = React.useState(false)
  const [openProj, setOpenProj] = React.useState<Project | null>(null)
  const [editProj, setEditProj] = React.useState<Project | null>(null)

  const onOpenProject = (p: Project) => { setOpenProj(p); setEditProj(null) }

  const page = () => {
    switch (route) {
      case 'dashboard':   return <DashboardPage onNavigate={(r) => setRoute(r as Route)} onOpenProject={onOpenProject} />
      case 'projects':    return <ProjectsPage />
      case 'suppliers':   return <SuppliersPage />
      case 'orders':      return <OrdersPage />
      case 'payments':    return <PaymentsPage />
      case 'cobranza':    return <CobranzaPage />
      case 'clients':     return <ClientsPage onOpenProject={onOpenProject} />
      case 'commissions': return <CommissionsPage />
      case 'admin':       return me?.role === 'admin' ? <AdminPage /> : <DashboardPage onNavigate={(r) => setRoute(r as Route)} onOpenProject={onOpenProject} />
      default: return null
    }
  }

  return (
    <div className={'app' + (collapsed ? ' collapsed' : '')}>
      <Sidebar route={route} setRoute={setRoute} />
      <div className="main">
        <header className="topbar">
          <button className="icon-btn" onClick={() => setCollapsed(c => !c)} title="Colapsar menú"><Icon name="menu" size={17} /></button>
          <div>
            <h1>{TITLES[route]}</h1>
            <div className="crumb">CC Racks Industriales</div>
          </div>
          <div className="flex-1"></div>
          {me && <span className={'badge-role mr-1 ' + (me.role === 'admin' ? 'role-admin' : 'role-ventas')}>{me.role === 'admin' ? 'Admin' : 'Ventas'}</span>}
          {me?.role === 'admin' && (
            <button className={'icon-btn' + (route === 'admin' ? ' active' : '')} onClick={() => setRoute('admin')} title="Administración">
              <Icon name="shield" size={17} />
            </button>
          )}
          <button className="icon-btn" onClick={() => setTweak('light', !t.light)} title={t.light ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}>
            <Icon name={t.light ? 'sun' : 'moon'} size={17} />
          </button>
          <button className="icon-btn relative" title="Notificaciones">
            <Icon name="bell" size={17} />
            <span className="absolute top-[7px] right-[7px] w-1.5 h-1.5 rounded-full bg-danger"></span>
          </button>
        </header>
        <main className="content blueprint">
          <div className="content-inner" key={route}>{page()}</div>
        </main>
      </div>

      {/* cross-module project overlay */}
      {openProj && !editProj && <ProjectDetail project={openProj} onClose={() => setOpenProj(null)} onEdit={() => setEditProj(openProj)} />}
      {editProj && <ProjectForm project={editProj} onClose={() => { setEditProj(null) }} />}

      <TweaksPanel title="Tweaks">
        <TweakSection label="Marca" />
        <TweakColor label="Color de acento" value={t.accent} options={['#2f6feb', '#6366f1', '#0ea5e9', '#16a34a', '#1b2230']} onChange={(v) => setTweak('accent', v as string)} />
        <TweakSection label="Densidad y textura" />
        <TweakRadio label="Densidad" value={t.density} options={['compacto', 'cómodo']} onChange={(v) => setTweak('density', v as string)} />
        <TweakSlider label="Textura blueprint" value={t.blueprint} min={0} max={10} step={1} onChange={(v) => setTweak('blueprint', v)} />
        <TweakSection label="Tema" />
        <TweakToggle label="Modo oscuro" value={t.light} onChange={(v) => setTweak('light', v)} />
      </TweaksPanel>
    </div>
  )
}

function Root() {
  const { state } = useStore()
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS)

  // aplica el tema/tweaks a nivel global (login y app)
  React.useEffect(() => {
    const r = document.documentElement.style
    r.setProperty('--acc', t.accent)
    r.setProperty('--acc-bright', adjust(t.accent, 22))
    r.setProperty('--acc-dim', adjust(t.accent, -40))
    r.setProperty('--acc-ghost', t.accent + alphaHex(0.12))
    r.setProperty('--acc-ghost-2', t.accent + alphaHex(0.22))
    r.setProperty('--st-4', t.accent)
  }, [t.accent])
  React.useEffect(() => {
    const r = document.documentElement.style
    if (t.density === 'compacto') { r.setProperty('--pad', '14px'); r.setProperty('--gap', '11px'); r.setProperty('--row-h', '38px'); document.body.style.fontSize = '13px' }
    else { r.setProperty('--pad', '20px'); r.setProperty('--gap', '16px'); r.setProperty('--row-h', '44px'); document.body.style.fontSize = '14px' }
  }, [t.density])
  React.useEffect(() => {
    document.documentElement.style.setProperty('--grid-a', (t.blueprint / 100 + 0.005).toFixed(3))
  }, [t.blueprint])
  React.useEffect(() => {
    document.body.classList.toggle('light', !!t.light)
  }, [t.light])

  return state.currentUser ? <Shell t={t} setTweak={setTweak} /> : <LoginPage />
}

export default function App() {
  return <StoreProvider><Root /></StoreProvider>
}
