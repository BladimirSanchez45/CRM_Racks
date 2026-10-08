// ============================================================
//  INVENTARIO — existencias de almacén (stock GENERAL)
//  · Una familia define SUS atributos: con dos se dibuja como MATRIZ
//    (peralte × longitud), con uno o ninguno como lista simple.
//  · La existencia NUNCA se escribe a mano: toda variación pasa por un
//    movimiento con motivo, quién y contra qué OC/proyecto (kardex).
//  · "Modo conteo" convierte la matriz en campos de captura para llenar
//    o cuadrar el inventario de una sola pasada por el almacén.
//  · El consumo de una OC se captura prellenado con sus materiales:
//    almacén solo corrige lo que cambió.
// ============================================================
import * as React from 'react'
import { useStore, sel, fmtDate, fmtDateShort, isDireccion, uid, INV_ROJO, INV_NARANJA, WAREHOUSE_STATUS_LABEL } from '../../core/data'
import { Modal, Field, Input, Select, Badge, Confirm, Empty, Seg, SecTitle, KPI, useUnsavedGuard } from '../../core/ui'
import { Icon } from '../../core/icons'
import { printSticker } from './sticker'
import type {
  InventoryAttr, InventoryFamily, InventoryItem, InventoryKit, InventoryMotivo, Order,
} from '../../core/types'

/** ¿Quién opera el inventario? Almacén (dueño del proceso) y administración.
 *  Dirección lo ve completo, pero en solo lectura. */
const canManageInv = (role?: string | null) =>
  role === 'almacen' || role === 'admin' || role === 'superadmin'

/** Motivos que se registran A MANO desde el modal: solo entra o sale.
 *  El conteo NO va aquí a propósito — se captura con el "Modo conteo" de la
 *  matriz, recorriendo el almacén, que es cuando de verdad se cuenta. */
const MOTIVOS: { id: InventoryMotivo; label: string; hint: string }[] = [
  { id: 'Entrada', label: 'Entrada', hint: 'Llegó material al almacén' },
  { id: 'Salida a proyecto', label: 'Salida', hint: 'Se ocupó en una obra' },
]
/** Colores del kardex. Conserva los motivos que ya no se capturan a mano
 *  (conteo y devolución) porque el historial viejo debe seguir viéndose. */
const MOTIVO_COLOR: Record<InventoryMotivo, string> = {
  'Entrada': 'var(--ok)',
  'Salida a proyecto': 'var(--acc)',
  'Ajuste por conteo': 'var(--warn)',
  'Devolución': 'var(--st-5)',
}
const NIVEL_COLOR: Record<string, string> = {
  zero: 'var(--tx-3)', low: 'var(--danger)', mid: 'var(--warn)', ok: 'var(--tx-0)',
}
/** Fondo tenue del nivel, para que la celda se lea de un vistazo. */
const NIVEL_BG: Record<string, string | undefined> = {
  zero: undefined,
  low: 'color-mix(in srgb, var(--danger) 12%, transparent)',
  mid: 'color-mix(in srgb, var(--warn) 12%, transparent)',
  ok: undefined,
}

/** Texto normalizado para buscar y para sugerir coincidencias. */
const norm = (s?: string) =>
  (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9.]+/g, ' ').trim()

/** Estados por los que se puede filtrar el inventario. */
const ESTADOS: { value: string; label: string }[] = [
  { value: '', label: 'Todas' },
  { value: 'conex', label: 'Con existencia' },
  { value: 'low', label: 'Por resurtir' },
  { value: 'sin', label: 'Sin contar' },
]

/** Texto por el que se busca una clave: nombre de la familia + sus atributos,
 *  con equivalencias incluidas (para que "8 ft" también encuentre). */
const textoDeCelda = (famName: string, r?: InventoryAttr, c?: InventoryAttr) =>
  `${famName} ${r?.label ?? ''} ${r?.sub ?? ''} ${c?.label ?? ''} ${c?.sub ?? ''}`

/** Id corto y estable a partir de una etiqueta (para los valores de atributo). */
const slug = (s: string, i: number) => {
  const base = norm(s).replace(/[^a-z0-9]+/g, '').slice(0, 10)
  return base ? `${base}${i}` : `v${i}`
}

/* ============================================================
   Registrar un movimiento de una clave
   ============================================================ */
