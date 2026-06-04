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

/** Orden de Compra (hoja "Control OC"). */
export interface Order {
  id: string
  number: string            // OC
  date: string              // Fecha OC
  supplierId: string        // Proveedor
  description: string       // Descripción
  conditions: Condicion     // Condiciones
  amount: number            // Monto Total
  responsible: string       // Responsable
  file: string              // archivo adjunto (OC firmada)
  projectId?: string        // vínculo opcional con un proyecto del CRM
  cancelled?: boolean       // override manual → Estatus "Cancelada"
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

/** Referencia a un documento adjunto (solo se guarda el nombre). */
export interface DocRef {
  name: string
  ok: boolean
}

export interface ProjectDocs {
  quote: DocRef
  layout: DocRef
  advance: DocRef
  completion: DocRef
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

/** Estado global de la aplicación. */
export interface AppState {
  projects: Project[]
  suppliers: Supplier[]
  orders: Order[]
  payments: Payment[]
  clients: Client[]
  sellers: Seller[]
  commissions: Commission[]
  activity: Activity[]
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
export type ClientInput = Omit<Client, 'id' | 'since'> & {
  id?: string
  since?: string
}

/** Acciones del store. */
export type Action =
  | { type: 'MOVE_STAGE'; id: string; stage: StageId }
  | { type: 'SAVE_PROJECT'; project: ProjectInput }
  | { type: 'DELETE_PROJECT'; id: string }
  | { type: 'SAVE_SUPPLIER'; supplier: SupplierInput }
  | { type: 'TOGGLE_SUPPLIER'; id: string }
  | { type: 'SAVE_ORDER'; order: OrderInput }
  | { type: 'DELETE_ORDER'; id: string }
  | { type: 'SAVE_PAYMENT'; payment: PaymentInput }
  | { type: 'DELETE_PAYMENT'; id: string }
  | { type: 'SAVE_CLIENT'; client: ClientInput }
  | { type: 'TOGGLE_COMMISSION'; id: string }
