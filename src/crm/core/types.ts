// ============================================================
//  MODELO DE DATOS DEL CRM
//  Tipos compartidos por todos los módulos.
// ============================================================
import type { IconName } from './icons'

/** Las 10 etapas del pipeline, en orden. */
export type StageId =
  | 'registro'
  | 'creacion'
  | 'asignacion'
  | 'compra'
  | 'fabricacion'
  | 'entrega_est'
  | 'pago'
  | 'coordinacion'
  | 'instalacion'
  | 'finalizado'

export interface Stage {
  id: StageId
  n: number
  label: string
  short: string
  color: string
  icon: IconName
  hint: string
}

export interface Seller {
  id: string
  name: string
  initials: string
  rate: number
  /** Comisión "override": % que este vendedor gana sobre las ventas de TODOS los demás
   *  (además de su propio `rate` en sus ventas). Solo lo tienen casos especiales. 0 / undefined = sin override. */
  overrideRate?: number
}

/** Roles de acceso. Por ahora todos ven todo; a futuro se limitará por rol. */
export type Role = 'admin' | 'ventas' | 'logistica' | 'almacen' | 'direccion'

export interface User {
  id: string
  name: string
  email: string
  password?: string       // solo se usa al CREAR/cambiar (lo maneja Supabase Auth, no se guarda en la tabla)
  role: Role
  initials: string
  title?: string          // puesto / cargo
  active: boolean
}

export interface Client {
  id: string
  name: string              // Nombre comercial
  city: string
  contact: string
  phone: string
  email: string
  since: string
  /* ---- Datos fiscales (SAT) — opcionales ---- */
  razonSocial?: string      // Razón social
  rfc?: string
  regimenFiscal?: string    // clave SAT, p.ej. '601'
  cp?: string               // código postal
  usoCFDI?: string
  diasCredito?: number
  limiteCredito?: number
  metodoPago?: string
  formaPago?: string
}

export interface Supplier {
  id: string
  name: string
  cat: string
  contact: string
  phone: string
  email: string
  city: string
  rating: number
  active: boolean
  notes: string
  /* ---- Campos del catálogo de proveedores (Excel) — opcionales ---- */
  direccion?: string
  diasCredito?: number       // Días Crédito
  cuentaBanco?: string       // Cuenta / Banco
  prefijo?: string           // Prefijo de Factura (p.ej. "IR")
}

/* ============================================================
   ÓRDENES DE COMPRA + PAGOS (modelo del Excel "Control OC")
   ============================================================ */

/** Condiciones de pago de la OC (Config!E). */
export type Condicion =
  | 'Contado'
  | 'Crédito'
  | 'Anticipo'
  | 'Contra entrega'
  | 'Parcialidades'

/** Estatus de la OC — CALCULADO a partir de sus abonos (Config!A). */
export type OcStatus =
  | 'Pendiente'
  | 'Parcial'
  | 'Liquidada'
  | 'Vencida'
  | 'Cancelada'

/** Estado de cada abono/pago (Config!C). */
export type PaymentStatus = 'Pagado' | 'Programado' | 'Cancelado'

/** Partida de material dentro de una OC (lista que sube el vendedor). */
export interface OcItem {
  id: string
  parte?: string            // No. de parte (del cotizador)
  color?: string            // Color
  material?: string         // Material (ej. Columna, Viga Primaria)
  description: string       // Descripción
  dimensiones?: string      // Dimensiones
  qty: number               // cantidad
  unitPrice: number         // costo unitario
  supplierId?: string       // proveedor de esta partida (puede diferir del de la OC)
}

