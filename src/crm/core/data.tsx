// ============================================================
//  DATA — stages, seed data, helpers, in-memory store
// ============================================================
import * as React from 'react'
import type {
  Action,
  Activity,
  AppState,
  Client,
  ClientPayment,
  Commission,
  Notification,
  OcStatus,
  Order,
  PayStatus,
  Payment,
  Project,
  Role,
  Seller,
  Stage,
  StageId,
  StateAction,
  User,
  Supplier,
  Remision,
  InternalPayment,
} from './types'
import {
  fetchMyProfile, signOut, loadAll,
  saveProject, deleteProject as apiDeleteProject,
  saveOrder, deleteOrder as apiDeleteOrder,
  savePayment, deletePayment as apiDeletePayment,
  saveClientPayment, deleteClientPayment as apiDeleteClientPayment,
  saveCommission, deleteCommission, saveClientRow, deleteClient as apiDeleteClient, saveSupplierRow, deleteSupplier as apiDeleteSupplier, saveSeller, deleteSeller as apiDeleteSeller,
  saveRemision, deleteRemision as apiDeleteRemision,
  saveInternalPayment, deleteInternalPayment as apiDeleteInternalPayment,
  saveActivity,
  saveNotification, markNotificationRead, markAllNotificationsRead, subscribeToNotifications,
  subscribeToData,
} from './api'
import { supabase } from './supabase'

/* ---- Roles ---- */
export const ROLE_LABELS: Record<Role, string> = {
  superadmin: 'Super Admin',
  admin: 'Administrador',
  ventas: 'Ventas',
  logistica: 'Logística',
  almacen: 'Almacén',
  direccion: 'Dirección',
}
export const roleLabel = (role?: Role | null) => (role ? ROLE_LABELS[role] : '—')
/** Acceso a nivel administrador (panel admin, gestión de usuarios). */
export const isAdminRole = (role?: Role | null) => role === 'admin' || role === 'superadmin'
/** Solo el programador: cosas exclusivas como suplantar usuarios o asignar el rol superadmin. */
export const isSuperadmin = (role?: Role | null) => role === 'superadmin'
/** Rol Ventas: acceso restringido (solo sus proyectos/OC, sin pagos/cobranza/etc.). */
export const isVentasRole = (role?: Role | null) => role === 'ventas'
/** Rol Logística: ve todos los proyectos/OC + asignación, remisiones y pagos internos. */
export const isLogisticaRole = (role?: Role | null) => role === 'logistica'

/** ¿El usuario puede EDITAR este proyecto?
 *  - Admin / Super Admin: siempre.
 *  - Ventas: solo el suyo y solo ANTES de confirmar la venta (etapa "registro").
 *  - Otros roles: no. */
export const canEditProject = (user: User | null | undefined, p: Project) => {
  if (!user) return false
  if (isAdminRole(user.role)) return true
  if (user.role === 'ventas') return p.seller === user.id && p.stage === 'registro'
  return false
}

/* ---- The 9 pipeline stages (exact, in order) ---- */
export const STAGES: Stage[] = [
  { id: 'registro',     n: 1, label: 'Registro de Venta',            short: 'Registro de Venta',     color: 'var(--st-1)', icon: 'flag',        hint: 'Captura inicial de datos de la venta' },
  { id: 'creacion',     n: 2, label: 'Creación del Proyecto',        short: 'Creación del Proyecto',     color: 'var(--st-2)', icon: 'docPlus',     hint: 'Admin captura la info del correo del vendedor' },
  { id: 'asignacion',   n: 3, label: 'Asignación de Proveedor / OC', short: 'Asign. / OC',  color: 'var(--st-3)', icon: 'handshake',   hint: 'Proveedor elegido, OC creada, anticipo pagado' },
  { id: 'compra',       n: 4, label: 'Creacion de orden de Compra', short: 'Orden de Compra',  color: 'var(--st-10)', icon: 'doc',   hint: 'Creacion de orden de Compra' },
  { id: 'fabricacion',  n: 5, label: 'En Fabricación',               short: 'Fabricación',  color: 'var(--st-4)', icon: 'factory',     hint: 'Fabricación en proceso, logística da seguimiento' },
  { id: 'entrega_est',  n: 6, label: 'Fecha Entrega Estimada',       short: 'Entrega Est.', color: 'var(--st-5)', icon: 'calendar',    hint: 'Proveedor da ETA, cliente notificado, espera finiquito' },
  { id: 'pago',         n: 7, label: 'Pago Recibido',                short: 'Pago Recibido',color: 'var(--st-6)', icon: 'money',       hint: 'Cliente pagó completo, logística coordina envío' },
  { id: 'coordinacion', n: 8, label: 'Coordinación Envío/Instalación',short: 'Coordinación',color: 'var(--st-7)', icon: 'truck',      hint: 'Define proveedores de servicio, crea remisión' },
  { id: 'instalacion',  n: 9, label: 'Instalación en Curso',         short: 'Instalación',  color: 'var(--st-8)', icon: 'layers',      hint: 'Material en destino con instaladores' },
  { id: 'finalizado',   n: 10, label: 'Finalizado',                   short: 'Finalizado',   color: 'var(--st-9)', icon: 'check',       hint: 'Carta fin de obra firmada, proyecto cerrado' },
]
export const STAGE_MAP = Object.fromEntries(STAGES.map(s => [s.id, s])) as Record<StageId, Stage>
export const stageIndex = (id: StageId) => STAGES.findIndex(s => s.id === id)

