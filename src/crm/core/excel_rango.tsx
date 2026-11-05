// ============================================================
//  Modal "Exportar a Excel": elegir el ALCANCE en meses.
//  Lo usan Metas de venta y Prospectos. Tres opciones:
//    · un mes (el que se está viendo / el filtrado)
//    · un rango de meses (desde – hasta)
//    · todos los meses con datos
//  Devuelve el rango elegido como 'YYYY-MM' (desde ≤ hasta).
// ============================================================
import * as React from 'react'
import { Modal, Select } from './ui'
import { Icon } from './icons'
import { MESES_L } from './data'

export interface RangoMeses {
  desde: string          // 'YYYY-MM'
  hasta: string          // 'YYYY-MM'
  todos: boolean         // true = se eligió "Todos los meses"
}

/** "Agosto 2026" */
export const mesLargo = (ym: string) => `${MESES_L[Number(ym.slice(5)) - 1] ?? ym} ${ym.slice(0, 4)}`
/** Etiqueta de un rango: "Agosto 2026", "Agosto – Octubre 2026", "Nov 2025 – Feb 2026". */
export const rangoLabel = (r: RangoMeses) => {
  if (r.desde === r.hasta) return mesLargo(r.desde)
  if (r.desde.slice(0, 4) === r.hasta.slice(0, 4)) return `${MESES_L[Number(r.desde.slice(5)) - 1]} – ${mesLargo(r.hasta)}`
  return `${mesLargo(r.desde)} – ${mesLargo(r.hasta)}`
}
/** Lista de meses 'YYYY-MM' entre desde y hasta (ambos incluidos). */
export const mesesEntre = (desde: string, hasta: string): string[] => {
  const out: string[] = []
  let [y, m] = desde.split('-').map(Number)
  for (let i = 0; i < 240; i++) {
    const ym = `${y}-${String(m).padStart(2, '0')}`
    if (ym > hasta) break
    out.push(ym)
    if (++m > 12) { m = 1; y++ }
  }
  return out
}

export function RangoMesesModal({ meses, mesActual, mesActualLabel, titulo = 'Exportar a Excel', onClose, onExportar }: {
  /** Meses disponibles ('YYYY-MM'), en cualquier orden. */
  meses: string[]
  /** Mes "actual" para la primera opción (el que se está viendo o el filtrado); '' = sin esa opción. */
  mesActual: string
  /** Texto de la primera opción; por defecto "Solo <mes>". */
  mesActualLabel?: string
  titulo?: string
  onClose: () => void
  onExportar: (r: RangoMeses) => void
}) {
  const orden = React.useMemo(() => [...new Set(meses.filter(Boolean))].sort(), [meses])
  const primero = orden[0] || mesActual
  const ultimo = orden[orden.length - 1] || mesActual
  const [modo, setModo] = React.useState<'mes' | 'rango' | 'todos'>(mesActual ? 'mes' : 'todos')
  const [desde, setDesde] = React.useState(() => (mesActual && mesActual > primero ? mesActual : primero))
  const [hasta, setHasta] = React.useState(() => mesActual || ultimo)
  const invertido = desde > hasta
  const exportar = () => {
    if (modo === 'mes') onExportar({ desde: mesActual, hasta: mesActual, todos: false })
    else if (modo === 'todos') onExportar({ desde: primero, hasta: ultimo, todos: true })
    else onExportar({ desde, hasta, todos: false })
    onClose()
  }
  const opcion = (v: typeof modo, label: React.ReactNode) => (
    <label className="flex items-center gap-2 text-[12.5px] text-tx-1 cursor-pointer">
      <input type="radio" name="xls-rango" checked={modo === v} onChange={() => setModo(v)} />{label}
    </label>
  )
  const selMes = (value: string, onChange: (v: string) => void) => (
    <Select value={value} onChange={e => onChange(e.target.value)} className="w-auto min-w-[150px] py-1">
      {orden.map(m => <option key={m} value={m}>{mesLargo(m)}</option>)}
    </Select>
  )
  return (
    <Modal title={titulo} icon="download" width={460} onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" disabled={modo === 'rango' && invertido} onClick={exportar}><Icon name="download" size={14} /> Descargar</button>
      </>}>
      <div className="flex flex-col gap-3">
        <div className="meta">¿Qué meses quieres incluir en el archivo?</div>
        {mesActual && opcion('mes', <span>{mesActualLabel || 'Solo'} <b>{mesLargo(mesActual)}</b></span>)}
        {opcion('rango', 'Un rango de meses')}
        {modo === 'rango' && (
          <div className="flex items-center gap-2 pl-6">
            <span className="meta">Desde</span>{selMes(desde, setDesde)}
            <span className="meta">hasta</span>{selMes(hasta, setHasta)}
          </div>
        )}
        {modo === 'rango' && invertido && <div className="pl-6 text-[12px]" style={{ color: 'var(--danger)' }}>El mes inicial debe ser anterior o igual al final.</div>}
        {opcion('todos', <span>Todos los meses <span className="meta">({orden.length ? rangoLabel({ desde: primero, hasta: ultimo, todos: true }) : 'sin datos'})</span></span>)}
      </div>
    </Modal>
  )
}
