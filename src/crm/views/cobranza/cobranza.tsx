// ============================================================
//  COBRANZA — estado de cobro por PROYECTO (una fila por proyecto)
// ============================================================
import * as React from 'react'
import { useStore, sel, fmtMoney, fmtMoney2, fmtDateShort, isDireccion } from '../../core/data'
import { Modal, Badge, Empty, KPI, Select } from '../../core/ui'
import { CobroForm } from '../projects/project_views'
import { Icon } from '../../core/icons'
import type { Project, ClientPayment, ClientPaymentStatus } from '../../core/types'

const COBRO_COLOR: Record<ClientPaymentStatus, string> = { Cobrado: 'var(--ok)', Programado: 'var(--warn)', Cancelado: 'var(--tx-3)' }

type Estado = 'Cobrado' | 'Parcial' | 'Sin cobro'
const ESTADO_COLOR: Record<Estado, string> = { Cobrado: 'var(--ok)', Parcial: 'var(--warn)', 'Sin cobro': 'var(--danger)' }
const estadoDe = (total: number, cobrado: number): Estado =>
  cobrado <= 0 ? 'Sin cobro' : (cobrado >= total - 0.5 ? 'Cobrado' : 'Parcial')

/* ---- Detalle de cobranza de un proyecto (registrar/ver cobros) ---- */
function CobranzaDetail({ project, onClose }: { project: Project; onClose: () => void }) {
  const { state, dispatch } = useStore()
  const readOnly = state.currentUser?.role === 'ventas' || isDireccion(state.currentUser?.role)   // ventas/dirección: ver sin registrar/editar cobros
  const p = state.projects.find(x => x.id === project.id) || project
  const cobros = sel.clientPaymentsForProject(state, p.id)
  const total = sel.projectTotalConIva(p)
  const cobrado = sel.projectCobrado(state, p.id)
  const saldo = sel.projectSaldoCliente(state, p)
  const [cobro, setCobro] = React.useState<ClientPayment | {} | null>(null)
  const acumOf = (c: ClientPayment) => cobros.filter(x => x.status !== 'Cancelado' && x.n <= c.n).reduce((a, x) => a + x.amount, 0)

  return (
    <Modal width={720} icon="download" title={`${p.code} · ${sel.clientName(state, p.client)}`} sub="Cobranza del proyecto" onClose={onClose}
      footer={<><div className="flex-1"></div>{!readOnly && <button className="btn btn-primary" onClick={() => setCobro({})}><Icon name="plus" size={15} /> Registrar cobro</button>}</>}>
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-bg-1 border border-line rounded-[8px] p-3"><div className="label-k">Monto total (c/IVA)</div><div className="font-display font-bold text-[17px] mt-0.5">{fmtMoney(total)}</div></div>
        <div className="bg-bg-1 border border-line rounded-[8px] p-3"><div className="label-k">Cobrado</div><div className="font-display font-bold text-[17px] mt-0.5 text-ok">{fmtMoney(cobrado)}</div></div>
        <div className="bg-bg-1 border border-line rounded-[8px] p-3"><div className="label-k">Saldo por cobrar</div><div className="font-display font-bold text-[17px] mt-0.5" style={{ color: saldo > 0 ? 'var(--warn)' : 'var(--ok)' }}>{fmtMoney(saldo)}</div></div>
      </div>
      {cobros.length === 0 ? (
        <div className="text-center py-10 text-[13px] text-tx-2">
          <Icon name="alert" size={26} className="mx-auto mb-2 text-warn opacity-70" />
          Sin cobros registrados.<br />Registra el <strong>anticipo</strong> para poder avanzar a la orden de compra.
        </div>
      ) : (
        <div className="border border-line rounded-[8px] overflow-hidden">
          <table className="tbl">
            <thead><tr><th>#</th><th>Fecha</th><th>Concepto</th><th className="num">Importe</th><th className="num">Acum.</th><th>Forma</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              {cobros.map(c => (
                <tr key={c.id} style={{ cursor: 'default' }}>
                  <td className="mono">{c.n}</td>
                  <td className="num text-tx-1 text-[12px]">{fmtDateShort(c.date)}</td>
                  <td className="text-[12.5px]">{c.concept || '—'}</td>
                  <td className="num">{fmtMoney(c.amount)}</td>
                  <td className="num text-[12px]">{fmtMoney(acumOf(c))}<div className="meta">de {fmtMoney(total)}</div></td>
                  <td className="text-tx-1 text-[12px]">{c.method || '—'}</td>
                  <td><Badge color={COBRO_COLOR[c.status]}>{c.status}</Badge></td>
                  <td>{!readOnly && <div className="flex gap-1 justify-end">
                    <button className="icon-btn w-7 h-7" title="Editar" onClick={() => setCobro(c)}><Icon name="edit" size={13} /></button>
                    <button className="icon-btn w-7 h-7" title="Eliminar" onClick={() => dispatch({ type: 'DELETE_CLIENT_PAYMENT', id: c.id })}><Icon name="trash" size={13} /></button>
                  </div>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {cobro && <CobroForm project={p} cobro={'id' in cobro ? cobro : undefined} onClose={() => setCobro(null)} readOnly={readOnly} />}
    </Modal>
  )
}

export function CobranzaPage() {
  const { state } = useStore()
  const [detail, setDetail] = React.useState<Project | null>(null)
  const [q, setQ] = React.useState('')
  const [fSupplier, setFSupplier] = React.useState('')

  // ---- Marcador "Nuevo" (no abierto), por usuario y persistido en el navegador ----
  // Cada usuario lleva su propio set de proyectos ya abiertos. Las filas que NO estén
  // en ese set se marcan como "Nuevo" y se ordenan arriba; al abrir el detalle se quitan.
  const seenKey = `cobranza_seen_v1_${state.currentUser?.id ?? 'anon'}`
  const [seen, setSeen] = React.useState<Set<string>>(() => {
    try { const raw = localStorage.getItem(seenKey); if (raw) return new Set<string>(JSON.parse(raw)) } catch { /* ignore */ }
    return new Set<string>()
  })
  // ¿Ya hay línea base guardada? Si no, se sembrará con los proyectos actuales una vez
  // que carguen, para que solo resalten los que entren DESPUÉS (evita marcar todo de golpe).
  const seededRef = React.useRef<boolean>(((): boolean => { try { return localStorage.getItem(seenKey) != null } catch { return false } })())
  const writeSeen = (next: Set<string>) => { try { localStorage.setItem(seenKey, JSON.stringify([...next])) } catch { /* ignore */ } }
  React.useEffect(() => {
    if (seededRef.current || state.projects.length === 0) return
    const init = new Set(state.projects.map(p => p.id))
    seededRef.current = true
    writeSeen(init)
    setSeen(init)
  }, [state.projects, seenKey]) // eslint-disable-line react-hooks/exhaustive-deps
  const isNew = (id: string) => seededRef.current && !seen.has(id)
  const markSeen = (id: string) => setSeen(prev => { if (prev.has(id)) return prev; const next = new Set(prev); next.add(id); writeSeen(next); return next })
  const markAllSeen = () => { const all = new Set(state.projects.map(p => p.id)); writeSeen(all); setSeen(all) }

  const rows = state.projects.map(p => {
    const total = sel.projectTotalConIva(p)
    const cobrado = sel.projectCobrado(state, p.id)
    const cobros = sel.clientPaymentsForProject(state, p.id)
    const formas = Array.from(new Set(cobros.filter(c => c.status !== 'Cancelado' && c.method).map(c => c.method)))
    const coment = cobros.map(c => c.comments).filter(Boolean).join(' · ')
    return { p, client: sel.clientName(state, p.client), total, cobrado, saldo: total - cobrado, estado: estadoDe(total, cobrado), forma: formas.join(', '), coment }
  })

  // Alcance por proveedor: proyectos con OC de ESE proveedor (mismo criterio que Órdenes de compra).
  const projSet = fSupplier ? new Set(state.orders.filter(o => o.supplierId === fSupplier && o.projectId).map(o => o.projectId)) : null
  const scopeRows = projSet ? rows.filter(r => projSet.has(r.p.id)) : rows
  const needle = q.trim().toLowerCase()
  const filtered = needle
    ? scopeRows.filter(r => `${r.p.code} ${r.client} ${r.total} ${r.cobrado} ${fmtMoney(r.total)} ${fmtMoney(r.cobrado)}`.toLowerCase().includes(needle))
    : scopeRows
  const ord: Record<Estado, number> = { 'Sin cobro': 0, Parcial: 1, Cobrado: 2 }
  // No abiertos (Nuevo) arriba; dentro de cada grupo, por estado y luego por código.
  const sorted = [...filtered].sort((a, b) =>
    (isNew(a.p.id) ? 0 : 1) - (isNew(b.p.id) ? 0 : 1)
    || ord[a.estado] - ord[b.estado]
    || (a.p.code < b.p.code ? 1 : -1))
  const newCount = scopeRows.filter(r => isNew(r.p.id)).length

  const totalCobrado = scopeRows.reduce((a, r) => a + r.cobrado, 0)
  const totalPorCobrar = scopeRows.reduce((a, r) => a + Math.max(0, r.saldo), 0)
  const sinCobro = scopeRows.filter(r => r.estado === 'Sin cobro').length
  const supplierName = fSupplier ? (sel.supplier(state, fSupplier)?.name || '') : ''
  // Proveedores que tienen al menos una OC ligada a un proyecto (para poblar el filtro).
  const supplierOpts = state.suppliers.filter(s => state.orders.some(o => o.supplierId === s.id && o.projectId))

  return (
    <div>
      <div className="spread mb-[18px]">
        <div className="sec-title m-0"><h2>Cobranza</h2><span className="sub">Estado de cobro por proyecto</span></div>
      </div>

      <div className="grid grid-cols-3 gap-3.5 mb-4">
        <KPI label={supplierName ? `Cobrado · ${supplierName}` : 'Total cobrado'} value={totalCobrado} format={fmtMoney} icon="money" accent />
        <KPI label={supplierName ? `Por cobrar · ${supplierName}` : 'Por cobrar (saldo)'} value={totalPorCobrar} format={fmtMoney} icon="calendar" foot={supplierName ? `${scopeRows.length} proyecto${scopeRows.length === 1 ? '' : 's'} con OC` : 'Pendiente de entrar'} />
        <KPI label="Proyectos sin cobro" value={sinCobro} icon="alert" />
      </div>

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 max-w-[440px]">
          <Icon name="search" size={15} className="absolute left-[11px] top-2.5 text-tx-3" />
          <input className="input pl-[34px]" placeholder="Buscar por proyecto, cliente, monto total o cobrado…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <Select value={fSupplier} onChange={e => setFSupplier(e.target.value)} className="w-auto min-w-[200px]">
          <option value="">Todos los proveedores</option>
          {supplierOpts.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
        {fSupplier && <button className="btn btn-ghost btn-sm" onClick={() => setFSupplier('')}><Icon name="close" size={13} /> Limpiar</button>}
        {newCount > 0 && (
          <span className="flex items-center gap-2">
            <Badge color="var(--acc)">{newCount} nuevo{newCount === 1 ? '' : 's'}</Badge>
            <button className="btn btn-ghost btn-sm" onClick={markAllSeen}><Icon name="check" size={13} /> Marcar todos como vistos</button>
          </span>
        )}
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>Proyecto</th><th>Cliente</th><th className="num">Monto total</th><th className="num">Cobrado</th><th className="num">Saldo</th><th>Estado</th><th>Forma de pago</th><th>Comentarios</th></tr></thead>
            <tbody>
              {sorted.map(r => (
                <tr key={r.p.id} onClick={() => { setDetail(r.p); markSeen(r.p.id) }}>
                  <td>
                    <span className="flex items-center gap-2">
                      {isNew(r.p.id) && <span className="w-1.5 h-1.5 rounded-full flex-none" style={{ background: 'var(--acc)' }} title="No abierto" />}
                      <span className="mono text-acc font-semibold">{r.p.code}</span>
                      {isNew(r.p.id) && <Badge color="var(--acc)">Nuevo</Badge>}
                    </span>
                  </td>
                  <td className="text-[12.5px]">{r.client}</td>
                  <td className="num font-semibold">{fmtMoney2(r.total)}</td>
                  <td className="num text-ok">{fmtMoney2(r.cobrado)}</td>
                  <td className="num" style={{ color: r.saldo > 0.5 ? 'var(--warn)' : 'var(--ok)' }}>{fmtMoney2(Math.max(0, r.saldo))}</td>
                  <td><Badge color={ESTADO_COLOR[r.estado]}>{r.estado}</Badge></td>
                  <td className="text-tx-1 text-[12px]">{r.forma || '—'}</td>
                  <td className="text-tx-2 text-[12px] max-w-[220px] truncate" title={r.coment}>{r.coment || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {sorted.length === 0 && <Empty icon="download">Ningún proyecto coincide con la búsqueda</Empty>}
      </div>

      {detail && <CobranzaDetail project={detail} onClose={() => setDetail(null)} />}
    </div>
  )
}
