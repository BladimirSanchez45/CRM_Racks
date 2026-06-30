// ============================================================
//  UI PRIMITIVES — badges, modal, fields, KPI, doc chips
// ============================================================
import * as React from 'react'
import { createPortal } from 'react-dom'
import { Icon, type IconName } from './icons'
import { STAGES, STAGE_MAP, stageIndex } from './data'
import { uploadDoc, deleteDoc, signedDocUrl } from './api'
import type { DocRef, OcStatus, PaymentStatus, PayStatus, StageId } from './types'

/* ---- Stage badge (colored, blueprint-y) ---- */
export function StageBadge({ stage, size = 'md', withNum = false }: { stage: StageId; size?: 'sm' | 'md'; withNum?: boolean }) {
  const s = STAGE_MAP[stage]
  if (!s) return null
  const small = size === 'sm'
  return (
    <span className={'badge ' + (small ? 'text-[9.5px] py-0.5 px-1.5' : 'text-[10.5px] py-[3px] px-2')} style={{ color: s.color }}>
      <span className="dot"></span>
      {withNum && <span className="opacity-70">{String(s.n).padStart(2, '0')}</span>}
      {s.short}
    </span>
  )
}

/* ---- Generic colored badge ---- */
export function Badge({ children, color = 'var(--tx-2)', solid = false, icon }: { children: React.ReactNode; color?: string; solid?: boolean; icon?: IconName }) {
  if (solid) {
    return (
      <span className="badge badge-solid" style={{ background: color, borderColor: color }}>
        {icon && <Icon name={icon} size={11} />}{children}
      </span>
    )
  }
  return (
    <span className="badge" style={{ color }}>
      <span className="dot"></span>{children}
    </span>
  )
}

/* ---- OC status badge (estatus calculado de la orden) ---- */
export const OC_STATUS: Record<OcStatus, { label: string; color: string }> = {
  Pendiente: { label: 'Pendiente', color: 'var(--tx-2)' },
  Parcial:   { label: 'Parcial',   color: 'var(--st-5)' },
  Liquidada: { label: 'Liquidada', color: 'var(--ok)' },
  Vencida:   { label: 'Vencida',   color: 'var(--danger)' },
  Cancelada: { label: 'Cancelada', color: 'var(--tx-3)' },
}
export function OCStatus({ status }: { status: OcStatus }) {
  const s = OC_STATUS[status] || OC_STATUS.Pendiente
  return <Badge color={s.color}>{s.label}</Badge>
}

/* ---- Payment status badge (estado de un abono) ---- */
export const PAY_STATUS: Record<PaymentStatus, { label: string; color: string }> = {
  Pagado:     { label: 'Pagado',     color: 'var(--ok)' },
  Programado: { label: 'Programado', color: 'var(--warn)' },
  Cancelado:  { label: 'Cancelado',  color: 'var(--tx-3)' },
}
export function PaymentBadge({ status }: { status: PaymentStatus }) {
  const s = PAY_STATUS[status] || PAY_STATUS.Programado
  return <Badge color={s.color}>{s.label}</Badge>
}

/* ---- Finiquito / payment badge ---- */
export function PayBadge({ status }: { status: PayStatus }) {
  return status === 'paid'
    ? <Badge color="var(--ok)">Pagado</Badge>
    : <Badge color="var(--warn)">Pendiente</Badge>
}

/* ---- Avatar ---- */
export function Avatar({ name, initials, size = 30, color }: { name?: string; initials?: string; size?: number; color?: string }) {
  const ini = initials || (name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.4, background: color || 'var(--bg-4)' }}>{ini}</span>
  )
}

