// ============================================================
//  Capa de acceso a datos (Supabase)
//  Lee de la base y mapea las columnas snake_case de Postgres
//  a los campos camelCase de los tipos del front (types.ts).
// ============================================================
import { supabase } from './supabase'
import type {
  Client, Supplier, User, Seller, Project, Order, Payment,
  ClientPayment, Commission, Activity, Notification, AppState,
  Remision, InternalPayment, Movement, MovementList, AppSettings, Campaign, Prospect,
} from './types'

/* eslint-disable @typescript-eslint/no-explicit-any */

function mapUser(r: any): User {
  return {
    id: r.id,
    name: r.name ?? '',
    email: r.email,
    role: r.role,
    initials: r.initials ?? '',
    active: !!r.active,
    ...(r.title ? { title: r.title } : {}),
  }
}

function mapClient(r: any): Client {
  return {
    id: r.id,
    name: r.name,
    city: r.city ?? '',
    contact: r.contact ?? '',
    phone: r.phone ?? '',
    email: r.email ?? '',
    since: r.since ?? '',
    ...(r.razon_social ? { razonSocial: r.razon_social } : {}),
    ...(r.rfc ? { rfc: r.rfc } : {}),
    ...(r.regimen_fiscal ? { regimenFiscal: r.regimen_fiscal } : {}),
    ...(r.cp ? { cp: r.cp } : {}),
    ...(r.uso_cfdi ? { usoCFDI: r.uso_cfdi } : {}),
    ...(r.dias_credito != null ? { diasCredito: r.dias_credito } : {}),
    ...(r.limite_credito != null ? { limiteCredito: Number(r.limite_credito) } : {}),
    ...(r.metodo_pago ? { metodoPago: r.metodo_pago } : {}),
    ...(r.forma_pago ? { formaPago: r.forma_pago } : {}),
    ...(r.pending ? { pending: true } : {}),
    ...(r.requested_by ? { requestedBy: r.requested_by } : {}),
  }
}

function mapSupplier(r: any): Supplier {
  return {
    id: r.id,
    name: r.name,
    cat: r.cat ?? '',
    contact: r.contact ?? '',
    phone: r.phone ?? '',
    email: r.email ?? '',
    city: r.city ?? '',
    rating: r.rating ?? 0,
    active: !!r.active,
    notes: r.notes ?? '',
    ...(r.direccion ? { direccion: r.direccion } : {}),
    ...(r.dias_credito != null ? { diasCredito: r.dias_credito } : {}),
    ...(r.cuenta_banco ? { cuentaBanco: r.cuenta_banco } : {}),
    ...(r.prefijo ? { prefijo: r.prefijo } : {}),
  }
}

/** Trae todos los clientes ordenados por nombre. */
export async function fetchClients(): Promise<Client[]> {
  const { data, error } = await supabase.from('clients').select('*').order('name')
  if (error) throw error
  return (data ?? []).map(mapClient)
}

/** Trae todos los proveedores ordenados por nombre. */
export async function fetchSuppliers(): Promise<Supplier[]> {
  const { data, error } = await supabase.from('suppliers').select('*').order('name')
  if (error) throw error
  return (data ?? []).map(mapSupplier)
}

/* ============================================================
   AUTENTICACIÓN
   ============================================================ */

/** Inicia sesión con correo y contraseña (Supabase Auth). */
/* ---- Cierre de sesión por inactividad ----
   Supabase mantiene la sesión indefinidamente (auto-refresca el token). Para exigir
   re-login tras INACTIVITY_LIMIT_MS sin usar la app, guardamos la marca de "última
   actividad" en localStorage. Vive aquí (junto a signIn/signOut) para marcarla ANTES
   de autenticar y evitar carreras con el evento SIGNED_IN. */
export const INACTIVITY_LIMIT_MS = 8 * 60 * 60 * 1000   // 8 horas
const ACTIVITY_KEY = 'ccracks_last_activity'
export const touchActivity = () => { try { localStorage.setItem(ACTIVITY_KEY, String(Date.now())) } catch { /* ignore */ } }
export const clearActivity = () => { try { localStorage.removeItem(ACTIVITY_KEY) } catch { /* ignore */ } }
/** ¿Expiró por inactividad? Sin marca → true (no podemos garantizar; pide login). */
export const inactivityExpired = (): boolean => {
  try {
    const raw = localStorage.getItem(ACTIVITY_KEY)
    if (!raw) return true
    return Date.now() - (Number(raw) || 0) > INACTIVITY_LIMIT_MS
  } catch { return false }
}

export async function signIn(email: string, password: string): Promise<void> {
  touchActivity()   // marca actividad ANTES de autenticar (el callback SIGNED_IN ya la verá fresca)
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) { clearActivity(); throw error }
}