/* ---- Helpers ---- */
const MXN = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 })
const MXN2 = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 2 })
export const fmtMoney = (n?: number) => MXN.format(n || 0)
export const fmtMoney2 = (n?: number) => MXN2.format(n || 0)
export const fmtK = (n?: number | null) => {
  if (n == null) return '—'
  if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M'
  if (Math.abs(n) >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'k'
  return '$' + n
}
export const MESES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
export const MESES_L = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
export const fmtDate = (d?: string) => { if (!d) return '—'; const x = new Date(d + 'T00:00:00'); return `${String(x.getDate()).padStart(2,'0')} ${MESES[x.getMonth()]} ${x.getFullYear()}` }
export const fmtDateShort = (d?: string) => { if (!d) return '—'; const x = new Date(d + 'T00:00:00'); return `${String(x.getDate()).padStart(2,'0')}/${String(x.getMonth()+1).padStart(2,'0')}/${String(x.getFullYear()).slice(2)}` }
// "Hoy" real (medianoche local), para que los días/vencimientos usen la fecha actual.
export const TODAY = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d })()
export const TODAY_ISO = `${TODAY.getFullYear()}-${String(TODAY.getMonth() + 1).padStart(2, '0')}-${String(TODAY.getDate()).padStart(2, '0')}`
export const daysBetween = (d?: string) => { if (!d) return null; const x = new Date(d + 'T00:00:00'); return Math.round((x.getTime() - TODAY.getTime()) / 86400000) }
// Suma `days` días a una fecha ISO (o a hoy si no se da base) y devuelve ISO (YYYY-MM-DD).
export const addDays = (days: number, base?: string) => {
  const d = base ? new Date(base + 'T00:00:00') : new Date(TODAY)
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
export const ago = (d: string) => {
  const x = new Date(d); const diff = Math.round((TODAY.getTime() - x.getTime()) / 86400000)
  if (diff <= 0) return 'hoy'
  if (diff === 1) return 'ayer'
  if (diff < 7) return `hace ${diff} días`
  if (diff < 30) return `hace ${Math.round(diff/7)} sem`
  return `hace ${Math.round(diff/30)} meses`
}
let _id = 1000
// Id ÚNICO entre sesiones. Antes era solo `${p}-${++_id}` con un contador que se
// reinicia en cada recarga; como guardamos con upsert (INSERT ... ON CONFLICT DO
// UPDATE), un id repetido SOBREESCRIBE un registro existente en vez de crear uno
// nuevo (data-loss silencioso). El timestamp en base36 lo hace único por sesión y
// el contador evita choques dentro del mismo milisegundo. Cabe en VARCHAR(20).
export const uid = (p = 'id') => `${p}-${Date.now().toString(36)}${(++_id).toString(36)}`

/** Abreviación de estado a partir de la ciudad ("Monterrey, N.L." → "N.L."). */
const CITY_ABBR: Record<string, string> = {
  'Ciudad de México': 'CDMX',
  'Estado de México': 'Edo. Méx.',
}
export const cityAbbr = (city?: string) => {
  if (!city) return '—'
  if (city.includes(',')) return city.split(',').pop()!.trim()
  return CITY_ABBR[city.trim()] || city.trim()
}

/* ---- Document helpers ---- */
export const docOK = (name: string) => ({ name, ok: true })
export const docNo = () => ({ name: '', ok: false })

/** Etiquetas de los 7 documentos de un proyecto, en orden. */
export const DOC_LABELS: { key: keyof Project['docs']; label: string }[] = [
  { key: 'cotizacion', label: 'Cotización' },
  { key: 'layout', label: 'Lay out' },
  { key: 'anticipo', label: 'Anticipo' },
  { key: 'ordenCompra', label: 'Orden de compra' },
  { key: 'finiquito', label: 'Finiquito' },
  { key: 'remision', label: 'Remisión de salida' },
  { key: 'cartaFin', label: 'Carta fin de obra' },
]

/** Conteo de documentos completos de un proyecto (de 7). */
export function docCount(p: Project) {
  const d = p.docs
  const all = [d.cotizacion, d.layout, d.anticipo, d.ordenCompra, d.finiquito, d.remision, d.cartaFin]
  return { done: all.filter(x => x.ok).length, total: 7 }
}

/* ---- Catálogo de Régimen Fiscal (SAT) ---- */
export const REGIMEN_FISCAL: Record<string, string> = {
  '601': 'General de Ley Personas Morales',
  '603': 'Personas Morales con Fines no Lucrativos',
  '605': 'Sueldos y Salarios e Ingresos Asimilados a Salarios',
  '606': 'Arrendamiento',
  '607': 'Régimen de Enajenación o Adquisición de Bienes',
  '608': 'Demás ingresos',
  '610': 'Residentes en el Extranjero sin Establecimiento Permanente',
  '611': 'Ingresos por Dividendos (socios y accionistas)',
  '612': 'Personas Físicas con Actividades Empresariales y Profesionales',
  '614': 'Ingresos por intereses',
  '615': 'Régimen de los ingresos por obtención de premios',
  '616': 'Sin obligaciones fiscales',
  '620': 'Sociedades Cooperativas de Producción que difieren ingresos',
  '621': 'Incorporación Fiscal',
  '622': 'Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras',
  '623': 'Opcional para Grupos de Sociedades',
  '624': 'Coordinados',
  '625': 'Actividades Empresariales con ingresos vía Plataformas Tecnológicas',
  '626': 'Régimen Simplificado de Confianza (RESICO)',
}
/** Etiqueta legible de un régimen fiscal: "612 · Personas Físicas…". */
export const regimenLabel = (code?: string) =>
  !code ? '—' : REGIMEN_FISCAL[code] ? `${code} · ${REGIMEN_FISCAL[code]}` : code

// Datos mock eliminados: el estado se carga desde Supabase tras el login.

// ============================================================
//  STORE — context + reducer
// ============================================================
const initial: AppState = {
  projects: [], suppliers: [], orders: [], payments: [], clientPayments: [],
  clients: [], sellers: [], commissions: [], remisiones: [], internalPayments: [],
  activity: [], notifications: [],
  users: [], currentUser: null,   // todo se carga desde Supabase tras el login
}

/* Helpers de fecha/usuario para las acciones. */
const today = () => new Date().toISOString().slice(0, 10)
const nowISO = () => new Date().toISOString()
const curMonth = () => new Date().toISOString().slice(0, 7)
const whoName = (s: AppState) => s.currentUser?.name ?? 'Sistema'

/** Construye las comisiones de un proyecto finalizado según el estado ACTUAL:
 *  - principal: el % del vendedor del proyecto sobre la base (flete + instalación).
 *  - override: el % de cada persona con override > 0 que NO sea el vendedor.
 *  `paid` (ids de beneficiarios ya pagados) preserva ese estado al recalcular. */
function buildCommissions(s: AppState, proj: Project, paid?: Set<string>): Commission[] {
  // Base = utilidad sin IVA (subtotal de venta − subtotal de compras/gastos).
  const base = sel.projectComisionBase(s, proj)
  const month = curMonth()
  const seller = s.sellers.find(x => x.id === proj.seller)
  const list: Commission[] = [{
    id: uid('cm'), projectId: proj.id, seller: proj.seller,
    amount: Math.round(base * (seller ? seller.rate : 0.04)),
    status: paid?.has(proj.seller) ? 'paid' : 'pending', month,
  }]
  for (const v of s.sellers) {
    if (v.overrideRate && v.overrideRate > 0 && v.id !== proj.seller) {
      list.push({
        id: uid('cm'), projectId: proj.id, seller: v.id,
        amount: Math.round(base * v.overrideRate),
        status: paid?.has(v.id) ? 'paid' : 'pending', month,
      })
    }
  }
  return list
}

/* Reducer PURO: solo aplica cambios al estado local. La persistencia en
   Supabase la maneja el wrapper `dispatch` de StoreProvider. */
function upsertBy<T extends { id: string }>(list: T[], item: T): T[] {
  return list.some(x => x.id === item.id) ? list.map(x => (x.id === item.id ? item : x)) : [item, ...list]
}

function reducer(state: AppState, a: StateAction): AppState {
  switch (a.type) {
    case 'HYDRATE': return { ...state, ...a.data }
    case 'LOGIN': return { ...state, currentUser: a.user }
    case 'LOGOUT': return { ...state, currentUser: null }
    case 'UPSERT_PROJECT': return { ...state, projects: upsertBy(state.projects, a.project) }
    case 'REMOVE_PROJECT':
      return { ...state, projects: state.projects.filter(p => p.id !== a.id), clientPayments: state.clientPayments.filter(c => c.projectId !== a.id) }
    case 'UPSERT_ORDER': return { ...state, orders: upsertBy(state.orders, a.order) }
    case 'REMOVE_ORDER':
      return { ...state, orders: state.orders.filter(o => o.id !== a.id), payments: state.payments.filter(p => p.orderId !== a.id) }
    case 'UPSERT_PAYMENT': return { ...state, payments: upsertBy(state.payments, a.payment) }
    case 'REMOVE_PAYMENT': return { ...state, payments: state.payments.filter(p => p.id !== a.id) }
    case 'UPSERT_CLIENT_PAYMENT': return { ...state, clientPayments: upsertBy(state.clientPayments, a.payment) }
    case 'REMOVE_CLIENT_PAYMENT': return { ...state, clientPayments: state.clientPayments.filter(c => c.id !== a.id) }
    case 'UPSERT_COMMISSION': return { ...state, commissions: upsertBy(state.commissions, a.commission) }
    case 'REMOVE_COMMISSION': return { ...state, commissions: state.commissions.filter(c => c.id !== a.id) }
    case 'UPSERT_CLIENT': return { ...state, clients: upsertBy(state.clients, a.client) }
    case 'REMOVE_CLIENT': return { ...state, clients: state.clients.filter(c => c.id !== a.id) }
    case 'UPSERT_SUPPLIER': return { ...state, suppliers: upsertBy(state.suppliers, a.supplier) }
    case 'REMOVE_SUPPLIER': return { ...state, suppliers: state.suppliers.filter(s => s.id !== a.id) }
    case 'UPSERT_SELLER': return { ...state, sellers: upsertBy(state.sellers, a.seller) }
    case 'REMOVE_SELLER': return { ...state, sellers: state.sellers.filter(s => s.id !== a.id) }
    case 'UPSERT_REMISION': return { ...state, remisiones: upsertBy(state.remisiones, a.remision) }
    case 'REMOVE_REMISION': return { ...state, remisiones: state.remisiones.filter(r => r.id !== a.id) }
    case 'UPSERT_INTERNAL_PAYMENT': return { ...state, internalPayments: upsertBy(state.internalPayments, a.payment) }
    case 'REMOVE_INTERNAL_PAYMENT': return { ...state, internalPayments: state.internalPayments.filter(p => p.id !== a.id) }
    case 'PUSH_ACTIVITY': return { ...state, activity: [a.activity, ...state.activity].slice(0, 40) }
    case 'UPSERT_NOTIFICATION': return { ...state, notifications: upsertBy(state.notifications, a.notification) }
    case 'MARK_ALL_NOTIFICATIONS_READ': return { ...state, notifications: state.notifications.map(n => n.read ? n : { ...n, read: true }) }
    default: return state
  }
}

export interface StoreValue {
  state: AppState
  dispatch: React.Dispatch<Action>
}

const StoreCtx = React.createContext<StoreValue | null>(null)

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, rawDispatch] = React.useReducer(reducer, initial)
  const stateRef = React.useRef(state)
  stateRef.current = state

  // Recarga TODO desde la base (resync tras un error de guardado).
  const reloadAll = React.useCallback(() => {
    loadAll()
      .then(data => rawDispatch({ type: 'HYDRATE', data }))
      .catch(err => console.error('[supabase] Error recargando datos:', err))
  }, [])

  // Ejecuta las escrituras en Supabase; si fallan, avisa y re-sincroniza.
  const persist = React.useCallback((thunks: (() => Promise<void>)[]) => {
    Promise.all(thunks.map(t => t())).catch(err => {
      console.error('[supabase] Error guardando, re-sincronizando:', err)
      alert('No se pudo guardar el cambio en la base. Se recargarán los datos.')
      reloadAll()
    })
  }, [reloadAll])

  // Reconciliación de un proyecto a partir de sus datos:
  //  1) Finiquito: "paid" si el cliente cubrió el total con IVA (bidireccional).
  //  2) Etapa: auto-avance SOLO hacia adelante y a partir de "creación"
  //     (registro→creación es confirmación manual).
  const reconcileProject = React.useCallback((ns: AppState, pid: string) => {
    const proj = ns.projects.find(p => p.id === pid)
    if (!proj) return
    // 1) Finiquito reflejo de la cobranza.
    const total = sel.projectTotalConIva(proj)
    const finiquito: PayStatus = total > 0 && sel.projectCobrado(ns, pid) >= total - 0.5 ? 'paid' : 'pending'
    // 2) Etapa.
    let stage = proj.stage
    if (stageIndex(proj.stage) >= stageIndex('creacion')) {
      const target = autoStageFor(ns, proj)
      if (target && stageIndex(target) > stageIndex(proj.stage)) stage = target
    }
    if (stage === proj.stage && finiquito === proj.finiquito) return    // nada que cambiar
    const updated: Project = { ...proj, stage, finiquito, updated: today() }
    rawDispatch({ type: 'UPSERT_PROJECT', project: updated })
    const thunks: (() => Promise<void>)[] = [() => saveProject(updated)]
    if (stage !== proj.stage) {                                          // hubo avance de etapa
      const stg = STAGE_MAP[stage]
      const activity: Activity = { id: uid('a'), t: nowISO(), icon: stg.icon, who: 'Sistema', txt: `avanzó automáticamente a ${stg.short}`, tgt: proj.code, kind: 'info' }
      rawDispatch({ type: 'PUSH_ACTIVITY', activity })
      thunks.push(() => saveActivity(activity))
    }
    persist(thunks)
  }, [persist])

  // dispatch PÚBLICO: aplica el cambio localmente (optimista) y lo persiste.
  const dispatch = React.useCallback((action: Action) => {
    const s = stateRef.current
    // Recalcula las comisiones de un proyecto: borra las viejas y crea nuevas según el
    // estado actual (vendedor, utilidad, overrides), preservando "pagada" por beneficiario.
    // `calcState` permite calcular con datos recién modificados (p. ej. la OC nueva).
    const regenCommissions = (proj: Project, thunks: (() => Promise<void>)[], calcState: AppState = s) => {
      const existing = s.commissions.filter(c => c.projectId === proj.id)
      const paid = new Set(existing.filter(c => c.status === 'paid').map(c => c.seller))
      for (const old of existing) {
        rawDispatch({ type: 'REMOVE_COMMISSION', id: old.id })
        thunks.push(() => deleteCommission(old.id))
      }
      for (const cm of buildCommissions(calcState, proj, paid)) {
        rawDispatch({ type: 'UPSERT_COMMISSION', commission: cm })
        thunks.push(() => saveCommission(cm))
      }
    }
    switch (action.type) {
      case 'HYDRATE': rawDispatch(action); return
      case 'LOGIN': rawDispatch(action); return
      case 'LOGOUT': rawDispatch(action); return

      case 'MOVE_STAGE': {
        const proj = s.projects.find(p => p.id === action.id); if (!proj) return
        const updated: Project = { ...proj, stage: action.stage, updated: today(), ...(action.stage === 'finalizado' ? { closedOn: today() } : {}) }
        rawDispatch({ type: 'UPSERT_PROJECT', project: updated })
        const thunks: (() => Promise<void>)[] = [() => saveProject(updated)]
        if (action.stage === 'finalizado' && !s.commissions.some(c => c.projectId === action.id)) {
          // Principal (vendedor) + override de cada persona con override, según el estado actual.
          for (const cm of buildCommissions(s, updated)) {
            rawDispatch({ type: 'UPSERT_COMMISSION', commission: cm })
            thunks.push(() => saveCommission(cm))
          }
        }
        const stg = STAGE_MAP[action.stage]
        const activity: Activity = { id: uid('a'), t: nowISO(), icon: stg.icon, who: whoName(s), txt: `movió a ${stg.short}`, tgt: proj.code, kind: 'info' }
        rawDispatch({ type: 'PUSH_ACTIVITY', activity })
        thunks.push(() => saveActivity(activity))
        persist(thunks); return
      }

      case 'SAVE_PROJECT': {
        const isNew = !action.project.id || !s.projects.some(p => p.id === action.project.id)
        const full: Project = isNew
          ? { ...(action.project as Project), id: action.project.id ?? uid('p'), created: today(), updated: today() }
          : { ...(action.project as Project), updated: today() }
        rawDispatch({ type: 'UPSERT_PROJECT', project: full })
        const thunks: (() => Promise<void>)[] = [() => saveProject(full)]
        if (isNew) {
          const activity: Activity = { id: uid('a'), t: nowISO(), icon: 'flag', who: whoName(s), txt: 'registró nueva venta', tgt: full.code, kind: 'new' }
          rawDispatch({ type: 'PUSH_ACTIVITY', activity })
          thunks.push(() => saveActivity(activity))
          // Cuando un VENDEDOR registra una venta, avisa a los administradores para que
          // den seguimiento al proceso. Best-effort: NO va en el lote del proyecto, así
          // que si falla no rompe ni alerta el guardado (solo se loguea). No se agrega al
          // estado local porque son notificaciones para OTROS usuarios (RLS las acota).
          if (s.currentUser?.role === 'ventas') {
            const clientName = sel.clientName(s, full.client)
            const admins = s.users.filter(u => isAdminRole(u.role) && u.active && u.id !== s.currentUser!.id)
            for (const adminUser of admins) {
              const notification: Notification = {
                id: uid('nt'), userId: adminUser.id, kind: 'project_created',
                title: `Nueva venta: ${full.code}`,
                body: `${whoName(s)} registró una venta${clientName ? ` de ${clientName}` : ''}. Da seguimiento al proceso.`,
                read: false, createdAt: nowISO(), projectId: full.id, actorName: whoName(s),
              }
              saveNotification(notification).catch(err =>
                console.error('[notif] no se pudo crear la notificación para', adminUser.email, err))
            }
          }
        } else {
          // Edición: si el proyecto está finalizado y cambió el vendedor o el subtotal de
          // venta (base de la utilidad), recalcula sus comisiones.
          const prev = s.projects.find(p => p.id === full.id)
          if (full.stage === 'finalizado' && prev &&
              (prev.seller !== full.seller || (prev.ventaSubtotal || 0) !== (full.ventaSubtotal || 0))) {
            regenCommissions(full, thunks)
          }
        }
        persist(thunks); return
      }
      case 'DELETE_PROJECT':
        rawDispatch({ type: 'REMOVE_PROJECT', id: action.id })
        persist([() => apiDeleteProject(action.id)]); return

      case 'SAVE_SUPPLIER': {
        const full: Supplier = { ...(action.supplier as Supplier), id: action.supplier.id ?? uid('s') }
        rawDispatch({ type: 'UPSERT_SUPPLIER', supplier: full })
        persist([() => saveSupplierRow(full)]); return
      }
      case 'TOGGLE_SUPPLIER': {
        const sup = s.suppliers.find(x => x.id === action.id); if (!sup) return
        const updated: Supplier = { ...sup, active: !sup.active }
        rawDispatch({ type: 'UPSERT_SUPPLIER', supplier: updated })
        persist([() => saveSupplierRow(updated)]); return
      }
      case 'DELETE_SUPPLIER':
        rawDispatch({ type: 'REMOVE_SUPPLIER', id: action.id })
        persist([() => apiDeleteSupplier(action.id)]); return

      case 'SAVE_ORDER': {
        const full: Order = { ...(action.order as Order), id: action.order.id ?? uid('oc') }
        rawDispatch({ type: 'UPSERT_ORDER', order: full })
        const thunks: (() => Promise<void>)[] = [() => saveOrder(full)]
        // Si la OC pertenece a un proyecto FINALIZADO, recalcula sus comisiones (cambia la utilidad).
        const proj = full.projectId ? s.projects.find(p => p.id === full.projectId) : undefined
        if (proj && proj.stage === 'finalizado') {
          regenCommissions(proj, thunks, { ...s, orders: upsertBy(s.orders, full) })
        }
        persist(thunks); return
      }
      case 'DELETE_ORDER': {
        const ord = s.orders.find(o => o.id === action.id)
        rawDispatch({ type: 'REMOVE_ORDER', id: action.id })
        const thunks: (() => Promise<void>)[] = [() => apiDeleteOrder(action.id)]
        const proj = ord?.projectId ? s.projects.find(p => p.id === ord.projectId) : undefined
        if (proj && proj.stage === 'finalizado') {
          regenCommissions(proj, thunks, { ...s, orders: s.orders.filter(o => o.id !== action.id) })
        }
        persist(thunks); return
      }

      case 'SAVE_PAYMENT': {
        const full: Payment = { ...(action.payment as Payment), id: action.payment.id ?? uid('pg') }
        rawDispatch({ type: 'UPSERT_PAYMENT', payment: full })
        persist([() => savePayment(full)]); return
      }
      case 'DELETE_PAYMENT':
        rawDispatch({ type: 'REMOVE_PAYMENT', id: action.id })
        persist([() => apiDeletePayment(action.id)]); return

      case 'SAVE_CLIENT_PAYMENT': {
        const full: ClientPayment = { ...(action.payment as ClientPayment), id: action.payment.id ?? uid('cp') }
        rawDispatch({ type: 'UPSERT_CLIENT_PAYMENT', payment: full })
        persist([() => saveClientPayment(full)]); return
      }
      case 'DELETE_CLIENT_PAYMENT':
        rawDispatch({ type: 'REMOVE_CLIENT_PAYMENT', id: action.id })
        persist([() => apiDeleteClientPayment(action.id)]); return

      case 'SAVE_CLIENT': {
        const existing = s.clients.find(c => c.id === action.client.id)
        const full: Client = {
          ...(action.client as Client),
          id: action.client.id ?? uid('c'),
          since: action.client.since ?? existing?.since ?? today(),
        }
        rawDispatch({ type: 'UPSERT_CLIENT', client: full })
        persist([() => saveClientRow(full)]); return
      }
      case 'DELETE_CLIENT':
        rawDispatch({ type: 'REMOVE_CLIENT', id: action.id })
        persist([() => apiDeleteClient(action.id)]); return

      case 'TOGGLE_COMMISSION': {
        const com = s.commissions.find(c => c.id === action.id); if (!com) return
        const updated: Commission = { ...com, status: com.status === 'paid' ? 'pending' : 'paid' }
        rawDispatch({ type: 'UPSERT_COMMISSION', commission: updated })
        persist([() => saveCommission(updated)]); return
      }
      case 'RECALC_COMMISSIONS': {
        const proj = s.projects.find(p => p.id === action.id)
        if (!proj || proj.stage !== 'finalizado') return
        const thunks: (() => Promise<void>)[] = []
        regenCommissions(proj, thunks)
        persist(thunks); return
      }

      case 'SAVE_SELLER': {
        const full: Seller = { ...(action.seller as Seller), id: action.seller.id ?? uid('v') }
        rawDispatch({ type: 'UPSERT_SELLER', seller: full })
        persist([() => saveSeller(full)]); return
      }
      case 'DELETE_SELLER':
        rawDispatch({ type: 'REMOVE_SELLER', id: action.id })
        persist([() => apiDeleteSeller(action.id)]); return

      case 'SAVE_REMISION': {
        const isNew = !action.remision.id || !s.remisiones.some(r => r.id === action.remision.id)
        const full: Remision = {
          ...(action.remision as Remision),
          id: action.remision.id ?? uid('rm'),
          createdBy: action.remision.createdBy ?? s.currentUser?.id ?? '',
          createdAt: action.remision.createdAt ?? nowISO(),
        }
        rawDispatch({ type: 'UPSERT_REMISION', remision: full })
        const thunks: (() => Promise<void>)[] = [() => saveRemision(full)]
        if (isNew) {
          const activity: Activity = { id: uid('a'), t: nowISO(), icon: 'truck', who: whoName(s), txt: `creó la remisión ${full.number}`, tgt: full.number, kind: 'work' }
          rawDispatch({ type: 'PUSH_ACTIVITY', activity })
          thunks.push(() => saveActivity(activity))
        }
        persist(thunks); return
      }
      case 'DELETE_REMISION':
        rawDispatch({ type: 'REMOVE_REMISION', id: action.id })
        persist([() => apiDeleteRemision(action.id)]); return

      case 'SAVE_INTERNAL_PAYMENT': {
        const isNew = !action.payment.id || !s.internalPayments.some(p => p.id === action.payment.id)
        const full: InternalPayment = {
          ...(action.payment as InternalPayment),
          id: action.payment.id ?? uid('ip'),
          requestedBy: action.payment.requestedBy ?? s.currentUser?.id ?? '',
          createdAt: action.payment.createdAt ?? nowISO(),
        }
        rawDispatch({ type: 'UPSERT_INTERNAL_PAYMENT', payment: full })
        const thunks: (() => Promise<void>)[] = [() => saveInternalPayment(full)]
        if (isNew) {
          const activity: Activity = { id: uid('a'), t: nowISO(), icon: 'money', who: whoName(s), txt: `solicitó un pago interno (${full.category})`, tgt: full.concept, kind: 'money' }
          rawDispatch({ type: 'PUSH_ACTIVITY', activity })
          thunks.push(() => saveActivity(activity))
          // Avisa a los administradores que hay un pago pendiente de aprobación.
          if (full.status === 'Pendiente') {
            const admins = s.users.filter(u => isAdminRole(u.role) && u.active && u.id !== s.currentUser?.id)
            for (const adminUser of admins) {
              const notification: Notification = {
                id: uid('nt'), userId: adminUser.id, kind: 'internal_payment_requested',
                title: `Pago interno por aprobar: ${full.concept}`,
                body: `${whoName(s)} solicitó un pago de ${fmtMoney(full.amount)} (${full.category}). Requiere tu aprobación.`,
                read: false, createdAt: nowISO(), internalPaymentId: full.id, actorName: whoName(s),
              }
              saveNotification(notification).catch(err =>
                console.error('[notif] no se pudo crear la notificación para', adminUser.email, err))
            }
          }
        }
        // Si está ligado a un proyecto FINALIZADO, recalcula comisiones (cambia la utilidad).
        const ipProj = full.projectId ? s.projects.find(p => p.id === full.projectId) : undefined
        if (ipProj && ipProj.stage === 'finalizado') {
          regenCommissions(ipProj, thunks, { ...s, internalPayments: upsertBy(s.internalPayments, full) })
        }
        persist(thunks); return
      }
      case 'DELETE_INTERNAL_PAYMENT': {
        const ip = s.internalPayments.find(p => p.id === action.id)
        rawDispatch({ type: 'REMOVE_INTERNAL_PAYMENT', id: action.id })
        const thunks: (() => Promise<void>)[] = [() => apiDeleteInternalPayment(action.id)]
        const proj = ip?.projectId ? s.projects.find(p => p.id === ip.projectId) : undefined
        if (proj && proj.stage === 'finalizado') {
          regenCommissions(proj, thunks, { ...s, internalPayments: s.internalPayments.filter(p => p.id !== action.id) })
        }
        persist(thunks); return
      }

      case 'DECIDE_INTERNAL_PAYMENT': {
        const ip = s.internalPayments.find(p => p.id === action.id); if (!ip) return
        const updated: InternalPayment = {
          ...ip,
          status: action.approve ? 'Aprobado' : 'Rechazado',
          approvedBy: s.currentUser?.id ?? '',
          decidedAt: nowISO(),
          ...(action.approve ? {} : { rejectReason: action.reason ?? '' }),
        }
        rawDispatch({ type: 'UPSERT_INTERNAL_PAYMENT', payment: updated })
        const thunks: (() => Promise<void>)[] = [() => saveInternalPayment(updated)]
        const activity: Activity = { id: uid('a'), t: nowISO(), icon: action.approve ? 'check' : 'close', who: whoName(s), txt: `${action.approve ? 'aprobó' : 'rechazó'} el pago interno`, tgt: ip.concept, kind: action.approve ? 'done' : 'info' }
        rawDispatch({ type: 'PUSH_ACTIVITY', activity })
        thunks.push(() => saveActivity(activity))
        // Avisa al solicitante la decisión.
        if (ip.requestedBy && ip.requestedBy !== s.currentUser?.id) {
          const notification: Notification = {
            id: uid('nt'), userId: ip.requestedBy, kind: 'internal_payment_decided',
            title: `Pago interno ${action.approve ? 'aprobado' : 'rechazado'}: ${ip.concept}`,
            body: action.approve
              ? `${whoName(s)} aprobó tu pago de ${fmtMoney(ip.amount)}. Ya puedes agendarlo.`
              : `${whoName(s)} rechazó tu pago de ${fmtMoney(ip.amount)}.${action.reason ? ` Motivo: ${action.reason}` : ''}`,
            read: false, createdAt: nowISO(), internalPaymentId: ip.id, actorName: whoName(s),
          }
          saveNotification(notification).catch(err =>
            console.error('[notif] no se pudo crear la notificación de decisión', err))
        }
        // Un rechazo saca el gasto de la utilidad; si el proyecto está finalizado, recalcula comisiones.
        const decProj = ip.projectId ? s.projects.find(p => p.id === ip.projectId) : undefined
        if (decProj && decProj.stage === 'finalizado') {
          regenCommissions(decProj, thunks, { ...s, internalPayments: upsertBy(s.internalPayments, updated) })
        }
        persist(thunks); return
      }

      case 'MARK_NOTIFICATION_READ': {
        const n = s.notifications.find(x => x.id === action.id); if (!n || n.read) return
        rawDispatch({ type: 'UPSERT_NOTIFICATION', notification: { ...n, read: true } })
        persist([() => markNotificationRead(action.id)]); return
      }
      case 'MARK_ALL_NOTIFICATIONS_READ': {
        if (!s.notifications.some(n => !n.read)) return
        rawDispatch({ type: 'MARK_ALL_NOTIFICATIONS_READ' })
        persist([() => markAllNotificationsRead()]); return
      }
    }
  }, [persist])

  // Reconciliación: tras cualquier cambio en proyectos / OC / pagos / cobros
  // (incluida la carga inicial), recalcula etapa y finiquito de cada proyecto.
  // Idempotente: una vez correcto no hace nada, así que converge. También cubre
  // el avance por FECHA (entrega estimada) al recargar.
  React.useEffect(() => {
    for (const p of state.projects) reconcileProject(state, p.id)
  }, [state, reconcileProject])

  // Sesión Supabase: al montar restaura la sesión (si la hay) y, cuando hay
  // usuario, carga su perfil + TODOS los datos. Al cerrar sesión, limpia.
  React.useEffect(() => {
    let active = true

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return
      if (session?.user) {
        fetchMyProfile()
          .then(profile => {
            if (!active || !profile) return
            if (!profile.active) { void signOut(); return }   // usuario desactivado
            rawDispatch({ type: 'LOGIN', user: profile })
            loadAll()
              .then(data => { if (active) rawDispatch({ type: 'HYDRATE', data }) })
              .catch(err => console.error('[supabase] No se pudieron cargar los datos:', err))
          })
          .catch(err => console.error('[supabase] Error cargando el perfil:', err))
      } else {
        rawDispatch({ type: 'LOGOUT' })
      }
    })

    return () => { active = false; sub.subscription.unsubscribe() }
  }, [])

  // Realtime: notificaciones EN VIVO del usuario en sesión (WebSocket por Supabase).
  // Cuando llega un INSERT para él (p. ej. un vendedor registró una venta), aparece
  // al instante en la campana sin recargar. Se re-suscribe si cambia el usuario.
  const myId = state.currentUser?.id
  React.useEffect(() => {
    if (!myId) return
    return subscribeToNotifications(myId, (n) => rawDispatch({ type: 'UPSERT_NOTIFICATION', notification: n }))
  }, [myId])

  // Realtime de DATOS: cuando alguien crea/edita/borra un proyecto, OC, pago, cliente,
  // etc., el cambio aparece EN VIVO en las pantallas de los demás (sin recargar). El
  // upsert/remove por id es idempotente, así que el eco del propio cambio no molesta.
  React.useEffect(() => {
    if (!myId) return
    return subscribeToData((c) => {
      if (c.type === 'delete') {
        switch (c.table) {
          case 'projects':        rawDispatch({ type: 'REMOVE_PROJECT', id: c.id }); break
          case 'orders':          rawDispatch({ type: 'REMOVE_ORDER', id: c.id }); break
          case 'payments':        rawDispatch({ type: 'REMOVE_PAYMENT', id: c.id }); break
          case 'client_payments': rawDispatch({ type: 'REMOVE_CLIENT_PAYMENT', id: c.id }); break
          case 'commissions':     rawDispatch({ type: 'REMOVE_COMMISSION', id: c.id }); break
          case 'clients':         rawDispatch({ type: 'REMOVE_CLIENT', id: c.id }); break
          case 'suppliers':       rawDispatch({ type: 'REMOVE_SUPPLIER', id: c.id }); break
          case 'sellers':         rawDispatch({ type: 'REMOVE_SELLER', id: c.id }); break
          case 'remisiones':      rawDispatch({ type: 'REMOVE_REMISION', id: c.id }); break
          case 'internal_payments': rawDispatch({ type: 'REMOVE_INTERNAL_PAYMENT', id: c.id }); break
        }
      } else {
        switch (c.table) {
          case 'projects':        rawDispatch({ type: 'UPSERT_PROJECT', project: c.row }); break
          case 'orders':          rawDispatch({ type: 'UPSERT_ORDER', order: c.row }); break
          case 'payments':        rawDispatch({ type: 'UPSERT_PAYMENT', payment: c.row }); break
          case 'client_payments': rawDispatch({ type: 'UPSERT_CLIENT_PAYMENT', payment: c.row }); break
          case 'commissions':     rawDispatch({ type: 'UPSERT_COMMISSION', commission: c.row }); break
          case 'clients':         rawDispatch({ type: 'UPSERT_CLIENT', client: c.row }); break
          case 'suppliers':       rawDispatch({ type: 'UPSERT_SUPPLIER', supplier: c.row }); break
          case 'sellers':         rawDispatch({ type: 'UPSERT_SELLER', seller: c.row }); break
          case 'remisiones':      rawDispatch({ type: 'UPSERT_REMISION', remision: c.row }); break
          case 'internal_payments': rawDispatch({ type: 'UPSERT_INTERNAL_PAYMENT', payment: c.row }); break
        }
      }
    })
  }, [myId])

  const value = React.useMemo<StoreValue>(() => ({ state, dispatch }), [state, dispatch])
  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>
}

