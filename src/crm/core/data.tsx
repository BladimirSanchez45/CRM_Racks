// ============================================================
//  DATA — stages, seed data, helpers, in-memory store
// ============================================================
import * as React from 'react'
import type {
  Action,
  Activity,
  AppState,
  Client,
  Commission,
  OcStatus,
  Order,
  Payment,
  Project,
  Seller,
  Stage,
  StageId,
  Supplier,
} from './types'
import { SEED_CLIENTS } from './seed-clients'
import { SEED_SUPPLIERS } from './seed-suppliers'

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
export const TODAY = new Date('2026-06-02T00:00:00')
export const TODAY_ISO = '2026-06-02'
export const daysBetween = (d?: string) => { if (!d) return null; const x = new Date(d + 'T00:00:00'); return Math.round((x.getTime() - TODAY.getTime()) / 86400000) }
export const ago = (d: string) => {
  const x = new Date(d); const diff = Math.round((TODAY.getTime() - x.getTime()) / 86400000)
  if (diff <= 0) return 'hoy'
  if (diff === 1) return 'ayer'
  if (diff < 7) return `hace ${diff} días`
  if (diff < 30) return `hace ${Math.round(diff/7)} sem`
  return `hace ${Math.round(diff/30)} meses`
}
let _id = 1000
export const uid = (p = 'id') => `${p}-${++_id}`

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

/* ---- Sellers ---- */
const SELLERS: Seller[] = [
  { id: 'v1', name: 'Ana Robles',    initials: 'AR', rate: 0.04 },
  { id: 'v2', name: 'Carlos Méndez', initials: 'CM', rate: 0.035 },
  { id: 'v3', name: 'Diana Fuentes', initials: 'DF', rate: 0.04 },
]

/* ---- Clients ---- */
const CLIENTS: Client[] = [
  { id: 'c1', name: 'Distribuidora Logística del Centro', city: 'Ciudad de México', contact: 'Ing. Patricia Lozano', phone: '55 1842 3390', email: 'compras@dlc.mx', since: '2023-02-11' },
  { id: 'c2', name: 'Almacenes Refrigerados Sonora',      city: 'Hermosillo, Son.',    contact: 'Lic. Marco Bustamante', phone: '662 210 7745', email: 'm.bustamante@arsonora.com', since: '2024-07-03' },
  { id: 'c3', name: 'Grupo Comercial Azteca',             city: 'Guadalajara, Jal.',   contact: 'Sra. Elena Cárdenas',  phone: '33 3640 1188', email: 'proyectos@gcazteca.mx', since: '2022-11-20' },
  ...SEED_CLIENTS,
]

/* ---- Suppliers ---- */
const SUPPLIERS: Supplier[] = [
  { id: 's1', name: 'Racks del Bajío, S.A. de C.V.', cat: 'Fabricante de racks', contact: 'Ing. Roberto Salazar', phone: '477 388 2210', email: 'ventas@racksbajio.mx', city: 'León, Gto.', rating: 5, active: true, notes: 'Proveedor principal. Cumple tiempos de fabricación. Acepta cambios de color sin costo extra.' },
  { id: 's2', name: 'Transportes Férreos del Norte',  cat: 'Fletes y transporte', contact: 'Lic. Mónica Treviño',  phone: '81 8344 5567', email: 'logistica@tfnorte.com', city: 'Monterrey, N.L.', rating: 4, active: true, notes: 'Buena cobertura nacional. Tarifas competitivas en rutas al norte.' },
  { id: 's3', name: 'Instalaciones Industriales Vega', cat: 'Cuadrilla de instalación', contact: 'Javier Vega', phone: '442 155 9023', email: 'jvega@iivega.mx', city: 'Querétaro, Qro.', rating: 4, active: true, notes: 'Cuadrilla de 6 instaladores certificados. Disponibilidad con 1 semana de anticipación.' },
  { id: 's4', name: 'Estructuras Metálicas Poniente',  cat: 'Fabricante de racks', contact: 'Ing. Luis Ontiveros', phone: '33 3122 4400', email: 'cotizaciones@empon.mx', city: 'Guadalajara, Jal.', rating: 3, active: false, notes: 'Proveedor de respaldo. Tiempos más largos. Usar solo en saturación.' },
  ...SEED_SUPPLIERS,
]