/** Orden de Compra (hoja "Control OC"). */
export interface Order {
  id: string
  number: string            // OC
  date: string              // Fecha OC
  supplierId: string        // Proveedor
  description: string       // Descripción
  conditions: string        // Condiciones (texto libre, p.ej. "50% anticipo - 30 días finiquito")
  amount: number            // Monto Total (con IVA si hay materiales)
  responsible: string       // Responsable (vendedor)
  file: string              // archivo adjunto (OC firmada) — nombre visible
  filePath?: string         // ruta del adjunto en Supabase Storage
  deliveryDate?: string     // fecha estimada de entrega de la OC
  projectId?: string        // proyecto asociado
  items?: OcItem[]          // lista de materiales (opcional)
  cancelled?: boolean       // override manual → Estatus "Cancelada"
}

/** Estado de un cobro al cliente. */
export type ClientPaymentStatus = 'Cobrado' | 'Programado' | 'Cancelado'

/** Cobro que el CLIENTE nos hace por un proyecto (ingreso). */
export interface ClientPayment {
  id: string
  projectId: string         // proyecto al que pertenece el cobro
  n: number                 // No. de cobro
  date: string              // Fecha
  amount: number            // Importe
  concept: string           // Concepto (Anticipo, Finiquito, Abono…)
  method: string            // Forma de pago / Ref.
  status: ClientPaymentStatus
  comments: string
}

/** Abono / pago de una OC (hoja "Pagos"). */
export interface Payment {
  id: string
  orderId: string           // OC (id interno)
  n: number                 // No. Abono
  date: string              // Fecha Pago
  amount: number            // Importe
  method: string            // Método / Ref.
  status: PaymentStatus     // Estado Pago
  comments: string          // Comentarios
}

/** Referencia a un documento adjunto. `path` = ruta en Supabase Storage. */
export interface DocRef {
  name: string
  ok: boolean
  path?: string
}

export interface ProjectDocs {
  cotizacion: DocRef        // Cotización
  layout: DocRef            // Lay out
  anticipo: DocRef          // Comprobante de anticipo
  ordenCompra: DocRef       // Orden de compra
  finiquito: DocRef         // Comprobante de finiquito
  remision: DocRef          // Remisión de salida
  cartaFin: DocRef          // Carta fin de obra
}

/** Estado de pago / finiquito. */
export type PayStatus = 'paid' | 'pending'

export interface Project {
  id: string
  code: string
  stage: StageId
  client: string
  seller: string
  city: string
  sistemaVendido?: string   // Sistema vendido (tipo de rack/solución)
  ventaSubtotal?: number    // Subtotal de la venta (YA incluye flete e instalación). IVA y total se calculan de aquí.
  freight: number
  install: number
  weeks: number
  obs: string
  docs: ProjectDocs
  suppliers: string[]
  eta: string
  finiquito: PayStatus
  created: string
  updated: string
  closedOn?: string
  remision?: string
}

export type CommissionStatus = 'paid' | 'pending'

export interface Commission {
  id: string
  projectId: string
  seller: string
  amount: number
  status: CommissionStatus
  month: string
}

export interface Activity {
  id: string
  t: string
  icon: IconName
  who: string
  txt: string
  tgt: string
  kind: 'done' | 'money' | 'new' | 'work' | 'info'
}

/** Tipos de notificación. Por ahora solo "proyecto asignado a un vendedor". */
export type NotificationKind = 'project_assigned'

/** Notificación dirigida a un usuario concreto (a diferencia del feed de
 *  actividad, que es global). Se entrega por id de usuario destinatario. */
export interface Notification {
  id: string
  userId: string          // destinatario (id de usuario)
  kind: NotificationKind
  title: string
  body: string
  read: boolean
  createdAt: string       // ISO
  projectId?: string      // entidad relacionada (para abrir el detalle)
  actorName?: string      // quién la originó
}

/** Estado global de la aplicación. */
export interface AppState {
  projects: Project[]
  suppliers: Supplier[]
  orders: Order[]
  payments: Payment[]
  clientPayments: ClientPayment[]
  clients: Client[]
  sellers: Seller[]
  commissions: Commission[]
  activity: Activity[]
  notifications: Notification[]
  users: User[]
  currentUser: User | null
}