export function useStore(): StoreValue {
  const ctx = React.useContext(StoreCtx)
  if (!ctx) throw new Error('useStore debe usarse dentro de <StoreProvider>')
  return ctx
}

/* ---- Selectors ---- */
export const sel = {
  clientName: (state: AppState, id: string) => (state.clients.find(c => c.id === id) || ({} as Client)).name || '—',
  client: (state: AppState, id: string) => state.clients.find(c => c.id === id),
  seller: (state: AppState, id: string) => state.sellers.find(s => s.id === id),
  sellerName: (state: AppState, id: string) => (state.sellers.find(s => s.id === id) || ({} as Seller)).name || '—',
  /** Vendedores "reales": registros de comisión que SÍ venden (standalone sin login,
   *  o usuarios de rol Ventas). Excluye a empleados de otros roles que solo cobran
   *  override. Úsalo para el catálogo de Vendedores y para asignar proyectos. */
  vendedores: (state: AppState) => state.sellers.filter(s => {
    const u = state.users.find(x => x.id === s.id)
    return !u || u.role === 'ventas'
  }),
  supplier: (state: AppState, id: string) => state.suppliers.find(s => s.id === id),
  ordersForProject: (state: AppState, pid: string) => state.orders.filter(o => o.projectId === pid),
  ordersForSupplier: (state: AppState, sid: string) => state.orders.filter(o => o.supplierId === sid),
  projectsForClient: (state: AppState, cid: string) => state.projects.filter(p => p.client === cid),
  projectByCode: (state: AppState, code: string) => state.projects.find(p => p.code === code),
  budget: (p: Pick<Project, 'freight' | 'install'>) => (p.freight || 0) + (p.install || 0),

  /* ---- Selectores de OC / Pagos (réplica de las fórmulas del Excel) ---- */
  order: (state: AppState, oid: string) => state.orders.find(o => o.id === oid),
  paymentsForOrder: (state: AppState, oid: string) =>
    state.payments.filter(p => p.orderId === oid).sort((a, b) => a.n - b.n),
  /** Pagado = suma de abonos con estado "Pagado" (Control OC!G). */
  ocPaid: (state: AppState, oid: string) =>
    state.payments.filter(p => p.orderId === oid && p.status === 'Pagado').reduce((a, p) => a + p.amount, 0),
  /** Saldo = Monto Total − Pagado (Control OC!H). */
  ocBalance: (state: AppState, oc: Order) => oc.amount - sel.ocPaid(state, oc.id),
  /** % Pagado (Control OC!I). */
  ocPct: (state: AppState, oc: Order) => (oc.amount ? sel.ocPaid(state, oc.id) / oc.amount : 0),
  /** Fecha último pago = máx. fecha de abonos "Pagado" (Control OC!J). */
  ocLastPayment: (state: AppState, oid: string) => {
    const ds = state.payments.filter(p => p.orderId === oid && p.status === 'Pagado').map(p => p.date)
    return ds.length ? ds.reduce((a, b) => (a > b ? a : b)) : ''
  },
  /** Fecha próximo pago = mín. fecha de abonos "Programado" (Control OC!K). */
  ocNextPayment: (state: AppState, oid: string) => {
    const ds = state.payments.filter(p => p.orderId === oid && p.status === 'Programado').map(p => p.date)
    return ds.length ? ds.reduce((a, b) => (a < b ? a : b)) : ''
  },
  /** Estatus calculado (Control OC!M). */
  ocStatus: (state: AppState, oc: Order): OcStatus => {
    if (oc.cancelled) return 'Cancelada'
    if (sel.ocBalance(state, oc) <= 0) return 'Liquidada'
    const next = sel.ocNextPayment(state, oc.id)
    if (next && next < TODAY_ISO) return 'Vencida'
    if (sel.ocPaid(state, oc.id) > 0) return 'Parcial'
    return 'Pendiente'
  },

  /* ---- Cobros del cliente (ingresos por proyecto) ---- */
  clientPaymentsForProject: (state: AppState, pid: string) =>
    state.clientPayments.filter(c => c.projectId === pid).sort((a, b) => a.n - b.n),
  /** Total de la venta con IVA (subtotal × 1.16), redondeado a centavos. */
  projectTotalConIva: (p: { ventaSubtotal?: number }) => Math.round((p.ventaSubtotal || 0) * 1.16 * 100) / 100,
  /** Compras/gastos del proyecto CON IVA = suma de OC no canceladas (Order.amount ya trae IVA). */
  projectComprasConIva: (state: AppState, pid: string) =>
    state.orders.filter(o => o.projectId === pid && !o.cancelled).reduce((a, o) => a + (o.amount || 0), 0),
  /** Costo REAL de servicios (flete + instalación) que asignó logística.
   *  Es SOLO de control/comparación contra el presupuesto: NO resta utilidad por sí mismo.
   *  El gasto real se descuenta cuando se paga vía un pago interno (projectInternalPaymentsCost). */
  projectServiciosCost: (_state: AppState, p: Project) => (p.freightCost || 0) + (p.installCost || 0),
  /** Gastos por pagos internos asociados al proyecto (flete, viáticos, maniobras…).
   *  Solo cuentan los ya PAGADOS: un pago pendiente/aprobado/programado aún no resta utilidad.
   *  Es el ÚNICO lugar por el que un gasto operativo baja la utilidad (evita doble conteo con Asignación). */
  projectInternalPaymentsCost: (state: AppState, pid: string) =>
    state.internalPayments
      .filter(p => p.projectId === pid && p.status === 'Pagado')
      .reduce((a, p) => a + (p.amount || 0), 0),
  /** Utilidad SIN IVA = subtotal de la venta − subtotal de compras (OC) − pagos internos pagados. */
  projectUtilidadSub: (state: AppState, p: Project) =>
    (p.ventaSubtotal || 0) - sel.projectComprasConIva(state, p.id) / 1.16
      - sel.projectInternalPaymentsCost(state, p.id),
  /** Base para calcular comisiones = utilidad sin IVA (nunca negativa). */
  projectComisionBase: (state: AppState, p: Project) => Math.max(0, sel.projectUtilidadSub(state, p)),
  /** Cobrado = suma de cobros con estado "Cobrado". */
  projectCobrado: (state: AppState, pid: string) =>
    state.clientPayments.filter(c => c.projectId === pid && c.status === 'Cobrado').reduce((a, c) => a + c.amount, 0),
  /** Saldo por cobrar = total con IVA − cobrado. */
  projectSaldoCliente: (state: AppState, p: Project) => sel.projectTotalConIva(p) - sel.projectCobrado(state, p.id),
  /** ¿El proyecto ya tiene el anticipo del cliente COBRADO? (al menos un cobro real).
   *  Regla de negocio: no se puede emitir la OC al proveedor sin antes asegurar el ingreso. */
  projectHasAnticipo: (state: AppState, pid: string) =>
    state.clientPayments.some(c => c.projectId === pid && c.status === 'Cobrado' && c.amount > 0),
  /** ¿Se pagó (status "Pagado") algún abono/anticipo al proveedor en las OC del proyecto? */
  projectAnticipoProveedor: (state: AppState, pid: string) =>
    sel.ordersForProject(state, pid).some(o => sel.ocPaid(state, o.id) > 0),

  /* ---- Remisiones de salida ---- */
  remisionesForProject: (state: AppState, pid: string) =>
    state.remisiones.filter(r => r.projectId === pid).sort((a, b) => (a.date < b.date ? 1 : -1)),

  /* ---- Pagos internos ---- */
  internalPaymentsForProject: (state: AppState, pid: string) =>
    state.internalPayments.filter(p => p.projectId === pid),
  userName: (state: AppState, id: string) => (state.users.find(u => u.id === id) || ({} as User)).name || '—',
}

