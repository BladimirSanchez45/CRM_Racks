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
  Movement,
  MovementList,
  Campaign,
  BankTransaction,
  CfdiDoc,
  Prospect,
  AgendaEvent,
  WarehouseItem,
  WarehouseSize,
  InventoryFamily,
  InventoryItem,
  InventoryMove,
} from './types'
import { WAREHOUSE_DAYS_DEFAULT, SALES_GOAL_DEFAULT } from './types'
import {
  fetchMyProfile, signOut, loadAll,
  touchActivity, clearActivity, inactivityExpired,
  saveProject, deleteProject as apiDeleteProject,
  saveOrder, deleteOrder as apiDeleteOrder,
  savePayment, deletePayment as apiDeletePayment,
  saveClientPayment, deleteClientPayment as apiDeleteClientPayment,
  saveCommission, deleteCommission, saveClientRow, deleteClient as apiDeleteClient, saveSupplierRow, deleteSupplier as apiDeleteSupplier, saveSeller, deleteSeller as apiDeleteSeller,
  saveRemision, deleteRemision as apiDeleteRemision,
  saveInternalPayment, deleteInternalPayment as apiDeleteInternalPayment,
  saveMovementList, deleteMovementList as apiDeleteMovementList,
  saveMovement, deleteMovement as apiDeleteMovement,
  saveCampaign, deleteCampaign as apiDeleteCampaign,
  saveBankTx, insertBankTxs, deleteBankTx as apiDeleteBankTx,
  saveCfdiDoc, deleteCfdiDoc as apiDeleteCfdiDoc, deleteDoc as apiDeleteDoc,
  saveAgendaEvent, deleteAgendaEvent as apiDeleteAgendaEvent,
  saveWarehouseItem, deleteWarehouseItem as apiDeleteWarehouseItem,
  saveInvFamily, deleteInvFamily as apiDeleteInvFamily,
  saveInvItem, saveInvItems, deleteInvItem as apiDeleteInvItem, saveInvMove,
  saveProspect, deleteProspect as apiDeleteProspect,
  saveActivity, saveSetting,
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
  ingenieria: 'Ingeniería',
  marketing: 'Marketing',
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
/** Rol Dirección: acceso de solo lectura a proyectos, OC, pagos, cobranza y pagos internos. */
export const isDireccion = (role?: Role | null) => role === 'direccion'
/** Gerentes de ventas (por correo): administran la meta mensual y ven el desglose
 *  de ventas por vendedor (vista "Metas de venta"). Participan en la meta y en las
 *  gráficas como cualquier otro vendedor (ver sel.vendedoresMeta). */
export const SALES_MANAGER_EMAILS = ['jcastaneda@ccracksmexico.com']
export const isSalesManager = (u?: { email?: string } | null) =>
  !!u?.email && SALES_MANAGER_EMAILS.includes(u.email.toLowerCase())
/** Rol Ingeniería: por ahora SOLO ve proyectos (solo lectura). Se ampliará después. */
export const isIngenieria = (role?: Role | null) => role === 'ingenieria'
/** Rol Marketing: por ahora SOLO ve el módulo de Estadísticas por origen (solo lectura). */
export const isMarketing = (role?: Role | null) => role === 'marketing'

/* ---- Agenda compartida ----
   Una anotación con `participants` aparece en la agenda de todos ellos. El
   "hecho" es INDIVIDUAL: cada quien la cierra en su agenda (`doneBy`) y el
   `done` del registro solo se enciende cuando ya la atendieron todos. */
/** Todas las agendas en las que aparece la anotación: dueño + invitados. */
export const agendaViewers = (e: Pick<AgendaEvent, 'userId' | 'participants'>): string[] =>
  [e.userId, ...(e.participants ?? [])].filter(Boolean)
/** ¿La anotación le aparece a esta persona (como dueño o como invitado)? */
export const agendaIsFor = (e: Pick<AgendaEvent, 'userId' | 'participants'>, userId?: string) =>
  !!userId && agendaViewers(e).includes(userId)
/** ¿Ya está atendida PARA esta persona? En las personales es el `done` de siempre. */
export const agendaDoneFor = (e: Pick<AgendaEvent, 'userId' | 'participants' | 'done' | 'doneBy'>, userId?: string) =>
  e.participants?.length ? (e.doneBy ?? []).includes(userId ?? '') : e.done
/** ¿Puede EDITAR el importe de una comisión pendiente? Solo Dirección y Admin/Super Admin.
 *  (Dirección no marca pagos, pero sí ajusta el total a pagar.) */
export const canEditCommissionAmount = (role?: Role | null) => isAdminRole(role) || isDireccion(role)

/** PUESTOS (no roles) de Ventas con visibilidad TOTAL: aunque su rol sea "ventas",
 *  Gerente General y Gerente de Ventas ven los prospectos de todo el equipo. */
export const PUESTOS_VENTAS_GLOBAL = ['GERENTE GENERAL', 'GERENTE DE VENTAS']
/** Normaliza un puesto para compararlo: mayúsculas, sin acentos ni espacios de más. */
const normTitle = (t?: string) =>
  (t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim().replace(/\s+/g, ' ')
/** ¿El usuario ve TODOS los prospectos (no solo los suyos)?
 *  - Roles distintos de "ventas" (admin, superadmin, dirección…): sí.
 *  - Rol "ventas": solo si su PUESTO es Gerente General o Gerente de Ventas. */
export const canSeeAllProspects = (u?: { role?: Role; title?: string } | null): boolean => {
  if (!u) return false
  if (u.role !== 'ventas') return true
  return PUESTOS_VENTAS_GLOBAL.includes(normTitle(u.title))
}

/** Comisión bancaria fija sobre la lista de movimientos "por fuera" (total = subtotal × (1 + esto)). */
export const COMISION_BANCARIA = 0.053

/* ---- Umbrales de alarma del INVENTARIO ----
   Son fijos para todas las claves (no hay mínimo por clave): a partir de aquí
   la existencia se pinta en rojo o en naranja. Si algún día hacen falta
   mínimos distintos por material, este es el único lugar que hay que tocar. */
/** Existencia en ROJO: urge resurtir. */
export const INV_ROJO = 5
/** Existencia en NARANJA: ya hay que irla pidiendo. */
export const INV_NARANJA = 8

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

/* ---- The 11 pipeline stages (exact, in order) ---- */
export const STAGES: Stage[] = [
  { id: 'registro',     n: 1, label: 'Registro de Venta',            short: 'Registro de Venta',     color: 'var(--st-1)', icon: 'flag',        hint: 'Captura inicial de datos de la venta' },
  { id: 'creacion',     n: 2, label: 'Creación del Proyecto',        short: 'Creación del Proyecto',     color: 'var(--st-2)', icon: 'docPlus',     hint: 'Admin captura la info del correo del vendedor' },
  { id: 'asignacion',   n: 3, label: 'Asignación de Proveedor / OC', short: 'Asign. / OC',  color: 'var(--st-3)', icon: 'handshake',   hint: 'Proveedor elegido, OC creada, anticipo pagado' },
  { id: 'compra',       n: 4, label: 'Creacion de orden de Compra', short: 'Orden de Compra',  color: 'var(--st-10)', icon: 'doc',   hint: 'Creacion de orden de Compra' },
  { id: 'fabricacion',  n: 5, label: 'En Fabricación',               short: 'Fabricación',  color: 'var(--st-4)', icon: 'factory',     hint: 'Fabricación en proceso, logística da seguimiento' },
  { id: 'entrega_est',  n: 6, label: 'Entrega por vencer',           short: 'Por Vencer',   color: 'var(--st-5)', icon: 'calendar',    hint: 'Faltan ≤5 días para la entrega y el cliente aún no paga el total' },
  { id: 'vencido',      n: 7, label: 'Entrega vencida',              short: 'Vencido',      color: 'var(--st-11)', icon: 'alert',      hint: 'La fecha de entrega ya pasó y el cliente aún no paga el total' },
  { id: 'pago',         n: 8, label: 'Pago Recibido',                short: 'Pago Recibido',color: 'var(--st-6)', icon: 'money',       hint: 'Cliente pagó completo, logística coordina envío' },
  { id: 'coordinacion', n: 9, label: 'Coordinación Envío/Instalación',short: 'Coordinación',color: 'var(--st-7)', icon: 'truck',      hint: 'Define proveedores de servicio, crea remisión' },
  { id: 'instalacion',  n: 10, label: 'Instalación en Curso',        short: 'Instalación',  color: 'var(--st-8)', icon: 'layers',      hint: 'Material en destino con instaladores' },
  { id: 'finalizado',   n: 11, label: 'Finalizado',                  short: 'Finalizado',   color: 'var(--st-9)', icon: 'check',       hint: 'Carta fin de obra firmada, proyecto cerrado' },
]
export const STAGE_MAP = Object.fromEntries(STAGES.map(s => [s.id, s])) as Record<StageId, Stage>
export const stageIndex = (id: StageId) => STAGES.findIndex(s => s.id === id)
/** Etapas a las que solo entra el sistema (según fecha ETA); los botones manuales de
 *  "Avanzar / Regresar" las saltan para no ofrecer "Avanzar a Vencido". */
export const AUTO_ONLY_STAGES: ReadonlySet<StageId> = new Set<StageId>(['vencido'])
/** Siguiente / anterior etapa para el avance MANUAL (salta las etapas automáticas). */
export const manualNextStage = (id: StageId): Stage | undefined => STAGES.slice(stageIndex(id) + 1).find(s => !AUTO_ONLY_STAGES.has(s.id))
export const manualPrevStage = (id: StageId): Stage | undefined => STAGES.slice(0, stageIndex(id)).reverse().find(s => !AUTO_ONLY_STAGES.has(s.id))

/* ---- Helpers ---- */
// Todos los montos se muestran con 2 decimales (nada se redondea a entero).
const MXN = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2, maximumFractionDigits: 2 })
const MXN2 = MXN
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

/** Llave de un documento SIMPLE del proyecto (excluye las listas: evidencia y órdenes de compra). */
export type DocKey = Exclude<keyof Project['docs'], 'evidencia' | 'ordenCompra'>
/** Etiquetas de los documentos simples de un proyecto, en orden.
 *  (Órdenes de compra y Evidencia se manejan aparte como listas.) */
export const DOC_LABELS: { key: DocKey; label: string }[] = [
  { key: 'cotizacion', label: 'Cotización' },
  { key: 'layout', label: 'Lay out' },
  { key: 'anticipo', label: 'Anticipo' },
  { key: 'finiquito', label: 'Finiquito' },
  { key: 'remision', label: 'Remisión de salida' },
  { key: 'cartaFin', label: 'Carta fin de obra' },
]

/** Conteo de documentos completos de un proyecto (de 7).
 *  Las órdenes de compra son una lista: cuentan como "1 hecho" si hay al menos una. */
export function docCount(p: Project) {
  const d = p.docs
  const simples = [d.cotizacion, d.layout, d.anticipo, d.finiquito, d.remision, d.cartaFin]
  const done = simples.filter(x => x.ok).length + ((d.ordenCompra?.length ?? 0) > 0 ? 1 : 0)
  return { done, total: 7 }
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
  movementLists: [], movements: [], campaigns: [], bankTxs: [], cfdiDocs: [], prospects: [], agendaEvents: [], warehouse: [],
  invFamilies: [], invItems: [], invMoves: [],
  settings: { bankBalance: 0, whDays: WAREHOUSE_DAYS_DEFAULT, salesGoals: {} },
  activity: [], notifications: [],
  users: [], currentUser: null,   // todo se carga desde Supabase tras el login
}

/* Helpers de fecha/usuario para las acciones. */
const today = () => new Date().toISOString().slice(0, 10)
const nowISO = () => new Date().toISOString()
const curMonth = () => new Date().toISOString().slice(0, 7)
const whoName = (s: AppState) => s.currentUser?.name ?? 'Sistema'

