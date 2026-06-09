// ============================================================
//  ADMINISTRACIÓN — gestión de usuarios (solo rol admin)
// ============================================================
import * as React from 'react'
import { useStore, roleLabel, isAdminRole, isSuperadmin, ROLE_LABELS } from '../../core/data'
import { createUser, updateUser, toggleUser, removeUser, fetchUsers, saveSeller, deleteSeller, fetchSellers, impersonateUser } from '../../core/api'
import { Modal, Field, Input, Select, Empty, Confirm } from '../../core/ui'
import { Icon } from '../../core/icons'
import type { User, Role, Seller } from '../../core/types'

// Roles asignables. 'superadmin' solo lo puede otorgar otro superadmin (se filtra abajo).
const ROLES: { id: Role; label: string }[] = [
  { id: 'superadmin', label: ROLE_LABELS.superadmin },
  { id: 'admin', label: ROLE_LABELS.admin },
  { id: 'ventas', label: ROLE_LABELS.ventas },
  { id: 'logistica', label: ROLE_LABELS.logistica },
  { id: 'almacen', label: ROLE_LABELS.almacen },
  { id: 'direccion', label: ROLE_LABELS.direccion },
]
const roleClass = (r: Role) => `role-${r}`
const initialsOf = (name: string) =>
  name.trim().split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?'
/** Fracción (0.04) → texto de porcentaje limpio ("4"). */
const pctStr = (frac: number) => String((frac * 100).toFixed(2).replace(/\.?0+$/, ''))

/* ---- Formulario de usuario ---- */
type UserFormState = {
  id?: string
  name: string
  email: string
  password: string
  role: Role
  title: string
  active: boolean
  ratePct: string
  overridePct: string
}
function UserForm({ user, onClose }: { user?: User; onClose: () => void }) {
  const { state, dispatch } = useStore()
  // Si el usuario ya tiene un vendedor ligado (mismo id), precarga sus % de comisión.
  const linkedSeller = user ? state.sellers.find(s => s.id === user.id) : undefined
  const [u, setU] = React.useState<UserFormState>(() => user
    ? { id: user.id, name: user.name, email: user.email, password: '', role: user.role, title: user.title || '', active: user.active,
        ratePct: linkedSeller ? pctStr(linkedSeller.rate) : '4', overridePct: linkedSeller?.overrideRate ? pctStr(linkedSeller.overrideRate) : '' }
    : { name: '', email: '', password: '', role: 'ventas', title: '', active: true, ratePct: '4', overridePct: '' })
  const set = (k: keyof UserFormState, v: unknown) => setU(s => ({ ...s, [k]: v }))
  const [error, setError] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const isVentas = u.role === 'ventas'

  // Al crear se exige contraseña; al editar es opcional (vacío = no cambiarla).
  // Si es vendedor, la comisión debe ser un número válido.
  const valid = u.name.trim() && u.email.trim() && (!!user || u.password.trim())
    && (!isVentas || (u.ratePct.trim() && !isNaN(Number(u.ratePct)) && (!u.overridePct.trim() || !isNaN(Number(u.overridePct)))))
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
      // Crea/edita el usuario y obtén su id (la Edge Function lo devuelve al crear).
      let userId = user?.id
      if (user) {
        await updateUser({ id: user.id, ...base, ...(u.password.trim() ? { password: u.password } : {}) })
      } else {
        const res = await createUser({ ...base, password: u.password })
        userId = res?.id
      }
      // Sincroniza el catálogo de vendedores: un usuario de rol Ventas ES un vendedor
      // (mismo id). Si cambia a otro rol, se elimina su vendedor ligado.
      if (userId) {
        if (isVentas) {
          await saveSeller({ id: userId, name: base.name, initials: base.initials, rate: Number(u.ratePct) / 100, overrideRate: u.overridePct.trim() ? Number(u.overridePct) / 100 : 0 })
        } else if (linkedSeller) {
          await deleteSeller(userId)
        }
      }
      // Refresca usuarios y vendedores desde la base.
      const [users, sellers] = await Promise.all([fetchUsers(), fetchSellers()])
      dispatch({ type: 'HYDRATE', data: { users, sellers } })
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
            {/* 'superadmin' SOLO se asigna desde la base de datos. En la UI solo aparece
                si el usuario ya lo es, para no perderlo al editar sus otros datos. */}
            {ROLES.filter(r => r.id !== 'superadmin' || isSuperadmin(user?.role)).map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
          </Select>
        </Field>
        <Field label="Puesto"><Input value={u.title} onChange={e => set('title', e.target.value)} placeholder="Ejecutivo de ventas" /></Field>
        {isVentas && <>
          <Field label="Comisión (%)"><Input value={u.ratePct} onChange={e => set('ratePct', e.target.value)} placeholder="4" /></Field>
          <Field label="Override otras ventas (%)"><Input value={u.overridePct} onChange={e => set('overridePct', e.target.value)} placeholder="0" /></Field>
          <div className="meta col-span-2 -mt-1">Como es rol Ventas, también se registra como <b>vendedor</b> (se le pueden asignar ventas y comisiones). Override: % que gana sobre las ventas de los demás.</div>
        </>}
        <Field label="Estado" span={2}>
          <button type="button" className="btn h-[38px] justify-center" onClick={() => set('active', !u.active)}
            style={{ background: u.active ? 'var(--acc-ghost-2)' : 'var(--bg-1)', borderColor: u.active ? 'var(--acc)' : 'var(--line)', color: u.active ? 'var(--acc-bright)' : 'var(--tx-2)' }}>
            {u.active ? 'Activo' : 'Inactivo'}
          </button>
        </Field>
      </div>
      {isAdminRole(u.role) && (
        <div className="mt-3.5 flex items-start gap-2 text-[12px] text-tx-2 rounded-[8px] p-3" style={{ background: 'var(--acc-ghost)' }}>
          <Icon name="shield" size={15} /> <span>{isSuperadmin(u.role)
            ? 'El Super Admin tiene acceso total, incluido suplantar usuarios y otorgar este mismo rol. Resérvalo para el programador.'
            : 'Los administradores tienen acceso total, incluido este panel para crear y gestionar usuarios.'}</span>
        </div>
      )}
    </Modal>
  )
}