/** Siguiente folio consecutivo con prefijo (ej. nextFolio(remisiones, 'REM') → "REM-2026-001"). */
export function nextFolio(items: { number: string }[], prefix: string, year = new Date().getFullYear()): string {
  const max = items.reduce((m, it) => {
    const mt = /(\d+)\s*$/.exec(it.number || '')
    return mt ? Math.max(m, parseInt(mt[1], 10)) : m
  }, 0)
  return `${prefix}-${year}-${String(max + 1).padStart(3, '0')}`
}

/* ============================================================
   AUTO-AVANCE DE ETAPA (según las acciones del flujo)
   ============================================================
   Calcula la etapa que le corresponde a un proyecto por sus DATOS, dentro del
   tramo AUTOMÁTICO (asignación → pago). Devuelve null si aún no cumple ninguna
   condición automática. Las etapas manuales —registro, creación (confirmación
   del cliente) y las de logística (coordinación, instalación, finalizado)— NO
   las decide esta función. La reconciliación del store solo avanza, nunca
   regresa, y respeta el candado manual registro→creación. */
export function autoStageFor(state: AppState, p: Project): StageId | null {
  // 7 · Pago Recibido — el cliente cubrió el total con IVA (incluye finiquito).
  const total = sel.projectTotalConIva(p)
  if (total > 0 && sel.projectCobrado(state, p.id) >= total - 0.5) return 'pago'
  const anticipoProveedor = sel.projectAnticipoProveedor(state, p.id)
  // 6 · Entrega Estimada — material en fabricación y ya llegó la fecha ETA del proyecto.
  if (anticipoProveedor && p.eta && p.eta <= TODAY_ISO) return 'entrega_est'
  // 5 · Fabricación — se pagó anticipo al proveedor.
  if (anticipoProveedor) return 'fabricacion'
  // 4 · Orden de Compra — ya existe la OC del proyecto.
  if (sel.ordersForProject(state, p.id).length > 0) return 'compra'
  // 3 · Asignación — hay proveedor asignado (aún sin OC).
  if (p.suppliers.length > 0) return 'asignacion'
  return null
}