/** Construye las comisiones de un proyecto finalizado según el estado ACTUAL:
 *  - principal: el % del vendedor del proyecto sobre la base (utilidad sin IVA).
 *  - override: el % de cada persona con override > 0 que NO sea el vendedor.
 *  `paid` (ids de beneficiarios ya pagados) preserva ese estado al recalcular.
 *  `manual` (beneficiario → importe fijado por Dirección/Admin) gana sobre la fórmula. */
function buildCommissions(s: AppState, proj: Project, paid?: Set<string>, manual?: Map<string, number>): Commission[] {
  // Base = utilidad sin IVA (subtotal de venta − subtotal de compras/gastos).
  const base = sel.projectComisionBase(s, proj)
  const month = curMonth()
  const seller = s.sellers.find(x => x.id === proj.seller)
  // Importe = el ajustado a mano si existe; si no, la fórmula.
  const amountFor = (id: string, calc: number) => (manual?.has(id) ? manual.get(id)! : calc)
  const list: Commission[] = [{
    id: uid('cm'), projectId: proj.id, seller: proj.seller,
    amount: amountFor(proj.seller, Math.round(base * (seller ? seller.rate : 0.04))),
    status: paid?.has(proj.seller) ? 'paid' : 'pending', month,
    ...(manual?.has(proj.seller) ? { manual: true } : {}),
  }]
  for (const v of s.sellers) {
    if (v.overrideRate && v.overrideRate > 0 && v.id !== proj.seller) {
      list.push({
        id: uid('cm'), projectId: proj.id, seller: v.id,
        amount: amountFor(v.id, Math.round(base * v.overrideRate)),
        status: paid?.has(v.id) ? 'paid' : 'pending', month,
        ...(manual?.has(v.id) ? { manual: true } : {}),
      })
    }
  }
  return list
}

/* ---- Orden de la cola de almacén ----------------------------------
   La posición es un número FRACCIONADO: para mover un proyecto se calcula
   el punto medio entre sus nuevos vecinos, así el cambio escribe UNA sola
   fila en vez de renumerar toda la cola. */
export const byWhPosition = (a: WarehouseItem, b: WarehouseItem) => a.position - b.position
/** Posición para encolar al final. */
const nextWhPosition = (s: AppState) =>
  s.warehouse.reduce((max, w) => Math.max(max, w.position), 0) + 1000
/** Posición que debe tener un renglón para quedar en el índice `idx` de `rest`
 *  (la lista ordenada SIN ese renglón). */
function positionAt(rest: WarehouseItem[], idx: number): number {
  const i = Math.max(0, Math.min(idx, rest.length))
  const prev = rest[i - 1]?.position
  const next = rest[i]?.position
  if (prev == null && next == null) return 1000
  if (prev == null) return next! - 1000
  if (next == null) return prev + 1000
  return (prev + next) / 2
}

/** Reparte un TOTAL entre varias comisiones, proporcional a su importe actual.
 *  El último renglón absorbe el redondeo para que la suma cuadre exacta. */