// ---- Payloads de creación/edición (el reducer rellena id/fechas) ----
export type ProjectInput = Omit<Project, 'id' | 'created' | 'updated'> & {
  id?: string
  created?: string
  updated?: string
}
export type SupplierInput = Omit<Supplier, 'id'> & { id?: string }
export type OrderInput = Omit<Order, 'id'> & { id?: string }
export type PaymentInput = Omit<Payment, 'id'> & { id?: string }
export type ClientPaymentInput = Omit<ClientPayment, 'id'> & { id?: string }
export type ClientInput = Omit<Client, 'id' | 'since'> & {
  id?: string
  since?: string
}
export type UserInput = Omit<User, 'id'> & { id?: string }
export type SellerInput = Omit<Seller, 'id'> & { id?: string }

/** Acciones del store. */
export type Action =
  | { type: 'HYDRATE'; data: Partial<AppState> }
  | { type: 'MOVE_STAGE'; id: string; stage: StageId }
  | { type: 'SAVE_PROJECT'; project: ProjectInput }
  | { type: 'DELETE_PROJECT'; id: string }
  | { type: 'SAVE_SUPPLIER'; supplier: SupplierInput }
  | { type: 'TOGGLE_SUPPLIER'; id: string }
  | { type: 'DELETE_SUPPLIER'; id: string }
  | { type: 'SAVE_ORDER'; order: OrderInput }
  | { type: 'DELETE_ORDER'; id: string }
  | { type: 'SAVE_PAYMENT'; payment: PaymentInput }
  | { type: 'DELETE_PAYMENT'; id: string }
  | { type: 'SAVE_CLIENT_PAYMENT'; payment: ClientPaymentInput }
  | { type: 'DELETE_CLIENT_PAYMENT'; id: string }
  | { type: 'SAVE_CLIENT'; client: ClientInput }
  | { type: 'DELETE_CLIENT'; id: string }
  | { type: 'TOGGLE_COMMISSION'; id: string }
  | { type: 'SAVE_SELLER'; seller: SellerInput }
  | { type: 'DELETE_SELLER'; id: string }
  | { type: 'MARK_NOTIFICATION_READ'; id: string }
  | { type: 'MARK_ALL_NOTIFICATIONS_READ' }
  | { type: 'LOGIN'; user: User }
  | { type: 'LOGOUT' }

/** Acciones PURAS del reducer (estado local). La capa de store traduce
 *  las acciones de arriba a estas + persistencia en Supabase. */
export type StateAction =
  | { type: 'HYDRATE'; data: Partial<AppState> }
  | { type: 'LOGIN'; user: User }
  | { type: 'LOGOUT' }
  | { type: 'UPSERT_PROJECT'; project: Project }
  | { type: 'REMOVE_PROJECT'; id: string }
  | { type: 'UPSERT_ORDER'; order: Order }
  | { type: 'REMOVE_ORDER'; id: string }
  | { type: 'UPSERT_PAYMENT'; payment: Payment }
  | { type: 'REMOVE_PAYMENT'; id: string }
  | { type: 'UPSERT_CLIENT_PAYMENT'; payment: ClientPayment }
  | { type: 'REMOVE_CLIENT_PAYMENT'; id: string }
  | { type: 'UPSERT_COMMISSION'; commission: Commission }
  | { type: 'UPSERT_CLIENT'; client: Client }
  | { type: 'REMOVE_CLIENT'; id: string }
  | { type: 'UPSERT_SUPPLIER'; supplier: Supplier }
  | { type: 'REMOVE_SUPPLIER'; id: string }
  | { type: 'UPSERT_SELLER'; seller: Seller }
  | { type: 'REMOVE_SELLER'; id: string }
  | { type: 'PUSH_ACTIVITY'; activity: Activity }
  | { type: 'UPSERT_NOTIFICATION'; notification: Notification }
  | { type: 'MARK_ALL_NOTIFICATIONS_READ' }
