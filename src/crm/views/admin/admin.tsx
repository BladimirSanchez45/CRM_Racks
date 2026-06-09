// ============================================================
//  ADMINISTRACIÓN — gestión de usuarios (solo rol admin)
// ============================================================
import * as React from 'react'
import { useStore } from '../../core/data'
import { createUser, updateUser, toggleUser, removeUser, fetchUsers } from '../../core/api'
import { Modal, Field, Input, Select, Empty, Confirm } from '../../core/ui'
import { Icon } from '../../core/icons'
import type { User, Role, Seller } from '../../core/types'

const ROLES: { id: Role; label: string }[] = [
  { id: 'admin', label: 'Administrador' },
  { id: 'ventas', label: 'Ventas' },
  { id: 'logistica', label: 'Logística' },
  { id: 'almacen', label: 'Almacén' },
  { id: 'direccion', label: 'Dirección' },
]
const roleClass = (r: Role) => `role-${r}`
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
    ? { id: user.id, name: user.name, email: user.email, password: '', role: user.role, title: user.title || '', active: user.active }
    : { name: '', email: '', password: '', role: 'ventas', title: '', active: true })
  const set = (k: keyof UserFormState, v: unknown) => setU(s => ({ ...s, [k]: v }))
  const [error, setError] = React.useState('')
  const [saving, setSaving] = React.useState(false)

  // Al crear se exige contraseña; al editar es opcional (vacío = no cambiarla).
  const valid = u.name.trim() && u.email.trim() && (!!user || u.password.trim())
  const save = async () => {
    setError('')
    setSaving(true)
    try {
      const base = {
        name: u.name.trim(),
        email: u.email.trim(),
        role: u.role,
        title: u.title.trim(),
        initials: initialsOf(u.name),
        active: u.active,
      }
      if (user) {
        await updateUser({ id: user.id, ...base, ...(u.password.trim() ? { password: u.password } : {}) })
      } else {
        await createUser({ ...base, password: u.password })
      }
      // Refresca la lista desde la base.
      const users = await fetchUsers()
      dispatch({ type: 'HYDRATE', data: { users } })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar el usuario.')
      setSaving(false)
    }
  }

  return (
    <Modal width={520} icon={user ? 'edit' : 'plus'} title={user ? 'Editar usuario' : 'Nuevo usuario'} onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
        <div className="flex-1"></div>
        <button className={'btn btn-primary' + (!valid || saving ? ' opacity-50' : '')} disabled={!valid || saving} onClick={save}><Icon name="check" size={15} /> {saving ? 'Guardando…' : 'Guardar'}</button>
      </>}>
      {error && <div className="login-error mb-3"><Icon name="alert" size={15} /> <span>{error}</span></div>}
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

/* ---- Formulario de vendedor ---- */
function SellerForm({ seller, onClose }: { seller?: Seller; onClose: () => void }) {
  const { dispatch } = useStore()
  const [name, setName] = React.useState(seller?.name ?? '')
  const [ratePct, setRatePct] = React.useState(seller ? String((seller.rate * 100).toFixed(2).replace(/\.?0+$/, '')) : '4')
  const [overridePct, setOverridePct] = React.useState(seller?.overrideRate ? String((seller.overrideRate * 100).toFixed(2).replace(/\.?0+$/, '')) : '')

  const valid = name.trim() && ratePct.trim() && !isNaN(Number(ratePct)) && (!overridePct.trim() || !isNaN(Number(overridePct)))
  const save = () => {
    dispatch({
      type: 'SAVE_SELLER',
      seller: {
        ...(seller ? { id: seller.id } : {}),
        name: name.trim(),
        initials: initialsOf(name),
        rate: Number(ratePct) / 100,
        overrideRate: overridePct.trim() ? Number(overridePct) / 100 : 0,
      },
    })
    onClose()
  }

  return (
    <Modal width={440} icon={seller ? 'edit' : 'plus'} title={seller ? 'Editar vendedor' : 'Nuevo vendedor'} onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
        <div className="flex-1"></div>
        <button className={'btn btn-primary' + (!valid ? ' opacity-50' : '')} disabled={!valid} onClick={save}><Icon name="check" size={15} /> Guardar</button>
      </>}>
      <div className="grid grid-cols-2 gap-3.5">
        <Field label="Nombre completo" span={2}><Input value={name} onChange={e => setName(e.target.value)} placeholder="Ej. Ana Robles" /></Field>
        <Field label="Comisión (%)"><Input value={ratePct} onChange={e => setRatePct(e.target.value)} placeholder="4" /></Field>
        <Field label="Override otras ventas (%)"><Input value={overridePct} onChange={e => setOverridePct(e.target.value)} placeholder="0" /></Field>
        <div className="meta col-span-2 -mt-1">Override: % que gana sobre las ventas de los <b>demás</b> vendedores. Déjalo en blanco si no aplica.</div>
      </div>
    </Modal>
  )
}

