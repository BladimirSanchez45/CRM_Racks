// ============================================================
//  CONFIGURACIÓN — vista de ajustes de la cuenta del usuario.
//  Layout tipo página de ajustes: hero de perfil + secciones a
//  dos columnas (descripción | controles). Pensada para crecer.
// ============================================================
import * as React from 'react'
import { useStore, roleLabel } from '../../core/data'
import { changeMyPassword } from '../../core/api'
import { Field, Input, Avatar } from '../../core/ui'
import { Icon } from '../../core/icons'
import { desktopSupported, desktopPermission, desktopEnabled, setDesktopEnabled, requestDesktopPermission, desktopNotify } from '../../core/desktop_notify'

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
          <span className={'badge-role role-' + (me?.role ?? 'ventas')}>{roleLabel(me?.role)}</span>
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
      <InfoRow label="Rol"><span className="text-[13px] font-semibold">{roleLabel(me?.role)}</span></InfoRow>
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

/** Notificaciones del sistema para los avisos de la agenda.
 *  El permiso lo da el NAVEGADOR y la preferencia se guarda por equipo:
 *  si entras desde otra computadora, hay que activarlas de nuevo ahí. */
function DesktopNotifControls() {
  const { state } = useStore()
  const myId = state.currentUser?.id
  const [perm, setPerm] = React.useState(desktopPermission())
  const [on, setOn] = React.useState(() => desktopEnabled(myId))
  const [probado, setProbado] = React.useState(false)

  if (!desktopSupported()) {
    return <div className="login-error"><Icon name="alert" size={15} /> <span>Este navegador no soporta notificaciones de escritorio.</span></div>
  }

  if (perm === 'denied') {
    return (
      <div className="flex flex-col gap-3">
        <div className="login-error"><Icon name="alert" size={15} /> <span>El navegador tiene bloqueadas las notificaciones de este sitio.</span></div>
        <p className="meta leading-relaxed">
          Para permitirlas, haz clic en el candado 🔒 de la barra de direcciones → <b>Notificaciones</b> → <b>Permitir</b>, y vuelve a cargar la página.
        </p>
      </div>
    )
  }

  // Activar: primero el permiso del navegador (requiere este clic), luego la preferencia.
  const activar = async () => {
    const p = perm === 'granted' ? 'granted' : await requestDesktopPermission()
    setPerm(p)
    if (p !== 'granted') return
    setDesktopEnabled(myId, true); setOn(true)
    desktopNotify({ title: 'Notificaciones activadas', body: 'Así se verán los avisos de tu agenda.', tag: 'crm-test' })
  }
  const desactivar = () => { setDesktopEnabled(myId, false); setOn(false); setProbado(false) }
  const probar = () => {
    desktopNotify({ title: 'Recordatorio · ' + new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }), body: 'Esto es una prueba desde el CRM.', tag: 'crm-test' })
    setProbado(true)
  }

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center justify-between gap-3 rounded-[8px] border border-line p-3 bg-bg-1">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className={on ? 'text-ok' : 'text-tx-3'}><Icon name={on ? 'check' : 'bell'} size={17} /></span>
          <div className="min-w-0">
            <div className="text-[13px] font-semibold">{on ? 'Activadas en este equipo' : 'Desactivadas'}</div>
            <div className="meta mt-0.5">{on ? 'Recibirás el aviso aunque la pestaña esté de fondo.' : 'Solo verás el aviso dentro de la app.'}</div>
          </div>
        </div>
        {on
          ? <button className="btn btn-ghost shrink-0" onClick={desactivar}>Desactivar</button>
          : <button className="btn btn-primary shrink-0" onClick={activar}><Icon name="bell" size={15} /> Activar</button>}
      </div>

      {on && (
        <div className="flex items-center justify-between gap-3">
          <span className="meta">{probado ? 'Enviada: revisa la esquina de tu pantalla.' : '¿Quieres ver cómo se ve?'}</span>
          <button className="btn btn-ghost" onClick={probar}>Enviar una de prueba</button>
        </div>
      )}

      <p className="meta leading-relaxed">
        Solo funcionan con el CRM <b>abierto</b> en el navegador (la pestaña puede estar de fondo o el navegador minimizado).
        Si cierras el navegador no llega nada.
      </p>
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
      <Section title="Notificaciones de escritorio" desc="Recibe los avisos de tu agenda (pendientes, recordatorios y citas) en el centro de notificaciones de Windows, no solo dentro del CRM. Se configura por equipo.">
        <DesktopNotifControls />
      </Section>
      <Section title="Seguridad" desc="Cambia la contraseña con la que inicias sesión. Solo afecta tu propia cuenta.">
        <SecurityControls />
      </Section>
    </div>
  )
}
