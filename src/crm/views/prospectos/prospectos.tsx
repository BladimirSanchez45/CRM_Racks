// ============================================================
//  PROSPECTOS — CRM de leads PREVIO a Proyectos.
//  El vendedor lleva el conteo de a quién le está cotizando; cuando el cliente
//  confirma, "Marcar como vendido" y luego "Registrar venta" crea el Proyecto
//  prellenando el formulario con los datos del prospecto.
// ============================================================
import * as React from 'react'
import { useStore, sel, fmtMoney, fmtDateShort, daysBetween, TODAY_ISO, uid, isDireccion } from '../../core/data'
import { Modal, Field, Input, TextArea, Select, MoneyInput, FileField, Badge, Avatar, Empty, KPI, Confirm, useUnsavedGuard } from '../../core/ui'
import { Icon } from '../../core/icons'
import { ProjectForm } from '../projects/project_views'
import type { Project, Prospect, ProspectComment, ProspectEstado, ProspectInput, ProspectResultado } from '../../core/types'

const ESTADOS: ProspectEstado[] = ['Nuevo', 'Contactado', 'Cotizado', 'Negociación']
const RESULTADOS: ProspectResultado[] = ['En espera', 'Vendido', 'Perdido']
const ESTADO_COLOR: Record<ProspectEstado, string> = {
  Nuevo: 'var(--tx-2)', Contactado: 'var(--st-2)', Cotizado: 'var(--ok)', 'Negociación': 'var(--st-5)',
}
const RESULTADO_COLOR: Record<ProspectResultado, string> = {
  'En espera': 'var(--warn)', Vendido: 'var(--ok)', Perdido: 'var(--danger)',
}
const ANUNCIOS = ['WebAd', 'CTC Ad Racks Industriales', 'CTC Ad Mezzanines', 'CTC Ad Minirack', 'Referido', 'Otro']

/** Días transcurridos desde el último contacto (para el "Seguimiento"). */
function seguimiento(p: Prospect): { label: string; color: string } {
  if (!p.ultimoContacto) return { label: '—', color: 'var(--tx-3)' }
  const d = daysBetween(p.ultimoContacto)
  const dias = d == null ? null : -d   // daysBetween(pasado) es negativo → días transcurridos
  if (dias == null) return { label: '—', color: 'var(--tx-3)' }
  if (dias <= 0) return { label: 'Al día', color: 'var(--ok)' }
  return { label: `${dias} día${dias === 1 ? '' : 's'}`, color: dias <= 2 ? 'var(--warn)' : 'var(--danger)' }
}

/* ============================================================
   Formulario de prospecto
   ============================================================ */