export function AdminPage() {
  const { state, dispatch } = useStore()
  const [form, setForm] = React.useState<User | {} | null>(null)
  const [del, setDel] = React.useState<User | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [sellerForm, setSellerForm] = React.useState<Seller | {} | null>(null)
  const [sellerDel, setSellerDel] = React.useState<Seller | null>(null)
  const me = state.currentUser

  const admins = state.users.filter(u => u.role === 'admin').length

  const refresh = async () => {
    const users = await fetchUsers()
    dispatch({ type: 'HYDRATE', data: { users } })
  }
  const onToggle = async (id: string) => {
    setBusy(true)
    try { await toggleUser(id); await refresh() }
    catch (e) { alert(e instanceof Error ? e.message : 'No se pudo cambiar el estado.') }
    finally { setBusy(false) }
  }
  const onDelete = async (id: string) => {
    setBusy(true)
    try { await removeUser(id); await refresh() }
    catch (e) { alert(e instanceof Error ? e.message : 'No se pudo eliminar el usuario.') }
    finally { setBusy(false); setDel(null) }
  }

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
                    <button className="btn btn-ghost btn-sm" title="Editar usuario" onClick={() => setForm(u)}><Icon name="edit" size={14} /></button>
                    <button className="btn btn-ghost btn-sm" disabled={isMe || lastAdmin || busy}
                      title={isMe ? 'No puedes desactivar tu propia cuenta' : lastAdmin ? 'Debe existir al menos un administrador' : ''}
                      onClick={() => onToggle(u.id)}>{u.active ? 'Desactivar' : 'Activar'}</button>
                    <button className="btn btn-ghost btn-sm text-danger" disabled={isMe || lastAdmin || busy}
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

      {/* ---- Vendedores ---- */}
      <div className="spread mb-[18px] mt-[28px]">
        <div className="sec-title m-0"><h2>Vendedores</h2><span className="sub">Catálogo de vendedores y su % de comisión</span></div>
        <button className="btn btn-primary" onClick={() => setSellerForm({})}><Icon name="plus" size={15} /> Nuevo vendedor</button>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>Vendedor</th><th>Comisión</th><th className="text-right">Acciones</th></tr></thead>
            <tbody>
              {state.sellers.map(v => (
                <tr key={v.id} onClick={() => setSellerForm(v)}>
                  <td>
                    <div className="flex items-center gap-2.5">
                      <span className="avatar">{v.initials}</span>
                      <span className="font-semibold text-[12.5px]">{v.name}</span>
                    </div>
                  </td>
                  <td className="num font-semibold">{(v.rate * 100).toFixed(1)}%{v.overrideRate ? <span className="meta font-normal"> + {(v.overrideRate * 100).toFixed(1)}% override</span> : null}</td>
                  <td className="text-right whitespace-nowrap" onClick={e => e.stopPropagation()}>
                    <button className="btn btn-ghost btn-sm" title="Editar vendedor" onClick={() => setSellerForm(v)}><Icon name="edit" size={14} /></button>
                    <button className="btn btn-ghost btn-sm text-danger" onClick={() => setSellerDel(v)}><Icon name="trash" size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {state.sellers.length === 0 && <Empty icon="clients">Sin vendedores</Empty>}
      </div>

      {form && <UserForm user={'id' in form ? form : undefined} onClose={() => setForm(null)} />}
      {del && <Confirm title="Eliminar usuario" message={`¿Eliminar a ${del.name}? Perderá el acceso al sistema.`}
        onConfirm={() => onDelete(del.id)} onClose={() => setDel(null)} />}
      {sellerForm && <SellerForm seller={'id' in sellerForm ? sellerForm : undefined} onClose={() => setSellerForm(null)} />}
      {sellerDel && <Confirm title="Eliminar vendedor" message={`¿Eliminar a ${sellerDel.name}?`}
        onConfirm={() => { dispatch({ type: 'DELETE_SELLER', id: sellerDel.id }); setSellerDel(null) }} onClose={() => setSellerDel(null)} />}
    </div>
  )
}
