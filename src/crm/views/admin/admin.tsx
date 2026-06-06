// ============================================================
//  ADMINISTRACIÓN — gestión de usuarios (solo rol admin)
// ============================================================
import * as React from 'react'
import { useStore } from '../../core/data'
import { Modal, Field, Input, Select, Empty, Confirm } from '../../core/ui'
import { Icon } from '../../core/icons'
import type { User, UserInput, Role } from '../../core/types'

const ROLES: { id: Role; label: string }[] = [
  { id: 'admin', label: 'Administrador' },
  { id: 'ventas', label: 'Ventas' },
]
const roleClass = (r: Role) => (r === 'admin' ? 'role-admin' : 'role-ventas')
const roleLabel = (r: Role) => ROLES.find(x => x.id === r)?.label ?? r
const initialsOf = (name: string) =>
  name.trim().split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?'

/* ---- Formulario de usuario ---- */
type UserFormState = {
  id?: string
  name: string
  email: string
  password: string
  role: Role
  title: string
  active: boolean
}
function UserForm({ user, onClose }: { user?: User; onClose: () => void }) {
  const { dispatch } = useStore()
  const [u, setU] = React.useState<UserFormState>(() => user
    ? { ...user, title: user.title || '' }
    : { name: '', email: '', password: '', role: 'ventas', title: '', active: true })
  const set = (k: keyof UserFormState, v: unknown) => setU(s => ({ ...s, [k]: v }))

  const valid = u.name.trim() && u.email.trim() && u.password.trim()
  const save = () => {
    const payload: UserInput = {
      ...(u.id ? { id: u.id } : {}),
      name: u.name.trim(),
      email: u.email.trim(),
      password: u.password,
      role: u.role,
      title: u.title.trim(),
      initials: initialsOf(u.name),
      active: u.active,
    }
    dispatch({ type: 'SAVE_USER', user: payload })
    onClose()
  }

  return (
    <Modal width={520} icon={user ? 'edit' : 'plus'} title={user ? 'Editar usuario' : 'Nuevo usuario'} onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
        <div className="flex-1"></div>
        <button className={'btn btn-primary' + (!valid ? ' opacity-50' : '')} disabled={!valid} onClick={save}><Icon name="check" size={15} /> Guardar</button>
      </>}>
      <div className="grid grid-cols-2 gap-3.5">
        <Field label="Nombre completo" span={2}><Input value={u.name} onChange={e => set('name', e.target.value)} placeholder="Ej. Ana Robles" /></Field>
        <Field label="Correo (usuario)" span={2}><Input type="email" value={u.email} onChange={e => set('email', e.target.value)} placeholder="correo@ccracks.mx" /></Field>
        <Field label="Contraseña" span={2}><Input value={u.password} onChange={e => set('password', e.target.value)} placeholder="••••••••" /></Field>
        <Field label="Rol">
          <Select value={u.role} onChange={e => set('role', e.target.value as Role)}>
            {ROLES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
          </Select>
        </Field>
        <Field label="Puesto"><Input value={u.title} onChange={e => set('title', e.target.value)} placeholder="Ejecutivo de ventas" /></Field>
        <Field label="Estado" span={2}>
          <button type="button" className="btn h-[38px] justify-center" onClick={() => set('active', !u.active)}
            style={{ background: u.active ? 'var(--acc-ghost-2)' : 'var(--bg-1)', borderColor: u.active ? 'var(--acc)' : 'var(--line)', color: u.active ? 'var(--acc-bright)' : 'var(--tx-2)' }}>
            {u.active ? 'Activo' : 'Inactivo'}
          </button>
        </Field>
      </div>
      {u.role === 'admin' && (
        <div className="mt-3.5 flex items-start gap-2 text-[12px] text-tx-2 rounded-[8px] p-3" style={{ background: 'var(--acc-ghost)' }}>
          <Icon name="shield" size={15} /> <span>Los administradores tienen acceso total, incluido este panel para crear y gestionar usuarios.</span>
        </div>
      )}
    </Modal>
  )
}

export function AdminPage() {
  const { state, dispatch } = useStore()
  const [form, setForm] = React.useState<User | {} | null>(null)
  const [del, setDel] = React.useState<User | null>(null)
  const me = state.currentUser

  const admins = state.users.filter(u => u.role === 'admin').length

  return (
    <div>
      <div className="spread mb-[18px]">
        <div className="sec-title m-0"><h2>Administración</h2><span className="sub">Usuarios y accesos del sistema</span></div>
        <button className="btn btn-primary" onClick={() => setForm({})}><Icon name="plus" size={15} /> Nuevo usuario</button>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>Usuario</th><th>Correo</th><th>Rol</th><th>Puesto</th><th>Estado</th><th className="text-right">Acciones</th></tr></thead>
            <tbody>
              {state.users.map(u => {
                const isMe = me?.id === u.id
                const lastAdmin = u.role === 'admin' && admins <= 1
                return (
                <tr key={u.id} onClick={() => setForm(u)}>
                  <td>
                    <div className="flex items-center gap-2.5">
                      <span className="avatar">{u.initials}</span>
                      <span className="font-semibold text-[12.5px]">{u.name}{isMe && <span className="meta ml-1">(tú)</span>}</span>
                    </div>
                  </td>
                  <td className="font-mono text-[12px] text-tx-1">{u.email}</td>
                  <td><span className={'badge-role ' + roleClass(u.role)}>{roleLabel(u.role)}</span></td>
                  <td className="text-[12.5px] text-tx-1">{u.title || '—'}</td>
                  <td>
                    <span className="inline-flex items-center gap-1.5 text-[12px]" style={{ color: u.active ? 'var(--ok)' : 'var(--tx-3)' }}>
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: u.active ? 'var(--ok)' : 'var(--tx-3)' }}></span>
                      {u.active ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="text-right whitespace-nowrap" onClick={e => e.stopPropagation()}>
                    <button className="btn btn-ghost btn-sm" disabled={isMe || lastAdmin}
                      title={isMe ? 'No puedes desactivar tu propia cuenta' : lastAdmin ? 'Debe existir al menos un administrador' : ''}
                      onClick={() => dispatch({ type: 'TOGGLE_USER', id: u.id })}>{u.active ? 'Desactivar' : 'Activar'}</button>
                    <button className="btn btn-ghost btn-sm text-danger" disabled={isMe || lastAdmin}
                      title={isMe ? 'No puedes eliminar tu propia cuenta' : lastAdmin ? 'Debe existir al menos un administrador' : ''}
                      onClick={() => setDel(u)}><Icon name="trash" size={14} /></button>
                  </td>
                </tr>
              ) })}
            </tbody>
          </table>
        </div>
        {state.users.length === 0 && <Empty icon="user">Sin usuarios</Empty>}
      </div>

      {form && <UserForm user={'id' in form ? form : undefined} onClose={() => setForm(null)} />}
      {del && <Confirm title="Eliminar usuario" message={`¿Eliminar a ${del.name}? Perderá el acceso al sistema.`}
        onConfirm={() => { dispatch({ type: 'DELETE_USER', id: del.id }); setDel(null) }} onClose={() => setDel(null)} />}
    </div>
  )
}