/** Cierra la sesión actual. */
export async function signOut(): Promise<void> {
  clearActivity()
  await supabase.auth.signOut()
}

/** Cambia la contraseña del usuario en sesión (no requiere ser admin). */
export async function changeMyPassword(password: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password })
  if (error) throw error
}

/** Perfil (public.users) del usuario autenticado, o null si no hay sesión. */
export async function fetchMyProfile(): Promise<User | null> {
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return null
  const { data, error } = await supabase.from('users').select('*').eq('id', auth.user.id).single()
  if (error) throw error
  return data ? mapUser(data) : null
}

/** Lista de usuarios (para el panel de administración). */
export async function fetchUsers(): Promise<User[]> {
  const { data, error } = await supabase.from('users').select('*').order('name')
  if (error) throw error
  return (data ?? []).map(mapUser)
}

/* ---- Gestión de usuarios (vía Edge Function 'admin-users', solo admin) ---- */

async function callAdminUsers(payload: Record<string, unknown>): Promise<any> {
  // invoke() agrega automáticamente el token del usuario en sesión.
  const { data, error } = await supabase.functions.invoke('admin-users', { body: payload })
  if (error) {
    // Intenta extraer el mensaje de error que devuelve la función.
    try {
      const ctx = (error as any).context
      const body = ctx && typeof ctx.json === 'function' ? await ctx.json() : null
      if (body?.error) throw new Error(body.error)
    } catch (inner) {
      if (inner instanceof Error && inner.message) throw inner
    }
    throw error
  }
  if (data?.error) throw new Error(data.error)
  return data
}

export function createUser(u: Partial<User> & { email: string; password: string }) {
  return callAdminUsers({ action: 'create', user: u })
}
export function updateUser(u: Partial<User> & { id: string }) {
  return callAdminUsers({ action: 'update', user: u })
}
export function toggleUser(id: string) {
  return callAdminUsers({ action: 'toggle', id })
}
export function removeUser(id: string) {
  return callAdminUsers({ action: 'delete', id })
}
/** Inicia sesión COMO otro usuario (suplantación, solo admin / testing).
 *  Reemplaza la sesión actual: quien llama queda logueado como el destino. */
export async function impersonateUser(id: string): Promise<void> {
  const res = await callAdminUsers({ action: 'impersonate', id })
  const tokenHash = res?.token_hash
  if (!tokenHash) throw new Error('No se pudo generar el acceso de suplantación.')
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' })
  if (error) throw error
}

/* ============================================================
   ENTIDADES OPERATIVAS — lectura y escritura
   (snake_case en la base ↔ camelCase en el front; JSONB para
    docs/items/suppliers)
   ============================================================ */

const orNull = (v?: string) => (v && v.trim() ? v : null)

async function upsert(table: string, row: Record<string, unknown>): Promise<void> {
  const { error } = await supabase.from(table).upsert(row)
  if (error) throw error
}
async function removeRow(table: string, id: string): Promise<void> {
  const { error } = await supabase.from(table).delete().eq('id', id)
  if (error) throw error
}

/* ---- Vendedores ---- */
function mapSeller(r: any): Seller {
  return { id: r.id, name: r.name ?? '', initials: r.initials ?? '', rate: Number(r.rate ?? 0), overrideRate: Number(r.override_rate ?? 0) }
}
export async function fetchSellers(): Promise<Seller[]> {
  const { data, error } = await supabase.from('sellers').select('*').order('name')
  if (error) throw error
  return (data ?? []).map(mapSeller)
}
export const saveSeller = (s: Seller) =>
  upsert('sellers', { id: s.id, name: s.name, initials: s.initials, rate: s.rate, override_rate: s.overrideRate ?? 0 })
export const deleteSeller = (id: string) => removeRow('sellers', id)

/* ---- Proyectos ---- */
const emptyDoc = () => ({ name: '', ok: false })
const emptyDocs = (): Project['docs'] => ({
  cotizacion: emptyDoc(), layout: emptyDoc(), anticipo: emptyDoc(), ordenCompra: [],
  finiquito: emptyDoc(), remision: emptyDoc(), cartaFin: emptyDoc(), evidencia: [],
})
/** Normaliza los docs de un proyecto: `ordenCompra` y `evidencia` deben ser LISTAS.
 *  Proyectos viejos guardaban `ordenCompra` como un solo objeto → se convierte a [obj]. */