/* ---- Órdenes de Compra (modelo "Control OC" del Excel) ---- */
const ORDERS: Order[] = [
  // OCs vinculadas a proyectos del CRM (convertidas al nuevo modelo)
  { id: 'oc1', number: 'OC-2026-0041', date: '2026-04-28', supplierId: 's1', projectId: 'p1', description: 'Racks selectivos · PRY-2026-001', conditions: '50% anticipo - 50% contra entrega', amount: 486000, responsible: 'Ana Robles', file: 'OC-2026-0041_RacksBajio.pdf' },
  { id: 'oc2', number: 'OC-2026-0047', date: '2026-05-19', supplierId: 's1', projectId: 'p2', description: 'Racks anticorrosivos · PRY-2026-002', conditions: '50% anticipo - 50% finiquito', amount: 312000, responsible: 'Carlos Méndez', file: 'OC-2026-0047_RacksBajio.pdf' },
  { id: 'oc3', number: 'OC-2026-0052', date: '2026-05-26', supplierId: 's2', projectId: 'p4', description: 'Flete Monterrey · PRY-2026-004', conditions: 'Contado', amount: 58000, responsible: 'Ana Robles', file: 'OC-2026-0052_Flete_TFN.pdf' },
  { id: 'oc4', number: 'OC-2026-0038', date: '2026-03-30', supplierId: 's1', projectId: 'p6', description: 'Racks · PRY-2026-006', conditions: 'Contado', amount: 540000, responsible: 'Diana Fuentes', file: 'OC-2026-0038_RacksBajio.pdf' },
  { id: 'oc5', number: 'OC-2026-0039', date: '2026-04-02', supplierId: 's3', projectId: 'p6', description: 'Instalación · PRY-2026-006', conditions: 'Contado', amount: 72000, responsible: 'Diana Fuentes', file: 'OC-2026-0039_Instalacion_Vega.pdf' },
  { id: 'oc6', number: 'OC-2026-0033', date: '2026-03-12', supplierId: 's1', projectId: 'p7', description: 'Racks · PRY-2026-007', conditions: 'Contado', amount: 398000, responsible: 'Ana Robles', file: 'OC-2026-0033_RacksBajio.pdf' },
  { id: 'oc7', number: 'OC-2026-0055', date: '2026-05-29', supplierId: 's1', projectId: 'p5', description: 'Racks · PRY-2026-005', conditions: '50% anticipo - 30 días finiquito', amount: 268000, responsible: 'Carlos Méndez', file: '' },
  // OCs reales del Excel (Control OC) — sin proyecto
  { id: 'oc-stock5', number: 'OC-STOCK 5', date: '2024-06-24', supplierId: 'rs1', description: 'Stock / compra general', conditions: 'Parcialidades', amount: 967150, responsible: 'Administración', file: 'OC-STOCK 5.pdf' },
  { id: 'oc-2103', number: 'OC-2103', date: '2025-01-31', supplierId: 'rs2', description: 'Orden de compra OC-2103', conditions: 'Parcialidades', amount: 2610000, responsible: 'Administración', file: 'OC-2103.pdf' },
  { id: 'oc-iwp1', number: 'OC-IWP-01', date: '2026-05-20', supplierId: 'rs3', description: 'Estructura metálica IWP', conditions: 'Crédito', amount: 180000, responsible: 'Administración', file: '' },
  { id: 'oc-lmp1', number: 'OC-LMP-01', date: '2026-02-10', supplierId: 'rs6', description: 'Material LAMPER', conditions: 'Contado', amount: 95000, responsible: 'Administración', file: '', cancelled: true },
]

