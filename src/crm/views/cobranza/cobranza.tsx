// ============================================================
//  COBRANZA — cobros que el CLIENTE nos hace por cada proyecto
// ============================================================
import * as React from 'react'
import { useStore, sel, fmtMoney, fmtMoney2, fmtDateShort } from '../../core/data'
import { Badge, Empty, KPI } from '../../core/ui'
import { CobroForm } from '../projects/project_views'
import { Icon } from '../../core/icons'
import type { ClientPayment, ClientPaymentStatus } from '../../core/types'

const COBRO_STATES: ClientPaymentStatus[] = ['Cobrado', 'Programado', 'Cancelado']
const COBRO_COLOR: Record<ClientPaymentStatus, string> = { Cobrado: 'var(--ok)', Programado: 'var(--warn)', Cancelado: 'var(--tx-3)' }

export function CobranzaPage() {
  const { state } = useStore()
  const [cobroForm, setCobroForm] = React.useState<ClientPayment | {} | null>(null)
  const [fCobro, setFCobro] = React.useState('')

  const rows = state.clientPayments
    .map(c => ({ c, project: state.projects.find(x => x.id === c.projectId) }))
    .filter(r => r.project)
    .filter(r => !fCobro || r.c.status === fCobro)
    .sort((a, b) => (a.c.date < b.c.date ? 1 : -1))
  const totalCobrado = state.clientPayments.filter(c => c.status === 'Cobrado').reduce((a, c) => a + c.amount, 0)
  const totalProg = state.clientPayments.filter(c => c.status === 'Programado').reduce((a, c) => a + c.amount, 0)
  // acumulado del proyecto hasta este cobro (por No., sin contar cancelados)
  const acumOf = (c: ClientPayment) =>
    state.clientPayments.filter(x => x.projectId === c.projectId && x.status !== 'Cancelado' && x.n <= c.n).reduce((a, x) => a + x.amount, 0)

  return (
    <div>
      <div className="spread mb-[18px]">
        <div className="sec-title m-0"><h2>Cobranza</h2><span className="sub">Cobros de clientes por proyecto</span></div>
        <button className="btn btn-primary" onClick={() => setCobroForm({})}><Icon name="plus" size={15} /> Nuevo cobro</button>
      </div>

      <div className="grid grid-cols-3 gap-3.5 mb-4">
        <KPI label="Total cobrado" value={totalCobrado} format={fmtMoney} icon="money" accent />
        <KPI label="Programado por cobrar" value={totalProg} format={fmtMoney} icon="calendar" foot="Pendiente de entrar" />
        <KPI label="Cobros registrados" value={state.clientPayments.length} icon="clients" />
      </div>

      <div className="flex gap-2 mb-3.5 items-center flex-wrap">
        <span className="label-k">Filtrar:</span>
        <div className="seg">
          <button className={!fCobro ? 'on' : ''} onClick={() => setFCobro('')}>Todos</button>
          {COBRO_STATES.map(s => <button key={s} className={fCobro === s ? 'on' : ''} onClick={() => setFCobro(s)}>{s}</button>)}
        </div>
        <span className="meta">{rows.length} de {state.clientPayments.length}</span>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>Proyecto</th><th>Cliente</th><th className="num">No.</th><th>Fecha</th><th className="num">Importe</th><th className="num">Acumulado</th><th className="num">Saldo</th><th>Concepto</th><th>Estado</th><th>Forma pago</th><th>Comentarios</th></tr></thead>
            <tbody>
              {rows.map(({ c, project }) => {
                const total = sel.projectTotalConIva(project!); const acum = acumOf(c); const saldo = total - acum
                return (
                <tr key={c.id} onClick={() => setCobroForm(c)}>
                  <td><span className="mono text-acc font-semibold">{project!.code}</span></td>
                  <td className="text-[12.5px]">{sel.clientName(state, project!.client)}</td>
                  <td className="num mono">{c.n}</td>
                  <td className="num text-tx-1 text-[12px]">{fmtDateShort(c.date)}</td>
                  <td className="num font-semibold">{fmtMoney2(c.amount)}</td>
                  <td className="num text-[12px]">{fmtMoney(acum)}<div className="meta">de {fmtMoney(total)}</div></td>
                  <td className="num text-[12px]" style={{ color: saldo > 0 ? 'var(--warn)' : 'var(--ok)' }}>{fmtMoney(saldo)}</td>
                  <td className="text-tx-1 text-[12px]">{c.concept || '—'}</td>
                  <td><Badge color={COBRO_COLOR[c.status]}>{c.status}</Badge></td>
                  <td className="text-tx-1 text-[12px]">{c.method || '—'}</td>
                  <td className="text-tx-2 text-[12px]">{c.comments || '—'}</td>
                </tr>
              ) })}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && <Empty icon="money">Sin cobros registrados</Empty>}
      </div>

      {cobroForm && <CobroForm cobro={'id' in cobroForm ? cobroForm : undefined} onClose={() => setCobroForm(null)} />}
    </div>
  )
}