export function splitTotal(items: Commission[], total: number): number[] {
  const base = items.reduce((a, c) => a + c.amount, 0)
  let asignado = 0
  return items.map((c, i) => {
    const amount = i === items.length - 1
      ? total - asignado
      : Math.round(base > 0 ? total * (c.amount / base) : total / items.length)
    asignado += amount
    return amount
  })
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
      return {
        ...state,
        projects: state.projects.filter(p => p.id !== a.id),
        clientPayments: state.clientPayments.filter(c => c.projectId !== a.id),
        // Los abonos del banco ligados a ese proyecto vuelven a "sin asignar" (la base hace SET NULL).
        bankTxs: state.bankTxs.map(t => (t.projectId === a.id ? { ...t, projectId: undefined, clientPaymentId: undefined, paymentCreated: false } : t)),
      }
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
    case 'UPSERT_MOVEMENT_LIST': return { ...state, movementLists: upsertBy(state.movementLists, a.list) }
    case 'REMOVE_MOVEMENT_LIST': return { ...state, movementLists: state.movementLists.filter(l => l.id !== a.id), movements: state.movements.filter(m => m.listId !== a.id) }
    case 'UPSERT_MOVEMENT': return { ...state, movements: upsertBy(state.movements, a.movement) }
    case 'REMOVE_MOVEMENT': return { ...state, movements: state.movements.filter(m => m.id !== a.id) }
    case 'UPSERT_CAMPAIGN': return { ...state, campaigns: upsertBy(state.campaigns, a.campaign) }
    case 'REMOVE_CAMPAIGN': return { ...state, campaigns: state.campaigns.filter(c => c.id !== a.id) }
    case 'UPSERT_BANK_TX': return { ...state, bankTxs: upsertBy(state.bankTxs, a.tx) }
    case 'UPSERT_BANK_TXS': {
      // Lote: se ignoran los que ya existan por hash (mismo criterio que la base).
      const seen = new Set(state.bankTxs.map(t => t.hash))
      const fresh = a.txs.filter(t => !seen.has(t.hash))
      return fresh.length ? { ...state, bankTxs: [...fresh, ...state.bankTxs] } : state
    }
    case 'REMOVE_BANK_TX':
      // Sus CFDI se van con él (la base hace CASCADE).
      return { ...state, bankTxs: state.bankTxs.filter(t => t.id !== a.id), cfdiDocs: state.cfdiDocs.filter(d => d.bankTxId !== a.id) }
    case 'UPSERT_CFDI_DOC': return { ...state, cfdiDocs: upsertBy(state.cfdiDocs, a.doc) }
    case 'REMOVE_CFDI_DOC': return { ...state, cfdiDocs: state.cfdiDocs.filter(d => d.id !== a.id) }
    case 'UPSERT_PROSPECT': return { ...state, prospects: upsertBy(state.prospects, a.prospect) }
    case 'REMOVE_PROSPECT': return { ...state, prospects: state.prospects.filter(p => p.id !== a.id) }
    case 'UPSERT_AGENDA_EVENT': return { ...state, agendaEvents: upsertBy(state.agendaEvents, a.event) }
    case 'REMOVE_AGENDA_EVENT': return { ...state, agendaEvents: state.agendaEvents.filter(e => e.id !== a.id) }
    case 'UPSERT_WAREHOUSE_ITEM': return { ...state, warehouse: upsertBy(state.warehouse, a.item) }
    case 'REMOVE_WAREHOUSE_ITEM': return { ...state, warehouse: state.warehouse.filter(w => w.id !== a.id) }
    case 'UPSERT_INV_FAMILY': return { ...state, invFamilies: upsertBy(state.invFamilies, a.family) }
    case 'REMOVE_INV_FAMILY':
      // Al quitar la familia se van sus claves (y sus movimientos quedan huérfanos, sin mostrarse).
      return { ...state, invFamilies: state.invFamilies.filter(f => f.id !== a.id), invItems: state.invItems.filter(i => i.familyId !== a.id) }
    case 'UPSERT_INV_ITEM': return { ...state, invItems: upsertBy(state.invItems, a.item) }
    case 'REMOVE_INV_ITEM': return { ...state, invItems: state.invItems.filter(i => i.id !== a.id) }
    case 'UPSERT_INV_MOVE': return { ...state, invMoves: upsertBy(state.invMoves, a.move) }
    case 'SET_SETTINGS': return { ...state, settings: a.settings }
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

  // Crea y persiste una notificación dirigida (best-effort) para cada destinatario.
  // NO se agrega al estado local: son para OTROS usuarios (RLS las acota a su dueño).
  const notify = React.useCallback((recipients: { id: string }[], fields: Omit<Notification, 'id' | 'userId' | 'read' | 'createdAt'>) => {
    for (const u of recipients) {
      const notification: Notification = { id: uid('nt'), userId: u.id, read: false, createdAt: nowISO(), ...fields }
      saveNotification(notification).catch(err => console.error('[notif] no se pudo crear la notificación', err))
    }
  }, [])

  // Aviso: PRIMER cobro "Cobrado" del proyecto (transición 0→1) → ya se puede emitir
  // la OC al proveedor. Avisa a los administradores (no se repite en cobros siguientes).
  // Lo usan tanto el cobro capturado a mano como la conciliación desde Bancos.
  const notifyFirstCobro = React.useCallback((st: AppState, full: ClientPayment) => {
    if (full.status !== 'Cobrado' || !full.projectId) return
    const hadCobradoBefore = st.clientPayments.some(c => c.id !== full.id && c.projectId === full.projectId && c.status === 'Cobrado')
    if (hadCobradoBefore) return
    const proj = st.projects.find(p => p.id === full.projectId)
    const admins = st.users.filter(u => isAdminRole(u.role) && u.active && u.id !== st.currentUser?.id)
    notify(admins, {
      kind: 'client_anticipo_paid',
      title: `Anticipo recibido: ${proj?.code ?? ''}`,
      body: `Ya entró el anticipo${proj ? ` de ${sel.clientName(st, proj.client)}` : ''}. Puedes emitir la orden de compra.`,
      projectId: full.projectId,
    })
  }, [notify])

  // Avisa al VENDEDOR del proyecto que cambió de etapa (movida manual o auto-avance).
  // Solo aplica si ese vendedor tiene usuario con login (los vendedores del catálogo sin
  // usuario comparten id con el usuario cuando lo tienen) y no es quien hizo el cambio.
  const notifySellerStage = React.useCallback((st: AppState, proj: Project, stage: StageId, actor?: string) => {
    const sellerUser = st.users.find(u => u.id === proj.seller && u.active)
    if (!sellerUser || sellerUser.id === st.currentUser?.id) return
    const stg = STAGE_MAP[stage]
    const cliente = sel.clientName(st, proj.client)
    notify([{ id: sellerUser.id }], {
      kind: 'project_stage_moved',
      title: `${proj.code} → ${stg.short}`,
      body: actor
        ? `${actor} movió tu proyecto ${proj.code}${cliente && cliente !== '—' ? ` (${cliente})` : ''} a la etapa "${stg.label}".`
        : `Tu proyecto ${proj.code}${cliente && cliente !== '—' ? ` (${cliente})` : ''} avanzó automáticamente a la etapa "${stg.label}".`,
      projectId: proj.id,
      ...(actor ? { actorName: actor } : {}),
    })
  }, [notify])

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
      // Su vendedor se entera del cambio de etapa (avance automático).
      notifySellerStage(ns, proj, stage)
      // Notificaciones de hand-off según la etapa alcanzada (se disparan UNA vez, en la
      // transición; al siguiente reconcile la etapa ya coincide y no se repiten).
      const others = (pred: (r: Role) => boolean) => ns.users.filter(u => u.active && u.id !== ns.currentUser?.id && pred(u.role))
      if (stage === 'entrega_est') {
        // Por Vencer: ≤5 días para la entrega y el cliente aún no liquida → avisa a admins.
        const saldo = sel.projectSaldoCliente(ns, updated)
        notify(others(r => isAdminRole(r)), {
          kind: 'project_due_soon',
          title: `Por vencer: ${proj.code}`,
          body: `Entrega en ≤${ENTREGA_EST_DIAS_PREVIOS} días y el cliente aún debe ${fmtMoney(saldo)}.`,
          projectId: proj.id,
        })
      } else if (stage === 'vencido') {
        // Vencido: la fecha de entrega ya pasó y el cliente sigue sin liquidar → avisa a admins.
        const saldo = sel.projectSaldoCliente(ns, updated)
        const dias = -(daysBetween(proj.eta) ?? 0)
        notify(others(r => isAdminRole(r)), {
          kind: 'project_overdue',
          title: `Vencido: ${proj.code}`,
          body: `La entrega venció hace ${dias} día${dias === 1 ? '' : 's'} y el cliente aún debe ${fmtMoney(saldo)}.`,
          projectId: proj.id,
        })
      } else if (stage === 'pago') {
        // Pago Recibido: el cliente liquidó → avisa a logística para coordinar el envío.
        const logi = others(r => r === 'logistica')
        notify(logi.length ? logi : others(r => isAdminRole(r)), {
          kind: 'project_paid',
          title: `Liquidado: ${proj.code}`,
          body: `${sel.clientName(ns, proj.client)} pagó el total. Coordina el envío/instalación.`,
          projectId: proj.id,
        })
      }
    }
    persist(thunks)
  }, [persist, notify, notifySellerStage])

  // dispatch PÚBLICO: aplica el cambio localmente (optimista) y lo persiste.
  const dispatch = React.useCallback((action: Action) => {
    const s = stateRef.current
    // Recalcula las comisiones de un proyecto: borra las viejas y crea nuevas según el
    // estado actual (vendedor, utilidad, overrides), preservando "pagada" por beneficiario
    // y los importes AJUSTADOS A MANO por Dirección/Admin.
    // `calcState` permite calcular con datos recién modificados (p. ej. la OC nueva).
    // `clearManual` (ids) descarta esos ajustes manuales y devuelve la fórmula.
    const regenCommissions = (proj: Project, thunks: (() => Promise<void>)[], calcState: AppState = s, clearManual?: Set<string>) => {
      const existing = s.commissions.filter(c => c.projectId === proj.id)
      const paid = new Set(existing.filter(c => c.status === 'paid').map(c => c.seller))
      const manual = new Map(existing.filter(c => c.manual && !clearManual?.has(c.id)).map(c => [c.seller, c.amount]))
      for (const old of existing) {
        rawDispatch({ type: 'REMOVE_COMMISSION', id: old.id })
        thunks.push(() => deleteCommission(old.id))
      }
      for (const cm of buildCommissions(calcState, proj, paid, manual)) {
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
        // Reglas de avance: al AVANZAR a una etapa con requisitos, bloquea si faltan.
        if (stageIndex(action.stage) > stageIndex(proj.stage)) {
          const reason = stageBlockedReason(s, proj, action.stage)
          if (reason) { alert(reason); return }
        }
        const updated: Project = { ...proj, stage: action.stage, updated: today(), ...(action.stage === 'finalizado' ? { closedOn: today() } : {}) }
        rawDispatch({ type: 'UPSERT_PROJECT', project: updated })
        const thunks: (() => Promise<void>)[] = [() => saveProject(updated)]
        // Su vendedor se entera de que le movieron el proyecto de etapa.
        notifySellerStage(s, proj, action.stage, whoName(s))
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
          ? { ...(action.project as Project), id: action.project.id ?? uid('p'), created: action.project.created || today(), updated: today() }
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
        // Cada OC nueva entra a la COLA DE ALMACÉN (sin talla): la unidad de trabajo
        // de almacén es la orden de compra, así que un proyecto con varias OC genera
        // varios renglones. Se avisa a los usuarios con rol Almacén.
        // OJO: solo si el PROVEEDOR está marcado como "sus OC las trabaja almacén"
        // (Proveedores → editar). Hay proveedores con los que sí se trabaja pero cuyo
        // material no pasa por almacén: esos no encolan nada.
        if (sel.supplier(s, full.supplierId)?.interno && !s.warehouse.some(w => w.orderId === full.id)) {
          const item: WarehouseItem = {
            id: uid('wh'), orderId: full.id, position: nextWhPosition(s),
            status: 'pendiente', enteredAt: nowISO(),
          }
          rawDispatch({ type: 'UPSERT_WAREHOUSE_ITEM', item })
          thunks.push(() => saveWarehouseItem(item))
          const alm = s.users.filter(u => u.role === 'almacen' && u.active && u.id !== s.currentUser?.id)
          const prov = sel.supplier(s, full.supplierId)?.name
          notify(alm, {
            kind: 'warehouse_queued',
            title: `Nueva OC en la cola: ${full.number}`,
            body: `${prov ? `${prov} · ` : ''}${proj ? `${proj.code} · ${sel.clientName(s, proj.client)}` : 'Sin proyecto'}. Clasifícala y ponla en su prioridad.`,
            ...(proj ? { projectId: proj.id } : {}),
            ...(s.currentUser?.name ? { actorName: s.currentUser.name } : {}),
          })
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
        notifyFirstCobro(s, full)
        persist([() => saveClientPayment(full)]); return
      }
      case 'DELETE_CLIENT_PAYMENT': {
        rawDispatch({ type: 'REMOVE_CLIENT_PAYMENT', id: action.id })
        const thunks: (() => Promise<void>)[] = [() => apiDeleteClientPayment(action.id)]
        // Si el cobro venía de un abono del banco, ese abono vuelve a "sin asignar".
        const linked = s.bankTxs.find(t => t.clientPaymentId === action.id)
        if (linked) {
          const freed: BankTransaction = { ...linked, projectId: undefined, clientPaymentId: undefined, paymentCreated: false }
          rawDispatch({ type: 'UPSERT_BANK_TX', tx: freed })
          thunks.push(() => saveBankTx(freed))
        }
        persist(thunks); return
      }

      case 'SAVE_CLIENT': {
        const existing = s.clients.find(c => c.id === action.client.id)
        const full: Client = {
          ...(action.client as Client),
          id: action.client.id ?? uid('c'),
          since: action.client.since ?? existing?.since ?? today(),
        }
        rawDispatch({ type: 'UPSERT_CLIENT', client: full })
        const thunks: (() => Promise<void>)[] = [() => saveClientRow(full)]
        // Alta con aprobación: si es un cliente NUEVO propuesto (pending) por alguien que no
        // es admin, avisa a los administradores para que lo aprueben o rechacen.
        if (full.pending && !existing && !isAdminRole(s.currentUser?.role)) {
          const admins = s.users.filter(u => isAdminRole(u.role) && u.active && u.id !== s.currentUser?.id)
          for (const adminUser of admins) {
            const notification: Notification = {
              id: uid('nt'), userId: adminUser.id, kind: 'client_pending',
              title: `Cliente por aprobar: ${full.name}`,
              body: `${whoName(s)} registró un cliente nuevo${full.rfc ? ` (RFC ${full.rfc})` : ''}. Revísalo y apruébalo o recházalo en Clientes.`,
              read: false, createdAt: nowISO(), actorName: whoName(s),
            }
            saveNotification(notification).catch(err =>
              console.error('[notif] no se pudo crear la notificación para', adminUser.email, err))
          }
        }
        persist(thunks); return
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
      // Dirección/Admin fijan el total a pagar de las comisiones PENDIENTES de una persona.
      case 'SET_COMMISSIONS_TOTAL': {
        if (!canEditCommissionAmount(s.currentUser?.role)) return
        const items = action.ids
          .map(id => s.commissions.find(c => c.id === id))
          .filter((c): c is Commission => !!c && c.status === 'pending')
        if (!items.length) return
        const total = Math.max(0, Math.round(action.total))
        const thunks: (() => Promise<void>)[] = []
        const montos = splitTotal(items, total)
        items.forEach((c, i) => {
          const updated: Commission = { ...c, amount: montos[i], manual: true }
          rawDispatch({ type: 'UPSERT_COMMISSION', commission: updated })
          thunks.push(() => saveCommission(updated))
        })
        const quien = sel.seller(s, items[0].seller)?.name || s.users.find(u => u.id === items[0].seller)?.name || '—'
        const activity: Activity = {
          id: uid('a'), t: nowISO(), icon: 'commissions', who: whoName(s),
          txt: `ajustó la comisión de ${quien} a ${fmtMoney(total)}`, tgt: `${items.length} comisión${items.length !== 1 ? 'es' : ''}`, kind: 'money',
        }
        rawDispatch({ type: 'PUSH_ACTIVITY', activity })
        thunks.push(() => saveActivity(activity))
        persist(thunks); return
      }
      // Quita el ajuste manual: regenera por fórmula los proyectos involucrados.
      case 'CLEAR_COMMISSIONS_MANUAL': {
        if (!canEditCommissionAmount(s.currentUser?.role)) return
        const items = s.commissions.filter(c => action.ids.includes(c.id) && c.manual)
        if (!items.length) return
        const ids = new Set(items.map(c => c.id))
        const thunks: (() => Promise<void>)[] = []
        for (const pid of new Set(items.map(c => c.projectId))) {
          const proj = s.projects.find(p => p.id === pid)
          if (proj) regenCommissions(proj, thunks, s, ids)
        }
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
        const thunks: (() => Promise<void>)[] = []

        // ---- SIN FACTURA aprobado → se convierte en MOVIMIENTO de la lista del jueves ----
        // No sigue el flujo de programar/pagar: el gasto se descuenta cuando Dirección
        // autoriza la lista y se sube su comprobante (evita descontar doble).
        let sinFacturaExtra: Partial<InternalPayment> = {}
        if (action.approve && ip.sinFactura) {
          const thursday = nextPayThursday()
          // Lista en Borrador de ESE jueves; si no existe, se crea.
          let list = s.movementLists.find(l => l.status === 'Borrador' && l.date === thursday)
          if (!list) {
            const last = [...s.movementLists].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0]
            list = {
              id: uid('ml'), name: payListName(thursday), date: thursday,
              bankBalance: last?.bankBalance ?? s.settings.bankBalance ?? 0,
              status: 'Borrador', createdBy: s.currentUser?.id ?? '', createdAt: nowISO(),
            }
            rawDispatch({ type: 'UPSERT_MOVEMENT_LIST', list })
            const l = list
            thunks.push(() => saveMovementList(l))
          }
          const mv: Movement = {
            id: uid('mv'), listId: list.id, date: today(),
            description: ip.concept, amount: ip.amount,
            ...(ip.projectId ? { projectId: ip.projectId } : {}),
            status: 'Pendiente', createdBy: s.currentUser?.id ?? '', createdAt: nowISO(),
            internalPaymentId: ip.id,
          }
          rawDispatch({ type: 'UPSERT_MOVEMENT', movement: mv })
          thunks.push(() => saveMovement(mv))
          sinFacturaExtra = { movementId: mv.id, movementListId: list.id }
        }

        const updated: InternalPayment = {
          ...ip,
          status: action.approve ? (ip.sinFactura ? 'En movimientos' : 'Aprobado') : 'Rechazado',
          approvedBy: s.currentUser?.id ?? '',
          decidedAt: nowISO(),
          ...sinFacturaExtra,
          ...(action.approve ? {} : { rejectReason: action.reason ?? '' }),
        }
        rawDispatch({ type: 'UPSERT_INTERNAL_PAYMENT', payment: updated })
        thunks.push(() => saveInternalPayment(updated))
        const activity: Activity = { id: uid('a'), t: nowISO(), icon: action.approve ? 'check' : 'close', who: whoName(s), txt: `${action.approve ? 'aprobó' : 'rechazó'} el pago interno`, tgt: ip.concept, kind: action.approve ? 'done' : 'info' }
        rawDispatch({ type: 'PUSH_ACTIVITY', activity })
        thunks.push(() => saveActivity(activity))
        // Avisa al solicitante la decisión.
        if (ip.requestedBy && ip.requestedBy !== s.currentUser?.id) {
          const notification: Notification = {
            id: uid('nt'), userId: ip.requestedBy, kind: 'internal_payment_decided',
            title: `Pago interno ${action.approve ? 'aprobado' : 'rechazado'}: ${ip.concept}`,
            body: action.approve
              ? (ip.sinFactura
                ? `${whoName(s)} aprobó tu pago SIN FACTURA de ${fmtMoney(ip.amount)}. Entró a la lista de movimientos del jueves ${fmtDate(nextPayThursday())}; se paga cuando Dirección autorice la lista.`
                : `${whoName(s)} aprobó tu pago de ${fmtMoney(ip.amount)}. Ya puedes agendarlo.`)
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

      case 'SAVE_MOVEMENT_LIST': {
        const isNew = !action.list.id || !s.movementLists.some(l => l.id === action.list.id)
        const full: MovementList = {
          ...(action.list as MovementList),
          id: action.list.id ?? uid('ml'),
          createdBy: action.list.createdBy ?? s.currentUser?.id ?? '',
          createdAt: action.list.createdAt ?? nowISO(),
          status: action.list.status ?? 'Borrador',
        }
        rawDispatch({ type: 'UPSERT_MOVEMENT_LIST', list: full })
        const thunks: (() => Promise<void>)[] = [() => saveMovementList(full)]
        if (isNew) {
          const activity: Activity = { id: uid('a'), t: nowISO(), icon: 'money', who: whoName(s), txt: 'creó una lista de movimientos', tgt: full.name, kind: 'money' }
          rawDispatch({ type: 'PUSH_ACTIVITY', activity })
          thunks.push(() => saveActivity(activity))
        }
        persist(thunks); return
      }
      case 'DELETE_MOVEMENT_LIST': {
        const list = s.movementLists.find(l => l.id === action.id)
        const movs = s.movements.filter(m => m.listId === action.id)
        rawDispatch({ type: 'REMOVE_MOVEMENT_LIST', id: action.id })   // quita lista + sus movimientos del estado
        const thunks: (() => Promise<void>)[] = [
          ...movs.map(m => () => apiDeleteMovement(m.id)),
          () => apiDeleteMovementList(action.id),
        ]
        // Recalcula comisiones de proyectos finalizados que perdían un movimiento autorizado.
        const nextMovs = s.movements.filter(m => m.listId !== action.id)
        const finalProjects = new Map<string, Project>()
        for (const m of movs) {
          if (m.status !== 'Autorizado' || !m.projectId) continue
          const proj = s.projects.find(p => p.id === m.projectId)
          if (proj && proj.stage === 'finalizado') finalProjects.set(proj.id, proj)
        }
        for (const proj of finalProjects.values()) regenCommissions(proj, thunks, { ...s, movements: nextMovs })
        if (list) {
          const activity: Activity = { id: uid('a'), t: nowISO(), icon: 'trash', who: whoName(s), txt: 'eliminó una lista de movimientos', tgt: list.name, kind: 'info' }
          rawDispatch({ type: 'PUSH_ACTIVITY', activity })
          thunks.push(() => saveActivity(activity))
        }
        persist(thunks); return
      }
      case 'SUBMIT_MOVEMENT_LIST': {
        const list = s.movementLists.find(l => l.id === action.id); if (!list || list.status !== 'Borrador') return
        const updated: MovementList = { ...list, status: 'Pendiente', sentAt: nowISO() }
        rawDispatch({ type: 'UPSERT_MOVEMENT_LIST', list: updated })
        const thunks: (() => Promise<void>)[] = [() => saveMovementList(updated)]
        const movs = s.movements.filter(m => m.listId === list.id)
        const subtotal = movs.reduce((a, m) => a + (m.amount || 0), 0)
        const total = subtotal * (1 + COMISION_BANCARIA)
        const activity: Activity = { id: uid('a'), t: nowISO(), icon: 'money', who: whoName(s), txt: `envió la lista "${list.name}" a autorización`, tgt: fmtMoney(total), kind: 'money' }
        rawDispatch({ type: 'PUSH_ACTIVITY', activity })
        thunks.push(() => saveActivity(activity))
        // Avisa a Dirección que hay una lista por autorizar.
        const dir = s.users.filter(u => u.role === 'direccion' && u.active && u.id !== s.currentUser?.id)
        notify(dir, {
          kind: 'movements_submitted',
          title: `Lista por autorizar: ${list.name}`,
          body: `${whoName(s)} envió "${list.name}" con ${movs.length} movimientos por ${fmtMoney(total)} (incluye 5.3%). Requiere tu autorización.`,
          movementListId: list.id, actorName: whoName(s),
        })
        persist(thunks); return
      }
      case 'DECIDE_MOVEMENT_LIST': {
        const list = s.movementLists.find(l => l.id === action.id); if (!list) return
        const updatedList: MovementList = {
          ...list,
          status: action.approve ? 'Autorizada' : 'Rechazada',
          authorizedBy: s.currentUser?.id ?? '', decidedAt: nowISO(),
          ...(action.approve ? {} : { rejectReason: action.reason ?? '' }),
        }
        rawDispatch({ type: 'UPSERT_MOVEMENT_LIST', list: updatedList })
        const thunks: (() => Promise<void>)[] = [() => saveMovementList(updatedList)]
        // Todos sus movimientos PENDIENTES pasan a Autorizado/Rechazado (los ya decididos y los eliminados se respetan).
        let next = s.movements
        for (const m of s.movements.filter(x => x.listId === list.id && x.status === 'Pendiente' && x.changedByDireccion !== 'removed')) {
          const um: Movement = { ...m, status: action.approve ? 'Autorizado' : 'Rechazado', authorizedBy: s.currentUser?.id ?? '', decidedAt: nowISO(), ...(action.approve ? {} : { rejectReason: action.reason ?? '' }) }
          rawDispatch({ type: 'UPSERT_MOVEMENT', movement: um })
          thunks.push(() => saveMovement(um))
          next = upsertBy(next, um)
        }
        const activity: Activity = { id: uid('a'), t: nowISO(), icon: action.approve ? 'check' : 'close', who: whoName(s), txt: `${action.approve ? 'autorizó' : 'rechazó'} la lista "${list.name}"`, tgt: list.name, kind: action.approve ? 'done' : 'info' }
        rawDispatch({ type: 'PUSH_ACTIVITY', activity })
        thunks.push(() => saveActivity(activity))
        if (list.createdBy && list.createdBy !== s.currentUser?.id) {
          notify([{ id: list.createdBy }], {
            kind: 'movement_decided',
            title: `Lista ${action.approve ? 'autorizada' : 'rechazada'}: ${list.name}`,
            body: action.approve
              ? `${whoName(s)} autorizó tu lista "${list.name}".`
              : `${whoName(s)} rechazó tu lista "${list.name}".${action.reason ? ` Motivo: ${action.reason}` : ''}`,
            movementListId: list.id, actorName: whoName(s),
          })
        }
        // Recalcula comisiones de proyectos finalizados ligados a los movimientos de la lista.
        const finalProjects = new Map<string, Project>()
        for (const m of next.filter(x => x.listId === list.id && x.projectId)) {
          const proj = s.projects.find(p => p.id === m.projectId)
          if (proj && proj.stage === 'finalizado') finalProjects.set(proj.id, proj)
        }
        for (const proj of finalProjects.values()) regenCommissions(proj, thunks, { ...s, movements: next })
        persist(thunks); return
      }
      case 'SET_LIST_COMPROBANTE': {
        const list = s.movementLists.find(l => l.id === action.id); if (!list) return
        const updated: MovementList = { ...list, comprobante: action.comprobante || undefined, comprobantePath: action.comprobantePath || undefined }
        rawDispatch({ type: 'UPSERT_MOVEMENT_LIST', list: updated })
        const thunks: (() => Promise<void>)[] = [() => saveMovementList(updated)]
        const subio = !!action.comprobantePath
        const activity: Activity = { id: uid('a'), t: nowISO(), icon: subio ? 'check' : 'doc', who: whoName(s), txt: subio ? `marcó como pagada la lista "${list.name}"` : `quitó el comprobante de "${list.name}"`, tgt: list.name, kind: subio ? 'done' : 'info' }
        rawDispatch({ type: 'PUSH_ACTIVITY', activity })
        thunks.push(() => saveActivity(activity))
        // Subir/quitar comprobante cambia si los movimientos descuentan utilidad: recalcula comisiones
        // de los proyectos FINALIZADOS ligados a los movimientos autorizados de esta lista.
        const nextLists = upsertBy(s.movementLists, updated)
        const finalProjects = new Map<string, Project>()
        for (const m of s.movements.filter(m => m.listId === list.id && m.status === 'Autorizado' && m.changedByDireccion !== 'removed' && m.projectId)) {
          const proj = s.projects.find(p => p.id === m.projectId)
          if (proj && proj.stage === 'finalizado') finalProjects.set(proj.id, proj)
        }
        for (const proj of finalProjects.values()) regenCommissions(proj, thunks, { ...s, movementLists: nextLists })
        persist(thunks); return
      }

      case 'SAVE_MOVEMENT': {
        const isNew = !action.movement.id || !s.movements.some(m => m.id === action.movement.id)
        const prev = action.movement.id ? s.movements.find(m => m.id === action.movement.id) : undefined
        const parent = s.movementLists.find(l => l.id === action.movement.listId)
        // Dirección interviniendo una lista ya enviada (Pendiente): marca su cambio.
        const dirReview = isDireccion(s.currentUser?.role) && parent?.status === 'Pendiente'
        const dirMark: Movement['changedByDireccion'] | undefined = dirReview
          ? (isNew ? 'added' : (prev?.changedByDireccion === 'added' ? 'added' : 'edited'))
          : (action.movement as Movement).changedByDireccion
        const full: Movement = {
          ...(action.movement as Movement),
          id: action.movement.id ?? uid('mv'),
          createdBy: action.movement.createdBy ?? s.currentUser?.id ?? '',
          createdAt: action.movement.createdAt ?? nowISO(),
          status: action.movement.status ?? 'Pendiente',
          ...(dirMark ? { changedByDireccion: dirMark } : {}),
        }
        rawDispatch({ type: 'UPSERT_MOVEMENT', movement: full })
        const thunks: (() => Promise<void>)[] = [() => saveMovement(full)]
        if (isNew) {
          const activity: Activity = { id: uid('a'), t: nowISO(), icon: 'money', who: whoName(s), txt: 'registró un movimiento', tgt: full.description, kind: 'money' }
          rawDispatch({ type: 'PUSH_ACTIVITY', activity })
          thunks.push(() => saveActivity(activity))
        }
        // Avisa al admin (creador de la lista) que Dirección modificó/agregó algo.
        if (dirReview && parent && parent.createdBy && parent.createdBy !== s.currentUser?.id) {
          notify([{ id: parent.createdBy }], {
            kind: 'movement_changed',
            title: `Dirección modificó tu lista: ${parent.name}`,
            body: `${whoName(s)} ${isNew ? 'agregó' : 'editó'} el movimiento "${full.description}" (${fmtMoney(full.amount)}).`,
            movementListId: parent.id, actorName: whoName(s),
          })
        }
        // Si liga a un proyecto FINALIZADO y ya está autorizado, recalcula comisiones (cambia la utilidad).
        const mvProj = full.projectId ? s.projects.find(p => p.id === full.projectId) : undefined
        if (mvProj && mvProj.stage === 'finalizado') {
          regenCommissions(mvProj, thunks, { ...s, movements: upsertBy(s.movements, full) })
        }
        persist(thunks); return
      }
      case 'DELETE_MOVEMENT': {
        const mv = s.movements.find(m => m.id === action.id); if (!mv) return
        const parent = s.movementLists.find(l => l.id === mv.listId)
        const dirReview = isDireccion(s.currentUser?.role) && parent?.status === 'Pendiente'
        const thunks: (() => Promise<void>)[] = []
        if (dirReview) {
          // BORRADO SUAVE: sigue visible (tachado), no suma; queda marcado como eliminado por Dirección.
          const soft: Movement = { ...mv, changedByDireccion: 'removed' }
          rawDispatch({ type: 'UPSERT_MOVEMENT', movement: soft })
          thunks.push(() => saveMovement(soft))
          if (parent && parent.createdBy && parent.createdBy !== s.currentUser?.id) {
            notify([{ id: parent.createdBy }], {
              kind: 'movement_changed',
              title: `Dirección modificó tu lista: ${parent.name}`,
              body: `${whoName(s)} eliminó el movimiento "${mv.description}" (${fmtMoney(mv.amount)}).`,
              movementListId: parent.id, actorName: whoName(s),
            })
          }
          const proj = mv.projectId ? s.projects.find(p => p.id === mv.projectId) : undefined
          if (proj && proj.stage === 'finalizado') {
            regenCommissions(proj, thunks, { ...s, movements: upsertBy(s.movements, soft) })
          }
          persist(thunks); return
        }
        // Borrado normal (admin en Borrador).
        rawDispatch({ type: 'REMOVE_MOVEMENT', id: action.id })
        thunks.push(() => apiDeleteMovement(action.id))
        const proj = mv.projectId ? s.projects.find(p => p.id === mv.projectId) : undefined
        if (proj && proj.stage === 'finalizado') {
          regenCommissions(proj, thunks, { ...s, movements: s.movements.filter(m => m.id !== action.id) })
        }
        persist(thunks); return
      }
      case 'DECIDE_MOVEMENT': {
        const mv = s.movements.find(m => m.id === action.id); if (!mv) return
        const updated: Movement = {
          ...mv,
          status: action.approve ? 'Autorizado' : 'Rechazado',
          authorizedBy: s.currentUser?.id ?? '',
          decidedAt: nowISO(),
          ...(action.approve ? {} : { rejectReason: action.reason ?? '' }),
        }
        rawDispatch({ type: 'UPSERT_MOVEMENT', movement: updated })
        const thunks: (() => Promise<void>)[] = [() => saveMovement(updated)]
        const next = upsertBy(s.movements, updated)
        // Recalcula el estatus de la lista padre: se resuelve cuando ya no quedan movimientos pendientes.
        const list = s.movementLists.find(l => l.id === mv.listId)
        if (list && list.status === 'Pendiente') {
          const mine = next.filter(m => m.listId === list.id && m.changedByDireccion !== 'removed')
          if (!mine.some(m => m.status === 'Pendiente')) {
            const resolved: MovementList = {
              ...list,
              status: mine.some(m => m.status === 'Autorizado') ? 'Autorizada' : 'Rechazada',
              authorizedBy: s.currentUser?.id ?? '', decidedAt: nowISO(),
            }
            rawDispatch({ type: 'UPSERT_MOVEMENT_LIST', list: resolved })
            thunks.push(() => saveMovementList(resolved))
            if (list.createdBy && list.createdBy !== s.currentUser?.id) {
              notify([{ id: list.createdBy }], {
                kind: 'movement_decided',
                title: `Lista ${resolved.status === 'Autorizada' ? 'autorizada' : 'rechazada'}: ${list.name}`,
                body: `${whoName(s)} terminó de revisar tu lista "${list.name}".`,
                movementListId: list.id, actorName: whoName(s),
              })
            }
          }
        }
        const activity: Activity = { id: uid('a'), t: nowISO(), icon: action.approve ? 'check' : 'close', who: whoName(s), txt: `${action.approve ? 'autorizó' : 'rechazó'} un movimiento`, tgt: mv.description, kind: action.approve ? 'done' : 'info' }
        rawDispatch({ type: 'PUSH_ACTIVITY', activity })
        thunks.push(() => saveActivity(activity))
        // Al autorizar/rechazar un movimiento ligado a proyecto FINALIZADO, recalcula comisiones.
        const decProj = mv.projectId ? s.projects.find(p => p.id === mv.projectId) : undefined
        if (decProj && decProj.stage === 'finalizado') {
          regenCommissions(decProj, thunks, { ...s, movements: next })
        }
        persist(thunks); return
      }

      case 'SAVE_CAMPAIGN': {
        const isNew = !action.campaign.id || !s.campaigns.some(c => c.id === action.campaign.id)
        const full: Campaign = {
          ...(action.campaign as Campaign),
          id: action.campaign.id ?? uid('cmp'),
          createdBy: action.campaign.createdBy ?? s.currentUser?.id,
          createdAt: action.campaign.createdAt ?? nowISO(),
        }
        rawDispatch({ type: 'UPSERT_CAMPAIGN', campaign: full })
        const thunks: (() => Promise<void>)[] = [() => saveCampaign(full)]
        const activity: Activity = { id: uid('a'), t: nowISO(), icon: 'trendUp', who: whoName(s), txt: `${isNew ? 'registró' : 'actualizó'} la campaña`, tgt: full.name, kind: 'info' }
        rawDispatch({ type: 'PUSH_ACTIVITY', activity })
        thunks.push(() => saveActivity(activity))
        persist(thunks); return
      }
      case 'DELETE_CAMPAIGN': {
        rawDispatch({ type: 'REMOVE_CAMPAIGN', id: action.id })
        persist([() => apiDeleteCampaign(action.id)]); return
      }

      /* ---- Bancos: estado de cuenta ---- */
      case 'IMPORT_BANK_TXS': {
        const seen = new Set(s.bankTxs.map(t => t.hash))
        const full: BankTransaction[] = action.txs
          .filter(t => !seen.has(t.hash))
          .map(t => ({ ...(t as BankTransaction), id: t.id ?? uid('btx'), importedBy: t.importedBy ?? s.currentUser?.id, importedAt: t.importedAt ?? nowISO() }))
        if (!full.length) return
        rawDispatch({ type: 'UPSERT_BANK_TXS', txs: full })
        const abonos = full.filter(t => t.kind === 'abono').length
        const activity: Activity = { id: uid('a'), t: nowISO(), icon: 'money', who: whoName(s), txt: `importó ${full.length} movimiento${full.length === 1 ? '' : 's'} del estado de cuenta (${abonos} abono${abonos === 1 ? '' : 's'})`, tgt: full[0].bank, kind: 'info' }
        rawDispatch({ type: 'PUSH_ACTIVITY', activity })
        persist([() => insertBankTxs(full), () => saveActivity(activity)]); return
      }
      case 'ASSIGN_BANK_TX': {
        const tx = s.bankTxs.find(t => t.id === action.id); if (!tx) return
        const proj = s.projects.find(p => p.id === action.projectId); if (!proj) return
        const method = `${tx.bank}${tx.bankFrom ? ' · ' + tx.bankFrom : ''}${tx.reference ? ' · ' + tx.reference : ''}`
        let cp: ClientPayment
        let created = false
        const existing = action.clientPaymentId ? s.clientPayments.find(c => c.id === action.clientPaymentId) : undefined
        if (existing) {
          // Liga un cobro ya capturado (normalmente "Programado"): toma fecha/importe reales del banco.
          cp = { ...existing, status: 'Cobrado', date: tx.date, amount: tx.amount, method, concept: action.concept || existing.concept }
        } else {
          const n = Math.max(0, ...s.clientPayments.filter(c => c.projectId === proj.id).map(c => c.n)) + 1
          cp = { id: uid('cp'), projectId: proj.id, n, date: tx.date, amount: tx.amount, concept: action.concept || 'Abono', method, status: 'Cobrado', comments: `Conciliado con estado de cuenta ${tx.bank}${tx.detail ? ` · "${tx.detail}"` : ''}` }
          created = true
        }
        // Si el abono ya estaba ligado a OTRO cobro creado desde él, ese cobro se borra (se sustituye).
        const prevCreated = tx.paymentCreated && tx.clientPaymentId && tx.clientPaymentId !== cp.id ? tx.clientPaymentId : undefined
        const updated: BankTransaction = { ...tx, projectId: proj.id, clientPaymentId: cp.id, paymentCreated: created, category: 'cliente' }
        if (prevCreated) rawDispatch({ type: 'REMOVE_CLIENT_PAYMENT', id: prevCreated })
        rawDispatch({ type: 'UPSERT_CLIENT_PAYMENT', payment: cp })
        rawDispatch({ type: 'UPSERT_BANK_TX', tx: updated })
        notifyFirstCobro(s, cp)
        const activity: Activity = { id: uid('a'), t: nowISO(), icon: 'money', who: whoName(s), txt: `concilió un abono de ${fmtMoney(tx.amount)} con`, tgt: proj.code, kind: 'done' }
        rawDispatch({ type: 'PUSH_ACTIVITY', activity })
        // Orden importa (FK): primero el cobro, luego el abono que lo referencia, al final el borrado del anterior.
        persist([
          () => saveClientPayment(cp).then(() => saveBankTx(updated)).then(() => (prevCreated ? apiDeleteClientPayment(prevCreated) : Promise.resolve())),
          () => saveActivity(activity),
        ]); return
      }
      case 'UNASSIGN_BANK_TX': {
        const tx = s.bankTxs.find(t => t.id === action.id); if (!tx) return
        const freed: BankTransaction = { ...tx, projectId: undefined, clientPaymentId: undefined, paymentCreated: false }
        rawDispatch({ type: 'UPSERT_BANK_TX', tx: freed })
        const toDelete = tx.paymentCreated ? tx.clientPaymentId : undefined
        if (toDelete) rawDispatch({ type: 'REMOVE_CLIENT_PAYMENT', id: toDelete })
        persist([() => saveBankTx(freed).then(() => (toDelete ? apiDeleteClientPayment(toDelete) : Promise.resolve()))]); return
      }
      case 'SET_BANK_TX_CATEGORY': {
        const tx = s.bankTxs.find(t => t.id === action.id); if (!tx) return
        const updated: BankTransaction = { ...tx, category: action.category, notes: action.notes ?? tx.notes }
        rawDispatch({ type: 'UPSERT_BANK_TX', tx: updated })
        persist([() => saveBankTx(updated)]); return
      }
      case 'DELETE_BANK_TX': {
        const tx = s.bankTxs.find(t => t.id === action.id); if (!tx) return
        rawDispatch({ type: 'REMOVE_BANK_TX', id: action.id })
        const toDelete = tx.paymentCreated ? tx.clientPaymentId : undefined
        if (toDelete) rawDispatch({ type: 'REMOVE_CLIENT_PAYMENT', id: toDelete })
        // Archivos de sus CFDI en Storage: se quitan best-effort (las filas caen por CASCADE).
        const files = s.cfdiDocs.filter(d => d.bankTxId === tx.id).flatMap(d => [d.pdfPath, d.xmlPath]).filter((p): p is string => !!p)
        for (const p of files) apiDeleteDoc(p).catch(() => { /* best-effort */ })
        persist([() => apiDeleteBankTx(action.id).then(() => (toDelete ? apiDeleteClientPayment(toDelete) : Promise.resolve()))]); return
      }
      case 'SAVE_CFDI_DOC': {
        const tx = s.bankTxs.find(t => t.id === action.doc.bankTxId); if (!tx) return
        const isNew = !action.doc.id || !s.cfdiDocs.some(d => d.id === action.doc.id)
        const full: CfdiDoc = {
          ...(action.doc as CfdiDoc),
          id: action.doc.id ?? uid('cfdi'),
          projectId: action.doc.projectId ?? tx.projectId,
          createdBy: action.doc.createdBy ?? s.currentUser?.id,
          createdAt: action.doc.createdAt ?? nowISO(),
        }
        rawDispatch({ type: 'UPSERT_CFDI_DOC', doc: full })
        const thunks: (() => Promise<void>)[] = [() => saveCfdiDoc(full)]
        if (isNew) {
          const proj = full.projectId ? s.projects.find(p => p.id === full.projectId) : undefined
          const label = full.kind === 'factura' ? 'la factura' : 'el complemento de pago'
          const activity: Activity = { id: uid('a'), t: nowISO(), icon: 'doc', who: whoName(s), txt: `cargó ${label}${full.folio ? ` ${full.serie}${full.serie && full.folio ? '-' : ''}${full.folio}` : ''} del abono de ${fmtMoney(tx.amount)}`, tgt: proj?.code ?? tx.bank, kind: 'info' }
          rawDispatch({ type: 'PUSH_ACTIVITY', activity })
          thunks.push(() => saveActivity(activity))
        }
        persist(thunks); return
      }
      case 'DELETE_CFDI_DOC': {
        const doc = s.cfdiDocs.find(d => d.id === action.id); if (!doc) return
        rawDispatch({ type: 'REMOVE_CFDI_DOC', id: action.id })
        for (const p of [doc.pdfPath, doc.xmlPath]) if (p) apiDeleteDoc(p).catch(() => { /* best-effort */ })
        persist([() => apiDeleteCfdiDoc(action.id)]); return
      }

      /* ---- Almacén: cola de trabajo ---- */
      case 'SAVE_WAREHOUSE_ITEM': {
        const prev = s.warehouse.find(w => w.id === action.item.id); if (!prev) return
        const updated: WarehouseItem = { ...prev, ...action.item }
        rawDispatch({ type: 'UPSERT_WAREHOUSE_ITEM', item: updated })
        persist([() => saveWarehouseItem(updated)]); return
      }
      case 'MOVE_WAREHOUSE_ITEM': {
        const item = s.warehouse.find(w => w.id === action.id); if (!item) return
        // Solo se reordena la cola ACTIVA (lo terminado ya no compite por prioridad).
        const activos = s.warehouse.filter(w => w.status !== 'listo').sort(byWhPosition)
        const position = positionAt(activos.filter(w => w.id !== action.id), action.toIndex)
        if (position === item.position) return
        const updated: WarehouseItem = { ...item, position }
        rawDispatch({ type: 'UPSERT_WAREHOUSE_ITEM', item: updated })
        persist([() => saveWarehouseItem(updated)]); return
      }
      case 'SET_WAREHOUSE_STATUS': {
        const item = s.warehouse.find(w => w.id === action.id); if (!item) return
        const updated: WarehouseItem = {
          ...item,
          status: action.status,
          // Sella la primera vez que arranca y cuándo se terminó (o lo limpia al reabrir).
          ...(action.status === 'proceso' && !item.startedAt ? { startedAt: nowISO() } : {}),
          ...(action.status === 'listo' ? { doneAt: nowISO() } : { doneAt: undefined }),
        }
        rawDispatch({ type: 'UPSERT_WAREHOUSE_ITEM', item: updated })
        const thunks: (() => Promise<void>)[] = [() => saveWarehouseItem(updated)]
        const ord = s.orders.find(o => o.id === item.orderId)
        const proj = ord?.projectId ? s.projects.find(p => p.id === ord.projectId) : undefined
        if (action.status === 'listo' && item.status !== 'listo' && ord) {
          // Al terminar se avisa a LOGÍSTICA (coordina el envío) y al VENDEDOR del proyecto.
          const logi = s.users.filter(u => u.role === 'logistica' && u.active && u.id !== s.currentUser?.id)
          const vendedor = proj ? s.users.filter(u => u.id === proj.seller && u.active && u.id !== s.currentUser?.id) : []
          notify([...logi, ...vendedor], {
            kind: 'warehouse_done',
            title: `Almacén terminó la OC ${ord.number}`,
            body: proj
              ? `${proj.code} · ${sel.clientName(s, proj.client)} ya está listo en almacén.`
              : 'La orden de compra ya está lista en almacén.',
            ...(proj ? { projectId: proj.id } : {}),
            ...(s.currentUser?.name ? { actorName: s.currentUser.name } : {}),
          })
          const activity: Activity = {
            id: uid('a'), t: nowISO(), icon: 'pkg', who: whoName(s),
            txt: `marcó listo en almacén${proj ? ` (${proj.code})` : ''}`, tgt: ord.number, kind: 'done',
          }
          rawDispatch({ type: 'PUSH_ACTIVITY', activity })
          thunks.push(() => saveActivity(activity))
        }
        persist(thunks); return
      }
      case 'REMOVE_FROM_WAREHOUSE': {
        rawDispatch({ type: 'REMOVE_WAREHOUSE_ITEM', id: action.id })
        persist([() => apiDeleteWarehouseItem(action.id)]); return
      }
      case 'SAVE_WAREHOUSE_DAYS': {
        const settings = { ...s.settings, whDays: action.days }
        rawDispatch({ type: 'SET_SETTINGS', settings })
        persist([() => saveSetting('wh_days', action.days)]); return
      }
      case 'SAVE_SALES_GOAL': {
        const salesGoals = { ...s.settings.salesGoals, [action.month]: action.goal }
        rawDispatch({ type: 'SET_SETTINGS', settings: { ...s.settings, salesGoals } })
        persist([() => saveSetting('sales_goals', salesGoals)]); return
      }

      /* ---- Inventario ---- */
      case 'SAVE_INV_FAMILY': {
        const full: InventoryFamily = {
          ...(action.family as InventoryFamily),
          id: action.family.id ?? uid('if'),
          position: action.family.position ?? (s.invFamilies.reduce((m, f) => Math.max(m, f.position), 0) + 1000),
        }
        rawDispatch({ type: 'UPSERT_INV_FAMILY', family: full })
        persist([() => saveInvFamily(full)]); return
      }
      case 'DELETE_INV_FAMILY': {
        const items = s.invItems.filter(i => i.familyId === action.id)
        rawDispatch({ type: 'REMOVE_INV_FAMILY', id: action.id })
        persist([...items.map(i => () => apiDeleteInvItem(i.id)), () => apiDeleteInvFamily(action.id)]); return
      }
      case 'SAVE_INV_ITEM': {
        // Alta de clave o cambio de mínimo/nombre. La existencia NO se toca aquí:
        // solo cambia por INV_MOVE / INV_COUNT, que dejan rastro en el kardex.
        const prev = action.item.id ? s.invItems.find(i => i.id === action.item.id) : undefined
        const full: InventoryItem = {
          ...(action.item as InventoryItem),
          id: action.item.id ?? uid('ii'),
          qty: prev ? prev.qty : (action.item.qty ?? 0),
          counted: prev ? prev.counted : (action.item.counted ?? false),
          updatedAt: nowISO(),
        }
        rawDispatch({ type: 'UPSERT_INV_ITEM', item: full })
        persist([() => saveInvItem(full)]); return
      }
      case 'DELETE_INV_ITEM':
        rawDispatch({ type: 'REMOVE_INV_ITEM', id: action.id })
        persist([() => apiDeleteInvItem(action.id)]); return

      case 'INV_MOVE': {
        const item = s.invItems.find(i => i.id === action.itemId)
        if (!item || !action.delta) return
        // La existencia no baja de cero: si la salida se pasa, se recorta al saldo.
        const qty = Math.max(0, item.qty + action.delta)
        const delta = qty - item.qty
        if (!delta) return
        const updated: InventoryItem = { ...item, qty, counted: true, updatedAt: nowISO() }
        const move: InventoryMove = {
          id: uid('im'), itemId: item.id, motivo: action.motivo, qty: delta, balance: qty,
          userId: s.currentUser?.id ?? '', at: nowISO(),
          ...(action.ref ? { ref: action.ref } : {}),
          ...(action.orderId ? { orderId: action.orderId } : {}),
          ...(action.projectId ? { projectId: action.projectId } : {}),
        }
        rawDispatch({ type: 'UPSERT_INV_ITEM', item: updated })
        rawDispatch({ type: 'UPSERT_INV_MOVE', move })
        persist([() => saveInvItem(updated), () => saveInvMove(move)]); return
      }
      case 'INV_COUNT': {
        const item = s.invItems.find(i => i.id === action.itemId); if (!item) return
        const qty = Math.max(0, Math.round(action.counted))
        const delta = qty - item.qty
        // Contar y que cuadre TAMBIÉN es información: la clave queda marcada
        // como contada aunque no haya diferencia (deja de estar "sin contar").
        if (delta === 0 && item.counted) return
        const updated: InventoryItem = { ...item, qty, counted: true, updatedAt: nowISO() }
        rawDispatch({ type: 'UPSERT_INV_ITEM', item: updated })
        const thunks: (() => Promise<void>)[] = [() => saveInvItem(updated)]
        if (delta !== 0) {
          const move: InventoryMove = {
            id: uid('im'), itemId: item.id, motivo: 'Ajuste por conteo', qty: delta, balance: qty,
            userId: s.currentUser?.id ?? '', at: nowISO(), ref: action.ref || 'Conteo físico',
          }
          rawDispatch({ type: 'UPSERT_INV_MOVE', move })
          thunks.push(() => saveInvMove(move))
        }
        persist(thunks); return
      }
      case 'INV_ADD_ITEMS': {
        // Completar la cuadrícula: da de alta TODAS las combinaciones que falten,
        // en cero. Sin modales de por medio: la existencia se captura después
        // (a mano o en modo conteo), que es donde el trabajo sí vale la pena.
        const nuevos: InventoryItem[] = []
        for (const c of action.combos) {
          if (s.invItems.some(i => i.familyId === action.familyId && i.rowId === c.rowId && i.colId === c.colId)) continue
          if (nuevos.some(i => i.rowId === c.rowId && i.colId === c.colId)) continue
          nuevos.push({
            id: uid('ii'), familyId: action.familyId, rowId: c.rowId, colId: c.colId,
            qty: 0, counted: false, updatedAt: nowISO(),
          })
        }
        if (!nuevos.length) return
        for (const it of nuevos) rawDispatch({ type: 'UPSERT_INV_ITEM', item: it })
        persist([() => saveInvItems(nuevos)]); return
      }
      case 'INV_COUNT_CELL': {
        // Conteo directo sobre la celda. Si la clave no existía, nace aquí con el
        // número contado: dar de alta y capturar son UN solo gesto.
        const prev = s.invItems.find(i => i.familyId === action.familyId && i.rowId === action.rowId && i.colId === action.colId)
        const qty = Math.max(0, Math.round(action.counted))
        if (prev) {
          const delta = qty - prev.qty
          if (delta === 0 && prev.counted) return
          const updated: InventoryItem = { ...prev, qty, counted: true, updatedAt: nowISO() }
          rawDispatch({ type: 'UPSERT_INV_ITEM', item: updated })
          const thunks: (() => Promise<void>)[] = [() => saveInvItem(updated)]
          if (delta !== 0) {
            const move: InventoryMove = {
              id: uid('im'), itemId: prev.id, motivo: 'Ajuste por conteo', qty: delta, balance: qty,
              userId: s.currentUser?.id ?? '', at: nowISO(), ref: 'Conteo físico',
            }
            rawDispatch({ type: 'UPSERT_INV_MOVE', move })
            thunks.push(() => saveInvMove(move))
          }
          persist(thunks); return
        }
        // Clave nueva: solo tiene sentido crearla si de verdad hay algo que contar.
        if (qty <= 0) return
        const item: InventoryItem = {
          id: uid('ii'), familyId: action.familyId, rowId: action.rowId, colId: action.colId,
          qty, counted: true, updatedAt: nowISO(),
        }
        const move: InventoryMove = {
          id: uid('im'), itemId: item.id, motivo: 'Ajuste por conteo', qty, balance: qty,
          userId: s.currentUser?.id ?? '', at: nowISO(), ref: 'Alta por conteo',
        }
        rawDispatch({ type: 'UPSERT_INV_ITEM', item })
        rawDispatch({ type: 'UPSERT_INV_MOVE', move })
        persist([() => saveInvItem(item), () => saveInvMove(move)]); return
      }
      case 'INV_CONSUMO': {
        // Salida en lote del material que se usó en una OC. Una sola pasada:
        // descuenta cada clave y deja un renglón de kardex por partida.
        const thunks: (() => Promise<void>)[] = []
        let piezas = 0
        for (const line of action.lines) {
          const item = s.invItems.find(i => i.id === line.itemId)
          if (!item || !line.qty) continue
          const qty = Math.max(0, item.qty - line.qty)
          const delta = qty - item.qty
          if (!delta) continue
          const updated: InventoryItem = { ...item, qty, counted: true, updatedAt: nowISO() }
          const move: InventoryMove = {
            id: uid('im'), itemId: item.id, motivo: 'Salida a proyecto', qty: delta, balance: qty,
            userId: s.currentUser?.id ?? '', at: nowISO(),
            ...(action.ref ? { ref: action.ref } : {}),
            orderId: action.orderId,
            ...(action.projectId ? { projectId: action.projectId } : {}),
          }
          rawDispatch({ type: 'UPSERT_INV_ITEM', item: updated })
          rawDispatch({ type: 'UPSERT_INV_MOVE', move })
          thunks.push(() => saveInvItem(updated), () => saveInvMove(move))
          piezas += -delta
        }
        if (!thunks.length) return
        const ord = s.orders.find(o => o.id === action.orderId)
        const activity: Activity = {
          id: uid('a'), t: nowISO(), icon: 'pkg', who: whoName(s),
          txt: `descontó ${piezas} pza de inventario`, tgt: ord?.number || action.ref || 'consumo', kind: 'work',
        }
        rawDispatch({ type: 'PUSH_ACTIVITY', activity })
        thunks.push(() => saveActivity(activity))
        persist(thunks); return
      }

      /* ---- Agenda personal ---- */
      case 'SAVE_AGENDA_EVENT': {
        const e = action.event
        // Por defecto la anotación es para uno mismo; admin/dirección pueden agendarle a otro.
        const owner = e.userId || s.currentUser?.id || ''
        // El dueño nunca va repetido en la lista de invitados.
        const participants = Array.from(new Set(e.participants ?? [])).filter(id => id && id !== owner)
        const viewers = [owner, ...participants]
        // Al compartir una anotación que ya estaba hecha, se respeta que el dueño ya la
        // atendió; y si alguien deja de estar invitado, se cae de `doneBy`.
        const doneBy = participants.length
          ? (e.doneBy ?? (e.done ? [owner] : [])).filter(id => viewers.includes(id))
          : []
        const full: AgendaEvent = {
          ...(e as AgendaEvent),
          id: e.id ?? uid('ag'),
          userId: owner,
          participants,
          doneBy,
          // En las compartidas, `done` = ya la atendieron TODOS.
          done: participants.length ? viewers.every(id => doneBy.includes(id)) : (e.done ?? false),
          createdBy: e.createdBy ?? s.currentUser?.id,
          createdAt: e.createdAt ?? nowISO(),
        }
        rawDispatch({ type: 'UPSERT_AGENDA_EVENT', event: full })
        persist([() => saveAgendaEvent(full)]); return
      }
      case 'DELETE_AGENDA_EVENT': {
        rawDispatch({ type: 'REMOVE_AGENDA_EVENT', id: action.id })
        persist([() => apiDeleteAgendaEvent(action.id)]); return
      }
      case 'TOGGLE_AGENDA_DONE': {
        const ev = s.agendaEvents.find(x => x.id === action.id); if (!ev) return
        // En una compartida se cierra la agenda que se está viendo (normalmente la propia;
        // un admin consultando la de otro la marca para ESE usuario, no para él).
        const who = action.userId || s.currentUser?.id || ''
        let updated: AgendaEvent
        if (ev.participants?.length) {
          const viewers = [ev.userId, ...ev.participants]
          if (!viewers.includes(who)) return   // ajeno a la anotación: no toca su estado
          const prev = ev.doneBy ?? []
          const doneBy = prev.includes(who) ? prev.filter(x => x !== who) : [...prev, who]
          updated = { ...ev, doneBy, done: viewers.every(id => doneBy.includes(id)) }
        } else {
          updated = { ...ev, done: !ev.done }
        }
        rawDispatch({ type: 'UPSERT_AGENDA_EVENT', event: updated })
        persist([() => saveAgendaEvent(updated)]); return
      }

      case 'SAVE_PROSPECT': {
        const full: Prospect = {
          ...(action.prospect as Prospect),
          id: action.prospect.id ?? uid('pr'),
          createdAt: action.prospect.createdAt ?? nowISO(),
          updated: nowISO(),
        }
        rawDispatch({ type: 'UPSERT_PROSPECT', prospect: full })
        persist([() => saveProspect(full)]); return
      }
      case 'DELETE_PROSPECT': {
        rawDispatch({ type: 'REMOVE_PROSPECT', id: action.id })
        persist([() => apiDeleteProspect(action.id)]); return
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
  }, [persist, notify, notifySellerStage, notifyFirstCobro])

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
        // Cierre por inactividad: si pasó el límite desde la última actividad (o no hay
        // marca), NO restaura la sesión y la cierra. Un login nuevo marca actividad ANTES
        // de autenticar (en signIn), así que aquí siempre se ve fresca y nunca se bloquea.
        // No se renueva la marca aquí a propósito: así un refresh de token automático no
        // mantiene viva una sesión inactiva.
        if (inactivityExpired()) { void signOut(); return }
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
        clearActivity()
        rawDispatch({ type: 'LOGOUT' })
      }
    })

    return () => { active = false; sub.subscription.unsubscribe() }
  }, [])

  // Realtime: notificaciones EN VIVO del usuario en sesión (WebSocket por Supabase).
  // Cuando llega un INSERT para él (p. ej. un vendedor registró una venta), aparece
  // al instante en la campana sin recargar. Se re-suscribe si cambia el usuario.
  const myId = state.currentUser?.id

  // Cierre de sesión por inactividad: mientras hay sesión, registra la actividad del
  // usuario (clic, teclado, scroll…) y, si pasa INACTIVITY_LIMIT_MS sin usar la app,
  // cierra la sesión. El chequeo periódico cubre el caso de tener la app abierta sin tocarla.
  React.useEffect(() => {
    if (!myId) return
    touchActivity()
    let last = 0
    const onActivity = () => { const t = Date.now(); if (t - last > 30_000) { last = t; touchActivity() } }
    const events: (keyof WindowEventMap)[] = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click']
    events.forEach(e => window.addEventListener(e, onActivity, { passive: true }))
    const iv = window.setInterval(() => { if (inactivityExpired()) { clearActivity(); void signOut() } }, 60_000)
    return () => { events.forEach(e => window.removeEventListener(e, onActivity)); clearInterval(iv) }
  }, [myId])

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
          case 'movement_lists':  rawDispatch({ type: 'REMOVE_MOVEMENT_LIST', id: c.id }); break
          case 'movements':       rawDispatch({ type: 'REMOVE_MOVEMENT', id: c.id }); break
          case 'campaigns':       rawDispatch({ type: 'REMOVE_CAMPAIGN', id: c.id }); break
          case 'bank_transactions': rawDispatch({ type: 'REMOVE_BANK_TX', id: c.id }); break
          case 'cfdi_docs':       rawDispatch({ type: 'REMOVE_CFDI_DOC', id: c.id }); break
          case 'prospects':       rawDispatch({ type: 'REMOVE_PROSPECT', id: c.id }); break
          case 'agenda_events':   rawDispatch({ type: 'REMOVE_AGENDA_EVENT', id: c.id }); break
          case 'warehouse_queue': rawDispatch({ type: 'REMOVE_WAREHOUSE_ITEM', id: c.id }); break
          case 'inventory_families': rawDispatch({ type: 'REMOVE_INV_FAMILY', id: c.id }); break
          case 'inventory_items':    rawDispatch({ type: 'REMOVE_INV_ITEM', id: c.id }); break
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
          case 'movement_lists':  rawDispatch({ type: 'UPSERT_MOVEMENT_LIST', list: c.row }); break
          case 'movements':       rawDispatch({ type: 'UPSERT_MOVEMENT', movement: c.row }); break
          case 'campaigns':       rawDispatch({ type: 'UPSERT_CAMPAIGN', campaign: c.row }); break
          case 'bank_transactions': rawDispatch({ type: 'UPSERT_BANK_TX', tx: c.row }); break
          case 'cfdi_docs':       rawDispatch({ type: 'UPSERT_CFDI_DOC', doc: c.row }); break
          case 'prospects':       rawDispatch({ type: 'UPSERT_PROSPECT', prospect: c.row }); break
          case 'agenda_events':   rawDispatch({ type: 'UPSERT_AGENDA_EVENT', event: c.row }); break
          case 'warehouse_queue': rawDispatch({ type: 'UPSERT_WAREHOUSE_ITEM', item: c.row }); break
          case 'inventory_families': rawDispatch({ type: 'UPSERT_INV_FAMILY', family: c.row }); break
          case 'inventory_items':    rawDispatch({ type: 'UPSERT_INV_ITEM', item: c.row }); break
          case 'inventory_moves':    rawDispatch({ type: 'UPSERT_INV_MOVE', move: c.row }); break
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
  /** Abono del banco ligado a un cobro (si el cobro se concilió desde Bancos). */
  bankTxForPayment: (state: AppState, cpId: string) => state.bankTxs.find(t => t.clientPaymentId === cpId),
  /** CFDI (facturas / complementos) de un abono, en orden de carga. */
  cfdiForTx: (state: AppState, txId: string) => state.cfdiDocs.filter(d => d.bankTxId === txId),
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
  /** Vendedores que participan de la meta mensual (reparto, barras y totales).
   *  Hoy son TODOS los vendedores, gerentes incluidos; si algún día alguien deja
   *  de contar, este es el único lugar que hay que filtrar. */
  vendedoresMeta: (state: AppState) => sel.vendedores(state),
  /** Meta de ventas de un mes ('YYYY-MM'): la capturada para ese mes o, si no
   *  hay, la del mes anterior más reciente con meta (o el default). Así solo se
   *  captura cuando la meta CAMBIA y los meses pasados conservan la suya. */
  salesGoal: (state: AppState, ym: string) => {
    const g = state.settings.salesGoals
    if (g[ym] != null) return g[ym]
    const prev = Object.keys(g).filter(k => k < ym).sort().pop()
    return prev ? g[prev] : SALES_GOAL_DEFAULT
  },
  /* ---- Almacén ---- */
  /** Cola ACTIVA (por iniciar + en proceso), en el orden que definió almacén. */
  warehouseQueue: (state: AppState) => state.warehouse.filter(w => w.status !== 'listo').sort(byWhPosition),
  /** Terminados, del más reciente al más viejo. */
  warehouseDone: (state: AppState) =>
    state.warehouse.filter(w => w.status === 'listo').sort((a, b) => (b.doneAt || '').localeCompare(a.doneAt || '')),
  /** Renglón de la cola de una OC (si entró). */
  warehouseForOrder: (state: AppState, oid: string) => state.warehouse.find(w => w.orderId === oid),
  /** Renglones de la cola de un PROYECTO: uno por cada OC suya que entró. */
  warehouseForProject: (state: AppState, pid: string) => {
    const ocs = new Set(state.orders.filter(o => o.projectId === pid).map(o => o.id))
    return state.warehouse.filter(w => ocs.has(w.orderId)).sort(byWhPosition)
  },
  /** Días de trabajo de un renglón (enteros): mandan los capturados a mano y, si
   *  no hay, los de la talla. 0 = sin clasificar (no suma a la carga). */
  warehouseDays: (state: AppState, w?: { size?: WarehouseSize; days?: number }) =>
    Math.round(w?.days != null ? w.days : (w?.size ? state.settings.whDays[w.size] ?? 0 : 0)),
  /** ¿El renglón ya tiene carga definida (por talla o a mano)? */
  warehouseClasificado: (w: { size?: WarehouseSize; days?: number }) => w.days != null || !!w.size,
  /** Resumen de carga para ventas: cuántos hay y cuántos días suman.
   *  Los proyectos SIN talla no suman días (se reportan aparte como "sin clasificar"). */
  warehouseLoad: (state: AppState) => {
    const q = sel.warehouseQueue(state)
    const proceso = q.filter(w => w.status === 'proceso')
    const pendiente = q.filter(w => w.status === 'pendiente')
    const pausado = q.filter(w => w.status === 'pausado')
    return {
      proceso: proceso.length,
      pendiente: pendiente.length,
      pausado: pausado.length,
      total: q.length,
      sinClasificar: q.filter(w => !sel.warehouseClasificado(w)).length,
      // Los días son enteros (lo que sale el mismo día cuenta como 1).
      dias: q.reduce((a, w) => a + sel.warehouseDays(state, w), 0),
      diasProceso: proceso.reduce((a, w) => a + sel.warehouseDays(state, w), 0),
    }
  },

  /* ---- Inventario ---- */
  /** Familias en el orden definido. */
  invFamilies: (state: AppState) => [...state.invFamilies].sort((a, b) => a.position - b.position),
  /** ¿La familia se dibuja como matriz? (tiene los dos atributos con valores). */
  invEsMatriz: (f: InventoryFamily) => (f.rows?.length ?? 0) > 0 && (f.cols?.length ?? 0) > 0,
  /** Claves de una familia. */
  invItemsForFamily: (state: AppState, fid: string) => state.invItems.filter(i => i.familyId === fid),
  /** Clave por combinación de atributos (undefined = esa medida no existe en catálogo). */
  invItemAt: (state: AppState, fid: string, rowId: string, colId: string) =>
    state.invItems.find(i => i.familyId === fid && i.rowId === rowId && i.colId === colId),
  /** Nombre legible de una clave: familia + sus atributos (o su nombre libre). */
  invLabel: (state: AppState, item: InventoryItem): string => {
    const fam = state.invFamilies.find(f => f.id === item.familyId)
    if (!fam) return item.label || '—'
    if (!sel.invEsMatriz(fam)) return item.label || '—'
    const r = fam.rows.find(x => x.id === item.rowId)?.label ?? ''
    const c = fam.cols.find(x => x.id === item.colId)?.label ?? ''
    return [fam.name.replace(/s$/, ''), r, c].filter(Boolean).join(' · ')
  },
  /** Nivel de existencia de una clave, para pintarla.
   *  Umbrales FIJOS para todo el inventario (INV_ROJO / INV_NARANJA).
   *  Caso aparte: un CERO que nunca se ha contado no es "se acabó", es
   *  "no sabemos" — se deja en gris para no llenar la matriz de alarmas
   *  falsas mientras el inventario se termina de capturar. */
  invNivel: (item: InventoryItem): 'zero' | 'low' | 'mid' | 'ok' =>
    item.qty <= 0 ? (item.counted ? 'low' : 'zero')
      : item.qty <= INV_ROJO ? 'low'
        : item.qty <= INV_NARANJA ? 'mid'
          : 'ok',
  /** Resumen para los KPI de la vista. */
  invResumen: (state: AppState) => {
    const items = state.invItems
    const hoy = TODAY_ISO
    return {
      piezas: items.reduce((a, i) => a + i.qty, 0),
      claves: items.length,
      conExistencia: items.filter(i => i.qty > 0).length,
      // Mismo criterio que el color de la celda: lo que se ve en rojo es lo que cuenta aquí.
      porResurtir: items.filter(i => sel.invNivel(i) === 'low').length,
      sinContar: items.filter(i => !i.counted).length,
      movsHoy: state.invMoves.filter(m => (m.at || '').slice(0, 10) === hoy).length,
    }
  },
  /** Kardex de una clave, del más reciente al más viejo. */
  invMovesForItem: (state: AppState, itemId: string) =>
    state.invMoves.filter(m => m.itemId === itemId).sort((a, b) => (a.at < b.at ? 1 : -1)),
  /** Kardex completo ordenado (el fetch ya lo acota a los últimos movimientos). */
  invMovesRecientes: (state: AppState) =>
    [...state.invMoves].sort((a, b) => (a.at < b.at ? 1 : -1)),
  /** ¿Ya se capturó el consumo de esta OC? (existe al menos una salida suya). */
  invConsumoCapturado: (state: AppState, orderId: string) =>
    state.invMoves.some(m => m.orderId === orderId && m.motivo === 'Salida a proyecto'),

  /** Comisiones de un proyecto. */
  commissionsForProject: (state: AppState, pid: string) => state.commissions.filter(c => c.projectId === pid),
  /** ¿El proyecto está ARCHIVADO (va al Historial)? = Finalizado + tiene comisiones y
   *  TODAS están pagadas, salvo que el usuario lo haya "restaurado" a Proyectos. */
  isProjectArchived: (state: AppState, p: Project): boolean => {
    if (p.stage !== 'finalizado' || p.restored) return false
    const cms = state.commissions.filter(c => c.projectId === p.id)
    return cms.length > 0 && cms.every(c => c.status === 'paid')
  },

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
      // Los SIN FACTURA que se fueron a una lista de movimientos NO cuentan aquí:
      // su gasto se descuenta vía projectMovementsCost (evita descontar doble).
      .filter(p => p.projectId === pid && p.status === 'Pagado' && !p.movementId)
      .reduce((a, p) => a + (p.amount || 0), 0),
  /** Los MISMOS pagos internos pero a SUBTOTAL (sin IVA), para restarlos de la utilidad
   *  sin IVA:
   *   · SIN factura → no traen IVA: se restan tal cual.
   *   · CON factura → se usa el `subtotal` capturado; si es un pago viejo que no lo tiene,
   *     se deriva quitándole el IVA al total (amount / 1.16). */
  projectInternalPaymentsSub: (state: AppState, pid: string) =>
    state.internalPayments
      .filter(p => p.projectId === pid && p.status === 'Pagado' && !p.movementId)
      .reduce((a, p) => a + (p.sinFactura
        ? (p.amount || 0)
        : (p.subtotal != null ? p.subtotal : (p.amount || 0) / 1.16)), 0),
  /** Gastos por movimientos "por fuera" ligados al proyecto. Solo cuentan los AUTORIZADOS,
   *  no eliminados, y cuya LISTA ya tiene comprobante de pago (lista pagada): hasta que se
   *  sube el comprobante no se descuenta la utilidad. */
  projectMovementsCost: (state: AppState, pid: string) => {
    const paidLists = new Set(state.movementLists.filter(l => !!l.comprobantePath).map(l => l.id))
    return state.movements
      .filter(m => m.projectId === pid && m.status === 'Autorizado' && m.changedByDireccion !== 'removed' && paidLists.has(m.listId))
      .reduce((a, m) => a + (m.amount || 0), 0)
  },
  /** Utilidad SIN IVA = subtotal de la venta − subtotal de compras (OC) − pagos internos
   *  (a subtotal: a los con factura se les quita el IVA) − movimientos (sin factura, tal cual). */
  projectUtilidadSub: (state: AppState, p: Project) =>
    (p.ventaSubtotal || 0) - sel.projectComprasConIva(state, p.id) / 1.16
      - sel.projectInternalPaymentsSub(state, p.id)
      - sel.projectMovementsCost(state, p.id),
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
/* ============================================================
   Corte semanal de pagos SIN FACTURA (van a la lista de Movimientos)
   Los pagos se hacen los JUEVES; la ventana para entrar a la lista de ese
   jueves va de lunes hasta el jueves a las 2:00 pm. Pasado el corte, el gasto
   aprobado entra a la lista del jueves SIGUIENTE.
   ============================================================ */
export const CORTE_DIA = 4     // jueves (0 = domingo)
export const CORTE_HORA = 14   // 2:00 pm

const isoDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Jueves de pago al que entra un gasto aprobado AHORA (respeta el corte de las 2 pm). */
export function nextPayThursday(now: Date = new Date()): string {
  const dow = now.getDay()
  let diff = (CORTE_DIA - dow + 7) % 7            // días hasta el próximo jueves (0 = hoy)
  // Si hoy es jueves y ya pasaron las 2 pm, se pasa al jueves siguiente.
  if (diff === 0 && now.getHours() >= CORTE_HORA) diff = 7
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diff)
  return isoDate(d)
}

