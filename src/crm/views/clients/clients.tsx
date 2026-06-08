// ============================================================
//  CLIENTS — list, project history, payment status
// ============================================================
import * as React from 'react'
import { useStore, sel, fmtMoney, fmtK, fmtDate, fmtMoney2, REGIMEN_FISCAL, regimenLabel } from '../../core/data'
import { Modal, Field, Input, Select, StageBadge, PayBadge, Badge, Avatar, Empty, Confirm, useUnsavedGuard } from '../../core/ui'
import { Icon } from '../../core/icons'
import type { Client, ClientInput, Project } from '../../core/types'

function ClientForm({ client, onClose }: { client?: Client; onClose: () => void }) {
  const { dispatch } = useStore()
  const [c, setC] = React.useState<ClientInput>(() => client ? { ...client } : { name: '', city: '', contact: '', phone: '', email: '' })
  const set = (k: keyof ClientInput, v: unknown) => setC(o => ({ ...o, [k]: v }))
  const setNum = (k: keyof ClientInput, v: string) => setC(o => ({ ...o, [k]: v === '' ? undefined : Number(v) }))
  const { requestClose, guard } = useUnsavedGuard(c, onClose)
  return (
    <Modal width={620} icon={client ? 'edit' : 'plus'} title={client ? 'Editar cliente' : 'Nuevo cliente'} onClose={requestClose}
      footer={<><button className="btn btn-ghost" onClick={requestClose}>Cancelar</button><button className={'btn btn-primary' + (!c.name ? ' opacity-50' : '')} disabled={!c.name} onClick={() => { dispatch({ type: 'SAVE_CLIENT', client: c }); onClose() }}><Icon name="check" size={15} /> Guardar</button></>}>
      <div className="grid grid-cols-2 gap-3.5">
        <Field label="Nombre comercial" span={2}><Input value={c.name} onChange={e => set('name', e.target.value)} /></Field>
        <Field label="Razón social" span={2}><Input value={c.razonSocial || ''} onChange={e => set('razonSocial', e.target.value)} /></Field>
        <Field label="RFC"><Input value={c.rfc || ''} onChange={e => set('rfc', e.target.value.toUpperCase())} /></Field>
        <Field label="Código postal"><Input value={c.cp || ''} onChange={e => set('cp', e.target.value)} /></Field>
        <Field label="Régimen fiscal" span={2}>
          <Select value={c.regimenFiscal || ''} onChange={e => set('regimenFiscal', e.target.value)}>
            <option value="">— Selecciona —</option>
            {Object.entries(REGIMEN_FISCAL).map(([code, label]) => <option key={code} value={code}>{code} · {label}</option>)}
          </Select>
        </Field>
        <Field label="Uso de CFDI"><Input value={c.usoCFDI || ''} onChange={e => set('usoCFDI', e.target.value.toUpperCase())} /></Field>
        <Field label="Correo"><Input value={c.email} onChange={e => set('email', e.target.value)} /></Field>
        <Field label="Ciudad"><Input value={c.city} onChange={e => set('city', e.target.value)} /></Field>
        <Field label="Teléfono"><Input value={c.phone} onChange={e => set('phone', e.target.value)} /></Field>
        <Field label="Persona de contacto" span={2}><Input value={c.contact} onChange={e => set('contact', e.target.value)} /></Field>
        <Field label="Días de crédito"><Input type="number" value={c.diasCredito ?? ''} onChange={e => setNum('diasCredito', e.target.value)} /></Field>
        <Field label="Límite de crédito"><Input type="number" value={c.limiteCredito ?? ''} onChange={e => setNum('limiteCredito', e.target.value)} /></Field>
      </div>
      {guard}
    </Modal>
  )
}

function FiscalRow({ label, value, mono, span2 }: { label: string; value?: string; mono?: boolean; span2?: boolean }) {
  return (
    <div className={span2 ? 'col-span-2' : ''}>
      <div className="label-k">{label}</div>
      <div className={'text-[13px] mt-0.5 ' + (mono ? 'mono' : '')}>{value || '—'}</div>
    </div>
  )
}