/* ---- Pagos / abonos (hoja "Pagos" del Excel) ---- */
const PAYMENTS: Payment[] = [
  { id: 'pg1',  orderId: 'oc1', n: 1, date: '2026-04-28', amount: 243000, method: 'Transferencia', status: 'Pagado',     comments: 'Anticipo 50%' },
  { id: 'pg2',  orderId: 'oc1', n: 2, date: '2026-06-15', amount: 243000, method: '',              status: 'Programado', comments: 'Liquidación' },
  { id: 'pg3',  orderId: 'oc2', n: 1, date: '2026-05-19', amount: 156000, method: 'Transferencia', status: 'Pagado',     comments: 'Anticipo 50%' },
  { id: 'pg4',  orderId: 'oc2', n: 2, date: '2026-07-01', amount: 156000, method: '',              status: 'Programado', comments: '' },
  { id: 'pg5',  orderId: 'oc3', n: 1, date: '2026-05-26', amount: 58000,  method: 'Transferencia', status: 'Pagado',     comments: 'Pago de contado' },
  { id: 'pg6',  orderId: 'oc4', n: 1, date: '2026-03-30', amount: 540000, method: 'Transferencia', status: 'Pagado',     comments: '' },
  { id: 'pg7',  orderId: 'oc5', n: 1, date: '2026-04-02', amount: 72000,  method: 'Transferencia', status: 'Pagado',     comments: '' },
  { id: 'pg8',  orderId: 'oc6', n: 1, date: '2026-03-12', amount: 398000, method: 'Transferencia', status: 'Pagado',     comments: '' },
  { id: 'pg9',  orderId: 'oc7', n: 1, date: '2026-05-29', amount: 134000, method: 'Transferencia', status: 'Pagado',     comments: 'Anticipo' },
  { id: 'pg10', orderId: 'oc7', n: 2, date: '2026-05-25', amount: 134000, method: '',              status: 'Programado', comments: 'Vencido' },
  // OC-STOCK 5 (datos reales del Excel) — liquidada
  { id: 'pg11', orderId: 'oc-stock5', n: 1, date: '2025-04-30', amount: 122321.63, method: '', status: 'Pagado', comments: '' },
  { id: 'pg12', orderId: 'oc-stock5', n: 2, date: '2025-06-17', amount: 300000,    method: '', status: 'Pagado', comments: '' },
  { id: 'pg13', orderId: 'oc-stock5', n: 3, date: '2025-09-26', amount: 160000,    method: '', status: 'Pagado', comments: '' },
  { id: 'pg14', orderId: 'oc-stock5', n: 4, date: '2025-09-30', amount: 384828.37, method: '', status: 'Pagado', comments: '' },
  // OC-2103 (datos reales del Excel)
  { id: 'pg15', orderId: 'oc-2103', n: 1, date: '2025-01-31', amount: 1450000, method: '', status: 'Pagado',     comments: '' },
  { id: 'pg16', orderId: 'oc-2103', n: 2, date: '2025-09-30', amount: 200000,  method: '', status: 'Programado', comments: '' },
  { id: 'pg17', orderId: 'oc-2103', n: 3, date: '2025-10-09', amount: 210000,  method: '', status: 'Programado', comments: '' },
  { id: 'pg18', orderId: 'oc-2103', n: 4, date: '2025-10-13', amount: 500000,  method: '', status: 'Programado', comments: '' },
  { id: 'pg19', orderId: 'oc-2103', n: 5, date: '2025-11-28', amount: 200000,  method: '', status: 'Programado', comments: '' },
  // oc-iwp1 → sin abonos (Pendiente);  oc-lmp1 → Cancelada
]

