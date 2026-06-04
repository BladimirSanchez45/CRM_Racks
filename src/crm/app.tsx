// ============================================================
//  APP SHELL — sidebar, topbar, routing, tweaks
// ============================================================
import * as React from 'react'
import { StoreProvider, useStore } from './core/data'
import { ProjectDetail, ProjectForm } from './views/projects/project_views'
import { Icon, type IconName } from './core/icons'
import { useTweaks, TweaksPanel, TweakSection, TweakSlider, TweakToggle, TweakRadio, TweakColor } from './core/tweaks-panel'
import { DashboardPage } from './views/dashboard/dashboard'
import { ProjectsPage } from './views/projects/projects'
import { SuppliersPage } from './views/suppliers/suppliers'
import { OrdersPage } from './views/orders/orders'
import { PaymentsPage } from './views/payments/payments'
import { ClientsPage } from './views/clients/clients'
import { CommissionsPage } from './views/commissions/commissions'
import type { Project } from './core/types'

type Route = 'dashboard' | 'projects' | 'suppliers' | 'orders' | 'payments' | 'clients' | 'commissions'
type CountKey = 'activeProjects' | 'suppliers' | 'orders' | 'payments' | 'clients'

const NAV: { id: Route; label: string; icon: IconName; countKey?: CountKey }[] = [
  { id: 'dashboard',   label: 'Panel',        icon: 'dashboard' },
  { id: 'projects',    label: 'Proyectos',    icon: 'kanban' },
  { id: 'suppliers',   label: 'Proveedores',  icon: 'suppliers'},
  { id: 'orders',      label: 'Órdenes de Compra', icon: 'orders'},
  { id: 'payments',    label: 'Pagos',        icon: 'money' },
  { id: 'clients',     label: 'Clientes',     icon: 'clients' },
  { id: 'commissions', label: 'Comisiones',   icon: 'commissions' },
]
const TITLES: Record<Route, string> = {
  dashboard: 'Panel general', projects: 'Proyectos', suppliers: 'Proveedores',
  orders: 'Órdenes de Compra', payments: 'Pagos', clients: 'Clientes', commissions: 'Comisiones',
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
  "light": false
}/*EDITMODE-END*/

function Sidebar({ route, setRoute }: { route: Route; setRoute: (r: Route) => void }) {
  const { state } = useStore()
  const counts: Record<CountKey, number> = {
    activeProjects: state.projects.filter(p => p.stage !== 'finalizado').length,
    suppliers: state.suppliers.filter(s => s.active).length,
    orders: state.orders.length,
    payments: state.payments.length,
    clients: state.clients.length,
  }
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">CC</div>
        <div className="brand-text">
          <div className="brand-name">CC RACKS</div>
          <div className="brand-sub">Operaciones · CRM</div>
        </div>
      </div>
      <nav className="nav">
        <div className="nav-sec">Operación</div>
        {NAV.map(n => (
          <div key={n.id} className={'nav-item' + (route === n.id ? ' active' : '')} onClick={() => setRoute(n.id)} title={n.label}>
            <Icon name={n.icon} size={18} />
            <span className="nav-label">{n.label}</span>
            {n.countKey && counts[n.countKey] != null && <span className="nav-count">{counts[n.countKey]}</span>}
          </div>
        ))}
      </nav>
      <div className="sidebar-foot">
        <div className="user-chip">
          <span className="avatar">BS</span>
          <div className="brand-text flex-1 min-w-0">
            <div className="text-[12.5px] font-semibold">Bladimir Sanchez</div>
            <div className="meta text-[10.5px]">Coord. Logística</div>
          </div>
        </div>
      </div>
    </aside>
  )
}

function Shell() {
  const [route, setRoute] = React.useState<Route>('dashboard')
  const [collapsed, setCollapsed] = React.useState(false)
  const [openProj, setOpenProj] = React.useState<Project | null>(null)
  const [editProj, setEditProj] = React.useState<Project | null>(null)
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS)

  // apply tweaks
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

  const onOpenProject = (p: Project) => { setOpenProj(p); setEditProj(null) }

  const page = () => {
    switch (route) {
      case 'dashboard':   return <DashboardPage onNavigate={(r) => setRoute(r as Route)} onOpenProject={onOpenProject} />
      case 'projects':    return <ProjectsPage />
      case 'suppliers':   return <SuppliersPage />
      case 'orders':      return <OrdersPage />
      case 'payments':    return <PaymentsPage />
      case 'clients':     return <ClientsPage onOpenProject={onOpenProject} />
      case 'commissions': return <CommissionsPage />
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
          <button className="icon-btn" onClick={() => setTweak('light', !t.light)} title={t.light ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}>
            <Icon name={t.light ? 'sun' : 'moon'} size={17} />
          </button>
          <button className="icon-btn" title="Buscar"><Icon name="search" size={17} /></button>
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

export default function App() {
  return <StoreProvider><Shell /></StoreProvider>
}