/* ---- Formulario de vendedor ---- */
function SellerForm({ seller, onClose }: { seller?: Seller; onClose: () => void }) {
  const { dispatch } = useStore()
  const [name, setName] = React.useState(seller?.name ?? '')
  const [ratePct, setRatePct] = React.useState(seller ? pctStr(seller.rate) : '4')
  const [overridePct, setOverridePct] = React.useState(seller?.overrideRate ? pctStr(seller.overrideRate) : '')

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
  const [impersonate, setImpersonate] = React.useState<User | null>(null)
  const me = state.currentUser

  const admins = state.users.filter(u => isAdminRole(u.role)).length

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
  const onImpersonate = async (id: string) => {
    setBusy(true)
    try { await impersonateUser(id) }   // al cambiar la sesión, el store recarga todo como ese usuario
    catch (e) { alert(e instanceof Error ? e.message : 'No se pudo iniciar sesión como el usuario.'); setBusy(false) }
    finally { setImpersonate(null) }
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
              {/* Las cuentas Super Admin solo son visibles para otro Super Admin */}
              {state.users.filter(u => !isSuperadmin(u.role) || isSuperadmin(me?.role)).map(u => {
                const isMe = me?.id === u.id
                const lastAdmin = isAdminRole(u.role) && admins <= 1
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
                    {isSuperadmin(me?.role) && !isMe && u.active && (
                      <button className="btn btn-ghost btn-sm" title="Iniciar sesión como este usuario" disabled={busy} onClick={() => setImpersonate(u)}><Icon name="logout" size={14} /> Entrar como</button>
                    )}
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
              {state.sellers.map(v => {
                const fromUser = state.users.some(us => us.id === v.id)
                return (
                <tr key={v.id} onClick={() => fromUser ? undefined : setSellerForm(v)}>
                  <td>
                    <div className="flex items-center gap-2.5">
                      <span className="avatar">{v.initials}</span>
                      <span className="font-semibold text-[12.5px]">{v.name}</span>
                      {fromUser && <span className="meta">· usuario</span>}
                    </div>
                  </td>
                  <td className="num font-semibold">{(v.rate * 100).toFixed(1)}%{v.overrideRate ? <span className="meta font-normal"> + {(v.overrideRate * 100).toFixed(1)}% override</span> : null}</td>
                  <td className="text-right whitespace-nowrap" onClick={e => e.stopPropagation()}>
                    {fromUser
                      ? <span className="meta">Se gestiona desde Usuarios</span>
                      : <>
                          <button className="btn btn-ghost btn-sm" title="Editar vendedor" onClick={() => setSellerForm(v)}><Icon name="edit" size={14} /></button>
                          <button className="btn btn-ghost btn-sm text-danger" onClick={() => setSellerDel(v)}><Icon name="trash" size={14} /></button>
                        </>}
                  </td>
                </tr>
              ) })}
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
      {impersonate && <Confirm title="Iniciar sesión como usuario" confirmLabel="Entrar como" danger={false}
        message={`Se cerrará tu sesión de administrador y entrarás como ${impersonate.name}. Para volver a tu cuenta, cierra sesión y vuelve a entrar como tú.`}
        onConfirm={() => onImpersonate(impersonate.id)} onClose={() => setImpersonate(null)} />}
    </div>
  )
}