function normalizeDocs(raw: any): Project['docs'] {
  const docs = { ...emptyDocs(), ...(raw ?? {}) } as any
  if (!Array.isArray(docs.ordenCompra)) docs.ordenCompra = docs.ordenCompra && (docs.ordenCompra.ok || docs.ordenCompra.name) ? [docs.ordenCompra] : []
  if (!Array.isArray(docs.evidencia)) docs.evidencia = []
  return docs as Project['docs']
}
function mapProject(r: any): Project {
  return {
    id: r.id, code: r.code, stage: r.stage,
    client: r.client ?? '', seller: r.seller ?? '', city: r.city ?? '',
    ...(r.alias ? { alias: r.alias } : {}),
    ...(r.origen ? { origen: r.origen } : {}),
    ...(r.sistema_vendido ? { sistemaVendido: r.sistema_vendido } : {}),
    ...(r.venta_subtotal != null ? { ventaSubtotal: Number(r.venta_subtotal) } : {}),
    freight: Number(r.freight ?? 0), install: Number(r.install ?? 0), weeks: r.weeks ?? 0,
    ...(r.freight_supplier_id ? { freightSupplierId: r.freight_supplier_id } : {}),
    ...(r.freight_cost != null ? { freightCost: Number(r.freight_cost) } : {}),
    ...(r.install_supplier_id ? { installSupplierId: r.install_supplier_id } : {}),
    ...(r.install_cost != null ? { installCost: Number(r.install_cost) } : {}),
    obs: r.obs ?? '',
    docs: normalizeDocs(r.docs),
    suppliers: Array.isArray(r.suppliers) ? r.suppliers : [],
    eta: r.eta ?? '', finiquito: r.finiquito ?? 'pending',
    created: r.created, updated: r.updated,
    ...(r.closed_on ? { closedOn: r.closed_on } : {}),
    ...(r.remision ? { remision: r.remision } : {}),
  }
}
function projectRow(p: Project): Record<string, unknown> {
  return {
    id: p.id, code: p.code, stage: p.stage, client: p.client, seller: p.seller, city: p.city,
    alias: p.alias ?? null,
    origen: p.origen ?? null,
    sistema_vendido: p.sistemaVendido ?? null, venta_subtotal: p.ventaSubtotal ?? null,
    freight: p.freight, install: p.install,
    freight_supplier_id: p.freightSupplierId ?? null, freight_cost: p.freightCost ?? null,
    install_supplier_id: p.installSupplierId ?? null, install_cost: p.installCost ?? null,
    weeks: p.weeks, obs: p.obs,
    docs: p.docs, suppliers: p.suppliers,
    eta: orNull(p.eta), finiquito: p.finiquito,
    created: p.created, updated: p.updated,
    closed_on: p.closedOn ?? null, remision: p.remision ?? null,
  }
}
export async function fetchProjects(): Promise<Project[]> {
  const { data, error } = await supabase.from('projects').select('*').order('created', { ascending: false })
  if (error) throw error
  return (data ?? []).map(mapProject)
}
export const saveProject = (p: Project) => upsert('projects', projectRow(p))
export const deleteProject = (id: string) => removeRow('projects', id)

/* ---- Órdenes de compra ---- */
function mapOrder(r: any): Order {
  return {
    id: r.id, number: r.number, date: r.date ?? '', supplierId: r.supplier_id ?? '',
    description: r.description ?? '', conditions: r.conditions ?? '', amount: Number(r.amount ?? 0),
    responsible: r.responsible ?? '', file: r.file ?? '',
    ...(r.file_path ? { filePath: r.file_path } : {}),
    ...(r.delivery_date ? { deliveryDate: r.delivery_date } : {}),
    ...(r.project_id ? { projectId: r.project_id } : {}),
    ...(Array.isArray(r.items) && r.items.length ? { items: r.items } : {}),
    ...(r.cancelled ? { cancelled: true } : {}),
  }
}
function orderRow(o: Order): Record<string, unknown> {
  return {
    id: o.id, number: o.number, date: orNull(o.date), supplier_id: o.supplierId,
    description: o.description, conditions: o.conditions, amount: o.amount,
    responsible: o.responsible, file: o.file, file_path: o.filePath ?? null,
    delivery_date: orNull(o.deliveryDate), project_id: o.projectId ?? null, items: o.items ?? [], cancelled: !!o.cancelled,
  }
}
export async function fetchOrders(): Promise<Order[]> {
  const { data, error } = await supabase.from('orders').select('*').order('date', { ascending: false })
  if (error) throw error
  return (data ?? []).map(mapOrder)
}
export const saveOrder = (o: Order) => upsert('orders', orderRow(o))
export const deleteOrder = (id: string) => removeRow('orders', id)