/** Nombre sugerido de la lista de ese jueves (ej. "Lista jue 16 jul"). */
export function payListName(thursdayISO: string): string {
  const [y, m, d] = thursdayISO.split('-').map(Number)
  const f = new Date(y, m - 1, d).toLocaleDateString('es-MX', { weekday: 'short', day: '2-digit', month: 'short' }).replace(/\.|,/g, '')
  return `Lista ${f}`
}

/** Info del corte para mostrar en la UI: jueves destino, fecha límite y tiempo restante. */
export function payCutoff(now: Date = new Date()): { thursday: string; deadline: Date; msLeft: number } {
  const thursday = nextPayThursday(now)
  const [y, m, d] = thursday.split('-').map(Number)
  const deadline = new Date(y, m - 1, d, CORTE_HORA, 0, 0)
  return { thursday, deadline, msLeft: deadline.getTime() - now.getTime() }
}

/** Días antes de la fecha ETA en que el proyecto entra a "Por Vencer". */
export const ENTREGA_EST_DIAS_PREVIOS = 5
export function autoStageFor(state: AppState, p: Project): StageId | null {
  // 7 · Pago Recibido — el cliente cubrió el total con IVA (incluye finiquito).
  const total = sel.projectTotalConIva(p)
  if (total > 0 && sel.projectCobrado(state, p.id) >= total - 0.5) return 'pago'
  const anticipoProveedor = sel.projectAnticipoProveedor(state, p.id)
  // 7 · Vencido — material en fabricación, la fecha ETA ya pasó y el cliente no ha pagado.
  // 6 · Por Vencer — material en fabricación y faltan ≤ 5 días para la fecha ETA.
  //     Se adelanta el salto a esta etapa para detectar a tiempo los proyectos
  //     próximos a vencer que aún no han recibido el pago del cliente.
  const etaDays = daysBetween(p.eta)
  if (anticipoProveedor && p.eta && etaDays != null) {
    if (etaDays < 0) return 'vencido'
    if (etaDays <= ENTREGA_EST_DIAS_PREVIOS) return 'entrega_est'
  }
  // 5 · Fabricación — se pagó anticipo al proveedor.
  if (anticipoProveedor) return 'fabricacion'
  // 4 · Orden de Compra — ya existe la OC del proyecto.
  if (sel.ordersForProject(state, p.id).length > 0) return 'compra'
  // 3 · Asignación — hay proveedor asignado (aún sin OC).
  if (p.suppliers.length > 0) return 'asignacion'
  return null
}