/* ---- Projects (each project = one sale) ---- */
const allDocs = (...flags: boolean[]): Project['docs'] => {
  const k: (keyof Project['docs'])[] = ['cotizacion', 'layout', 'anticipo', 'ordenCompra', 'finiquito', 'remision', 'cartaFin']
  const d = {} as Project['docs']
  k.forEach((key, i) => { d[key] = flags[i] ? docOK(`${key}.pdf`) : docNo() })
  return d
}
const PROJECTS: Project[] = [
  {
    id: 'p1', code: 'PRY-2026-001', stage: 'fabricacion', client: 'c1', seller: 'v1',
    city: 'Ciudad de México', sistemaVendido: 'Rack selectivo', ventaSubtotal: 520000, freight: 38000, install: 64000, weeks: 6,
    obs: 'Cambio de color a gris RAL 7016 en parcales. Cliente solicita refuerzo en niveles bajos.',
    docs: allDocs(true, true, true, true, false, false, false),
    suppliers: ['s1'], eta: '2026-06-24', finiquito: 'pending', created: '2026-04-20', updated: '2026-05-28',
  },
  {
    id: 'p2', code: 'PRY-2026-002', stage: 'asignacion', client: 'c2', seller: 'v2',
    city: 'Hermosillo, Son.', sistemaVendido: 'Rack selectivo anticorrosivo', ventaSubtotal: 410000, freight: 52000, install: 41000, weeks: 8,
    obs: 'Almacén refrigerado — requiere acabado anticorrosivo especial. Validar con fabricante.',
    docs: allDocs(true, true, true, true, false, false, false),
    suppliers: ['s1'], eta: '', finiquito: 'pending', created: '2026-05-12', updated: '2026-05-19',
  },
  {
    id: 'p3', code: 'PRY-2026-003', stage: 'registro', client: 'c3', seller: 'v3',
    city: 'Guadalajara, Jal.', sistemaVendido: 'Rack selectivo', ventaSubtotal: 240000, freight: 21000, install: 33000, weeks: 5,
    obs: 'Venta recién registrada por el vendedor. Pendiente captura completa por admin.',
    docs: allDocs(true, false, false, false, false, false, false),
    suppliers: [], eta: '', finiquito: 'pending', created: '2026-05-30', updated: '2026-05-30',
  },
  {
    id: 'p4', code: 'PRY-2026-004', stage: 'coordinacion', client: 'c1', seller: 'v1',
    city: 'Monterrey, N.L.', sistemaVendido: 'Rack selectivo + cantilever', ventaSubtotal: 560000, freight: 47000, install: 58000, weeks: 7,
    obs: 'Pago completo recibido. Coordinar flete con TFN y cuadrilla de instalación. Generar remisión.',
    docs: allDocs(true, true, true, true, true, true, false),
    suppliers: ['s1', 's2'], eta: '2026-06-10', finiquito: 'paid', created: '2026-04-02', updated: '2026-05-27', remision: 'REM-2026-019',
  },
  {
    id: 'p5', code: 'PRY-2026-005', stage: 'entrega_est', client: 'c2', seller: 'v2',
    city: 'Culiacán, Sin.', sistemaVendido: 'Rack selectivo', ventaSubtotal: 430000, freight: 44000, install: 39000, weeks: 6,
    obs: 'Proveedor confirmó ETA 18 jun. Cliente notificado, en espera de finiquito antes de embarque.',
    docs: allDocs(true, true, true, true, false, false, false),
    suppliers: ['s1'], eta: '2026-06-18', finiquito: 'pending', created: '2026-04-25', updated: '2026-05-29',
  },
  /* completed this month → commissions */
  {
    id: 'p6', code: 'PRY-2026-006', stage: 'finalizado', client: 'c3', seller: 'v3',
    city: 'Guadalajara, Jal.', sistemaVendido: 'Rack de penetración (drive-in)', ventaSubtotal: 690000, freight: 56000, install: 72000, weeks: 7,
    obs: 'Obra concluida y carta de fin de obra firmada. Entra a comisiones de junio.',
    docs: allDocs(true, true, true, true, true, true, true),
    suppliers: ['s1', 's3'], eta: '2026-05-22', finiquito: 'paid', created: '2026-03-20', updated: '2026-05-30', closedOn: '2026-05-30',
  },
  {
    id: 'p7', code: 'PRY-2026-007', stage: 'finalizado', client: 'c1', seller: 'v1',
    city: 'Puebla, Pue.', sistemaVendido: 'Rack selectivo', ventaSubtotal: 480000, freight: 33000, install: 48000, weeks: 6,
    obs: 'Proyecto cerrado. Cliente satisfecho, posible recompra Q3.',
    docs: allDocs(true, true, true, true, true, true, true),
    suppliers: ['s1'], eta: '2026-05-08', finiquito: 'paid', created: '2026-03-05', updated: '2026-05-14', closedOn: '2026-05-14',
  },
]

/* ---- Commissions ---- */
const COMMISSIONS: Commission[] = [
  { id: 'cm1', projectId: 'p6', seller: 'v3', amount: 20480, status: 'pending', month: '2026-06' },
  { id: 'cm2', projectId: 'p7', seller: 'v1', amount: 16200, status: 'paid',    month: '2026-06' },
]

/* ---- Activity feed ---- */
const ACTIVITY: Activity[] = [
  { id: 'a1', t: '2026-05-30T16:20', icon: 'check',   who: 'Diana Fuentes', txt: 'cerró el proyecto', tgt: 'PRY-2026-006', kind: 'done' },
  { id: 'a2', t: '2026-05-29T11:05', icon: 'calendar',who: 'Logística',     txt: 'registró ETA 18 jun en', tgt: 'PRY-2026-005', kind: 'info' },
  { id: 'a3', t: '2026-05-28T09:40', icon: 'factory', who: 'Racks del Bajío', txt: 'reportó avance de fabricación 60% en', tgt: 'PRY-2026-001', kind: 'work' },
  { id: 'a4', t: '2026-05-27T15:12', icon: 'truck',   who: 'Logística',     txt: 'generó remisión REM-2026-019 para', tgt: 'PRY-2026-004', kind: 'info' },
  { id: 'a5', t: '2026-05-26T10:30', icon: 'money',   who: 'Admin',         txt: 'confirmó finiquito de', tgt: 'PRY-2026-004', kind: 'money' },
  { id: 'a6', t: '2026-05-19T13:55', icon: 'orders',  who: 'Carlos Méndez', txt: 'creó la OC-2026-0047 para', tgt: 'PRY-2026-002', kind: 'info' },
  { id: 'a7', t: '2026-05-30T08:15', icon: 'flag',    who: 'Diana Fuentes', txt: 'registró nueva venta', tgt: 'PRY-2026-003', kind: 'new' },
]