/* ---- Pagos de OC ---- */
function mapPayment(r: any): Payment {
  return {
    id: r.id, orderId: r.order_id, n: r.n ?? 1, date: r.date ?? '', amount: Number(r.amount ?? 0),
    method: r.method ?? '', status: r.status, comments: r.comments ?? '',
  }
}
function paymentRow(p: Payment): Record<string, unknown> {
  return {
    id: p.id, order_id: p.orderId, n: p.n, date: orNull(p.date), amount: p.amount,
    method: p.method, status: p.status, comments: p.comments,
  }
}
export async function fetchPayments(): Promise<Payment[]> {
  const { data, error } = await supabase.from('payments').select('*')
  if (error) throw error
  return (data ?? []).map(mapPayment)
}
export const savePayment = (p: Payment) => upsert('payments', paymentRow(p))
export const deletePayment = (id: string) => removeRow('payments', id)

/* ---- Cobros del cliente ---- */
function mapClientPayment(r: any): ClientPayment {
  return {
    id: r.id, projectId: r.project_id, n: r.n ?? 1, date: r.date ?? '', amount: Number(r.amount ?? 0),
    concept: r.concept ?? '', method: r.method ?? '', status: r.status, comments: r.comments ?? '',
    ...(r.file ? { file: r.file } : {}),
    ...(r.file_path ? { filePath: r.file_path } : {}),
  }
}
function clientPaymentRow(c: ClientPayment): Record<string, unknown> {
  return {
    id: c.id, project_id: c.projectId, n: c.n, date: orNull(c.date), amount: c.amount,
    concept: c.concept, method: c.method, status: c.status, comments: c.comments,
    file: c.file ?? null, file_path: c.filePath ?? null,
  }
}
export async function fetchClientPayments(): Promise<ClientPayment[]> {
  const { data, error } = await supabase.from('client_payments').select('*')
  if (error) throw error
  return (data ?? []).map(mapClientPayment)
}
export const saveClientPayment = (c: ClientPayment) => upsert('client_payments', clientPaymentRow(c))
export const deleteClientPayment = (id: string) => removeRow('client_payments', id)

/* ---- Comisiones ---- */
function mapCommission(r: any): Commission {
  return {
    id: r.id, projectId: r.project_id, seller: r.seller ?? '', amount: Number(r.amount ?? 0),
    status: r.status, month: r.month,
  }
}
export async function fetchCommissions(): Promise<Commission[]> {
  const { data, error } = await supabase.from('commissions').select('*')
  if (error) throw error
  return (data ?? []).map(mapCommission)
}
export const saveCommission = (c: Commission) =>
  upsert('commissions', { id: c.id, project_id: c.projectId, seller: c.seller, amount: c.amount, status: c.status, month: c.month })
export const deleteCommission = (id: string) => removeRow('commissions', id)

/* ---- Remisiones de salida ---- */
function mapRemision(r: any): Remision {
  return {
    id: r.id, number: r.number ?? '', projectId: r.project_id ?? '', date: r.date ?? '',
    destination: r.destination ?? '', items: Array.isArray(r.items) ? r.items : [],
    status: r.status, notes: r.notes ?? '', file: r.file ?? '',
    createdBy: r.created_by ?? '', createdAt: r.created_at,
    ...(r.carrier_id ? { carrierId: r.carrier_id } : {}),
    ...(r.phone ? { phone: r.phone } : {}),
    ...(r.received_by ? { receivedBy: r.received_by } : {}),
    ...(r.file_path ? { filePath: r.file_path } : {}),
  }
}
function remisionRow(r: Remision): Record<string, unknown> {
  return {
    id: r.id, number: r.number, project_id: r.projectId, date: orNull(r.date),
    carrier_id: r.carrierId ?? null, destination: r.destination, phone: orNull(r.phone), received_by: orNull(r.receivedBy),
    items: r.items ?? [], status: r.status, notes: r.notes, file: r.file, file_path: r.filePath ?? null,
    created_by: r.createdBy, created_at: r.createdAt,
  }
}
export async function fetchRemisiones(): Promise<Remision[]> {
  const { data, error } = await supabase.from('remisiones').select('*').order('date', { ascending: false })
  if (error) throw error
  return (data ?? []).map(mapRemision)
}
export const saveRemision = (r: Remision) => upsert('remisiones', remisionRow(r))
export const deleteRemision = (id: string) => removeRow('remisiones', id)