/* ============================================================
   REQUISITOS PARA AVANZAR DE ETAPA (etapas manuales de logística)
   ============================================================
   Devuelve el motivo (texto) si NO se puede avanzar a `target`, o null si se puede.
   Solo se evalúa al AVANZAR (no al regresar). Reglas:
   · Coordinación  → requiere costo de flete E instalación asignados.
   · Instalación   → requiere al menos una remisión de salida creada.
   · Finalizado    → requiere la Carta fin de obra + ≥1 imagen de evidencia. */
export function stageBlockedReason(state: AppState, p: Project, target: StageId): string | null {
  if (target === 'coordinacion') {
    if (!((p.freightCost || 0) > 0 && (p.installCost || 0) > 0))
      return 'Para pasar a Coordinación primero asigna el costo de flete e instalación en "Asignación de servicios".'
  }
  if (target === 'instalacion') {
    if (sel.remisionesForProject(state, p.id).length === 0)
      return 'Para pasar a Instalación primero crea la remisión de salida del proyecto.'
  }
  if (target === 'finalizado') {
    if (!p.docs?.cartaFin?.ok)
      return 'Para Finalizar primero sube la Carta fin de obra (carta de terminación).'
    if (!(p.docs?.evidencia || []).some(d => d.ok))
      return 'Para Finalizar primero sube al menos una imagen de evidencia de la obra terminada.'
  }
  return null
}