function MoveModal({ item, onClose, readOnly }: {
  item: InventoryItem; onClose: () => void
  /** Dirección (y cualquier rol sin permiso) consulta el kardex, pero no mueve nada. */
  readOnly?: boolean
}) {
  const { state, dispatch } = useStore()
  const fam = state.invFamilies.find(f => f.id === item.familyId)
  const label = sel.invLabel(state, item)
  const [motivo, setMotivo] = React.useState<InventoryMotivo>('Entrada')
  const [cant, setCant] = React.useState('1')
  const [ref, setRef] = React.useState('')

  const n = Math.max(0, Math.round(Number(cant) || 0))
  const valido = cant.trim() !== '' && /^\d+$/.test(cant.trim())
  // La entrada suma y la salida resta. Poner la existencia en un número exacto
  // se hace con el Modo conteo de la matriz, no desde aquí.
  const resultado = motivo === 'Salida a proyecto' ? Math.max(0, item.qty - n) : item.qty + n
  const paso = (d: number) => setCant(String(Math.max(0, n + d)))

  const guardar = () => {
    if (!valido || readOnly) return
    const delta = motivo === 'Salida a proyecto' ? -n : n
    if (delta) dispatch({ type: 'INV_MOVE', itemId: item.id, motivo, delta, ...(ref.trim() ? { ref: ref.trim() } : {}) })
    onClose()
  }

  const kardex = sel.invMovesForItem(state, item.id).slice(0, 5)

  return (
    <Modal width={460} icon="pkg" title={label} sub={`Existencia actual: ${item.qty} ${fam?.unit ?? 'pza'}`}
      onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>{readOnly ? 'Cerrar' : 'Cancelar'}</button>
        <div className="flex-1"></div>
        {!readOnly && (
          <button className={'btn btn-primary' + (!valido ? ' opacity-50' : '')} disabled={!valido} onClick={guardar}>
            <Icon name="check" size={15} /> Guardar movimiento
          </button>
        )}
      </>}>

      {!readOnly && (
        <>
          <Field label="Motivo">
            <div className="grid grid-cols-2 gap-2">
              {MOTIVOS.map(m => (
                <button key={m.id} title={m.hint}
                  className={'btn justify-center ' + (motivo === m.id ? 'btn-primary' : 'btn-ghost')}
                  onClick={() => setMotivo(m.id)}>{m.label}</button>
              ))}
            </div>
          </Field>

          <div className="mt-4 flex items-center justify-center gap-3">
            <button className="icon-btn w-10 h-10" title="Menos" onClick={() => paso(-1)}><Icon name="close" size={16} /></button>
            <input className="input mono text-center font-bold" style={{ width: 110, fontSize: 22, height: 46 }}
              value={cant} inputMode="numeric" autoFocus onFocus={e => e.currentTarget.select()}
              onChange={e => setCant(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') guardar() }} />
            <button className="icon-btn w-10 h-10" title="Más" onClick={() => paso(1)}><Icon name="plus" size={16} /></button>
          </div>

          <div className="text-center mt-2.5 text-[12.5px] text-tx-2">
            Queda en <b className="mono text-tx-0">{resultado}</b>
          </div>
          {motivo === 'Salida a proyecto' && n > item.qty && (
            <div className="text-center mt-1 text-[11.5px]" style={{ color: 'var(--warn)' }}>
              Solo hay {item.qty}: la salida se recorta al saldo y queda en cero.
            </div>
          )}

          <div className="mt-4">
            <Field label="Referencia (opcional)">
              <Input value={ref} onChange={e => setRef(e.target.value)}
                placeholder={motivo === 'Entrada' ? 'OC JZ-2241, remisión del proveedor…' : 'PRY-2026-018, nota…'} />
            </Field>
          </div>
        </>
      )}

      {kardex.length > 0 && (
        <div className="mt-4">
          <div className="label-k mb-1.5">Últimos movimientos</div>
          <div className="border border-line rounded-[8px] overflow-hidden">
            {kardex.map(m => (
              <div key={m.id} className="flex items-center gap-2.5 px-3 py-2 border-b border-line-soft last:border-b-0 text-[12px]">
                <Badge color={MOTIVO_COLOR[m.motivo]}>{m.motivo === 'Salida a proyecto' ? 'Salida' : m.motivo === 'Ajuste por conteo' ? 'Conteo' : m.motivo}</Badge>
                <span className="mono font-semibold" style={{ color: m.qty > 0 ? 'var(--ok)' : 'var(--danger)' }}>{m.qty > 0 ? '+' : ''}{m.qty}</span>
                <span className="meta">quedó en {m.balance}</span>
                <span className="flex-1"></span>
                <span className="meta">{fmtDateShort((m.at || '').slice(0, 10))}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Modal>
  )
}

/* ============================================================
   Alta / ajuste de una CLAVE (nombre en listas, mínimo, borrado)
   ============================================================ */
function ItemModal({ familyId, rowId, colId, item, onClose }: {
  familyId: string; rowId?: string; colId?: string; item?: InventoryItem; onClose: () => void
}) {
  const { state, dispatch } = useStore()
  const fam = state.invFamilies.find(f => f.id === familyId)
  const esMatriz = fam ? sel.invEsMatriz(fam) : false
  const [label, setLabel] = React.useState(item?.label ?? '')
  const [sub, setSub] = React.useState(item?.sub ?? '')
  const [confirmDel, setConfirmDel] = React.useState(false)

  // Al EDITAR, la fila/columna vienen de la propia clave (no como props): si no se
  // reenvían, el guardado la dejaría sin atributos y se saldría de la cuadrícula.
  const rId = rowId ?? item?.rowId
  const cId = colId ?? item?.colId

  // Nombre repetido IGNORANDO acentos y mayúsculas: "Ancla de expansión" y
  // "Ancla de expansion" son el mismo material, y tenerlos dos veces parte la
  // existencia en dos renglones que nunca cuadran. Se bloquea el alta.
  const duplicado = !esMatriz && label.trim().length > 0 &&
    sel.invItemsForFamily(state, familyId).some(i => i.id !== item?.id && norm(i.label || '') === norm(label))
  const nombreOk = esMatriz || (label.trim().length > 0 && !duplicado)
  const guardar = (seguir = false) => {
    if (!nombreOk) return
    dispatch({
      type: 'SAVE_INV_ITEM',
      item: {
        ...(item?.id ? { id: item.id } : {}),
        familyId,
        ...(rId ? { rowId: rId } : {}), ...(cId ? { colId: cId } : {}),
        ...(esMatriz ? {} : { label: label.trim() }),
        ...(sub.trim() ? { sub: sub.trim() } : {}),
      },
    })
    // "Guardar y agregar otro": deja el formulario listo para el siguiente material
    // en vez de cerrar y volver a abrir por cada uno.
    if (seguir) { setLabel(''); setSub('') } else onClose()
  }

  const titulo = item ? 'Ajustar clave' : 'Dar de alta la clave'
  const combo = esMatriz && fam
    ? [fam.rows.find(r => r.id === (rowId ?? item?.rowId))?.label, fam.cols.find(c => c.id === (colId ?? item?.colId))?.label].filter(Boolean).join(' · ')
    : ''

  return (
    <Modal width={430} icon={item ? 'edit' : 'plus'} title={titulo} sub={combo || fam?.name} onClose={onClose}
      footer={<>
        {item && <button className="btn btn-ghost text-danger" onClick={() => setConfirmDel(true)}><Icon name="trash" size={14} /> Eliminar</button>}
        <div className="flex-1"></div>
        <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
        {!item && !esMatriz && (
          <button className={'btn btn-ghost' + (!nombreOk ? ' opacity-50' : '')} disabled={!nombreOk} onClick={() => guardar(true)}>
            Guardar y agregar otro
          </button>
        )}
        <button className={'btn btn-primary' + (!nombreOk ? ' opacity-50' : '')} disabled={!nombreOk} onClick={() => guardar(false)}>
          <Icon name="check" size={15} /> Guardar
        </button>
      </>}>
      {!esMatriz && (
        <>
          <Field label="Nombre del material">
            <Input value={label} onChange={e => setLabel(e.target.value)} placeholder="Ej. Charola, Ancla de expansión" autoFocus />
            {duplicado && (
              <div className="text-[11.5px] mt-1.5" style={{ color: 'var(--warn)' }}>
                Ya existe un material con ese nombre en esta familia (no importan acentos ni
                mayúsculas). Usa el que ya está en vez de crear otro: si no, la existencia
                queda partida en dos y nunca cuadra.
              </div>
            )}
          </Field>
          <div className="mt-3.5">
            <Field label="Detalle (opcional)"><Input value={sub} onChange={e => setSub(e.target.value)} placeholder='Ej. 1/2" x 4", calibre 22' /></Field>
          </div>
        </>
      )}
      <div className="meta mt-3.5">
        La alarma es igual para todo el inventario: <b style={{ color: 'var(--danger)' }}>{INV_ROJO} o menos en rojo</b>,
        {' '}<b style={{ color: 'var(--warn)' }}>{INV_NARANJA} o menos en naranja</b>.
      </div>
      {!item && (
        <div className="meta mt-3">La clave nace en <b>cero</b>. La existencia se captura con un movimiento o en modo conteo.</div>
      )}
      {confirmDel && item && (
        <Confirm title="Eliminar la clave"
          message={`¿Quitar "${sel.invLabel(state, item)}" del catálogo? Su historial de movimientos se conserva, pero deja de aparecer en el inventario.`}
          onConfirm={() => { dispatch({ type: 'DELETE_INV_ITEM', id: item.id }); onClose() }}
          onClose={() => setConfirmDel(false)} />
      )}
    </Modal>
  )
}

/* ============================================================
   Alta / edición de FAMILIA
   Se arranca por la pregunta concreta —¿este material se distingue por dos
   medidas o solo por su nombre?— y de ahí se derivan los campos. Nada de
   "atributos de fila y columna": eso es lenguaje de base de datos, no de
   almacén. Los valores se capturan uno por renglón (lo más rápido para cargar
   doce de golpe) y una vista previa muestra cómo va a quedar la tabla, para no
   tener que imaginársela.
   ============================================================ */
const attrsToText = (a: InventoryAttr[]) =>
  a.map(x => (x.sub ? `${x.label} | ${x.sub}` : x.label)).join('\n')
const textToAttrs = (t: string, prev: InventoryAttr[]): InventoryAttr[] => {
  const usados = new Set<string>()
  return t.split('\n').map(l => l.trim()).filter(Boolean).map((l, i) => {
    const [label, sub] = l.split('|').map(x => x.trim())
    // Conserva el id del valor para que las claves ya capturadas no se despeguen
    // de su fila/columna al editar la familia. La comparación IGNORA acentos y
    // mayúsculas: corregir "Escalon" a "Escalón" es una corrección de dedo, no
    // una medida nueva, y no debe dejar la existencia colgando.
    const old = prev.find(p => norm(p.label) === norm(label) && !usados.has(p.id))
    let id = old?.id ?? slug(label, i)
    // Dos renglones que normalizan igual no pueden compartir id (rompería la matriz).
    if (usados.has(id)) id = `${slug(label, i)}x${i}`
    usados.add(id)
    return { id, label, ...(sub ? { sub } : {}) }
  })
}

function FamilyModal({ family, onClose }: { family?: InventoryFamily; onClose: () => void }) {
  const { state, dispatch } = useStore()
  const [name, setName] = React.useState(family?.name ?? '')
  const [unit, setUnit] = React.useState(family?.unit ?? 'pza')
  // 'medidas' = cuadrícula de dos medidas · 'lista' = se distingue solo por nombre
  const [tipo, setTipo] = React.useState<'medidas' | 'lista'>(
    family ? (sel.invEsMatriz(family) ? 'medidas' : 'lista') : 'medidas')
  const [rowLabel, setRowLabel] = React.useState(family?.rowLabel ?? '')
  const [colLabel, setColLabel] = React.useState(family?.colLabel ?? '')
  const [rowsTxt, setRowsTxt] = React.useState(attrsToText(family?.rows ?? []))
  const [colsTxt, setColsTxt] = React.useState(attrsToText(family?.cols ?? []))
  const [confirmDel, setConfirmDel] = React.useState(false)
  const snapshot = { name, unit, tipo, rowLabel, colLabel, rowsTxt, colsTxt }
  const { requestClose, guard } = useUnsavedGuard(snapshot, onClose)

  const rows = textToAttrs(rowsTxt, family?.rows ?? [])
  const cols = textToAttrs(colsTxt, family?.cols ?? [])
  const esMedidas = tipo === 'medidas'
  // Con dos medidas hace falta al menos un valor de cada lado: si no, la familia
  // se guardaría como cuadrícula y se dibujaría como lista — a medias y confuso.
  const valido = name.trim().length > 0 && (!esMedidas || (rows.length > 0 && cols.length > 0))
  const claves = family ? sel.invItemsForFamily(state, family.id).length : 0

  /* ---- Aviso: medidas CON EXISTENCIA que van a quedar fuera de la cuadrícula ----
     Renombrar un valor no es renombrar: para el sistema es borrar una medida y
     crear otra, así que sus claves se despegan. Antes esto pasaba en silencio y
     la existencia aparecía después en el bloque ámbar de la vista. */
  const idsRow = new Set(rows.map(r => r.id))
  const idsCol = new Set(cols.map(c => c.id))
  const perdidas = new Map<string, { label: string; pzas: number }>()
  if (family && esMedidas) {
    const anota = (id: string, label: string, pzas: number) => {
      const e = perdidas.get(id) ?? { label, pzas: 0 }
      e.pzas += pzas
      perdidas.set(id, e)
    }
    for (const i of sel.invItemsForFamily(state, family.id)) {
      if (i.qty <= 0) continue
      if (i.rowId && !idsRow.has(i.rowId)) anota(i.rowId, family.rows.find(r => r.id === i.rowId)?.label ?? i.rowId, i.qty)
      if (i.colId && !idsCol.has(i.colId)) anota(i.colId, family.cols.find(c => c.id === i.colId)?.label ?? i.colId, i.qty)
    }
  }
  const enRiesgo = [...perdidas.values()]

  const guardar = () => {
    if (!valido) return
    dispatch({
      type: 'SAVE_INV_FAMILY',
      family: {
        ...(family?.id ? { id: family.id } : {}),
        ...(family?.position != null ? { position: family.position } : {}),
        name: name.trim(), unit: unit.trim() || 'pza',
        ...(esMedidas && rowLabel.trim() ? { rowLabel: rowLabel.trim() } : {}),
        ...(esMedidas && colLabel.trim() ? { colLabel: colLabel.trim() } : {}),
        rows: esMedidas ? rows : [],
        cols: esMedidas ? cols : [],
      },
    })
    onClose()
  }

  /** Botón de la decisión de arranque: qué es, con ejemplo, y cómo se verá. */
  const opcion = (id: 'medidas' | 'lista', titulo: string, ejemplo: string, resultado: string) => (
    <button type="button" onClick={() => setTipo(id)}
      className={'text-left p-3 rounded-[8px] border cursor-pointer transition-colors ' + (tipo === id ? 'border-acc' : 'border-line')}
      style={{ background: tipo === id ? 'var(--acc-ghost)' : 'var(--bg-1)' }}>
      <div className="flex items-center gap-2">
        <Icon name={id === 'medidas' ? 'grid' : 'list'} size={15} style={{ color: tipo === id ? 'var(--acc)' : 'var(--tx-2)' }} />
        <span className="font-semibold text-[13px]">{titulo}</span>
      </div>
      <div className="meta mt-1">{ejemplo}</div>
      <div className="meta mt-0.5" style={{ color: tipo === id ? 'var(--acc)' : undefined }}>{resultado}</div>
    </button>
  )

  return (
    <Modal width={640} icon={family ? 'edit' : 'plus'} title={family ? 'Editar familia' : 'Nueva familia'}
      sub={family ? family.name : 'Un grupo de material que se maneja igual'}
      onClose={requestClose}
      footer={<>
        {family && <button className="btn btn-ghost text-danger" onClick={() => setConfirmDel(true)}><Icon name="trash" size={14} /> Eliminar familia</button>}
        <div className="flex-1"></div>
        <button className="btn btn-ghost" onClick={requestClose}>Cancelar</button>
        <button className={'btn btn-primary' + (!valido ? ' opacity-50' : '')} disabled={!valido} onClick={guardar}>
          <Icon name="check" size={15} /> Guardar familia
        </button>
      </>}>

      <div className="grid grid-cols-[2fr_1fr] gap-3.5">
        <Field label="Nombre de la familia"><Input value={name} onChange={e => setName(e.target.value)} placeholder="Ej. Vigas selectivas" autoFocus /></Field>
        <Field label="Se cuenta en">
          <Select value={unit} onChange={e => setUnit(e.target.value)}>
            {['pza', 'm', 'kg', 'caja', 'rollo', 'tramo'].map(u => <option key={u} value={u}>{u}</option>)}
          </Select>
        </Field>
      </div>

      <div className="mt-4">
        <div className="label-k mb-2">¿Cómo se distingue un material de otro?</div>
        <div className="grid grid-cols-2 gap-2.5">
          {opcion('medidas', 'Por dos medidas', 'Ej. peralte y longitud', 'Se ve como cuadrícula')}
          {opcion('lista', 'Solo por su nombre', 'Ej. anclas, charolas', 'Se ve como lista')}
        </div>
      </div>

      {esMedidas ? (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3.5">
            <div>
              <Field label="Primera medida"><Input value={rowLabel} onChange={e => setRowLabel(e.target.value)} placeholder="Ej. Peralte" /></Field>
              <div className="mt-2">
                <textarea className="textarea mono" rows={6} value={rowsTxt} onChange={e => setRowsTxt(e.target.value)}
                  placeholder={'4.0"\n4.5"\n5.0"'} style={{ fontSize: 12 }} />
              </div>
              <div className="meta mt-1">{rows.length} valor{rows.length === 1 ? '' : 'es'}</div>
            </div>
            <div>
              <Field label="Segunda medida"><Input value={colLabel} onChange={e => setColLabel(e.target.value)} placeholder="Ej. Longitud" /></Field>
              <div className="mt-2">
                <textarea className="textarea mono" rows={6} value={colsTxt} onChange={e => setColsTxt(e.target.value)}
                  placeholder={'2336.8 | 92 in\n2438.4 | 8 ft'} style={{ fontSize: 12 }} />
              </div>
              <div className="meta mt-1">{cols.length} valor{cols.length === 1 ? '' : 'es'}</div>
            </div>
          </div>
          <div className="meta mt-2">
            Un valor por renglón. Con <b className="mono">|</b> le agregas la equivalencia
            (<span className="mono">2438.4 | 8 ft</span>) y aparece chiquita debajo.
          </div>

          {enRiesgo.length > 0 && (
            <div className="flex items-start gap-3 mt-3 p-3 rounded-[8px] border"
              style={{ borderColor: 'var(--warn)', background: 'color-mix(in srgb, var(--warn) 10%, transparent)' }}>
              <Icon name="alert" size={18} className="mt-0.5 flex-none" style={{ color: 'var(--warn)' }} />
              <div className="text-[12.5px] text-tx-2 flex-1">
                <b style={{ color: 'var(--warn)' }}>
                  {enRiesgo.length} medida{enRiesgo.length === 1 ? '' : 's'} con existencia
                  {enRiesgo.length === 1 ? ' va' : ' van'} a quedar fuera de la cuadrícula.
                </b>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {enRiesgo.map(p => (
                    <span key={p.label} className="badge" style={{ color: 'var(--warn)' }}>
                      {p.label} · <b className="mono">{p.pzas}</b> pza
                    </span>
                  ))}
                </div>
                <div className="mt-2">
                  Cambiarle el texto a una medida no la renombra: para el sistema es <b>borrar una y
                  crear otra</b>, así que su existencia se despega. No se pierde —sale en un bloque
                  ámbar debajo de la tabla— pero deja de contar en la cuadrícula. Si solo querías
                  corregir el texto, considera dejarlo como está.
                </div>
              </div>
            </div>
          )}

          {/* Vista previa: vuelve concreto lo que si no habría que imaginarse. */}
          {rows.length > 0 && cols.length > 0 && (
            <div className="mt-4">
              <div className="label-k mb-1.5">Así se va a ver</div>
              <div className="border border-line rounded-[8px] overflow-x-auto">
                <table className="tbl tbl-matrix" style={{ minWidth: 320 }}>
                  <thead>
                    {colLabel.trim() && (
                      <tr>
                        <th rowSpan={2} style={{ minWidth: 110 }}>{rowLabel || 'Medida'}</th>
                        <th colSpan={Math.min(cols.length, 4) + (cols.length > 4 ? 1 : 0)} style={{ textAlign: 'center' }}>{colLabel}</th>
                      </tr>
                    )}
                    <tr>
                      {!colLabel.trim() && <th style={{ minWidth: 110 }}>{rowLabel || 'Medida'}</th>}
                      {cols.slice(0, 4).map(c => (
                        <th key={c.id} className="num" style={{ textAlign: 'center' }}>
                          {c.label}{c.sub && <div className="meta" style={{ fontWeight: 400 }}>{c.sub}</div>}
                        </th>
                      ))}
                      {cols.length > 4 && <th className="meta">+{cols.length - 4}</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 4).map(r => (
                      <tr key={r.id} style={{ cursor: 'default' }}>
                        <td className="text-[12.5px] font-semibold">{r.label}{r.sub && <div className="meta">{r.sub}</div>}</td>
                        {cols.slice(0, 4).map(c => <td key={c.id} className="text-center text-tx-3">·</td>)}
                        {cols.length > 4 && <td></td>}
                      </tr>
                    ))}
                    {rows.length > 4 && (
                      <tr style={{ cursor: 'default' }}>
                        <td className="meta">+{rows.length - 4} más</td>
                        {cols.slice(0, 4).map(c => <td key={c.id}></td>)}
                        {cols.length > 4 && <td></td>}
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="meta mt-1.5">
                {rows.length * cols.length} combinaciones. Las llenas desde la vista, con el
                <b> Modo conteo</b> o dándolas de alta una por una.
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="meta mt-4 leading-[1.6]">
          Vas a poder agregar materiales por nombre con el botón <b>Material</b>, cada uno con su
          detalle opcional (calibre, medida, color…).
        </div>
      )}

      {confirmDel && family && (
        <Confirm title="Eliminar la familia"
          message={`Se elimina "${family.name}"${claves ? ` y sus ${claves} clave${claves === 1 ? '' : 's'} con todo y existencia` : ''}. El kardex se conserva pero deja de mostrarse. ¿Continuar?`}
          onConfirm={() => { dispatch({ type: 'DELETE_INV_FAMILY', id: family.id }); onClose() }}
          onClose={() => setConfirmDel(false)} />
      )}
      {guard}
    </Modal>
  )
}

/* ============================================================
   Buscador de claves (para "Entrada" desde la barra superior)
   ============================================================ */
function PickItemModal({ onPick, onPickKit, onClose, title = '¿Qué material entró?', sub = 'Busca la clave y registra el movimiento' }: {
  onPick: (item: InventoryItem) => void
  /** Si viene, el buscador también ofrece los PAQUETES (kits). */
  onPickKit?: (kit: InventoryKit) => void
  onClose: () => void
  title?: string
  sub?: string
}) {
  const { state } = useStore()
  const [q, setQ] = React.useState('')
  const palabras = norm(q).split(' ').filter(Boolean)
  const kits = onPickKit
    ? sel.invKits(state).filter(k => palabras.every(w => norm(k.name).includes(w)))
    : []
  const lista = state.invItems
    .map(i => ({ i, label: sel.invLabel(state, i), fam: state.invFamilies.find(f => f.id === i.familyId) }))
    // Por palabras y no por texto contiguo: "viga 4.5" debe encontrar
    // "Viga escalón 4.5"". El nombre de la familia también cuenta.
    .filter(x => {
      if (!palabras.length) return true
      const heno = norm(`${x.fam?.name ?? ''} ${x.label} ${x.i.sub ?? ''}`)
      return palabras.every(w => heno.includes(w))
    })
    .sort((a, b) => a.label.localeCompare(b.label, 'es', { numeric: true }))
    .slice(0, 40)

  return (
    <Modal width={520} icon="search" title={title} sub={sub} onClose={onClose}
      footer={<><div className="flex-1"></div><button className="btn btn-ghost" onClick={onClose}>Cerrar</button></>}>
      <Input value={q} onChange={e => setQ(e.target.value)} placeholder="viga 4.5, marco 3000, ancla…" autoFocus />
      <div className="mt-3 flex flex-col gap-1 max-h-[320px] overflow-y-auto">
        {kits.map(k => (
          // Los paquetes van arriba: al elegir uno entran todas sus piezas de un golpe.
          <button key={k.id} className="flex items-center gap-3 px-3 py-2.5 rounded-[8px] border border-transparent hover:border-line hover:bg-bg-3 text-left cursor-pointer bg-transparent"
            onClick={() => onPickKit!(k)}>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] flex items-center gap-2">{k.name} <Badge color="var(--acc)">Paquete</Badge></div>
              <div className="meta truncate">{sel.invKitDesc(state, k)}</div>
            </div>
            <span className="mono text-[12.5px] text-tx-2" title="Paquetes que se pueden armar con la existencia">{sel.invKitArmables(state, k)} arm.</span>
          </button>
        ))}
        {lista.length === 0 && kits.length === 0
          ? <Empty icon="search">Nada con ese nombre. En la matriz, el <b>+</b> gris da de alta la medida nueva.</Empty>
          : lista.map(({ i, label, fam }) => {
            return (
              <button key={i.id} className="flex items-center gap-3 px-3 py-2.5 rounded-[8px] border border-transparent hover:border-line hover:bg-bg-3 text-left cursor-pointer bg-transparent"
                onClick={() => onPick(i)}>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px]">{label}</div>
                  {i.sub && <div className="meta">{i.sub}</div>}
                </div>
                <span className="mono text-[12.5px]" style={{ color: NIVEL_COLOR[sel.invNivel(i)] }}>{i.qty} {fam?.unit ?? ''}</span>
              </button>
            )
          })}
      </div>
    </Modal>
  )
}

/* ============================================================
   Paquete (kit): nombre + piezas que lo forman
   ============================================================ */
function KitModal({ kit, onClose }: { kit?: InventoryKit; onClose: () => void }) {
  const { state, dispatch } = useStore()
  const [name, setName] = React.useState(kit?.name ?? '')
  const [comps, setComps] = React.useState<{ itemId: string; qty: number }[]>(kit?.components ?? [])
  const [picking, setPicking] = React.useState(false)
  const [confirmDel, setConfirmDel] = React.useState(false)
  const { requestClose, guard } = useUnsavedGuard({ name, comps }, onClose)
  // Mismo nombre normalizado que otro paquete → en el consumo empatarían y ganaría uno al azar.
  const duplicado = sel.invKits(state).some(k => k.id !== kit?.id && norm(k.name) === norm(name))
  const valid = !!name.trim() && !duplicado && comps.length > 0
    && comps.every(c => c.qty > 0 && state.invItems.some(i => i.id === c.itemId))

  const setQty = (itemId: string, qty: number) =>
    setComps(cs => cs.map(c => c.itemId === itemId ? { ...c, qty: Math.max(0, Math.round(qty)) } : c))
  const agregar = (item: InventoryItem) => {
    setPicking(false)
    setComps(cs => cs.some(c => c.itemId === item.id) ? cs : [...cs, { itemId: item.id, qty: 1 }])
  }
  const save = () => {
    if (!valid) return
    dispatch({ type: 'SAVE_INV_KIT', kit: { ...(kit ?? {}), name: name.trim(), components: comps } })
    onClose()
  }

  return (
    <Modal width={560} icon="layers" title={kit ? 'Editar paquete' : 'Nuevo paquete'}
      sub="Un paquete no tiene existencia propia: al descontarlo se descuentan sus piezas" onClose={requestClose}
      footer={<>
        {kit && <button className="btn btn-ghost" style={{ color: 'var(--danger)' }} onClick={() => setConfirmDel(true)}><Icon name="trash" size={14} /> Eliminar</button>}
        <div className="flex-1"></div>
        <button className="btn btn-ghost" onClick={requestClose}>Cancelar</button>
        <button className={'btn btn-primary' + (!valid ? ' opacity-50' : '')} disabled={!valid} onClick={save}><Icon name="check" size={15} /> Guardar</button>
      </>}>
      <Field label="Nombre del paquete"><Input value={name} onChange={e => setName(e.target.value)} placeholder="Ej. Nivel Mini" autoFocus /></Field>
      <div className="meta mt-1.5 mb-4">
        {duplicado
          ? <span style={{ color: 'var(--danger)' }}>Ya hay un paquete con ese nombre.</span>
          : 'El nombre es lo que se compara con las partidas de la OC: “Nivel Mini” reconoce “NIVEL · MINIRACK · ESTANDAR”.'}
      </div>
      <div className="label-k mb-1.5">Piezas por paquete</div>
      {comps.length === 0
        ? <Empty icon="box">Agrega las piezas que forman UN paquete (ej. 2 charolas + 2 vigas).</Empty>
        : (
          <div className="border border-line rounded-[8px] overflow-hidden">
            <table className="tbl">
              <thead><tr><th>Pieza</th><th className="num">Existencia</th><th className="num">Cantidad</th><th></th></tr></thead>
              <tbody>
                {comps.map(c => {
                  const it = state.invItems.find(i => i.id === c.itemId)
                  return (
                    <tr key={c.itemId} style={{ cursor: 'default' }}>
                      <td className="text-[12.5px]">{it ? sel.invLabel(state, it) : <span style={{ color: 'var(--danger)' }}>clave eliminada — quítala para poder guardar</span>}</td>
                      <td className="num text-tx-2 text-[12px]">{it?.qty ?? '—'}</td>
                      <td className="num">
                        <input className="input mono text-center" style={{ width: 62, padding: '4px 2px' }} value={c.qty}
                          inputMode="numeric" onChange={e => setQty(c.itemId, Number(e.target.value) || 0)} />
                      </td>
                      <td><button className="icon-btn w-7 h-7" title="Quitar" onClick={() => setComps(cs => cs.filter(x => x.itemId !== c.itemId))}><Icon name="trash" size={13} /></button></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      <button className="btn btn-ghost mt-3" onClick={() => setPicking(true)}><Icon name="plus" size={14} /> Agregar pieza</button>
      {picking && <PickItemModal title="¿Qué pieza lleva el paquete?" sub="Busca la clave de inventario" onPick={agregar} onClose={() => setPicking(false)} />}
      {confirmDel && kit && (
        <Confirm title="Eliminar paquete" message={`¿Eliminar el paquete "${kit.name}"? No afecta la existencia de sus piezas.`}
          onConfirm={() => { dispatch({ type: 'DELETE_INV_KIT', id: kit.id }); onClose() }} onClose={() => setConfirmDel(false)} />
      )}
      {guard}
    </Modal>
  )
}

/* ============================================================
   Consumo de una OC: qué material se ocupó de verdad
   ============================================================ */
/** Qué tanto coincide un nombre (sus palabras) con el texto de una partida.
 *  `score` = cuántas palabras aparecen (decide si hay coincidencia).
 *  `orden` = cuántas aparecen EN EL MISMO ORDEN (solo desempata). Sin esto,
 *  una parrilla de 46x42 y una de 42x46 puntúan idéntico —las dos palabras
 *  están en el texto— y se elegía por azar. */
function coincidencia(tokens: string[], heno: string) {
  let sueltas = 0, enOrden = 0, pos = 0
  for (const t of tokens) {
    if (heno.includes(t)) sueltas++
    const i = heno.indexOf(t, pos)
    if (i >= 0) { enOrden++; pos = i + t.length }
  }
  return { score: sueltas / tokens.length, orden: enOrden / tokens.length }
}
const tokensDe = (s: string) => norm(s).split(' ').filter(t => t.length > 1)
/** Piezas de un paquete cuya clave sigue existiendo (los paquetes no tienen FK: una clave
 *  borrada dejaría líneas fantasma que inflan el total y luego no se descuentan). */
const piezasVivas = (state: ReturnType<typeof useStore>['state'], kit: InventoryKit) =>
  kit.components.filter(c => state.invItems.some(i => i.id === c.itemId))
const mejor = <T,>(a: T & { score: number; orden: number } | null, b: T & { score: number; orden: number }) =>
  (b.score >= 0.6 && (!a || b.score > a.score || (b.score === a.score && b.orden > a.orden))) ? b : a

/** Sugiere qué descontar a partir de los materiales de la OC. Es una AYUDA:
 *  almacén revisa y corrige. Por cada partida prueba primero los PAQUETES
 *  (p. ej. "Nivel Mini" = 2 charolas + 2 vigas): si coincide, la partida se
 *  descompone en sus piezas. Si no, busca la clave suelta de mayor coincidencia.
 *  Devuelve también `porPartida`: con qué quedó cada renglón de la OC —id de
 *  clave, 'kit:<id>' o null—, que es lo que permite avisar qué NO se descuenta. */
function sugerirLineas(state: ReturnType<typeof useStore>['state'], order: Order) {
  const claves = state.invItems.map(i => ({ id: i.id, tokens: tokensDe(sel.invLabel(state, i) + ' ' + (i.sub || '')) })).filter(c => c.tokens.length)
  const kits = state.invKits.map(k => ({ kit: k, tokens: tokensDe(k.name) })).filter(c => c.tokens.length)
  const lineas: { itemId: string; qty: number }[] = []
  const porPartida: (string | null)[] = []
  // Una misma clave puede venir en VARIAS partidas de la OC (renglones partidos
  // o dos paquetes que comparten pieza). Se SUMAN: descartar la segunda
  // descontaría de menos y en silencio, que es el peor error de inventario.
  const sumar = (itemId: string, qty: number) => {
    const ya = lineas.find(o => o.itemId === itemId)
    if (ya) ya.qty += qty
    else lineas.push({ itemId, qty })
  }
  for (const p of order.items ?? []) {
    const heno = norm([p.parte, p.material, p.description, p.dimensiones, p.color].filter(Boolean).join(' '))
    let kit: { kit: InventoryKit; score: number; orden: number } | null = null
    for (const c of kits) kit = mejor(kit, { kit: c.kit, ...coincidencia(c.tokens, heno) })
    let clave: { id: string; score: number; orden: number } | null = null
    for (const c of claves) clave = mejor(clave, { id: c.id, ...coincidencia(c.tokens, heno) })
    // El paquete gana en empate: "Nivel Mini" describe mejor "NIVEL MINIRACK" que "Marco Mini".
    if (kit && (!clave || kit.score >= clave.score)) {
      porPartida.push(`kit:${kit.kit.id}`)
      for (const c of piezasVivas(state, kit.kit)) sumar(c.itemId, (p.qty || 0) * c.qty)
    } else if (clave) {
      porPartida.push(clave.id)
      sumar(clave.id, p.qty || 0)
    } else {
      porPartida.push(null)
    }
  }
  return { lineas, porPartida }
}

export function ConsumoModal({ order, onClose, onSaved }: {
  order: Order
  onClose: () => void
  /** Se llama SOLO si se guardó el consumo (no al cancelar). Lo usa Almacén
   *  para marcar la OC como lista en cuanto queda descontado el material. */
  onSaved?: () => void
}) {
  const { state, dispatch } = useStore()
  const proj = order.projectId ? state.projects.find(p => p.id === order.projectId) : undefined
  const partidas = order.items ?? []
  // La sugerencia se calcula UNA sola vez, al abrir; de ahí en adelante manda el usuario.
  const [sug] = React.useState(() => sugerirLineas(state, order))
  const [lineas, setLineas] = React.useState<{ itemId: string; qty: number; plan: number }[]>(() =>
    sug.lineas.map(l => ({ itemId: l.itemId, qty: l.qty, plan: l.qty })))
  // Partidas de la OC que el usuario vinculó a mano: índice de la partida → clave.
  const [vinculadas, setVinculadas] = React.useState<Record<number, string>>({})
  // null = cerrado · 'libre' = agregar material suelto · { idx } = vincular esa partida
  const [picking, setPicking] = React.useState<'libre' | { idx: number } | null>(null)
  const enKardex = sel.invConsumoEnKardex(state, order.id)
  const soloManual = !enKardex && !!order.consumoManual

  /** Con qué quedó cubierta una partida de la OC: id de clave, 'kit:<id>' o null. Si la persona
   *  quitó esa línea del consumo, la partida vuelve a contar como NO cubierta. */
  const cubierta = (idx: number) => {
    const id = vinculadas[idx] ?? sug.porPartida[idx] ?? null
    if (!id) return null
    const activa = (itemId: string) => lineas.some(l => l.itemId === itemId && l.qty > 0)
    if (id.startsWith('kit:')) {
      const k = state.invKits.find(x => x.id === id.slice(4))
      return k && k.components.some(c => activa(c.itemId)) ? id : null
    }
    return activa(id) ? id : null
  }
  const sinReconocer = partidas.map((_, i) => i).filter(i => !cubierta(i))
  const piezasSinReconocer = sinReconocer.reduce((a, i) => a + (partidas[i]?.qty || 0), 0)

  const setQty = (itemId: string, q: number) =>
    setLineas(ls => ls.map(l => l.itemId === itemId ? { ...l, qty: Math.max(0, q) } : l))
  const quitar = (itemId: string) => setLineas(ls => ls.filter(l => l.itemId !== itemId))
  /** Suma (o da de alta) el renglón de consumo de esa clave. `plan` = también
   *  cuenta como planeado (viene de una partida de la OC); si no, es material suelto. */
  const sumarLinea = (itemId: string, qty: number, plan = true) =>
    setLineas(ls => {
      const ya = ls.find(l => l.itemId === itemId)
      if (ya) return ls.map(l => l.itemId === itemId ? { ...l, qty: l.qty + qty, plan: l.plan + (plan ? qty : 0) } : l)
      return [...ls, { itemId, qty, plan: plan ? qty : 0 }]
    })
  const agregar = (item: InventoryItem) => {
    const modo = picking
    setPicking(null)
    if (modo && modo !== 'libre') {
      // Vincular una partida concreta: entra con SU cantidad planeada.
      setVinculadas(v => ({ ...v, [modo.idx]: item.id }))
      sumarLinea(item.id, partidas[modo.idx]?.qty || 0)
      return
    }
    sumarLinea(item.id, 1, false)   // suelto: suma 1 (igual que un paquete suelto suma sus piezas)
  }
  /** Un paquete entra como todas sus piezas: × la cantidad de la partida al
   *  vincular, o × 1 si se agrega suelto. */
  const agregarKit = (kit: InventoryKit) => {
    const modo = picking
    setPicking(null)
    const vinculo = modo && modo !== 'libre' ? modo : null
    const veces = vinculo ? (partidas[vinculo.idx]?.qty || 0) : 1
    if (vinculo) setVinculadas(v => ({ ...v, [vinculo.idx]: `kit:${kit.id}` }))
    for (const c of piezasVivas(state, kit)) sumarLinea(c.itemId, veces * c.qty, !!vinculo)
  }
  const igualarPlan = () => setLineas(ls => ls.map(l => ({ ...l, qty: l.plan })))

  const totales = lineas.reduce((a, l) => a + l.qty, 0)
  // Si ninguna clave tiene existencia, el reducer no escribe nada: no hay que dar la OC por resuelta.
  const descontable = lineas.some(l => l.qty > 0 && (state.invItems.find(i => i.id === l.itemId)?.qty ?? 0) > 0)
  const guardar = () => {
    const utiles = lineas.filter(l => l.qty > 0)
    if (!utiles.length || !descontable) return
    dispatch({
      type: 'INV_CONSUMO',
      orderId: order.id,
      ...(order.projectId ? { projectId: order.projectId } : {}),
      ref: proj ? proj.code : order.number,
      lines: utiles.map(l => ({ itemId: l.itemId, qty: l.qty })),
    })
    onSaved?.()
    onClose()
  }
  /** Cierra la OC sin descontar: el material ya se registró a mano (o no pasa por el inventario). */
  const cerrarManual = () => {
    dispatch({ type: 'SET_ORDER_CONSUMO_MANUAL', id: order.id, manual: true })
    onSaved?.()
    onClose()
  }

  return (
    <Modal width={760} icon="pkg" title={`Consumo · OC ${order.number}`}
      sub={proj ? `${proj.code} · ${sel.clientName(state, proj.client)}` : 'Sin proyecto'}
      onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" onClick={() => setPicking('libre')}><Icon name="plus" size={14} /> Agregar material</button>
        <button className="btn btn-ghost" disabled={!lineas.some(l => l.plan > 0)} onClick={igualarPlan}>Usé lo planeado</button>
        {!enKardex && !order.consumoManual && (
          <button className="btn btn-ghost" title="Cierra esta OC sin descontar nada: el material ya se registró a mano o no pasa por el inventario"
            onClick={cerrarManual}><Icon name="check" size={14} /> Capturado a mano</button>
        )}
        <div className="flex-1"></div>
        <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
        <button className={'btn btn-primary' + (totales <= 0 || !descontable ? ' opacity-50' : '')} disabled={totales <= 0 || !descontable} onClick={guardar}
          title={totales > 0 && !descontable ? 'Ninguna de estas claves tiene existencia: no hay nada que descontar' : undefined}>
          <Icon name="check" size={15} /> Descontar {totales} pza
        </button>
      </>}>

      {(enKardex || soloManual) && (
        <div className="flex items-start gap-3 mb-4 p-3 rounded-[8px] border" style={{ borderColor: 'var(--warn)', background: 'color-mix(in srgb, var(--warn) 10%, transparent)' }}>
          <Icon name="alert" size={18} className="mt-0.5 flex-none" style={{ color: 'var(--warn)' }} />
          <div className="text-[12.5px] text-tx-2">
            {enKardex ? <>
              Esta OC <b>ya tiene consumo capturado</b>. Si guardas otra vez, el material se descuenta de nuevo.
              Úsalo solo para registrar material adicional que se ocupó después.
            </> : <>
              Esta OC se marcó como <b>resuelta a mano</b>: en el sistema no se ha descontado nada.
              Si guardas aquí, el material se descuenta por primera vez.
            </>}
          </div>
        </div>
      )}

      <div className="flex items-start gap-3 mb-4 p-3 rounded-[8px]" style={{ background: 'var(--acc-ghost)', border: '1px solid color-mix(in srgb, var(--acc) 30%, transparent)' }}>
        <Icon name="pkg" size={17} className="mt-0.5 flex-none text-acc" />
        <div className="text-[12.5px] text-tx-1">
          Viene prellenado con lo que traía la orden de compra. <b>Corrige solo lo que haya cambiado</b>
          {' '}—si sobró material o se ocupó de más— y guarda.
        </div>
      </div>

      {/* Lo que NO se va a descontar, dicho antes de apretar el botón. */}
      {sinReconocer.length > 0 && (
        <div className="flex items-start gap-3 mb-4 p-3 rounded-[8px] border"
          style={{ borderColor: 'var(--warn)', background: 'color-mix(in srgb, var(--warn) 10%, transparent)' }}>
          <Icon name="alert" size={18} className="mt-0.5 flex-none" style={{ color: 'var(--warn)' }} />
          <div className="text-[12.5px] text-tx-2 flex-1">
            <b style={{ color: 'var(--warn)' }}>
              {sinReconocer.length} de {partidas.length} materiales de la OC no están en el inventario
              {piezasSinReconocer > 0 ? ` (${piezasSinReconocer} pza)` : ''}.
            </b>
            {' '}Esos <b>no se van a descontar</b>. Abajo, en la lista de la OC, vienen marcados: si la clave
            ya existe y solo no la reconoció, dale <b>Vincular</b>; si de plano no está en el catálogo, hay que
            darla de alta primero en su familia.
          </div>
        </div>
      )}

      {lineas.length === 0 ? (
        <Empty icon="box">
          No se reconoció ningún material de la OC en el catálogo. Agrégalos con “Agregar material”.
        </Empty>
      ) : (
        <div className="border border-line rounded-[8px] overflow-hidden">
          <table className="tbl">
            <thead><tr><th>Material</th><th className="num">Existencia</th><th className="num">Planeado</th><th className="num">Usado</th><th className="num">Dif.</th><th></th></tr></thead>
            <tbody>
              {lineas.map(l => {
                const item = state.invItems.find(i => i.id === l.itemId)
                if (!item) return null
                const dif = l.qty - l.plan
                const falta = l.qty > item.qty
                return (
                  <tr key={l.itemId} style={{ cursor: 'default' }}>
                    <td className="text-[12.5px]">{sel.invLabel(state, item)}</td>
                    <td className="num text-[12px]" style={{ color: falta ? 'var(--danger)' : 'var(--tx-2)' }}>{item.qty}</td>
                    <td className="num text-tx-2 text-[12px]">{l.plan || '—'}</td>
                    <td className="num">
                      <div className="inline-flex items-center gap-1">
                        <button className="icon-btn w-7 h-7" onClick={() => setQty(l.itemId, l.qty - 1)}><Icon name="close" size={12} /></button>
                        <input className="input mono text-center" style={{ width: 62, padding: '4px 2px' }} value={l.qty}
                          inputMode="numeric" onChange={e => setQty(l.itemId, Math.round(Number(e.target.value) || 0))} />
                        <button className="icon-btn w-7 h-7" onClick={() => setQty(l.itemId, l.qty + 1)}><Icon name="plus" size={12} /></button>
                      </div>
                    </td>
                    <td className="num text-[12px]" style={{ color: dif === 0 ? 'var(--tx-3)' : dif > 0 ? 'var(--warn)' : 'var(--acc)', fontWeight: dif === 0 ? 400 : 600 }}>
                      {dif === 0 ? '—' : `${dif > 0 ? '+' : ''}${dif}`}
                    </td>
                    <td><button className="icon-btn w-7 h-7" title="Quitar del consumo" onClick={() => quitar(l.itemId)}><Icon name="trash" size={13} /></button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {(order.items?.length ?? 0) > 0 && (
        <div className="mt-4">
          <div className="label-k mb-1.5">Materiales de la OC ({order.items!.length}) — referencia</div>
          <div className="border border-line rounded-[8px] overflow-hidden max-h-[190px] overflow-y-auto">
            {order.items!.map((it, idx) => {
              // Cada partida dice si quedó cubierta o no. Lo que no se reconoce
              // NO se descuenta, así que tiene que verse aquí, no adivinarse.
              const claveId = cubierta(idx)
              const kit = claveId?.startsWith('kit:') ? state.invKits.find(k => k.id === claveId.slice(4)) : undefined
              const clave = claveId && !kit ? state.invItems.find(i => i.id === claveId) : undefined
              // Paquete: se muestra ya multiplicado por la cantidad de la partida (12 niveles → 24 + 24).
              const piezasKit = kit ? sel.invKitDesc(state, kit, it.qty || 0) : ''
              return (
                <div key={it.id} className="flex items-center gap-3 px-3 py-2 border-b border-line-soft last:border-b-0 text-[12px]">
                  <span className="mono font-semibold w-10">{it.qty}</span>
                  <span className="flex-1 min-w-0 truncate" style={{ color: clave ? undefined : 'var(--tx-2)' }}>
                    {[it.material, it.description, it.dimensiones].filter(Boolean).join(' · ') || '—'}
                  </span>
                  {it.color && <span className="meta shrink-0">{it.color}</span>}
                  {kit
                    ? <span className="meta truncate max-w-[260px]" style={{ color: 'var(--ok)' }} title={`${kit.name} → ${piezasKit}`}>
                        <Icon name="check" size={12} className="align-[-1px]" /> {kit.name} → {piezasKit}
                      </span>
                    : clave
                    ? <span className="meta truncate max-w-[180px]" style={{ color: 'var(--ok)' }} title={sel.invLabel(state, clave)}>
                        <Icon name="check" size={12} className="align-[-1px]" /> {sel.invLabel(state, clave)}
                      </span>
                    : <>
                        <Badge color="var(--warn)">no está en el inventario</Badge>
                        <button className="btn btn-sm btn-ghost shrink-0" title="Elegir a mano la clave de inventario que le corresponde"
                          onClick={() => setPicking({ idx })}>Vincular</button>
                      </>}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {picking && <PickItemModal title="Material o paquete" sub="Busca la clave de inventario o un paquete" onPick={agregar} onPickKit={agregarKit} onClose={() => setPicking(null)} />}
    </Modal>
  )
}

/* ============================================================
   Cuerpo de una familia: matriz o lista
   ============================================================ */
function MatrixBody({ fam, manage, conteo, matchTexto, matchItem, onCell, onNew }: {
  fam: InventoryFamily
  manage: boolean
  conteo: boolean
  matchTexto: (txt: string) => boolean
  matchItem: (item?: InventoryItem) => boolean
  onCell: (item: InventoryItem) => void
  onNew: (rowId: string, colId: string) => void
}) {
  const { state, dispatch } = useStore()
  const itemAt = (r: string, c: string) => sel.invItemAt(state, fam.id, r, c)
  // Claves cuya fila o columna ya no está en la familia (pasa al renombrar un
  // valor de atributo). Se muestran aparte para que su existencia NUNCA
  // desaparezca en silencio: se recupera devolviendo la etiqueta a como estaba,
  // o vaciándola con una salida y dándola de alta en la medida correcta.
  const sueltas = sel.invItemsForFamily(state, fam.id).filter(i =>
    !fam.rows.some(r => r.id === i.rowId) || !fam.cols.some(c => c.id === i.colId))
  const visible = (r: InventoryAttr, c: InventoryAttr) => {
    if (!matchTexto(textoDeCelda(fam.name, r, c))) return false
    // En modo conteo se ve la cuadrícula COMPLETA: es el momento de llenar los
    // huecos, así que filtrar por existencia sería justo al revés.
    if (conteo) return true
    return matchItem(itemAt(r.id, c.id))
  }
  const filas = fam.rows.filter(r => fam.cols.some(c => visible(r, c)))
  const cols = fam.cols.filter(c => filas.some(r => visible(r, c)))

  const bloqueSueltas = sueltas.length > 0 && (
    <div className="mt-3 p-3 rounded-[8px] border" style={{ borderColor: 'var(--warn)', background: 'color-mix(in srgb, var(--warn) 8%, transparent)' }}>
      <div className="flex items-start gap-2.5">
        <Icon name="alert" size={16} className="mt-0.5 flex-none" style={{ color: 'var(--warn)' }} />
        <div className="text-[12px] text-tx-2 flex-1">
          <b>{sueltas.length} clave{sueltas.length === 1 ? '' : 's'} fuera de la cuadrícula.</b> Su medida ya no
          existe en la familia (seguro se renombró), pero <b>su existencia sigue aquí</b> y sigue contando en el
          total de arriba. Para recuperarlas, edita la familia y vuelve a escribir las medidas <b>tal como
          estaban y en el mismo orden</b>: se reenganchan solas. Si prefieres el nombre nuevo, dales salida y
          captúralas de nuevo en la medida correcta.
          <div className="flex flex-wrap gap-1.5 mt-2">
            {sueltas.map(i => (
              <button key={i.id} className="btn btn-sm btn-ghost" onClick={() => onCell(i)}>
                {[i.rowId, i.colId].filter(Boolean).join(' · ')} <span className="mono">{i.qty}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )

  if (!filas.length || !cols.length) {
    return <>
      <div className="meta py-3">{fam.rows.length === 0 || fam.cols.length === 0 ? 'Esta familia no tiene medidas capturadas. Edítala para agregarlas.' : 'Sin claves que coincidan con el filtro.'}</div>
      {bloqueSueltas}
    </>
  }

  return (
    <>
    <div className="overflow-x-auto border border-line rounded-[8px]">
      <table className="tbl tbl-matrix" style={{ minWidth: 520 }}>
        {/* Dos renglones de encabezado: arriba el NOMBRE de la segunda medida
            abarcando sus columnas, abajo sus valores. Sin eso, la tabla mostraba
            "2336.8 / 2438.4" sin decir en ningún lado que son longitudes. */}
        <thead>
          {fam.colLabel && (
            <tr>
              <th rowSpan={2} style={{ minWidth: 150 }}>{fam.rowLabel || 'Clave'}</th>
              <th colSpan={cols.length} style={{ textAlign: 'center' }}>{fam.colLabel}</th>
              <th rowSpan={2} className="num" style={{ width: 66 }}>Total</th>
            </tr>
          )}
          <tr>
            {!fam.colLabel && <th style={{ minWidth: 150 }}>{fam.rowLabel || 'Clave'}</th>}
            {cols.map(c => (
              <th key={c.id} className="num" style={{ textAlign: 'center' }}>
                {c.label}
                {c.sub && <div className="meta" style={{ fontWeight: 400 }}>{c.sub}</div>}
              </th>
            ))}
            {!fam.colLabel && <th className="num" style={{ width: 66 }}>Total</th>}
          </tr>
        </thead>
        <tbody>
          {filas.map(r => {
            let tot = 0
            return (
              <tr key={r.id} style={{ cursor: 'default' }}>
                <td className="text-[12.5px] font-semibold">{r.label}{r.sub && <div className="meta">{r.sub}</div>}</td>
                {cols.map(c => {
                  const it = itemAt(r.id, c.id)
                  if (it) tot += it.qty
                  if (!it) {
                    // En modo conteo la celda vacía TAMBIÉN se escribe: al teclear un
                    // número la clave nace con esa existencia. Llenar el inventario es
                    // recorrer la cuadrícula, no dar de alta cosas de una en una.
                    if (conteo && manage) {
                      return (
                        <td key={c.id} style={{ textAlign: 'center', padding: 4 }}>
                          <input
                            className="input mono text-center"
                            style={{ width: 62, padding: '5px 2px', borderStyle: 'dashed' }}
                            defaultValue="" placeholder="—" inputMode="numeric"
                            title={`${r.label} · ${c.label} — sin dar de alta`}
                            onFocus={e => e.currentTarget.select()}
                            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
                            onBlur={e => {
                              const txt = e.currentTarget.value.trim()
                              if (!txt) return
                              const n = Math.max(0, Math.round(Number(txt) || 0))
                              if (n > 0) dispatch({ type: 'INV_COUNT_CELL', familyId: fam.id, rowId: r.id, colId: c.id, counted: n })
                              else e.currentTarget.value = ''
                            }} />
                        </td>
                      )
                    }
                    return (
                      <td key={c.id} style={{ textAlign: 'center', padding: 0 }}>
                        <button className="cell-btn cell-empty" disabled={!manage}
                          title={`${r.label} · ${c.label} — dar de alta y registrar entrada`}
                          onClick={() => manage && onNew(r.id, c.id)}>
                          <Icon name="plus" size={14} />
                        </button>
                      </td>
                    )
                  }
                  const nivel = sel.invNivel(it)
                  if (conteo && manage) {
                    return (
                      <td key={c.id} style={{ textAlign: 'center', padding: 4, background: NIVEL_BG[nivel] }}>
                        <input
                          key={it.id + ':' + it.qty}
                          className="input mono text-center"
                          style={{ width: 62, padding: '5px 2px' }}
                          defaultValue={it.qty} inputMode="numeric"
                          title={sel.invLabel(state, it)}
                          onFocus={e => e.currentTarget.select()}
                          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
                          onBlur={e => {
                            const n = Math.max(0, Math.round(Number(e.currentTarget.value) || 0))
                            if (n !== it.qty || !it.counted) dispatch({ type: 'INV_COUNT', itemId: it.id, counted: n })
                          }} />
                      </td>
                    )
                  }
                  return (
                    <td key={c.id} style={{ textAlign: 'center', padding: 0, background: NIVEL_BG[nivel] }}>
                      <button
                        className="cell-btn"
                        style={{ color: NIVEL_COLOR[nivel], fontSize: 13.5 }}
                        title={`${sel.invLabel(state, it)}${it.counted ? '' : ' · sin contar'}`}
                        onClick={() => onCell(it)}>
                        {it.qty}{!it.counted && <span className="text-tx-3 font-normal">?</span>}
                      </button>
                    </td>
                  )
                })}
                <td className="num text-tx-2 text-[12px]">{tot}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
    {bloqueSueltas}
    </>
  )
}

function ListBody({ fam, manage, matchTexto, matchItem, onCell, onEdit }: {
  fam: InventoryFamily
  manage: boolean
  matchTexto: (txt: string) => boolean
  matchItem: (item?: InventoryItem) => boolean
  onCell: (item: InventoryItem) => void
  onEdit: (item: InventoryItem) => void
}) {
  const { state, dispatch } = useStore()
  const items = sel.invItemsForFamily(state, fam.id)
    // El nombre de la familia también entra en la búsqueda: buscar "minirracks"
    // debe traer sus materiales aunque ninguno se llame así.
    .filter(i => matchTexto(`${fam.name} ${i.label || ''} ${i.sub || ''}`) && matchItem(i))
    .sort((a, b) => (a.label || '').localeCompare(b.label || '', 'es', { numeric: true }))
  if (!items.length) return <div className="meta py-3">Sin claves que coincidan con el filtro.</div>
  const paso = (i: InventoryItem, d: number) =>
    dispatch({ type: 'INV_MOVE', itemId: i.id, motivo: d > 0 ? 'Entrada' : 'Salida a proyecto', delta: d })

  return (
    <div className="border border-line rounded-[8px] overflow-hidden">
      {items.map(i => {
        const nivel = sel.invNivel(i)
        return (
          <div key={i.id} className="flex items-center gap-3 px-3.5 py-2.5 border-b border-line-soft last:border-b-0">
            <div className="flex-1 min-w-0">
              <div className="text-[13px]">{i.label || '—'}{!i.counted && <span className="meta"> · sin contar</span>}</div>
              {i.sub && <div className="meta">{i.sub}</div>}
            </div>
            {sel.invNivel(i) === 'low' && <Badge color="var(--danger)">por resurtir</Badge>}
            {manage && <button className="icon-btn w-7 h-7" title="Quitar uno" onClick={() => paso(i, -1)}><Icon name="close" size={13} /></button>}
            <button className="mono font-semibold bg-transparent border-none cursor-pointer" style={{ minWidth: 52, color: NIVEL_COLOR[nivel], fontSize: 14 }}
              title="Registrar movimiento" onClick={() => onCell(i)}>{i.qty} <span className="meta">{fam.unit}</span></button>
            {manage && <button className="icon-btn w-7 h-7" title="Agregar uno" onClick={() => paso(i, 1)}><Icon name="plus" size={13} /></button>}
            {manage && <button className="icon-btn w-7 h-7" title="Ajustar clave" onClick={() => onEdit(i)}><Icon name="edit" size={13} /></button>}
          </div>
        )
      })}
    </div>
  )
}

/* ============================================================
   Página
   ============================================================ */
export function InventoryPage() {
  const { state, dispatch } = useStore()
  const manage = canManageInv(state.currentUser?.role) && !isDireccion(state.currentUser?.role)
  const [vista, setVista] = React.useState('stock')
  const [conteo, setConteo] = React.useState(false)
  const [q, setQ] = React.useState('')
  const [fFamilia, setFFamilia] = React.useState('')
  const [fEstado, setFEstado] = React.useState('')
  const [cerradas, setCerradas] = React.useState<Set<string>>(new Set())
  const [moveItem, setMoveItem] = React.useState<InventoryItem | null>(null)
  const [editItem, setEditItem] = React.useState<InventoryItem | null>(null)
  const [newItem, setNewItem] = React.useState<{ familyId: string; rowId?: string; colId?: string } | null>(null)
  // null = cerrado · {} = familia nueva · { family } = editando esa familia
  const [famForm, setFamForm] = React.useState<{ family?: InventoryFamily } | null>(null)
  // null = cerrado · {} = paquete nuevo · { kit } = editando ese paquete
  const [kitForm, setKitForm] = React.useState<{ kit?: InventoryKit } | null>(null)
  const [picking, setPicking] = React.useState(false)
  const [consumoOc, setConsumoOc] = React.useState<Order | null>(null)
  // Consumo por OC: por defecto solo lo que falta por resolver, para que la lista no crezca.
  const [fConsumo, setFConsumo] = React.useState('pendientes')

  const res = sel.invResumen(state)

  // Búsqueda por PALABRAS, no por texto contiguo: "viga 4.0" debe encontrar
  // "Vigas selectivas · Escalón 4.0". Deben aparecer todas las palabras, en
  // cualquier orden y en cualquier parte del nombre.
  const busqueda = norm(q)
  const palabras = React.useMemo(() => busqueda.split(' ').filter(Boolean), [busqueda])
  const matchTexto = React.useCallback((txt: string) => {
    if (!palabras.length) return true
    const heno = norm(txt)
    return palabras.every(w => heno.includes(w))
  }, [palabras])
  // Filtro por estado de la clave. Una celda sin clave dada de alta (undefined)
  // solo se muestra cuando no hay filtro de estado.
  const matchItem = React.useCallback((i?: InventoryItem) => {
    if (!fEstado) return true
    if (!i) return false
    if (fEstado === 'conex') return i.qty > 0
    if (fEstado === 'low') return sel.invNivel(i) === 'low'
    if (fEstado === 'sin') return !i.counted
    return true
  }, [fEstado])

  const hayFiltro = !!q.trim() || !!fFamilia || !!fEstado
  const familias = sel.invFamilies(state).filter(f => !fFamilia || f.id === fFamilia)

  /** ¿La familia tiene algo que mostrar con los filtros puestos? Si no, su
   *  tarjeta ni se dibuja: tres tarjetas diciendo "sin coincidencias" es ruido. */
  const familiaVisible = (fam: InventoryFamily): boolean => {
    if (sel.invEsMatriz(fam)) {
      return fam.rows.some(r => fam.cols.some(c => {
        if (!matchTexto(textoDeCelda(fam.name, r, c))) return false
        return conteo || matchItem(sel.invItemAt(state, fam.id, r.id, c.id))
      }))
    }
    const items = sel.invItemsForFamily(state, fam.id)
    // Una familia de lista vacía se ve solo sin filtros, para poder agregarle material.
    if (!items.length) return !hayFiltro
    return items.some(i => matchTexto(`${fam.name} ${i.label || ''} ${i.sub || ''}`) && matchItem(i))
  }
  const visibles = familias.filter(familiaVisible)
  /** Claves que pasan los filtros (para el contador de resultados). */
  const clavesFiltradas = state.invItems.filter(i => {
    const fam = state.invFamilies.find(f => f.id === i.familyId)
    if (!fam || (fFamilia && fam.id !== fFamilia)) return false
    const txt = sel.invEsMatriz(fam)
      ? textoDeCelda(fam.name, fam.rows.find(r => r.id === i.rowId), fam.cols.find(c => c.id === i.colId))
      : `${fam.name} ${i.label || ''} ${i.sub || ''}`
    return matchTexto(txt) && matchItem(i)
  }).length
  const limpiar = () => { setQ(''); setFFamilia(''); setFEstado('') }

  const toggleFam = (id: string) => setCerradas(s => {
    const n = new Set(s)
    if (n.has(id)) n.delete(id); else n.add(id)
    return n
  })

  // Celda vacía en modo normal: la clave nace al momento y se abre directo el
  // movimiento. Un clic en vez de un formulario intermedio.
  const crearYAbrir = (familyId: string, rowId: string, colId: string) => {
    const id = uid('ii')
    dispatch({ type: 'SAVE_INV_ITEM', item: { id, familyId, rowId, colId } })
    setMoveItem({ id, familyId, rowId, colId, qty: 0, counted: false, updatedAt: '' })
  }
  /** Combinaciones de la familia que todavía no tienen clave. */
  const faltantes = (fam: InventoryFamily) => {
    const out: { rowId: string; colId: string }[] = []
    for (const r of fam.rows) for (const c of fam.cols) {
      if (!sel.invItemAt(state, fam.id, r.id, c.id)) out.push({ rowId: r.id, colId: c.id })
    }
    return out
  }

  // OC que trabaja almacén, para capturarles el consumo (mismo criterio que la cola).
  const ocsConsumo = sel.warehouseQueue(state)
    .concat(sel.warehouseDone(state).slice(0, 20))
    .map(w => state.orders.find(o => o.id === w.orderId))
    .filter((o): o is Order => !!o)
  const pendientesConsumo = ocsConsumo.filter(o => !sel.invConsumoCapturado(state, o.id))

  return (
    <div>
      <SecTitle title="Inventario" sub="Existencias de almacén · stock general"
        right={manage ? (
          <div className="flex gap-2 items-center">
            <button className="btn btn-ghost" onClick={() => setFamForm({})}><Icon name="plus" size={15} /> Nueva familia</button>
            <button className="btn btn-primary" onClick={() => setPicking(true)}><Icon name="plus" size={15} /> Entrada</button>
          </div>
        ) : undefined} />

      <div className="grid grid-cols-4 gap-3.5 mb-5">
        <KPI label="Piezas en almacén" value={res.piezas} icon="pkg" accent
          foot={`${res.conExistencia} de ${res.claves} claves con existencia`} />
        <KPI label="Por resurtir" value={res.porResurtir} icon="alert"
          foot={res.porResurtir ? `${INV_ROJO} piezas o menos` : 'Al corriente'} footTrend={res.porResurtir ? 'dn' : undefined} />
        <KPI label="Movimientos hoy" value={res.movsHoy} icon="trendUp" foot={`${state.invMoves.length} en el historial`} />
        <KPI label="Sin contar" value={res.sinContar} icon="box"
          foot={res.sinContar ? 'Nunca se les capturó conteo' : 'Todo contado'} />
      </div>

      <div className="flex gap-2.5 mb-4 items-center flex-wrap">
        <div className="relative flex-[1_1_220px] max-w-[320px]">
          <Icon name="search" size={15} className="absolute left-[11px] top-2.5 text-tx-3" />
          <input className="input pl-[34px]" placeholder="Buscar: viga 4.0, marco, 2438…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <Seg value={vista} onChange={setVista} options={[
          { value: 'stock', label: 'Existencias' },
          { value: 'movs', label: `Movimientos (${state.invMoves.length})` },
          { value: 'consumo', label: 'Consumo por OC' },
          { value: 'kits', label: `Paquetes (${state.invKits.length})` },
        ]} />
        <div className="flex-1"></div>
        {vista === 'kits' && manage && (
          <button className="btn btn-primary" onClick={() => setKitForm({})}><Icon name="plus" size={14} /> Nuevo paquete</button>
        )}
        {vista === 'stock' && manage && (
          <button className={'btn' + (conteo ? ' btn-primary' : ' btn-ghost')} onClick={() => setConteo(v => !v)}>
            <Icon name="check" size={14} /> Modo conteo
          </button>
        )}
      </div>

      {/* Filtros. Familia y búsqueda acotan por dónde vas; el estado se ignora en
          modo conteo, porque ahí necesitas ver los huecos para llenarlos. */}
      {vista === 'stock' && (
        <div className="flex gap-2.5 mb-4 items-center flex-wrap">
          <span className="label-k">Filtrar:</span>
          <Select value={fFamilia} onChange={e => setFFamilia(e.target.value)} className="w-auto min-w-[190px]">
            <option value="">Todas las familias</option>
            {sel.invFamilies(state).map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </Select>
          <Seg value={fEstado} onChange={setFEstado} options={ESTADOS} />
          {hayFiltro && (
            <button className="btn btn-ghost btn-sm" onClick={limpiar}><Icon name="close" size={13} /> Limpiar</button>
          )}
          <span className="meta">{clavesFiltradas} de {res.claves} claves</span>
          {conteo && fEstado && <span className="meta" style={{ color: 'var(--warn)' }}>· el filtro de estado no aplica en modo conteo</span>}
        </div>
      )}

      {conteo && vista === 'stock' && (
        <div className="flex items-start gap-3 mb-4 p-3 rounded-[8px]" style={{ background: 'var(--acc-ghost)', border: '1px solid color-mix(in srgb, var(--acc) 30%, transparent)' }}>
          <Icon name="check" size={18} className="mt-0.5 flex-none text-acc" />
          <div className="text-[12.5px] text-tx-1">
            <b>Modo conteo activo.</b> Camina el almacén y escribe lo que cuentes: <b>Tab</b> salta a la siguiente
            celda y <b>Enter</b> guarda. Cada diferencia queda en el kardex como <i>ajuste por conteo</i> a tu nombre.
          </div>
        </div>
      )}

      {/* ---- EXISTENCIAS ---- */}
      {vista === 'stock' && (
        familias.length === 0 ? (
          <Empty icon="pkg">
            Todavía no hay familias. Crea la primera con <b>Nueva familia</b>: le pones sus medidas
            (peralte, longitud…) y el inventario se dibuja solo.
          </Empty>
        ) : visibles.length === 0 ? (
          <Empty icon="search">
            Nada coincide con lo que buscas.
            <div className="mt-2.5"><button className="btn btn-ghost btn-sm" onClick={limpiar}><Icon name="close" size={13} /> Limpiar filtros</button></div>
          </Empty>
        ) : (
          <div className="flex flex-col gap-3.5">
            {visibles.map(fam => {
              const abierta = !cerradas.has(fam.id)
              const items = sel.invItemsForFamily(state, fam.id)
              const total = items.reduce((a, i) => a + i.qty, 0)
              const bajos = items.filter(i => sel.invNivel(i) === 'low').length
              const esMatriz = sel.invEsMatriz(fam)
              return (
                <section key={fam.id} className="card overflow-hidden">
                  <div className="card-h cursor-pointer" onClick={() => toggleFam(fam.id)}>
                    <Icon name="chevron" size={15} className={'text-tx-3 transition-transform ' + (abierta ? 'rotate-90' : '')} />
                    <span className="ttl">{fam.name}</span>
                    <span className="meta mono">{total.toLocaleString('es-MX')} {fam.unit}</span>
                    {bajos > 0
                      ? <Badge color="var(--danger)">{bajos} por resurtir</Badge>
                      : items.length > 0 ? <Badge color="var(--ok)">al corriente</Badge> : <Badge color="var(--tx-3)">vacía</Badge>}
                    <span className="flex-1"></span>
                    {manage && (
                      <span className="flex gap-1.5" onClick={e => e.stopPropagation()}>
                        {!esMatriz && <button className="btn btn-sm btn-ghost" onClick={() => setNewItem({ familyId: fam.id })}><Icon name="plus" size={13} /> Material</button>}
                        {esMatriz && faltantes(fam).length > 0 && (
                          <button className="btn btn-sm btn-ghost" title="Da de alta de un jalón todas las medidas que faltan, en cero"
                            onClick={() => dispatch({ type: 'INV_ADD_ITEMS', familyId: fam.id, combos: faltantes(fam) })}>
                            <Icon name="grid" size={13} /> Completar cuadrícula ({faltantes(fam).length})
                          </button>
                        )}
                        <button className="btn btn-sm btn-ghost" title="Editar familia y sus medidas" onClick={() => setFamForm({ family: fam })}><Icon name="edit" size={13} /></button>
                      </span>
                    )}
                  </div>
                  {abierta && (
                    <div className="p-4">
                      {esMatriz
                        ? <MatrixBody fam={fam} manage={manage} conteo={conteo} matchTexto={matchTexto} matchItem={matchItem}
                            onCell={setMoveItem} onNew={(rowId, colId) => crearYAbrir(fam.id, rowId, colId)} />
                        : (items.length === 0
                          ? <Empty icon="box">Sin materiales. Agrégalos con el botón <b>Material</b>.</Empty>
                          : <ListBody fam={fam} manage={manage} matchTexto={matchTexto} matchItem={matchItem}
                              onCell={setMoveItem} onEdit={setEditItem} />)}
                    </div>
                  )}
                </section>
              )
            })}
          </div>
        )
      )}

      {/* ---- MOVIMIENTOS (kardex) ---- */}
      {vista === 'movs' && (
        <div className="card overflow-hidden">
          <div className="card-h">
            <Icon name="list" size={17} className="text-acc" />
            <span className="ttl">Movimientos</span>
            <span className="flex-1"></span>
            <span className="meta">La existencia no se escribe a mano: es la suma de esto.</span>
          </div>
          {state.invMoves.length === 0 ? <Empty icon="box">Todavía no hay movimientos registrados</Empty> : (
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead><tr><th>Cuándo</th><th>Material</th><th>Motivo</th><th className="num">Cant.</th><th className="num">Quedó en</th><th>Quién</th><th>Referencia</th></tr></thead>
                <tbody>
                  {sel.invMovesRecientes(state).map(m => {
                    const item = state.invItems.find(i => i.id === m.itemId)
                    return (
                      <tr key={m.id} style={{ cursor: 'default' }}>
                        <td className="text-tx-2 text-[12px] whitespace-nowrap">{fmtDate((m.at || '').slice(0, 10))}</td>
                        <td className="text-[12.5px]">{item ? sel.invLabel(state, item) : <span className="text-tx-3">clave eliminada</span>}</td>
                        <td><Badge color={MOTIVO_COLOR[m.motivo]}>{m.motivo}</Badge></td>
                        <td className="num font-semibold" style={{ color: m.qty > 0 ? 'var(--ok)' : 'var(--danger)' }}>{m.qty > 0 ? '+' : ''}{m.qty}</td>
                        <td className="num text-tx-1">{m.balance}</td>
                        <td className="text-tx-2 text-[12px]">{sel.userName(state, m.userId)}</td>
                        <td className="text-[12px] mono text-acc">{m.ref || '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ---- PAQUETES (kits) ---- */}
      {vista === 'kits' && (
        <div className="card overflow-hidden">
          <div className="card-h">
            <Icon name="layers" size={17} className="text-acc" />
            <span className="ttl">Paquetes</span>
            <span className="flex-1"></span>
            <span className="meta">Sin existencia propia: al descontar un paquete se descuentan sus piezas.</span>
          </div>
          {state.invKits.length === 0
            ? <Empty icon="layers">Todavía no hay paquetes. Ejemplo: “Nivel Mini” = 2 charolas + 2 vigas.{manage ? ' Créalo con “Nuevo paquete”.' : ''}</Empty>
            : (
              <table className="tbl">
                <thead><tr><th>Paquete</th><th>Piezas por paquete</th><th className="num">Armables hoy</th><th></th></tr></thead>
                <tbody>
                  {sel.invKits(state).map(k => (
                    <tr key={k.id} style={manage ? undefined : { cursor: 'default' }} onClick={() => manage && setKitForm({ kit: k })}>
                      <td className="font-semibold text-[13px]">{k.name}</td>
                      <td className="text-[12.5px] text-tx-2">
                        {sel.invKitDesc(state, k)}
                      </td>
                      <td className="num font-semibold" title="Con la existencia actual de sus piezas">{sel.invKitArmables(state, k)}</td>
                      <td className="text-right" onClick={e => e.stopPropagation()}>
                        {manage && <button className="btn btn-sm btn-ghost" onClick={() => setKitForm({ kit: k })}><Icon name="edit" size={13} /> Editar</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </div>
      )}

      {/* ---- CONSUMO POR OC ---- */}
      {vista === 'consumo' && (
        <div className="card overflow-hidden">
          <div className="card-h">
            <Icon name="orders" size={17} className="text-acc" />
            <span className="ttl">Consumo por orden de compra</span>
            <span className="flex-1"></span>
            <Seg value={fConsumo} onChange={setFConsumo} options={[
              { value: 'pendientes', label: `Pendientes (${pendientesConsumo.length})` },
              { value: 'todas', label: 'Todas' },
            ]} />
          </div>
          {(() => {
            const lista = fConsumo === 'pendientes' ? pendientesConsumo : ocsConsumo
            return lista.length === 0
              ? <Empty icon={fConsumo === 'pendientes' ? 'check' : 'orders'}>{fConsumo === 'pendientes' ? 'No hay órdenes de compra con consumo pendiente' : 'No hay órdenes de compra en la cola de almacén'}</Empty>
              : (
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead><tr><th>OC</th><th>Proyecto</th><th>Estado en almacén</th><th className="num">Materiales</th><th>Consumo</th><th></th></tr></thead>
                <tbody>
                  {lista.map(o => {
                    const wh = sel.warehouseForOrder(state, o.id)
                    const proj = o.projectId ? state.projects.find(p => p.id === o.projectId) : undefined
                    // "capturado" = hay salidas en el kardex; "a mano" = se resolvió fuera del sistema.
                    const enKardex = sel.invConsumoEnKardex(state, o.id)
                    const capturado = sel.invConsumoCapturado(state, o.id)
                    return (
                      // Toda la fila abre la captura de consumo; sin permiso, no hace nada.
                      <tr key={o.id} style={manage ? undefined : { cursor: 'default' }}
                        title={manage ? (capturado ? 'Ver o ajustar el consumo' : 'Capturar el consumo de esta OC') : undefined}
                        onClick={() => { if (manage) setConsumoOc(o) }}>
                        <td><span className="mono text-acc font-semibold">{o.number}</span></td>
                        <td>{proj ? <>{proj.code}<div className="meta">{sel.clientName(state, proj.client)}</div></> : <span className="text-tx-3">—</span>}</td>
                        <td className="text-tx-2 text-[12px]">{wh ? WAREHOUSE_STATUS_LABEL[wh.status] : '—'}</td>
                        <td className="num text-[12px]">{o.items?.length ?? 0}</td>
                        <td>{enKardex ? <Badge color="var(--ok)">capturado</Badge> : o.consumoManual ? <Badge color="var(--acc)">a mano</Badge> : <Badge color="var(--warn)">pendiente</Badge>}</td>
                        {/* Los botones mandan lo suyo: no deben disparar además el clic de la fila. */}
                        <td className="text-right" onClick={e => e.stopPropagation()}>
                          <div className="flex gap-1.5 justify-end">
                            {/* Calcomanía de salida: se pega al pedido cuando ya está listo. */}
                            <button className="btn btn-sm btn-ghost" title="Genera la calcomanía para pegar al pedido"
                              onClick={() => printSticker(state, o)}>
                              <Icon name="download" size={13} /> Sticker
                            </button>
                            {manage && <button className="btn btn-sm btn-ghost" onClick={() => setConsumoOc(o)}>
                              {capturado ? 'Ver / ajustar' : 'Capturar consumo'}
                            </button>}
                            {/* Resuelto fuera del sistema: la OC deja de estar pendiente sin tocar el kardex. */}
                            {manage && !enKardex && (
                              o.consumoManual
                                ? <button className="btn btn-sm btn-ghost" title="Vuelve a quedar pendiente"
                                    onClick={() => dispatch({ type: 'SET_ORDER_CONSUMO_MANUAL', id: o.id, manual: false })}>Reabrir</button>
                                : <button className="btn btn-sm btn-ghost" title="El material ya se descontó a mano o no pasa por el inventario: no se descuenta nada"
                                    onClick={() => dispatch({ type: 'SET_ORDER_CONSUMO_MANUAL', id: o.id, manual: true })}>
                                    <Icon name="check" size={13} /> Ya lo registré a mano
                                  </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
              )
          })()}
        </div>
      )}

      {moveItem && (() => {
        const vivo = state.invItems.find(i => i.id === moveItem.id) ?? moveItem
        return <MoveModal item={vivo} onClose={() => setMoveItem(null)} readOnly={!manage} />
      })()}
      {editItem && <ItemModal familyId={editItem.familyId} item={editItem} onClose={() => setEditItem(null)} />}
      {newItem && <ItemModal familyId={newItem.familyId} rowId={newItem.rowId} colId={newItem.colId} onClose={() => setNewItem(null)} />}
      {famForm && <FamilyModal family={famForm.family} onClose={() => setFamForm(null)} />}
      {kitForm && <KitModal kit={kitForm.kit} onClose={() => setKitForm(null)} />}
      {picking && <PickItemModal onPick={(i) => { setPicking(false); setMoveItem(i) }} onClose={() => setPicking(false)} />}
      {consumoOc && <ConsumoModal order={consumoOc} onClose={() => setConsumoOc(null)} />}
    </div>
  )
}

/* ============================================================
   Tarjeta de resurtido para el Panel de almacén: solo lo que urge.
   ============================================================ */
export function InventoryLowCard({ onNavigate }: { onNavigate?: (route: string) => void }) {
  const { state } = useStore()
  const bajos = state.invItems
    .filter(i => sel.invNivel(i) === 'low')
    .sort((a, b) => a.qty - b.qty)
    .slice(0, 6)
  if (state.invItems.length === 0) return null

  return (
    <div className="card overflow-hidden">
      <div className="card-h">
        <Icon name="pkg" size={17} className={bajos.length ? 'text-danger' : 'text-ok'} />
        <span className="ttl">Inventario · por resurtir</span>
        <span className="flex-1"></span>
        {onNavigate && <button className="btn btn-ghost btn-sm" onClick={() => onNavigate('inventario')}>Ver todo <Icon name="arrowRight" size={13} /></button>}
      </div>
      {bajos.length === 0
        ? <Empty icon="check">Todo por encima del mínimo</Empty>
        : bajos.map(i => (
          <div key={i.id} className="flex items-center gap-3 px-3.5 py-2.5 border-b border-line-soft last:border-b-0">
            <span className="flex-1 min-w-0 text-[12.5px] truncate">{sel.invLabel(state, i)}</span>
            <span className="mono text-[12.5px] font-semibold" style={{ color: 'var(--danger)' }}>{i.qty}</span>
            <span className="meta">en existencia</span>
          </div>
        ))}
    </div>
  )
}