/* ---- Pagos internos (con flujo de aprobación) ---- */
function mapInternalPayment(r: any): InternalPayment {
  return {
    id: r.id, concept: r.concept ?? '', category: r.category, amount: Number(r.amount ?? 0),
    status: r.status, requestedBy: r.requested_by ?? '', notes: r.notes ?? '', file: r.file ?? '',
    createdAt: r.created_at,
    ...(r.project_id ? { projectId: r.project_id } : {}),
    ...(r.supplier_id ? { supplierId: r.supplier_id } : {}),
    ...(r.origen ? { origen: r.origen } : {}),
    ...(r.destino ? { destino: r.destino } : {}),
    ...(r.scheduled_date ? { scheduledDate: r.scheduled_date } : {}),
    ...(r.approved_by ? { approvedBy: r.approved_by } : {}),
    ...(r.decided_at ? { decidedAt: r.decided_at } : {}),
    ...(r.reject_reason ? { rejectReason: r.reject_reason } : {}),
    ...(r.file_path ? { filePath: r.file_path } : {}),
    ...(r.comprobante ? { comprobante: r.comprobante } : {}),
    ...(r.comprobante_path ? { comprobantePath: r.comprobante_path } : {}),
  }
}
function internalPaymentRow(p: InternalPayment): Record<string, unknown> {
  return {
    id: p.id, concept: p.concept, category: p.category, project_id: p.projectId ?? null,
    supplier_id: p.supplierId ?? null, amount: p.amount, scheduled_date: orNull(p.scheduledDate),
    origen: p.origen ?? null, destino: p.destino ?? null,
    status: p.status, requested_by: p.requestedBy, approved_by: p.approvedBy ?? null,
    decided_at: p.decidedAt ?? null, reject_reason: orNull(p.rejectReason), notes: p.notes,
    file: p.file, file_path: p.filePath ?? null,
    comprobante: p.comprobante ?? null, comprobante_path: p.comprobantePath ?? null,
    created_at: p.createdAt,
  }
}
export async function fetchInternalPayments(): Promise<InternalPayment[]> {
  const { data, error } = await supabase.from('internal_payments').select('*').order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(mapInternalPayment)
}
export const saveInternalPayment = (p: InternalPayment) => upsert('internal_payments', internalPaymentRow(p))
export const deleteInternalPayment = (id: string) => removeRow('internal_payments', id)

/* ---- Listas de movimientos "por fuera" (cada jueves = una lista) ---- */
function mapMovementList(r: any): MovementList {
  return {
    id: r.id, name: r.name ?? '', date: r.date ?? '', bankBalance: Number(r.bank_balance ?? 0),
    status: r.status, createdBy: r.created_by ?? '', createdAt: r.created_at,
    ...(r.sent_at ? { sentAt: r.sent_at } : {}),
    ...(r.authorized_by ? { authorizedBy: r.authorized_by } : {}),
    ...(r.decided_at ? { decidedAt: r.decided_at } : {}),
    ...(r.reject_reason ? { rejectReason: r.reject_reason } : {}),
    ...(r.comprobante ? { comprobante: r.comprobante } : {}),
    ...(r.comprobante_path ? { comprobantePath: r.comprobante_path } : {}),
  }
}
function movementListRow(l: MovementList): Record<string, unknown> {
  return {
    id: l.id, name: l.name, date: orNull(l.date), bank_balance: l.bankBalance, status: l.status,
    created_by: l.createdBy || null, sent_at: l.sentAt ?? null,
    authorized_by: l.authorizedBy ?? null, decided_at: l.decidedAt ?? null,
    reject_reason: orNull(l.rejectReason),
    comprobante: l.comprobante ?? null, comprobante_path: l.comprobantePath ?? null,
    created_at: l.createdAt,
  }
}
export async function fetchMovementLists(): Promise<MovementList[]> {
  const { data, error } = await supabase.from('movement_lists').select('*').order('date', { ascending: false })
  if (error) throw error
  return (data ?? []).map(mapMovementList)
}
export const saveMovementList = (l: MovementList) => upsert('movement_lists', movementListRow(l))
export const deleteMovementList = (id: string) => removeRow('movement_lists', id)

/* ---- Movimientos individuales (pertenecen a una lista) ---- */
function mapMovement(r: any): Movement {
  return {
    id: r.id, listId: r.list_id ?? '', date: r.date ?? '', description: r.description ?? '', amount: Number(r.amount ?? 0),
    status: r.status, createdBy: r.created_by ?? '', createdAt: r.created_at,
    ...(r.project_id ? { projectId: r.project_id } : {}),
    ...(r.authorized_by ? { authorizedBy: r.authorized_by } : {}),
    ...(r.decided_at ? { decidedAt: r.decided_at } : {}),
    ...(r.reject_reason ? { rejectReason: r.reject_reason } : {}),
    ...(r.changed_by_direccion ? { changedByDireccion: r.changed_by_direccion } : {}),
  }
}
function movementRow(m: Movement): Record<string, unknown> {
  return {
    id: m.id, list_id: m.listId || null, date: orNull(m.date), description: m.description, amount: m.amount,
    project_id: m.projectId ?? null, status: m.status,
    created_by: m.createdBy || null, authorized_by: m.authorizedBy ?? null,
    decided_at: m.decidedAt ?? null, reject_reason: orNull(m.rejectReason),
    changed_by_direccion: m.changedByDireccion ?? null,
    created_at: m.createdAt,
  }
}
export async function fetchMovements(): Promise<Movement[]> {
  const { data, error } = await supabase.from('movements').select('*').order('date', { ascending: false })
  if (error) throw error
  return (data ?? []).map(mapMovement)
}
export const saveMovement = (m: Movement) => upsert('movements', movementRow(m))
export const deleteMovement = (id: string) => removeRow('movements', id)

