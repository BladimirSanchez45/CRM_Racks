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
/** superadmin = acceso total + cosas exclusivas (p. ej. suplantar usuarios).
 *  admin = gestión normal. El resto son roles operativos. */
export type Role = 'superadmin' | 'admin' | 'ventas' | 'logistica' | 'almacen' | 'direccion' | 'ingenieria' | 'marketing'

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
  file?: string             // Comprobante de pago — nombre visible
  filePath?: string         // Ruta del comprobante en Supabase Storage
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

/* ============================================================
   REMISIONES DE SALIDA DE MATERIAL (módulo de logística)
   ============================================================ */

/** Estatus de una remisión de salida. */
export type RemisionStatus = 'Borrador' | 'Emitida' | 'Entregada' | 'Cancelada'

/** Partida de material que sale en una remisión. */
export interface RemisionItem {
  id: string
  code?: string             // Código del material (CODIGO en la remisión)
  description: string       // Descripción del material
  qty: number               // Cantidad
  unit?: string             // Unidad (pza, tarima, ml…)
}

/** Remisión de salida del material hacia el destino del proyecto. */
export interface Remision {
  id: string
  number: string            // Folio de remisión (ej. REM-2026-001)
  projectId: string         // Proyecto asociado
  date: string              // Fecha de salida
  carrierId?: string        // Proveedor de flete / transportista (Supplier)
  destination: string       // Domicilio / ciudad de entrega
  phone?: string            // Teléfono de contacto en destino (autollenado del cliente, editable)
  receivedBy?: string       // Persona que recibe en destino
  items: RemisionItem[]     // Partidas de material que salen
  status: RemisionStatus
  notes: string
  file: string              // Archivo adjunto (remisión firmada) — nombre visible
  filePath?: string         // Ruta del adjunto en Supabase Storage
  createdBy: string         // userId de quien la creó
  createdAt: string         // ISO
}

/* ============================================================
   PAGOS INTERNOS (logística cotiza → admin aprueba → se paga)
   ============================================================ */

/** Categoría del pago interno (gasto operativo de logística). */
export type InternalPaymentCategory = 'Flete' | 'Instalación' | 'Viáticos' | 'Maniobras' | 'Material' | 'Otro'

/** Estatus del pago interno a lo largo del flujo de aprobación.
 *  Pendiente → (admin) Aprobado | Rechazado → (logística) Programado → Pagado. */
export type InternalPaymentStatus =
  | 'Pendiente'     // creado por logística, espera aprobación del admin
  | 'Aprobado'      // admin lo aprobó; listo para programar/pagar
  | 'Rechazado'     // admin lo rechazó (con motivo)
  | 'Programado'    // logística agendó la fecha de pago
  | 'Pagado'        // ya se ejecutó el pago
  | 'Cancelado'     // logística lo canceló

/** Solicitud de pago interno (flete, instalación, viáticos…) que requiere
 *  aprobación del administrador antes de proceder. */
export interface InternalPayment {
  id: string
  concept: string                 // Concepto del pago
  category: InternalPaymentCategory
  projectId?: string              // Proyecto relacionado (opcional)
  supplierId?: string             // Proveedor a pagar (opcional)
  amount: number                  // Monto cotizado
  origen?: string                 // Ubicación de origen (para Flete / Instalación)
  destino?: string                // Ubicación de destino (para Flete / Instalación)
  scheduledDate?: string          // Fecha en que se quiere agendar el pago
  status: InternalPaymentStatus
  requestedBy: string             // userId del solicitante (logística)
  approvedBy?: string             // userId del admin que decidió
  decidedAt?: string              // ISO de la aprobación/rechazo
  rejectReason?: string           // Motivo si se rechazó
  notes: string                   // Notas / justificación
  file: string                    // Cotización adjunta — nombre visible
  filePath?: string               // Ruta del adjunto en Supabase Storage
  comprobante?: string            // Comprobante de pago — nombre visible (requisito para liberar/pagar)
  comprobantePath?: string        // Ruta del comprobante en Supabase Storage
  createdAt: string               // ISO
}

/** Estatus de una LISTA de movimientos "por fuera" (cada jueves = una lista).
 *  Borrador → (admin envía) Pendiente → (dirección) Autorizada | Rechazada. */
export type MovementListStatus = 'Borrador' | 'Pendiente' | 'Autorizada' | 'Rechazada'

/** Lista semanal de gastos "por fuera" que autoriza Dirección. Agrupa sus
 *  movimientos y guarda su propio saldo de cuenta (snapshot). */