type ProspectFormState = {
  id?: string; name: string; seller: string; empresa: string; email: string; phone: string; city: string
  fechaAsignacion: string; estado: ProspectEstado; ultimoContacto: string; costo: number | string
  sistema: string; anuncio: string; resultado: ProspectResultado; notas: string
  cotizacion?: string; cotizacionPath?: string; convertedProjectId?: string; createdAt?: string
}
function ProspectForm({ prospect, onClose }: { prospect?: Prospect; onClose: () => void }) {
  const { state, dispatch } = useStore()
  const me = state.currentUser
  const isVentas = me?.role === 'ventas'
  const [p, setP] = React.useState<ProspectFormState>(() => prospect ? {
    ...prospect,
    empresa: prospect.empresa || '', email: prospect.email || '', phone: prospect.phone || '', city: prospect.city || '',
    fechaAsignacion: prospect.fechaAsignacion || '', ultimoContacto: prospect.ultimoContacto || '',
    costo: prospect.costo ?? '', sistema: prospect.sistema || '', anuncio: prospect.anuncio || '', notas: prospect.notas || '',
  } : {
    name: '', seller: isVentas ? me!.id : '', empresa: '', email: '', phone: '', city: '',
    fechaAsignacion: TODAY_ISO, estado: 'Nuevo', ultimoContacto: TODAY_ISO, costo: '', sistema: '', anuncio: '',
    resultado: 'En espera', notas: '',
  })
  const set = (k: keyof ProspectFormState, v: unknown) => setP(s => ({ ...s, [k]: v }))
  // Anuncio: si el valor guardado no es uno de los presets, se considera "Otro" (texto libre).
  const presetAnuncios = ANUNCIOS.filter(a => a !== 'Otro')
  const [anuncioOtro, setAnuncioOtro] = React.useState(() => !!p.anuncio && !presetAnuncios.includes(p.anuncio))
  const valid = p.name.trim() && p.seller
  const { requestClose, guard } = useUnsavedGuard(p, onClose)
  const save = () => {
    const seller = isVentas ? me!.id : p.seller
    const payload: ProspectInput = {
      ...prospect, id: prospect?.id, name: p.name.trim(), seller, estado: p.estado, resultado: p.resultado,
      empresa: p.empresa.trim() || undefined, email: p.email.trim() || undefined, phone: p.phone.trim() || undefined,
      city: p.city.trim() || undefined, fechaAsignacion: p.fechaAsignacion || undefined, ultimoContacto: p.ultimoContacto || undefined,
      costo: p.costo === '' ? undefined : +p.costo, sistema: p.sistema.trim() || undefined, anuncio: p.anuncio.trim() || undefined,
      notas: p.notas.trim() || undefined, cotizacion: p.cotizacion, cotizacionPath: p.cotizacionPath,
      convertedProjectId: p.convertedProjectId,
    }
    dispatch({ type: 'SAVE_PROSPECT', prospect: payload }); onClose()
  }
  return (
    <Modal width={640} icon={prospect ? 'edit' : 'plus'} title={prospect ? 'Editar prospecto' : 'Nuevo prospecto'} onClose={requestClose}
      footer={<>
        <button className="btn btn-ghost" onClick={requestClose}>Cancelar</button>
        <div className="flex-1"></div>
        <button className={'btn btn-primary' + (!valid ? ' opacity-50' : '')} disabled={!valid} onClick={save}><Icon name="check" size={15} /> Guardar</button>
      </>}>
      <div className="grid grid-cols-2 gap-3.5">
        <Field label="Nombre del prospecto"><Input value={p.name} onChange={e => set('name', e.target.value)} placeholder="Contacto" autoFocus /></Field>
        <Field label="Empresa"><Input value={p.empresa} onChange={e => set('empresa', e.target.value)} placeholder="Opcional" /></Field>
        <Field label="Teléfono"><Input value={p.phone} onChange={e => set('phone', e.target.value)} placeholder="55 0000 0000" /></Field>
        <Field label="Correo"><Input value={p.email} onChange={e => set('email', e.target.value)} placeholder="correo@ejemplo.com" /></Field>
        <Field label="Ciudad"><Input value={p.city} onChange={e => set('city', e.target.value)} placeholder="Ciudad" /></Field>
        {!isVentas && (
          <Field label="Vendedor">
            <Select value={p.seller} onChange={e => set('seller', e.target.value)}>
              <option value="">Selecciona…</option>
              {sel.vendedores(state).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
        )}
        <Field label="Estado"><Select value={p.estado} onChange={e => set('estado', e.target.value)}>{ESTADOS.map(s => <option key={s} value={s}>{s}</option>)}</Select></Field>
        <Field label="Resultado"><Select value={p.resultado} onChange={e => set('resultado', e.target.value)}>{RESULTADOS.map(s => <option key={s} value={s}>{s}</option>)}</Select></Field>
        <Field label="Fecha de asignación"><Input type="date" value={p.fechaAsignacion} onChange={e => set('fechaAsignacion', e.target.value)} /></Field>
        <Field label="Último contacto"><Input type="date" value={p.ultimoContacto} onChange={e => set('ultimoContacto', e.target.value)} /></Field>
        <Field label="Sistema"><Input value={p.sistema} onChange={e => set('sistema', e.target.value)} placeholder="Ej. Miniracks, Mezzanine" /></Field>
        <Field label="Anuncio / origen">
          <Select value={anuncioOtro ? 'Otro' : (p.anuncio || '')} onChange={e => {
            const v = e.target.value
            if (v === 'Otro') { setAnuncioOtro(true); set('anuncio', '') }
            else { setAnuncioOtro(false); set('anuncio', v) }
          }}>
            <option value="">Selecciona…</option>
            {ANUNCIOS.map(a => <option key={a} value={a}>{a}</option>)}
          </Select>
        </Field>
        {anuncioOtro && <Field label="Especificar origen"><Input value={p.anuncio} onChange={e => set('anuncio', e.target.value)} placeholder="Describe el origen" autoFocus /></Field>}
        <Field label="Costo / cotización (Sin IVA)"><MoneyInput value={p.costo} onChange={v => set('costo', v)} placeholder="0" /></Field>
        <Field label="Cotización (archivo)" span={2}>
          <FileField label="" value={p.cotizacion || ''} path={p.cotizacionPath} folder={`prospects/${prospect?.id || 'nuevos'}`}
            onChange={v => setP(s => ({ ...s, cotizacion: v.name, cotizacionPath: v.path }))} accept=".pdf,.xlsx,.xls,.jpg,.png" />
        </Field>
        <Field label="Notas" span={2}><Input value={p.notas} onChange={e => set('notas', e.target.value)} placeholder="Seguimiento, detalles…" /></Field>
      </div>
      {guard}
    </Modal>
  )
}

/* ============================================================
   Hilo de comentarios de un prospecto
   ============================================================ */
const fmtWhen = (iso: string) => {
  try { return new Date(iso).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) }
  catch { return '' }
}
function ProspectComments({ prospect, onClose }: { prospect: Prospect; onClose: () => void }) {
  const { state, dispatch } = useStore()
  const me = state.currentUser
  const readOnly = isDireccion(me?.role)
  const p = state.prospects.find(x => x.id === prospect.id) || prospect
  const comments = p.comments || []
  const [text, setText] = React.useState('')
  const add = () => {
    const t = text.trim(); if (!t || !me) return
    const c: ProspectComment = { id: uid('cm'), author: me.id, authorName: me.name, text: t, at: new Date().toISOString() }
    dispatch({ type: 'SAVE_PROSPECT', prospect: { ...p, comments: [...comments, c] } })
    setText('')
  }
  return (
    <Modal width={520} icon="comment" title="Comentarios" sub={p.name} onClose={onClose}
      footer={<button className="btn btn-ghost" onClick={onClose}>Cerrar</button>}>
      <div className="flex flex-col gap-3 max-h-[52vh] overflow-y-auto mb-3 pr-1">
        {comments.length === 0 ? <Empty icon="comment">Sin comentarios aún</Empty> : comments.map(c => (
          <div key={c.id} className="flex gap-2.5">
            <Avatar name={c.authorName || '—'} size={28} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-[12.5px]">{c.authorName || '—'}</span>
                <span className="meta">{fmtWhen(c.at)}</span>
              </div>
              <div className="text-[13px] text-tx-1 mt-1 whitespace-pre-wrap break-words bg-bg-1 border border-line rounded-[8px] px-3 py-2">{c.text}</div>
            </div>
          </div>
        ))}
      </div>
      {!readOnly && (
        <div className="flex gap-2 items-end border-t border-line pt-3">
          <div className="flex-1"><TextArea value={text} onChange={e => setText(e.target.value)} placeholder="Escribe un comentario…"
            onKeyDown={(e: React.KeyboardEvent) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); add() } }} /></div>
          <button className={'btn btn-primary' + (!text.trim() ? ' opacity-50' : '')} disabled={!text.trim()} onClick={add}><Icon name="comment" size={14} /> Comentar</button>
        </div>
      )}
    </Modal>
  )
}