/* ---- Campañas de marketing (presupuesto total + anuncios en JSONB) ---- */
function mapCampaign(r: any): Campaign {
  return {
    id: r.id, name: r.name ?? '', budget: Number(r.budget ?? 0),
    ads: Array.isArray(r.ads) ? r.ads.map((a: any) => ({ id: String(a.id), name: a.name ?? '', amount: Number(a.amount ?? 0) })) : [],
    createdAt: r.created_at,
    ...(r.created_by ? { createdBy: r.created_by } : {}),
  }
}
function campaignRow(c: Campaign): Record<string, unknown> {
  return {
    id: c.id, name: c.name, budget: c.budget, ads: c.ads,
    created_by: c.createdBy ?? null, created_at: c.createdAt,
  }
}
export async function fetchCampaigns(): Promise<Campaign[]> {
  const { data, error } = await supabase.from('campaigns').select('*').order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(mapCampaign)
}
export const saveCampaign = (c: Campaign) => upsert('campaigns', campaignRow(c))
export const deleteCampaign = (id: string) => removeRow('campaigns', id)

/* ---- Prospectos / leads (CRM previo a Proyectos) ---- */
function mapProspect(r: any): Prospect {
  return {
    id: r.id, name: r.name ?? '', seller: r.seller ?? '',
    estado: (r.estado ?? 'Nuevo') as Prospect['estado'],
    resultado: (r.resultado ?? 'En espera') as Prospect['resultado'],
    ...(r.empresa ? { empresa: r.empresa } : {}),
    ...(r.email ? { email: r.email } : {}),
    ...(r.phone ? { phone: r.phone } : {}),
    ...(r.city ? { city: r.city } : {}),
    ...(r.fecha_asignacion ? { fechaAsignacion: r.fecha_asignacion } : {}),
    ...(r.ultimo_contacto ? { ultimoContacto: r.ultimo_contacto } : {}),
    ...(r.cotizacion ? { cotizacion: r.cotizacion } : {}),
    ...(r.cotizacion_path ? { cotizacionPath: r.cotizacion_path } : {}),
    ...(r.costo != null ? { costo: Number(r.costo) } : {}),
    ...(r.sistema ? { sistema: r.sistema } : {}),
    ...(r.anuncio ? { anuncio: r.anuncio } : {}),
    ...(r.notas ? { notas: r.notas } : {}),
    ...((() => {
      // El JSONB puede llegar como arreglo (REST) o, en algunos casos de realtime, como texto.
      const raw = typeof r.comments === 'string' ? (() => { try { return JSON.parse(r.comments) } catch { return [] } })() : r.comments
      return Array.isArray(raw) && raw.length ? { comments: raw.map((c: any) => ({ id: String(c.id), author: c.author ?? '', authorName: c.authorName ?? '', text: c.text ?? '', at: c.at ?? '' })) } : {}
    })()),
    ...(r.converted_project_id ? { convertedProjectId: r.converted_project_id } : {}),
    createdAt: r.created_at, ...(r.updated ? { updated: r.updated } : {}),
  }
}
function prospectRow(p: Prospect): Record<string, unknown> {
  return {
    id: p.id, name: p.name, seller: p.seller, estado: p.estado, resultado: p.resultado,
    empresa: p.empresa ?? null, email: p.email ?? null, phone: p.phone ?? null, city: p.city ?? null,
    fecha_asignacion: orNull(p.fechaAsignacion), ultimo_contacto: orNull(p.ultimoContacto),
    cotizacion: p.cotizacion ?? null, cotizacion_path: p.cotizacionPath ?? null,
    costo: p.costo ?? null, sistema: p.sistema ?? null, anuncio: p.anuncio ?? null, notas: p.notas ?? null,
    comments: p.comments ?? [],
    converted_project_id: p.convertedProjectId ?? null, created_at: p.createdAt, updated: p.updated ?? null,
  }
}
export async function fetchProspects(): Promise<Prospect[]> {
  const { data, error } = await supabase.from('prospects').select('*').order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(mapProspect)
}
export const saveProspect = (p: Prospect) => upsert('prospects', prospectRow(p))
export const deleteProspect = (id: string) => removeRow('prospects', id)