function ClientDetail({ client, onClose, onEdit, onDelete, onOpenProject }: { client: Client; onClose: () => void; onEdit: () => void; onDelete: () => void; onOpenProject: (p: Project) => void }) {
  const { state } = useStore()
  const projects = sel.projectsForClient(state, client.id)
  const total = projects.reduce((a, p) => a + sel.budget(p), 0)
  const active = projects.filter(p => p.stage !== 'finalizado').length
  const sub = [client.rfc || client.city, `Cliente desde ${fmtDate(client.since)}`].filter(Boolean).join(' · ')
  return (
    <Modal width={680} icon="clients" title={client.name} sub={sub} onClose={onClose}
      footer={<>
        <button className="btn btn-danger" disabled={projects.length > 0} title={projects.length > 0 ? 'No se puede eliminar: tiene proyectos asociados' : 'Eliminar cliente'} onClick={onDelete}><Icon name="trash" size={15} /> Eliminar</button>
        <div className="flex-1"></div>
        <button className="btn btn-ghost" onClick={onEdit}><Icon name="edit" size={15} /> Editar</button>
      </>}>
      <div className="grid grid-cols-2 gap-5 mb-5">
        <div className="flex flex-col gap-2.5">
          {client.contact && <div className="flex items-center gap-[9px] text-[13px]"><Icon name="user" size={15} className="text-tx-2" /> {client.contact}</div>}
          {client.phone && <div className="flex items-center gap-[9px] text-[13px]"><Icon name="phone" size={15} className="text-tx-2" /> <span className="mono">{client.phone}</span></div>}
          <div className="flex items-center gap-[9px] text-[13px]"><Icon name="mail" size={15} className="text-tx-2" /> {client.email || '—'}</div>
          {client.city && <div className="flex items-center gap-[9px] text-[13px]"><Icon name="pin" size={15} className="text-tx-2" /> {client.city}</div>}
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-bg-1 border border-line p-[11px]"><div className="label-k">Proyectos</div><div className="font-display font-extrabold text-[22px] mt-[3px]">{projects.length}</div></div>
          <div className="bg-bg-1 border border-line p-[11px]"><div className="label-k">Activos</div><div className="font-display font-extrabold text-[22px] mt-[3px]">{active}</div></div>
          <div className="bg-bg-1 border border-line p-[11px]"><div className="label-k">Valor</div><div className="font-display font-extrabold text-[16px] mt-1.5">{fmtK(total)}</div></div>
        </div>
      </div>

      {/* ---- Datos fiscales ---- */}
      {(client.rfc || client.razonSocial || client.regimenFiscal || client.cp) && (
        <>
          <div className="label-k mb-2">Datos fiscales</div>
          <div className="grid grid-cols-2 gap-x-5 gap-y-2.5 mb-5 bg-bg-1 border border-line p-3.5">
            <FiscalRow label="Razón social" value={client.razonSocial} />
            <FiscalRow label="RFC" value={client.rfc} mono />
            <FiscalRow label="Régimen fiscal" value={regimenLabel(client.regimenFiscal)} span2 />
            <FiscalRow label="Código postal" value={client.cp} mono />
            <FiscalRow label="Uso de CFDI" value={client.usoCFDI} mono />
            {client.diasCredito != null && <FiscalRow label="Días de crédito" value={String(client.diasCredito)} />}
            {client.limiteCredito != null && <FiscalRow label="Límite de crédito" value={fmtMoney2(client.limiteCredito)} />}
          </div>
        </>
      )}
      <div className="label-k mb-2">Historial de proyectos</div>
      {projects.length === 0 ? <Empty icon="projects">Sin proyectos</Empty> : (
        <div className="border border-line">
          <table className="tbl">
            <thead><tr><th>Proyecto</th><th>Ciudad</th><th>Etapa</th><th className="num">Monto</th><th>Finiquito</th></tr></thead>
            <tbody>
              {projects.map(p => (
                <tr key={p.id} onClick={() => { onClose(); onOpenProject(p) }}>
                  <td><span className="mono text-acc">{p.code}</span></td>
                  <td className="text-tx-1">{p.city}</td>
                  <td><StageBadge stage={p.stage} size="sm" /></td>
                  <td className="num">{fmtMoney(sel.budget(p))}</td>
                  <td><PayBadge status={p.finiquito} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  )
}

const CLIENTS_PAGE_SIZE = 60

export function ClientsPage({ onOpenProject }: { onOpenProject: (p: Project) => void }) {
  const { state, dispatch } = useStore()
  const [detail, setDetail] = React.useState<Client | null>(null)
  const [del, setDel] = React.useState<Client | null>(null)
  const [form, setForm] = React.useState<Partial<Client> | null>(null)
  const [q, setQ] = React.useState('')
  const [limit, setLimit] = React.useState(CLIENTS_PAGE_SIZE)

  const filtered = React.useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return state.clients
    return state.clients.filter(c =>
      (c.name + ' ' + (c.razonSocial || '') + ' ' + (c.rfc || '') + ' ' + (c.city || '') + ' ' + (c.email || ''))
        .toLowerCase().includes(needle))
  }, [state.clients, q])
  const shown = filtered.slice(0, limit)

  return (
    <div>
      <div className="spread mb-[18px]">
        <div className="sec-title m-0"><h2>Clientes</h2><span className="sub">{filtered.length} de {state.clients.length} registrados</span></div>
        <button className="btn btn-primary" onClick={() => setForm({})}><Icon name="plus" size={15} /> Nuevo cliente</button>
      </div>
      <div className="relative mb-4 max-w-[380px]">
        <Icon name="search" size={15} className="absolute left-[11px] top-2.5 text-tx-3" />
        <input className="input pl-[34px]" placeholder="Buscar nombre, RFC, razón social, correo…" value={q}
          onChange={e => { setQ(e.target.value); setLimit(CLIENTS_PAGE_SIZE) }} />
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(340px,1fr))] gap-3.5">
        {shown.map(c => {
          const projects = sel.projectsForClient(state, c.id)
          const active = projects.filter(p => p.stage !== 'finalizado').length
          const pendingPay = projects.some(p => p.stage !== 'finalizado' && p.finiquito === 'pending')
          const total = projects.reduce((a, p) => a + sel.budget(p), 0)
          return (
            <div key={c.id} className="card cursor-pointer" onClick={() => setDetail(c)}>
              <div className="p-4">
                <div className="flex gap-3 items-start">
                  <Avatar name={c.name} size={42} color="var(--bg-3)" />
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-[14px] font-display leading-[1.25]">{c.name}</div>
                    {c.city
                      ? <div className="meta mt-[3px] flex items-center gap-1"><Icon name="pin" size={11} className="opacity-60" /> {c.city}</div>
                      : c.rfc && <div className="meta mt-[3px] flex items-center gap-1 mono"><Icon name="doc" size={11} className="opacity-60" /> {c.rfc}</div>}
                  </div>
                  {pendingPay && <Badge color="var(--warn)">Por cobrar</Badge>}
                </div>
                <div className="flex justify-between mt-3.5 pt-3 border-t border-line-soft">
                  <div><div className="label-k">Proyectos</div><div className="font-mono font-semibold text-[15px] mt-0.5">{projects.length} <span className="text-tx-3 text-[11px]">({active} act.)</span></div></div>
                  <div className="text-right"><div className="label-k">Valor total</div><div className="font-display font-bold text-[15px] mt-0.5">{fmtK(total)}</div></div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
      {filtered.length === 0 && <Empty icon="clients">Ningún cliente coincide con “{q}”</Empty>}
      {shown.length < filtered.length && (
        <div className="text-center mt-4">
          <button className="btn btn-ghost" onClick={() => setLimit(l => l + CLIENTS_PAGE_SIZE)}>
            Ver más ({filtered.length - shown.length} restantes)
          </button>
        </div>
      )}
      {detail && <ClientDetail client={state.clients.find(x=>x.id===detail.id)!} onClose={() => setDetail(null)} onEdit={() => { setForm(detail); setDetail(null) }} onDelete={() => { setDel(detail); setDetail(null) }} onOpenProject={onOpenProject} />}
      {form && <ClientForm client={form.id ? (form as Client) : undefined} onClose={() => setForm(null)} />}
      {del && <Confirm title="Eliminar cliente" message={`¿Eliminar a ${del.name}? Esta acción no se puede deshacer.`} onConfirm={() => { dispatch({ type: 'DELETE_CLIENT', id: del.id }); setDel(null) }} onClose={() => setDel(null)} />}
    </div>
  )
}