/* ============================================================
   Página de Prospectos
   ============================================================ */
export function ProspectosPage() {
  const { state, dispatch } = useStore()
  const me = state.currentUser
  const readOnly = isDireccion(me?.role)   // dirección: solo lectura

  const [form, setForm] = React.useState<Prospect | {} | null>(null)
  const [convert, setConvert] = React.useState<Prospect | null>(null)
  const [del, setDel] = React.useState<Prospect | null>(null)
  const [comments, setComments] = React.useState<Prospect | null>(null)
  const [f, setF] = React.useState({ q: '', seller: '', estado: '', resultado: '' })

  // Nombre del vendedor tolerante a id de vendedor O id de usuario (ventas).
  const sellerName = (id: string) => {
    const s = sel.sellerName(state, id)
    return s !== '—' ? s : (sel.userName(state, id) || '—')
  }

  const rows = state.prospects.filter(p => {
    if (f.seller && p.seller !== f.seller) return false
    if (f.estado && p.estado !== f.estado) return false
    if (f.resultado && p.resultado !== f.resultado) return false
    if (f.q) {
      const hay = `${p.name} ${p.empresa || ''} ${p.phone || ''} ${p.city || ''} ${p.sistema || ''}`.toLowerCase()
      if (!hay.includes(f.q.toLowerCase())) return false
    }
    return true
  })

  // Opciones de vendedor (ids presentes en prospectos).
  const sellerOpts = [...new Set(state.prospects.map(p => p.seller).filter(Boolean))]
  // KPIs — respetan el filtro de VENDEDOR (no los de estado/resultado, para no vaciar
  // los conteos). Al elegir un vendedor, muestran solo sus prospectos.
  const kpiBase = f.seller ? state.prospects.filter(p => p.seller === f.seller) : state.prospects
  const enEspera = kpiBase.filter(p => p.resultado === 'En espera').length
  const vendidosPorConvertir = kpiBase.filter(p => p.resultado === 'Vendido' && !p.convertedProjectId).length
  const cotizados = kpiBase.filter(p => p.estado === 'Cotizado').length
  const totalCosto = kpiBase.reduce((a, p) => a + (p.costo || 0), 0)
  const hasFilters = f.q || f.seller || f.estado || f.resultado

  const markSold = (p: Prospect) => dispatch({ type: 'SAVE_PROSPECT', prospect: { ...p, resultado: 'Vendido' } })

  // Prellenado del formulario de proyecto con los datos del prospecto (sin cliente:
  // ese se agrega en el propio formulario).
  const prefillFrom = (pr: Prospect): Partial<Project> => ({
    seller: pr.seller,
    city: pr.city || '',
    sistemaVendido: pr.sistema,
    origen: pr.anuncio,
    alias: pr.name,
    ventaSubtotal: pr.costo,
    obs: `Prospecto: ${pr.name}${pr.empresa ? ' · ' + pr.empresa : ''}${pr.phone ? ' · Tel: ' + pr.phone : ''}${pr.email ? ' · ' + pr.email : ''}`,
  })
  const onConverted = (pr: Prospect, project: Project) => {
    dispatch({ type: 'SAVE_PROSPECT', prospect: { ...pr, resultado: 'Vendido', convertedProjectId: project.id } })
    setConvert(null)
  }

  return (
    <div>
      <div className="spread mb-[18px] flex-wrap gap-3">
        <div className="sec-title m-0"><h2>Prospectos</h2><span className="sub">Seguimiento de leads antes de registrar la venta</span></div>
        {!readOnly && <button className="btn btn-primary" onClick={() => setForm({})}><Icon name="plus" size={15} /> Nuevo prospecto</button>}
      </div>

      <div className="grid grid-cols-5 gap-3.5 mb-4">
        <KPI label={f.seller ? `Prospectos · ${sellerName(f.seller)}` : 'Total prospectos'} value={kpiBase.length} icon="clients" accent />
        <KPI label="Costo total" value={totalCosto} format={fmtMoney} icon="money" />
        <KPI label="Cotizados" value={cotizados} icon="doc" />
        <KPI label="En espera" value={enEspera} icon="calendar" />
        <KPI label="Vendidos por registrar" value={vendidosPorConvertir} icon="flag" foot={vendidosPorConvertir ? 'Falta crear el proyecto' : 'Al corriente'} />
      </div>

      <div className="flex gap-2 mb-3.5 items-center flex-wrap">
        <div className="relative flex-[1_1_220px] max-w-[300px]">
          <Icon name="search" size={15} className="absolute left-[11px] top-2.5 text-tx-3" />
          <input className="input pl-[34px]" placeholder="Buscar nombre, empresa, teléfono…" value={f.q} onChange={e => setF({ ...f, q: e.target.value })} />
        </div>
        <Select value={f.seller} onChange={e => setF({ ...f, seller: e.target.value })} className="w-auto min-w-[160px]">
          <option value="">Todos los vendedores</option>
          {sellerOpts.map(id => <option key={id} value={id}>{sellerName(id)}</option>)}
        </Select>
        <Select value={f.estado} onChange={e => setF({ ...f, estado: e.target.value })} className="w-auto min-w-[140px]">
          <option value="">Todos los estados</option>
          {ESTADOS.map(s => <option key={s} value={s}>{s}</option>)}
        </Select>
        <Select value={f.resultado} onChange={e => setF({ ...f, resultado: e.target.value })} className="w-auto min-w-[140px]">
          <option value="">Todos los resultados</option>
          {RESULTADOS.map(s => <option key={s} value={s}>{s}</option>)}
        </Select>
        {hasFilters && <button className="btn btn-ghost btn-sm" onClick={() => setF({ q: '', seller: '', estado: '', resultado: '' })}><Icon name="close" size={13} /> Limpiar</button>}
        <span className="meta">{rows.length} de {state.prospects.length}</span>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead><tr>
              <th>Nombre</th><th>Vendedor</th><th>Empresa</th><th>Teléfono</th><th>Ciudad</th>
              <th>Fecha asig.</th><th>Estado</th><th>Últ. contacto</th><th>Seguimiento</th>
              <th className="num">Costo</th><th>Resultado</th><th>Sistema</th><th>Anuncio</th><th></th>
            </tr></thead>
            <tbody>
              {rows.map(p => {
                const sg = seguimiento(p)
                return (
                  <tr key={p.id} onClick={() => !readOnly && setForm(p)} style={readOnly ? { cursor: 'default' } : undefined}>
                    <td className="font-semibold text-tx-1 text-[12.5px]">{p.name}</td>
                    <td className="text-[12px]">{sellerName(p.seller)}</td>
                    <td className="text-tx-2 text-[12px]">{p.empresa || '—'}</td>
                    <td className="mono text-[12px]">{p.phone || '—'}</td>
                    <td className="text-tx-1 text-[12px]">{p.city || '—'}</td>
                    <td className="num text-tx-2 text-[12px]">{p.fechaAsignacion ? fmtDateShort(p.fechaAsignacion) : '—'}</td>
                    <td><Badge color={ESTADO_COLOR[p.estado]}>{p.estado}</Badge></td>
                    <td className="num text-tx-2 text-[12px]">{p.ultimoContacto ? fmtDateShort(p.ultimoContacto) : '—'}</td>
                    <td><span className="text-[11.5px] font-semibold" style={{ color: sg.color }}>{sg.label}</span></td>
                    <td className="num">{p.costo != null ? fmtMoney(p.costo) : '—'}</td>
                    <td><Badge color={RESULTADO_COLOR[p.resultado]}>{p.resultado}</Badge></td>
                    <td className="text-tx-2 text-[12px]">{p.sistema || '—'}</td>
                    <td className="text-tx-2 text-[12px]">{p.anuncio || '—'}</td>
                    <td onClick={e => e.stopPropagation()}>
                      <div className="flex gap-1 justify-end items-center">
                        {!readOnly && (
                          <>
                            {p.convertedProjectId ? (
                              <Badge color="var(--st-9)" icon="check">Convertido</Badge>
                            ) : p.resultado === 'Vendido' ? (
                              <button className="btn btn-primary btn-sm whitespace-nowrap" onClick={() => setConvert(p)}><Icon name="flag" size={13} /> Registrar venta</button>
                            ) : (
                              <button className="btn btn-ghost btn-sm whitespace-nowrap" title="Marcar como vendido" onClick={() => markSold(p)}><Icon name="check" size={13} /> Marcar vendido</button>
                            )}
                            <button className="icon-btn w-7 h-7" title="Editar" onClick={() => setForm(p)}><Icon name="edit" size={13} /></button>
                            <button className="icon-btn w-7 h-7" title="Eliminar" onClick={() => setDel(p)}><Icon name="trash" size={13} /></button>
                          </>
                        )}
                        <button className="icon-btn w-7 h-7 relative" title="Comentarios" onClick={() => setComments(p)}>
                          <Icon name="comment" size={13} />
                          {(p.comments?.length || 0) > 0 && <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] px-1 grid place-items-center rounded-full text-white text-[9px] font-bold leading-none" style={{ background: 'var(--acc)' }}>{p.comments!.length}</span>}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && <Empty icon="clients">Sin prospectos{hasFilters ? ' que coincidan con los filtros' : ' — agrega el primero'}</Empty>}
      </div>

      {form && <ProspectForm prospect={'id' in form ? form : undefined} onClose={() => setForm(null)} />}
      {convert && (
        <ProjectForm prefill={prefillFrom(convert)} onClose={() => setConvert(null)} onSaved={(project) => onConverted(convert, project)} />
      )}
      {comments && <ProspectComments prospect={comments} onClose={() => setComments(null)} />}
      {del && (
        <Confirm title="Eliminar prospecto" danger
          message={`¿Seguro que quieres eliminar el prospecto "${del.name}"? Esta acción no se puede deshacer.`}
          onConfirm={() => { dispatch({ type: 'DELETE_PROSPECT', id: del.id }); setDel(null) }}
          onClose={() => setDel(null)} />
      )}
    </div>
  )
}
