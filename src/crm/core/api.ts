// ============================================================
//  Capa de acceso a datos (Supabase)
//  Lee de la base y mapea las columnas snake_case de Postgres
//  a los campos camelCase de los tipos del front (types.ts).
// ============================================================
import { supabase } from './supabase'
import type {
  Client, Supplier, User, Seller, Project, Order, Payment,
  ClientPayment, Commission, Activity, AppState,
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
export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
}

/** Cierra la sesión actual. */
export async function signOut(): Promise<void> {
  await supabase.auth.signOut()
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
  return { id: r.id, name: r.name ?? '', initials: r.initials ?? '', rate: Number(r.rate ?? 0) }
}
export async function fetchSellers(): Promise<Seller[]> {
  const { data, error } = await supabase.from('sellers').select('*').order('name')
  if (error) throw error
  return (data ?? []).map(mapSeller)
}
export const saveSeller = (s: Seller) =>
  upsert('sellers', { id: s.id, name: s.name, initials: s.initials, rate: s.rate })
export const deleteSeller = (id: string) => removeRow('sellers', id)

/* ---- Proyectos ---- */
const emptyDoc = () => ({ name: '', ok: false })
const emptyDocs = (): Project['docs'] => ({
  cotizacion: emptyDoc(), layout: emptyDoc(), anticipo: emptyDoc(), ordenCompra: emptyDoc(),
  finiquito: emptyDoc(), remision: emptyDoc(), cartaFin: emptyDoc(),
})
function mapProject(r: any): Project {
  return {
    id: r.id, code: r.code, stage: r.stage,
    client: r.client ?? '', seller: r.seller ?? '', city: r.city ?? '',
    ...(r.sistema_vendido ? { sistemaVendido: r.sistema_vendido } : {}),
    ...(r.venta_subtotal != null ? { ventaSubtotal: Number(r.venta_subtotal) } : {}),
    freight: Number(r.freight ?? 0), install: Number(r.install ?? 0), weeks: r.weeks ?? 0,
    obs: r.obs ?? '',
    docs: { ...emptyDocs(), ...(r.docs ?? {}) },
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
    sistema_vendido: p.sistemaVendido ?? null, venta_subtotal: p.ventaSubtotal ?? null,
    freight: p.freight, install: p.install, weeks: p.weeks, obs: p.obs,
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
    ...(r.project_id ? { projectId: r.project_id } : {}),
    ...(Array.isArray(r.items) && r.items.length ? { items: r.items } : {}),
    ...(r.cancelled ? { cancelled: true } : {}),
  }
}
function orderRow(o: Order): Record<string, unknown> {
  return {
    id: o.id, number: o.number, date: orNull(o.date), supplier_id: o.supplierId,
    description: o.description, conditions: o.conditions, amount: o.amount,
    responsible: o.responsible, file: o.file,
    project_id: o.projectId ?? null, items: o.items ?? [], cancelled: !!o.cancelled,
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
  }
}
function clientPaymentRow(c: ClientPayment): Record<string, unknown> {
  return {
    id: c.id, project_id: c.projectId, n: c.n, date: orNull(c.date), amount: c.amount,
    concept: c.concept, method: c.method, status: c.status, comments: c.comments,
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

/* ---- Clientes / Proveedores (escritura; lectura ya existe arriba) ---- */
export const saveClientRow = (c: Client) => upsert('clients', {
  id: c.id, name: c.name, city: c.city, contact: c.contact, phone: c.phone, email: c.email,
  since: orNull(c.since), razon_social: c.razonSocial ?? null, rfc: c.rfc ?? null,
  regimen_fiscal: c.regimenFiscal ?? null, cp: c.cp ?? null, uso_cfdi: c.usoCFDI ?? null,
  dias_credito: c.diasCredito ?? null, limite_credito: c.limiteCredito ?? null,
  metodo_pago: c.metodoPago ?? null, forma_pago: c.formaPago ?? null,
})
export const saveSupplierRow = (s: Supplier) => upsert('suppliers', {
  id: s.id, name: s.name, cat: s.cat, contact: s.contact, phone: s.phone, email: s.email, city: s.city,
  rating: s.rating, active: s.active, notes: s.notes, direccion: s.direccion ?? null,
  dias_credito: s.diasCredito ?? null, cuenta_banco: s.cuentaBanco ?? null, prefijo: s.prefijo ?? null,
})

/* ---- Carga inicial de TODO el estado (tras login) ---- */
export async function loadAll(): Promise<Partial<AppState>> {
  const [clients, suppliers, users, sellers, projects, orders, payments, clientPayments, commissions, activity] =
    await Promise.all([
      fetchClients(), fetchSuppliers(), fetchUsers(), fetchSellers(), fetchProjects(),
      fetchOrders(), fetchPayments(), fetchClientPayments(), fetchCommissions(), fetchActivity(),
    ])
  return { clients, suppliers, users, sellers, projects, orders, payments, clientPayments, commissions, activity }
}