export interface MovementList {
  id: string
  name: string              // nombre de la lista (ej. "Lista jue 26 jun")
  date: string              // fecha de la lista (default hoy)
  bankBalance: number       // saldo de cuenta capturado para ESTA lista
  status: MovementListStatus
  createdBy: string         // userId de quien la armó
  sentAt?: string           // ISO en que se envió a autorización
  authorizedBy?: string     // userId de dirección que decidió
  decidedAt?: string        // ISO de la autorización/rechazo
  rejectReason?: string     // motivo si se rechazó
  comprobante?: string      // comprobante de pago de la lista — nombre visible
  comprobantePath?: string  // ruta del comprobante en Supabase Storage. Al subirlo, la lista
                            // se considera PAGADA y recién entonces descuenta utilidad.
  createdAt: string         // ISO
}

/** Estatus de un movimiento individual dentro de una lista. */
export type MovementStatus = 'Pendiente' | 'Autorizado' | 'Rechazado'

/** Movimiento "por fuera" perteneciente a una lista. Puede ligarse opcionalmente
 *  a un proyecto (descuenta de su utilidad cuando queda Autorizado). */
export interface Movement {
  id: string
  listId: string            // lista a la que pertenece
  date: string              // fecha del movimiento (default hoy)
  description: string        // concepto libre (ej. "Flete Cristian Morales", "Nóminas")
  amount: number
  projectId?: string        // proyecto ligado (opcional)
  status: MovementStatus
  createdBy: string         // userId de quien lo creó
  authorizedBy?: string     // userId de dirección que decidió
  decidedAt?: string        // ISO de la autorización/rechazo
  rejectReason?: string     // motivo si se rechazó
  /** Marca de intervención de Dirección sobre la lista ya enviada (Pendiente):
   *  'added' = lo agregó Dirección, 'edited' = lo modificó, 'removed' = lo eliminó (borrado suave,
   *  sigue visible tachado y no suma al total). Dirección es la autoridad final. */
  changedByDireccion?: 'added' | 'edited' | 'removed'
  createdAt: string         // ISO
}