/* ---- Configuración global (clave/valor) — p. ej. saldo bancario ---- */
export async function fetchSettings(): Promise<AppSettings> {
  const { data, error } = await supabase.from('app_settings').select('*')
  if (error) throw error
  const map = Object.fromEntries((data ?? []).map((r: any) => [r.key, r.value]))
  return { bankBalance: Number(map['bank_balance'] ?? 0) }
}
export const saveSetting = (key: string, value: unknown) =>
  upsert('app_settings', { key, value, updated_at: new Date().toISOString() })

/* ---- Actividad ---- */
function mapActivity(r: any): Activity {
  return { id: r.id, t: r.t, icon: r.icon, who: r.who, txt: r.txt, tgt: r.tgt ?? '', kind: r.kind }
}
export async function fetchActivity(): Promise<Activity[]> {
  const { data, error } = await supabase.from('activity').select('*').order('t', { ascending: false }).limit(40)
  if (error) throw error
  return (data ?? []).map(mapActivity)
}
export const saveActivity = (a: Activity) =>
  upsert('activity', { id: a.id, t: a.t, icon: a.icon, who: a.who, txt: a.txt, tgt: orNull(a.tgt), kind: a.kind })

/* ---- Notificaciones (dirigidas a un usuario; RLS las acota al destinatario) ---- */
function mapNotification(r: any): Notification {
  return {
    id: r.id,
    userId: r.user_id,
    kind: r.kind,
    title: r.title ?? '',
    body: r.body ?? '',
    read: !!r.read,
    createdAt: r.created_at,
    ...(r.project_id ? { projectId: r.project_id } : {}),
    ...(r.internal_payment_id ? { internalPaymentId: r.internal_payment_id } : {}),
    ...(r.actor_name ? { actorName: r.actor_name } : {}),
  }
}
/** Trae las notificaciones del usuario en sesión (RLS filtra por destinatario). */
export async function fetchNotifications(): Promise<Notification[]> {
  const { data, error } = await supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(60)
  if (error) throw error
  return (data ?? []).map(mapNotification)
}
/** Crea una notificación (para OTRO usuario). Usa INSERT puro y `return=minimal`
 *  (sin .select()): con `upsert` el ON CONFLICT DO UPDATE haría que el RLS evalúe
 *  la política de UPDATE sobre una fila ajena → 42501. El INSERT solo evalúa la
 *  política de INSERT (with check true). Los ids ya son únicos, no hay upsert que valga. */
export async function saveNotification(n: Notification): Promise<void> {
  const { error } = await supabase.from('notifications').insert({
    id: n.id, user_id: n.userId, kind: n.kind, title: n.title, body: n.body,
    read: n.read, created_at: n.createdAt, project_id: n.projectId ?? null,
    internal_payment_id: n.internalPaymentId ?? null, actor_name: n.actorName ?? null,
  })
  if (error) throw error
}
/** Marca una notificación como leída. */
export async function markNotificationRead(id: string): Promise<void> {
  const { error } = await supabase.from('notifications').update({ read: true }).eq('id', id)
  if (error) throw error
}
/** Suscripción EN VIVO (Realtime/WebSocket) a las notificaciones de un usuario.
 *  Recibe INSERT/UPDATE de la tabla acotados al destinatario (el RLS también aplica)
 *  y llama onChange con la notificación mapeada. Devuelve una función para desuscribir.
 *  Requiere que la tabla `notifications` esté habilitada en la publicación
 *  `supabase_realtime` (Database → Replication en el panel). */
