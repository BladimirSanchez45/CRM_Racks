// ============================================================
//  UI PRIMITIVES — badges, modal, fields, KPI, doc chips
// ============================================================
import * as React from 'react'
import { Icon, type IconName } from './icons'
import { STAGES, STAGE_MAP, stageIndex } from './data'
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

/* ---- Document chip ---- */
export function DocChip({ doc, label }: { doc?: DocRef; label: string }) {
  if (!doc || !doc.ok) {
    return (
      <span className="doc-chip doc-missing" title={`${label}: faltante`}>
        <Icon name="docPlus" size={14} />
        <span className="nm">{label} · faltante</span>
      </span>
    )
  }
  return (
    <span className="doc-chip" title={doc.name}>
      <Icon name="doc" size={14} />
      <span className="nm">{doc.name}</span>
    </span>
  )
}

/* ---- File field (stores filename only) ---- */
export function FileField({ label, value, onChange, accept }: { label: string; value?: string; onChange: (name: string) => void; accept?: string }) {
  const ref = React.useRef<HTMLInputElement>(null)
  return (
    <div className="field">
      <label>{label}</label>
      <div className="flex gap-2">
        <div className={'doc-chip flex-1' + (value ? '' : ' doc-missing')}>
          <Icon name="clip" size={14} />
          <span className="nm">{value || 'Ningún archivo seleccionado'}</span>
        </div>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => ref.current?.click()}>Examinar</button>
        {value && <button type="button" className="btn btn-sm btn-ghost" onClick={() => onChange('')}><Icon name="close" size={13} /></button>}
      </div>
      <input ref={ref} type="file" accept={accept} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onChange(f.name) }} />
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
  return (
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
    </div>
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