/** Configuración global de la app (valores escalares persistidos). */
export interface AppSettings {
  bankBalance: number       // saldo de la cuenta bancaria (manual) — en desuso (cada lista guarda el suyo)
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
  ordenCompra: DocRef[]     // Órdenes de compra (una por OC generada; varios espacios)
  finiquito: DocRef         // Comprobante de finiquito
  remision: DocRef          // Remisión de salida
  cartaFin: DocRef          // Carta fin de obra
  excel?: DocRef            // Excel del proyecto (control / cotización en hoja de cálculo). Opcional.
  evidencia?: DocRef[]      // Imágenes de evidencia de obra terminada (varias). Requisito para finalizar.
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
  origen?: string           // Origen del lead/venta (WebAd, CTC Ad…)
  sistemaVendido?: string   // Sistema vendido (tipo de rack/solución)
  ventaSubtotal?: number    // Subtotal de la venta (YA incluye flete e instalación). IVA y total se calculan de aquí.
  freight: number           // Presupuesto de flete (informativo; incluido en ventaSubtotal)
  install: number           // Presupuesto de instalación (informativo; incluido en ventaSubtotal)
  /* ---- Asignación de servicios (logística): proveedor + costo REAL ---- */
  freightSupplierId?: string  // proveedor de flete asignado
  freightCost?: number        // costo real del flete (lo que cobra el proveedor) — resta utilidad
  installSupplierId?: string  // proveedor de instalación (cuadrilla) asignado
  installCost?: number        // costo real de instalación — resta utilidad
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

/** Tipos de notificación.
 *  - project_created: un vendedor registró una venta → se avisa a los administradores.
 *  - client_anticipo_paid: entró el primer cobro del cliente → se avisa a admins (ya pueden emitir la OC).
 *  - project_due_soon: el proyecto entró a "Por Vencer" (≤5 días de entrega y sin pagar) → se avisa a admins.
 *  - project_paid: el cliente liquidó el total → se avisa a logística (coordinar envío/instalación).
 *  - internal_payment_requested: logística solicitó un pago interno → se avisa a los administradores.
 *  - internal_payment_decided: el admin aprobó/rechazó un pago interno → se avisa al solicitante. */
export type NotificationKind =
  | 'project_assigned'
  | 'project_created'
  | 'client_anticipo_paid'
  | 'project_due_soon'
  | 'project_paid'
  | 'internal_payment_requested'
  | 'internal_payment_decided'
  | 'movements_submitted'        // admin envió la lista de movimientos → se avisa a dirección
  | 'movement_decided'           // dirección autorizó/rechazó la lista → se avisa al creador
  | 'movement_changed'           // dirección modificó (agregó/editó/eliminó) la lista → se avisa al creador

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
  internalPaymentId?: string  // pago interno relacionado (para abrir el detalle)
  movementId?: string     // movimiento relacionado (para abrir el detalle)
  movementListId?: string // lista de movimientos relacionada (para abrir el detalle)
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
  remisiones: Remision[]
  internalPayments: InternalPayment[]
  movementLists: MovementList[]
  movements: Movement[]
  settings: AppSettings
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
export type RemisionInput = Omit<Remision, 'id' | 'createdBy' | 'createdAt'> & {
  id?: string
  createdBy?: string
  createdAt?: string
}
export type InternalPaymentInput = Omit<InternalPayment, 'id' | 'requestedBy' | 'createdAt'> & {
  id?: string
  requestedBy?: string
  createdAt?: string
}
export type MovementInput = Omit<Movement, 'id' | 'createdBy' | 'createdAt'> & {
  id?: string
  createdBy?: string
  createdAt?: string
}
export type MovementListInput = Omit<MovementList, 'id' | 'createdBy' | 'createdAt'> & {
  id?: string
  createdBy?: string
  createdAt?: string
}

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
  | { type: 'RECALC_COMMISSIONS'; id: string }   // recalcula las comisiones de un proyecto finalizado
  | { type: 'SAVE_SELLER'; seller: SellerInput }
  | { type: 'DELETE_SELLER'; id: string }
  | { type: 'SAVE_REMISION'; remision: RemisionInput }
  | { type: 'DELETE_REMISION'; id: string }
  | { type: 'SAVE_INTERNAL_PAYMENT'; payment: InternalPaymentInput }
  | { type: 'DELETE_INTERNAL_PAYMENT'; id: string }
  /** Decisión del admin sobre un pago interno (aprobar/rechazar). */
  | { type: 'DECIDE_INTERNAL_PAYMENT'; id: string; approve: boolean; reason?: string }
  | { type: 'SAVE_MOVEMENT_LIST'; list: MovementListInput }
  | { type: 'DELETE_MOVEMENT_LIST'; id: string }
  /** Admin envía la lista a autorización: Borrador → Pendiente, avisa a dirección. */
  | { type: 'SUBMIT_MOVEMENT_LIST'; id: string }
  /** Decisión de dirección sobre la LISTA completa (autorizar/rechazar todo). */
  | { type: 'DECIDE_MOVEMENT_LIST'; id: string; approve: boolean; reason?: string }
  /** Sube/quita el comprobante de pago de la lista (al subirlo, descuenta utilidad). */
  | { type: 'SET_LIST_COMPROBANTE'; id: string; comprobante?: string; comprobantePath?: string }
  | { type: 'SAVE_MOVEMENT'; movement: MovementInput }
  | { type: 'DELETE_MOVEMENT'; id: string }
  /** Decisión de dirección sobre un movimiento individual (autorizar/rechazar). */
  | { type: 'DECIDE_MOVEMENT'; id: string; approve: boolean; reason?: string }
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
  | { type: 'REMOVE_COMMISSION'; id: string }
  | { type: 'UPSERT_CLIENT'; client: Client }
  | { type: 'REMOVE_CLIENT'; id: string }
  | { type: 'UPSERT_SUPPLIER'; supplier: Supplier }
  | { type: 'REMOVE_SUPPLIER'; id: string }
  | { type: 'UPSERT_SELLER'; seller: Seller }
  | { type: 'REMOVE_SELLER'; id: string }
  | { type: 'UPSERT_REMISION'; remision: Remision }
  | { type: 'REMOVE_REMISION'; id: string }
  | { type: 'UPSERT_INTERNAL_PAYMENT'; payment: InternalPayment }
  | { type: 'REMOVE_INTERNAL_PAYMENT'; id: string }
  | { type: 'UPSERT_MOVEMENT_LIST'; list: MovementList }
  | { type: 'REMOVE_MOVEMENT_LIST'; id: string }
  | { type: 'UPSERT_MOVEMENT'; movement: Movement }
  | { type: 'REMOVE_MOVEMENT'; id: string }
  | { type: 'SET_SETTINGS'; settings: AppSettings }
  | { type: 'PUSH_ACTIVITY'; activity: Activity }
  | { type: 'UPSERT_NOTIFICATION'; notification: Notification }
  | { type: 'MARK_ALL_NOTIFICATIONS_READ' }