export function subscribeToNotifications(userId: string, onChange: (n: Notification) => void): () => void {
  const channel = supabase
    .channel(`notifications:${userId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
      (payload) => {
        const row = payload.new as Record<string, unknown> | null
        if (row && Object.keys(row).length) onChange(mapNotification(row))
      },
    )
    .subscribe()
  return () => { void supabase.removeChannel(channel) }
}

/** Marca como leídas todas las notificaciones del usuario en sesión. */
export async function markAllNotificationsRead(): Promise<void> {
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return
  const { error } = await supabase.from('notifications').update({ read: true }).eq('user_id', auth.user.id).eq('read', false)
  if (error) throw error
}

/* ============================================================
   REALTIME — sincronización en vivo de las tablas operativas
   ============================================================ */

/** Un cambio en vivo de datos: fila ya mapeada (upsert) o id (delete). */
export type DataChange =
  | { table: string; type: 'upsert'; row: any }
  | { table: string; type: 'delete'; id: string }

// Tabla (Postgres) → función que mapea su fila al tipo del front.
const REALTIME_MAP: Record<string, (r: any) => any> = {
  projects: mapProject,
  orders: mapOrder,
  payments: mapPayment,
  client_payments: mapClientPayment,
  commissions: mapCommission,
  clients: mapClient,
  suppliers: mapSupplier,
  sellers: mapSeller,
  remisiones: mapRemision,
  internal_payments: mapInternalPayment,
  movement_lists: mapMovementList,
  movements: mapMovement,
  campaigns: mapCampaign,
  prospects: mapProspect,
}

/** Suscripción Realtime (WebSocket) a TODAS las tablas operativas. Por cada cambio
 *  llama onChange con la fila ya mapeada (upsert) o el id (delete). Requiere que las
 *  tablas estén en la publicación `supabase_realtime` (Database → Replication). */
export function subscribeToData(onChange: (c: DataChange) => void): () => void {
  const channel = supabase.channel('data-sync')
  for (const table of Object.keys(REALTIME_MAP)) {
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table },
      (payload) => {
        if (payload.eventType === 'DELETE') {
          const id = (payload.old as any)?.id
          if (id != null) onChange({ table, type: 'delete', id: String(id) })
        } else {
          const r = payload.new as Record<string, unknown>
          if (r && Object.keys(r).length) onChange({ table, type: 'upsert', row: REALTIME_MAP[table](r) })
        }
      },
    )
  }
  channel.subscribe()
  return () => { void supabase.removeChannel(channel) }
}

/* ---- Clientes / Proveedores (escritura; lectura ya existe arriba) ---- */
export const saveClientRow = (c: Client) => upsert('clients', {
  id: c.id, name: c.name, city: c.city, contact: c.contact, phone: c.phone, email: c.email,
  since: orNull(c.since), razon_social: c.razonSocial ?? null, rfc: c.rfc ?? null,
  regimen_fiscal: c.regimenFiscal ?? null, cp: c.cp ?? null, uso_cfdi: c.usoCFDI ?? null,
  dias_credito: c.diasCredito ?? null, limite_credito: c.limiteCredito ?? null,
  metodo_pago: c.metodoPago ?? null, forma_pago: c.formaPago ?? null,
  pending: c.pending ?? false, requested_by: c.requestedBy ?? null,
})
export const deleteClient = (id: string) => removeRow('clients', id)
export const saveSupplierRow = (s: Supplier) => upsert('suppliers', {
  id: s.id, name: s.name, cat: s.cat, contact: s.contact, phone: s.phone, email: s.email, city: s.city,
  rating: s.rating, active: s.active, notes: s.notes, direccion: s.direccion ?? null,
  dias_credito: s.diasCredito ?? null, cuenta_banco: s.cuentaBanco ?? null, prefijo: s.prefijo ?? null,
})
export const deleteSupplier = (id: string) => removeRow('suppliers', id)

/* ---- Documentos (Supabase Storage, bucket privado "documentos") ---- */
const DOC_BUCKET = 'documentos'

/** Sube un archivo al bucket y devuelve su ruta (path) guardable. */
export async function uploadDoc(file: File, folder: string): Promise<string> {
  const safe = file.name.replace(/[^\w.\-]+/g, '_')
  const path = `${folder}/${Date.now()}_${safe}`
  const { error } = await supabase.storage.from(DOC_BUCKET).upload(path, file, { upsert: false })
  if (error) throw error
  return path
}

/** URL temporal firmada para ver/descargar un documento (por defecto 1 h).
 *  `download` = true o un nombre de archivo fuerza la descarga (Content-Disposition). */
export async function signedDocUrl(path: string, expiresSec = 3600, download?: boolean | string): Promise<string> {
  const opts = download ? { download } : undefined
  const { data, error } = await supabase.storage.from(DOC_BUCKET).createSignedUrl(path, expiresSec, opts)
  if (error) throw error
  return data.signedUrl
}

/** Borra un documento del bucket (best-effort). */
export async function deleteDoc(path: string): Promise<void> {
  const { error } = await supabase.storage.from(DOC_BUCKET).remove([path])
  if (error) throw error
}

/* ---- Carga inicial de TODO el estado (tras login) ---- */
export async function loadAll(): Promise<Partial<AppState>> {
  const [clients, suppliers, users, sellers, projects, orders, payments, clientPayments, commissions, remisiones, internalPayments, movementLists, movements, campaigns, prospects, settings, activity, notifications] =
    await Promise.all([
      fetchClients(), fetchSuppliers(), fetchUsers(), fetchSellers(), fetchProjects(),
      fetchOrders(), fetchPayments(), fetchClientPayments(), fetchCommissions(),
      fetchRemisiones(), fetchInternalPayments(), fetchMovementLists(), fetchMovements(), fetchCampaigns(), fetchProspects(), fetchSettings(), fetchActivity(), fetchNotifications(),
    ])
  return { clients, suppliers, users, sellers, projects, orders, payments, clientPayments, commissions, remisiones, internalPayments, movementLists, movements, campaigns, prospects, settings, activity, notifications }
}