// ============================================================
//  STORE — context + reducer
// ============================================================
const initial: AppState = {
  projects: PROJECTS, suppliers: SUPPLIERS, orders: ORDERS, payments: PAYMENTS,
  clients: CLIENTS, sellers: SELLERS, commissions: COMMISSIONS, activity: ACTIVITY,
}

function pushActivity(state: AppState, a: Omit<Activity, 'id' | 't'>): Activity[] {
  return [{ id: uid('a'), t: new Date().toISOString().slice(0, 16), ...a }, ...state.activity].slice(0, 40)
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'MOVE_STAGE': {
      const projects = state.projects.map(p => p.id === action.id ? { ...p, stage: action.stage, updated: '2026-06-02', ...(action.stage === 'finalizado' ? { closedOn: '2026-06-02' } : {}) } : p)
      const proj = state.projects.find(p => p.id === action.id)!
      let commissions = state.commissions
      if (action.stage === 'finalizado' && !state.commissions.some(c => c.projectId === action.id)) {
        const seller = state.sellers.find(s => s.id === proj.seller)
        const amt = Math.round((proj.freight + proj.install) * (seller ? seller.rate : 0.04))
        commissions = [...state.commissions, { id: uid('cm'), projectId: action.id, seller: proj.seller, amount: amt, status: 'pending', month: '2026-06' }]
      }
      const stg = STAGE_MAP[action.stage]
      return { ...state, projects, commissions, activity: pushActivity(state, { icon: stg.icon, who: 'Tú', txt: `movió a ${stg.short}`, tgt: proj.code, kind: 'info' }) }
    }
    case 'SAVE_PROJECT': {
      const exists = state.projects.some(p => p.id === action.project.id)
      const projects = exists
        ? state.projects.map(p => p.id === action.project.id ? { ...action.project, updated: '2026-06-02' } as Project : p)
        : [{ ...action.project, id: uid('p'), created: '2026-06-02', updated: '2026-06-02' } as Project, ...state.projects]
      return { ...state, projects, activity: exists ? state.activity : pushActivity(state, { icon: 'flag', who: 'Tú', txt: 'registró nueva venta', tgt: action.project.code, kind: 'new' }) }
    }
    case 'DELETE_PROJECT':
      return { ...state, projects: state.projects.filter(p => p.id !== action.id) }
    case 'SAVE_SUPPLIER': {
      const exists = state.suppliers.some(s => s.id === action.supplier.id)
      const suppliers = exists
        ? state.suppliers.map(s => s.id === action.supplier.id ? action.supplier as Supplier : s)
        : [...state.suppliers, { ...action.supplier, id: uid('s') } as Supplier]
      return { ...state, suppliers }
    }
    case 'TOGGLE_SUPPLIER':
      return { ...state, suppliers: state.suppliers.map(s => s.id === action.id ? { ...s, active: !s.active } : s) }
    case 'SAVE_ORDER': {
      const exists = state.orders.some(o => o.id === action.order.id)
      const orders = exists
        ? state.orders.map(o => o.id === action.order.id ? action.order as Order : o)
        : [...state.orders, { ...action.order, id: uid('oc') } as Order]
      return { ...state, orders }
    }
    case 'DELETE_ORDER':
      return { ...state, orders: state.orders.filter(o => o.id !== action.id), payments: state.payments.filter(p => p.orderId !== action.id) }
    case 'SAVE_PAYMENT': {
      const exists = state.payments.some(p => p.id === action.payment.id)
      const payments = exists
        ? state.payments.map(p => p.id === action.payment.id ? action.payment as Payment : p)
        : [...state.payments, { ...action.payment, id: uid('pg') } as Payment]
      return { ...state, payments }
    }
    case 'DELETE_PAYMENT':
      return { ...state, payments: state.payments.filter(p => p.id !== action.id) }
    case 'SAVE_CLIENT': {
      const exists = state.clients.some(c => c.id === action.client.id)
      const clients = exists
        ? state.clients.map(c => c.id === action.client.id ? action.client as Client : c)
        : [...state.clients, { ...action.client, id: uid('c'), since: '2026-06-02' } as Client]
      return { ...state, clients }
    }
    case 'TOGGLE_COMMISSION':
      return { ...state, commissions: state.commissions.map(c => c.id === action.id ? { ...c, status: c.status === 'paid' ? 'pending' : 'paid' } : c) }
    default:
      return state
  }
}

export interface StoreValue {
  state: AppState
  dispatch: React.Dispatch<Action>
}

const StoreCtx = React.createContext<StoreValue | null>(null)

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = React.useReducer(reducer, initial)
  const value = React.useMemo<StoreValue>(() => ({ state, dispatch }), [state])
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
}
