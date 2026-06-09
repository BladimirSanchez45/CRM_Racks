// ============================================================
//  CONFIGURACIÓN — vista de ajustes de la cuenta del usuario.
//  Layout tipo página de ajustes: hero de perfil + secciones a
//  dos columnas (descripción | controles). Pensada para crecer.
// ============================================================
import * as React from 'react'
import { useStore } from '../../core/data'
import { changeMyPassword } from '../../core/api'
import { Field, Input, Avatar } from '../../core/ui'
import { Icon } from '../../core/icons'

const MIN_LEN = 6

/** Fila de sección: descripción a la izquierda, controles a la derecha. */
function Section({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-x-12 gap-y-4 py-7 border-t border-line">
      <div>
        <h3 className="text-[14px] font-semibold">{title}</h3>
        <p className="meta mt-1.5 leading-relaxed">{desc}</p>
      </div>
      <div className="w-full max-w-[480px]">{children}</div>
    </div>
  )
}

/** Fila etiqueta/valor (para datos de solo lectura). Valor pegado a la etiqueta. */
function InfoRow({ label, children, last }: { label: string; children: React.ReactNode; last?: boolean }) {
  return (
    <div className={'grid grid-cols-[120px_1fr] items-center gap-3 py-2.5' + (last ? '' : ' border-b border-line-soft')}>
      <span className="text-[12.5px] text-tx-2">{label}</span>
      <span className="min-w-0 truncate">{children}</span>
    </div>
  )
}

function ProfileHero() {
  const { state } = useStore()
  const me = state.currentUser
  return (
    <div className="flex items-center gap-4 pb-7">
      <Avatar name={me?.name} size={58} />
      <div className="min-w-0">
        <div className="text-[19px] font-bold leading-tight truncate">{me?.name || 'Usuario'}</div>
        <div className="meta font-mono mt-0.5 truncate">{me?.email}</div>
        <div className="flex items-center gap-2 mt-2">
          <span className={'badge-role ' + (me?.role === 'admin' ? 'role-admin' : 'role-ventas')}>{me?.role === 'admin' ? 'Administrador' : 'Ventas'}</span>
          {me?.title && <span className="meta">{me.title}</span>}
        </div>
      </div>
    </div>
  )
}

function AccountControls() {
  const { state } = useStore()
  const me = state.currentUser
  return (
    <>
      <InfoRow label="Nombre"><span className="text-[13px] font-semibold">{me?.name || '—'}</span></InfoRow>
      <InfoRow label="Correo"><span className="text-[13px] font-mono">{me?.email || '—'}</span></InfoRow>
      <InfoRow label="Rol"><span className="text-[13px] font-semibold">{me?.role === 'admin' ? 'Administrador' : 'Ventas'}</span></InfoRow>
      <InfoRow label="Puesto" last><span className="text-[13px]">{me?.title || '—'}</span></InfoRow>
    </>
  )
}

function SecurityControls() {
  const [pw, setPw] = React.useState('')
  const [pw2, setPw2] = React.useState('')
  const [error, setError] = React.useState('')
  const [ok, setOk] = React.useState(false)
  const [saving, setSaving] = React.useState(false)

  const valid = pw.trim().length >= MIN_LEN && pw === pw2
  const save = async () => {
    setError(''); setOk(false)
    if (pw.length < MIN_LEN) { setError(`La contraseña debe tener al menos ${MIN_LEN} caracteres.`); return }
    if (pw !== pw2) { setError('Las contraseñas no coinciden.'); return }
    setSaving(true)
    try {
      await changeMyPassword(pw)
      setOk(true); setPw(''); setPw2('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cambiar la contraseña.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-3.5">
      {error && <div className="login-error"><Icon name="alert" size={15} /> <span>{error}</span></div>}
      {ok && (
        <div className="flex items-center gap-2 text-[12.5px] rounded-[8px] p-2.5" style={{ background: 'var(--acc-ghost)', color: 'var(--ok)' }}>
          <Icon name="check" size={15} /> <span>Contraseña actualizada correctamente.</span>
        </div>
      )}
      <Field label="Nueva contraseña"><Input type="password" value={pw} onChange={e => { setPw(e.target.value); setOk(false) }} placeholder="••••••••" /></Field>
      <Field label="Confirmar contraseña"><Input type="password" value={pw2} onChange={e => { setPw2(e.target.value); setOk(false) }} placeholder="••••••••" /></Field>
      <div className="flex items-center justify-between gap-3">
        <span className="meta">Mínimo {MIN_LEN} caracteres.</span>
        <button className={'btn btn-primary' + (!valid || saving ? ' opacity-50' : '')} disabled={!valid || saving} onClick={save}>
          <Icon name="check" size={15} /> {saving ? 'Guardando…' : 'Cambiar contraseña'}
        </button>
      </div>
    </div>
  )
}

export function SettingsPage() {
  return (
    <div>
      <div className="spread mb-5">
        <div className="sec-title m-0"><h2>Configuración</h2><span className="sub">Ajustes de tu cuenta</span></div>
      </div>
      <ProfileHero />
      <Section title="Mi cuenta" desc="Información de tu perfil. Para cambiar estos datos contacta a un administrador.">
        <AccountControls />
      </Section>
      <Section title="Seguridad" desc="Cambia la contraseña con la que inicias sesión. Solo afecta tu propia cuenta.">
        <SecurityControls />
      </Section>
    </div>
  )
}