/* ---- Star rating ---- */
export function Rating({ value = 0, size = 13 }: { value?: number; size?: number }) {
  return (
    <span className="inline-flex gap-0.5 text-acc">
      {[1,2,3,4,5].map(i => (
        <svg key={i} width={size} height={size} viewBox="0 0 24 24" fill={i <= value ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" style={{ opacity: i <= value ? 1 : 0.3 }}>
          <path d="M12 3l2.6 5.6 6.1.7-4.5 4.1 1.2 6L12 16.9 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z"/>
        </svg>
      ))}
    </span>
  )
}

/* ---- Document chip (abre el visor si tiene archivo) ---- */
export function DocChip({ doc, label }: { doc?: DocRef; label: string }) {
  const [open, setOpen] = React.useState(false)
  if (!doc || !doc.ok) {
    return (
      <span className="doc-chip doc-missing" title={`${label}: faltante`}>
        <Icon name="docPlus" size={14} />
        <span className="nm">{label} · faltante</span>
      </span>
    )
  }
  return (
    <>
      <span className={'doc-chip' + (doc.path ? ' doc-clickable' : '')} title={doc.path ? `Ver ${doc.name}` : doc.name} onClick={doc.path ? () => setOpen(true) : undefined}>
        <Icon name="doc" size={14} />
        <span className="nm">{doc.name}</span>
        {doc.path && <Icon name="eye" size={13} className="doc-eye" />}
      </span>
      {open && doc.path && <DocPreview path={doc.path} name={doc.name} onClose={() => setOpen(false)} />}
    </>
  )
}

/* ---- Visor de documento (URL firmada de Storage: PDF en iframe, imágenes inline) ---- */
export function DocPreview({ path, name, onClose }: { path: string; name: string; onClose: () => void }) {
  const [url, setUrl] = React.useState('')
  const [err, setErr] = React.useState('')
  React.useEffect(() => {
    let active = true
    signedDocUrl(path)
      .then(u => { if (active) setUrl(u) })
      .catch(() => { if (active) setErr('No se pudo cargar el documento.') })
    return () => { active = false }
  }, [path])
  const isImg = /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name)
  const isPdf = /\.pdf$/i.test(name)
  // Office (Excel/Word/PowerPoint): el navegador no los previsualiza; usamos el visor de Office Online.
  // Incluye .xlsm/.xlsb (Excel con macros / binario) además de los formatos estándar.
  const isOffice = /\.(xlsx|xlsm|xlsb|xls|docx|doc|pptx|ppt)$/i.test(name)
  const officeSrc = url ? `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}` : ''
  return (
    <Modal width={900} icon="doc" title={name} onClose={onClose}
      footer={url ? <a className="btn btn-ghost" href={url} target="_blank" rel="noreferrer"><Icon name="download" size={15} /> Abrir / Descargar</a> : <span></span>}>
      <div className="doc-preview">
        {err ? <div className="text-tx-2 text-[13px] py-12 text-center">{err}</div>
          : !url ? <div className="text-tx-3 text-[13px] py-12 text-center">Cargando…</div>
          : isImg ? <img src={url} alt={name} />
          : isPdf ? <iframe src={url} title={name} />
          : isOffice ? <iframe src={officeSrc} title={name} />
          : <div className="text-tx-2 text-[13px] py-12 text-center">Sin vista previa para este tipo de archivo.<br /><a className="text-acc" href={url} target="_blank" rel="noreferrer">Descargar archivo</a></div>}
      </div>
    </Modal>
  )
}

/* ---- File field (sube a Supabase Storage; guarda nombre + ruta) ---- */
export function FileField({ label, value, path, folder, onChange, accept }: {
  label: string
  value?: string
  path?: string
  folder: string
  onChange: (v: { name: string; path: string }) => void
  accept?: string
}) {
  const ref = React.useRef<HTMLInputElement>(null)
  const [busy, setBusy] = React.useState(false)
  const [err, setErr] = React.useState('')
  const [preview, setPreview] = React.useState(false)
  const [dragOver, setDragOver] = React.useState(false)

  const pick = async (file: File) => {
    setBusy(true); setErr('')
    try {
      const p = await uploadDoc(file, folder)
      onChange({ name: file.name, path: p })
    } catch {
      setErr('No se pudo subir el archivo.')
    } finally {
      setBusy(false)
      if (ref.current) ref.current.value = ''
    }
  }
  const clear = async () => {
    if (path) { try { await deleteDoc(path) } catch { /* best-effort */ } }
    onChange({ name: '', path: '' })
  }

  return (
    <div className="field">
      {label && <label>{label}</label>}
      <div className="flex gap-2">
        <div
          className={'doc-chip flex-1 min-w-0' + (value ? '' : ' doc-missing')}
          onClick={() => { if (!busy) ref.current?.click() }}
          onDragOver={(e) => { e.preventDefault(); if (!busy) setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f && !busy) pick(f) }}
          style={{ cursor: busy ? 'default' : 'pointer', ...(dragOver ? { borderColor: 'var(--acc)', background: 'color-mix(in srgb, var(--acc) 10%, transparent)' } : {}) }}
          title="Arrastra un archivo aquí o haz clic para examinar">
          <Icon name={value && !busy ? 'doc' : 'clip'} size={14} />
          <span className="nm">{busy ? 'Subiendo…' : (value || (dragOver ? 'Suelta el archivo aquí' : 'Arrastra un archivo o examina'))}</span>
        </div>
        {value && path && <button type="button" className="btn btn-sm btn-ghost shrink-0" onClick={() => setPreview(true)} title="Ver"><Icon name="eye" size={14} /></button>}
        <button type="button" className="btn btn-sm btn-ghost shrink-0" disabled={busy} onClick={() => ref.current?.click()}>{value ? 'Cambiar' : 'Examinar'}</button>
        {value && <button type="button" className="btn btn-sm btn-ghost shrink-0" disabled={busy} onClick={clear}><Icon name="close" size={13} /></button>}
      </div>
      {err && <div className="text-[11.5px] mt-1" style={{ color: 'var(--danger)' }}>{err}</div>}
      <input ref={ref} type="file" accept={accept} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) pick(f) }} />
      {preview && path && <DocPreview path={path} name={value || 'documento'} onClose={() => setPreview(false)} />}
    </div>
  )
}

/* ---- Form fields ---- */
export function Field({ label, children, span }: { label?: React.ReactNode; children: React.ReactNode; span?: number }) {
  return <div className="field" style={span ? { gridColumn: `span ${span}` } : undefined}>{label && <label>{label}</label>}{children}</div>
}
export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) { return <input className="input" {...props} /> }
export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) { return <textarea className="textarea" {...props} /> }
export function Select({ children, className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) { return <select className={'select' + (className ? ' ' + className : '')} {...props}>{children}</select> }

/* ---- Combobox: select con búsqueda (escribe y filtra) ---- */
export interface ComboOption { value: string; label: string; sub?: string }
export function Combobox({ value, onChange, options, placeholder = 'Selecciona…', emptyText = 'Sin resultados', max = 50 }: {
  value: string
  onChange: (v: string) => void
  options: ComboOption[]
  placeholder?: string
  emptyText?: string
  max?: number
}) {
  const [open, setOpen] = React.useState(false)
  const [q, setQ] = React.useState('')
  const wrap = React.useRef<HTMLDivElement>(null)
  const selected = options.find(o => o.value === value)

  React.useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) { setOpen(false); setQ('') } }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const needle = q.trim().toLowerCase()
  const matches = needle ? options.filter(o => (o.label + ' ' + (o.sub || '')).toLowerCase().includes(needle)) : options
  const shown = matches.slice(0, max)
  const pick = (v: string) => { onChange(v); setOpen(false); setQ('') }

  return (
    <div className="combo" ref={wrap}>
      <div className={'combo-input' + (open ? ' open' : '')} onClick={() => setOpen(true)}>
        <Icon name="search" size={14} />
        <input
          value={open ? q : (selected?.label ?? '')}
          placeholder={selected ? selected.label : placeholder}
          onChange={e => { setQ(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
        />
        {value && <button type="button" className="combo-clear" title="Quitar" onClick={e => { e.stopPropagation(); onChange(''); setQ('') }}><Icon name="close" size={13} /></button>}
        <Icon name="chevronDown" size={14} className="combo-caret" />
      </div>
      {open && (
        <div className="combo-pop">
          {shown.length === 0
            ? <div className="combo-empty">{emptyText}</div>
            : shown.map(o => (
              <div key={o.value} className={'combo-opt' + (o.value === value ? ' on' : '')} onMouseDown={e => { e.preventDefault(); pick(o.value) }}>
                <span className="combo-opt-label">{o.label}</span>
                {o.sub && <span className="combo-opt-sub">{o.sub}</span>}
              </div>
            ))}
          {matches.length > shown.length && <div className="combo-more">Mostrando {shown.length} de {matches.length} · sigue escribiendo para afinar</div>}
        </div>
      )}
    </div>
  )
}

/* ---- Campo de dinero: muestra el número con comas y "$"; devuelve el número ---- */
const moneyClean = (s: string) => {
  let r = s.replace(/[^\d.]/g, '')
  const i = r.indexOf('.')
  if (i !== -1) r = r.slice(0, i + 1) + r.slice(i + 1).replace(/\./g, '') // un solo punto decimal
  return r
}
const moneyFormat = (raw: string) => {
  if (raw === '' || raw === '.') return raw
  const [int, dec] = raw.split('.')
  const intFmt = (int || '0').replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return dec !== undefined ? `${intFmt}.${dec}` : intFmt
}
const moneyDisp = (v: number | string) => {
  if (v === '' || v == null) return ''
  const n = typeof v === 'number' ? v : parseFloat(String(v))
  return isNaN(n) ? '' : moneyFormat(moneyClean(String(v)))
}
export function MoneyInput({ value, onChange, placeholder, className }: { value: number | string; onChange: (n: number) => void; placeholder?: string; className?: string }) {
  const [disp, setDisp] = React.useState(() => moneyDisp(value))
  React.useEffect(() => {
    if (value === '' || value == null) { if (disp !== '') setDisp('') ; return }
    const ext = typeof value === 'number' ? value : parseFloat(String(value))
    const cur = parseFloat(moneyClean(disp) || 'x')
    if (!isNaN(ext) && ext !== cur) setDisp(moneyDisp(value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-tx-3 text-[13px] pointer-events-none">$</span>
      <input className={'input pl-7' + (className ? ' ' + className : '')} inputMode="decimal" placeholder={placeholder}
        value={disp}
        onChange={e => { const c = moneyClean(e.target.value); setDisp(moneyFormat(c)); onChange(c === '' || c === '.' ? 0 : parseFloat(c) || 0) }} />
    </div>
  )
}

/* ---- Variante compacta de campo de dinero para celdas de tabla ----
   Muestra el valor como dinero ("$1,234.56") con la clase que se le pase (sin la
   clase "input" grande), y devuelve el número. El "$" va dentro del texto para no
   ocupar espacio extra en celdas angostas. */
export function MoneyCellInput({ value, onChange, className, placeholder }: { value: number | string; onChange: (n: number) => void; className?: string; placeholder?: string }) {
  const [disp, setDisp] = React.useState(() => moneyDisp(value))
  React.useEffect(() => {
    if (value === '' || value == null) { if (disp !== '') setDisp(''); return }
    const ext = typeof value === 'number' ? value : parseFloat(String(value))
    const cur = parseFloat(moneyClean(disp) || 'x')
    if (!isNaN(ext) && ext !== cur) setDisp(moneyDisp(value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])
  return (
    <input className={className} inputMode="decimal" placeholder={placeholder}
      value={disp === '' ? '' : '$' + disp}
      onChange={e => { const c = moneyClean(e.target.value); setDisp(moneyFormat(c)); onChange(c === '' || c === '.' ? 0 : parseFloat(c) || 0) }} />
  )
}

/* ---- Modal ---- */
export function Modal({ title, sub, icon, onClose, children, footer, width = 640 }: {
  title: React.ReactNode
  sub?: React.ReactNode
  icon?: IconName
  onClose: () => void
  children: React.ReactNode
  footer?: React.ReactNode
  width?: number
}) {
  React.useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', h); document.body.style.overflow = '' }
  }, [])
  // Portal a <body>: evita que el modal quede atrapado en el stacking context de
  // un ancestro con transform/filter/backdrop-filter (p. ej. el topbar) y aparezca
  // detrás del contenido.
  return createPortal(
    <div className="modal-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ maxWidth: width }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-h">
          {icon && <span className="text-acc"><Icon name={icon} size={20} /></span>}
          <div className="flex-1">
            <div className="m-ttl">{title}</div>
            {sub && <div className="meta mt-0.5">{sub}</div>}
          </div>
          <button className="icon-btn bg-transparent border-none" onClick={onClose}><Icon name="close" size={18} /></button>
        </div>
        <div className="modal-b">{children}</div>
        {footer && <div className="modal-f">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

/* ---- KPI card with animated counter ---- */
export function useCountUp(target: number, dur = 700) {
  // Init to target so the value is correct on first paint and never gets
  // stuck at 0 if rAF is throttled (background tab). Animate from 0 when visible.
  const [v, setV] = React.useState(target)
  React.useEffect(() => {
    let raf: number, start: number | undefined
    const tick = (t: number) => {
      if (!start) start = t
      const p = Math.min((t - start) / dur, 1)
      const eased = 1 - Math.pow(1 - p, 3)
      setV(target * eased)
      if (p < 1) raf = requestAnimationFrame(tick)
      else setV(target)
    }
    raf = requestAnimationFrame(tick)
    const fb = setTimeout(() => setV(target), dur + 250) // guarantee final value
    return () => { cancelAnimationFrame(raf); clearTimeout(fb) }
  }, [target])
  return v
}
export function KPI({ label, value, unit, format, icon, foot, footTrend, accent, delay = 0 }: {
  label: React.ReactNode
  value: number | string
  unit?: React.ReactNode
  format?: (n: number) => string
  icon?: IconName
  foot?: React.ReactNode
  footTrend?: 'up' | 'dn'
  accent?: boolean
  delay?: number
}) {
  const animated = useCountUp(typeof value === 'number' ? value : 0)
  const display = typeof value === 'number'
    ? (format ? format(animated) : Math.round(animated).toLocaleString('es-MX'))
    : value
  return (
    <div className={'kpi animate-in' + (accent ? ' kpi-accent' : '')} style={{ animationDelay: delay + 'ms' }}>
      <div className="k-label">{label}</div>
      <div className="k-val">{display}{unit && <span className="unit">{unit}</span>}</div>
      {foot && <div className="k-foot"><span className={footTrend === 'up' ? 'trend-up' : footTrend === 'dn' ? 'trend-dn' : ''}>{foot}</span></div>}
      {icon && <div className="k-ic"><Icon name={icon} size={22} /></div>}
    </div>
  )
}

/* ---- Segmented control ---- */
export function Seg({ value, onChange, options }: {
  value: string
  onChange: (v: string) => void
  options: { value: string; icon?: IconName; label: React.ReactNode }[]
}) {
  return (
    <div className="seg">
      {options.map(o => (
        <button key={o.value} className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.icon && <Icon name={o.icon} size={14} style={{ marginRight: o.label ? 6 : 0, verticalAlign: '-2px' }} />}
          {o.label}
        </button>
      ))}
    </div>
  )
}

/* ---- Empty state ---- */
export function Empty({ icon = 'box', children }: { icon?: IconName; children: React.ReactNode }) {
  return <div className="empty"><Icon name={icon} size={40} /><div>{children}</div></div>
}

/* ---- Confirm dialog ---- */
export function Confirm({ title, message, confirmLabel = 'Eliminar', danger = true, onConfirm, onClose }: {
  title: React.ReactNode
  message: React.ReactNode
  confirmLabel?: string
  danger?: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <Modal title={title} icon="alert" onClose={onClose} width={420}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
        <button className={danger ? 'btn btn-danger' : 'btn btn-primary'} onClick={() => { onConfirm(); onClose() }}>{confirmLabel}</button>
      </>}>
      <p className="m-0 text-tx-1 leading-normal">{message}</p>
    </Modal>
  )
}

/* ---- Guardia de cambios sin guardar ----
   Compara una "foto" del estado del formulario contra su valor inicial. Si hay
   cambios, intercepta el cierre y pide confirmación antes de descartar.
   Uso:  const { requestClose, guard } = useUnsavedGuard(formState, onClose)
         <Modal onClose={requestClose} ...>  // y el botón Cancelar → requestClose
         ... {guard}  // se renderiza dentro del modal */
export function useUnsavedGuard(snapshot: unknown, onClose: () => void) {
  const initial = React.useRef(JSON.stringify(snapshot)).current
  const dirty = JSON.stringify(snapshot) !== initial
  const [confirmExit, setConfirmExit] = React.useState(false)
  const requestClose = () => { if (dirty) setConfirmExit(true); else onClose() }
  const guard = confirmExit ? (
    <Confirm
      title="Salir sin guardar"
      message="Tienes cambios sin guardar. Si sales ahora se perderán. ¿Seguro que quieres salir?"
      confirmLabel="Salir sin guardar"
      onConfirm={onClose}
      onClose={() => setConfirmExit(false)}
    />
  ) : null
  return { requestClose, guard, dirty }
}

/* ---- Section header ---- */
export function SecTitle({ title, sub, right }: { title: React.ReactNode; sub?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="spread mb-3.5">
      <div className="sec-title m-0">
        <h2>{title}</h2>
        {sub && <span className="sub">{sub}</span>}
      </div>
      {right}
    </div>
  )
}

/* ---- Stage stepper (mini pipeline indicator) ---- */
export function StageStepper({ stage }: { stage: StageId }) {
  const cur = stageIndex(stage)
  return (
    <div className="flex gap-[3px] items-center">
      {STAGES.map((s, i) => (
        <div key={s.id} title={s.label} style={{
          width: i === cur ? 22 : 9, height: 6,
          background: i <= cur ? s.color : 'var(--bg-4)',
          opacity: i <= cur ? 1 : 0.6, transition: 'all .2s',
        }}></div>
      ))}
    </div>
  )
}
