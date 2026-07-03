// ============================================================
//  CAMPAÑAS — módulo de Marketing. Se registra una campaña con su
//  presupuesto TOTAL y se reparte entre 1..n anuncios (cada uno con
//  su monto y su % del total). Vista de lista expandible + modal.
// ============================================================
import * as React from 'react'
import { useStore, fmtMoney, uid, isDireccion } from '../../core/data'
import { Modal, Field, Input, MoneyInput, Confirm, SecTitle, Empty, KPI, useUnsavedGuard } from '../../core/ui'
import { Icon } from '../../core/icons'
import type { Campaign, CampaignInput } from '../../core/types'

/* ---- Formulario de registro / edición ---- */
type AdRow = { id: string; name: string; amount: number | string }
type FormState = { id?: string; name: string; budget: number | string; ads: AdRow[] }

function CampaignForm({ campaign, onClose }: { campaign?: Campaign; onClose: () => void }) {
  const { dispatch } = useStore()
  const [c, setC] = React.useState<FormState>(() => campaign
    ? { id: campaign.id, name: campaign.name, budget: campaign.budget, ads: campaign.ads.map(a => ({ ...a })) }
    : { name: '', budget: '', ads: [{ id: uid('ad'), name: '', amount: '' }] })

  const budgetNum = +c.budget || 0
  const set = (k: keyof FormState, v: unknown) => setC(s => ({ ...s, [k]: v }))
  const setAd = (id: string, patch: Partial<AdRow>) => setC(s => ({ ...s, ads: s.ads.map(a => (a.id === id ? { ...a, ...patch } : a)) }))
  const addAd = () => setC(s => ({ ...s, ads: [...s.ads, { id: uid('ad'), name: '', amount: '' }] }))
  const removeAd = (id: string) => setC(s => ({ ...s, ads: s.ads.filter(a => a.id !== id) }))

  const distribuido = c.ads.reduce((a, ad) => a + (+ad.amount || 0), 0)
  const restante = budgetNum - distribuido
  const cuadra = budgetNum > 0 && Math.abs(restante) < 0.5

  const { requestClose, guard } = useUnsavedGuard(c, onClose)
  const valid = c.name.trim() !== '' && budgetNum > 0

  const save = () => {
    const payload: CampaignInput = {
      ...campaign,   // conserva createdBy/createdAt al editar
      name: c.name.trim(),
      budget: budgetNum,
      ads: c.ads
        .filter(a => a.name.trim() !== '' || +a.amount > 0)
        .map((a, i) => ({ id: a.id, name: a.name.trim() || `Anuncio ${i + 1}`, amount: +a.amount || 0 })),
    }
    dispatch({ type: 'SAVE_CAMPAIGN', campaign: payload })
    onClose()
  }

  return (
    <Modal width={620} icon={campaign ? 'edit' : 'plus'} title={campaign ? 'Editar campaña' : 'Registrar campaña'} onClose={requestClose}
      footer={<>
        <button className="btn btn-ghost" onClick={requestClose}>Cancelar</button>
        <div className="flex-1"></div>
        <button className={'btn btn-primary' + (!valid ? ' opacity-50' : '')} disabled={!valid} onClick={save}>
          <Icon name="check" size={15} /> {campaign ? 'Guardar' : 'Registrar campaña'}
        </button>
      </>}>
      {/* Campaña */}
      <div className="label-k mb-2">Campaña</div>
      <div className="grid grid-cols-[1fr_200px] gap-3.5 mb-4">
        <Field label="Nombre de la campaña"><Input value={c.name} onChange={e => set('name', e.target.value)} placeholder="Ej. Campaña Racks Q3" autoFocus /></Field>
        <Field label="Presupuesto total (MXN)"><MoneyInput value={c.budget} onChange={v => set('budget', v)} placeholder="0" /></Field>
      </div>

      {/* Anuncios */}
      <div className="flex items-center mb-2">
        <span className="label-k">Anuncios</span>
        <span className="flex-1"></span>
        <button className="btn btn-sm btn-primary" onClick={addAd}><Icon name="plus" size={13} /> Agregar anuncio</button>
      </div>

      <div className="flex flex-col gap-2">
        {c.ads.map((ad, i) => {
          const amt = +ad.amount || 0
          const pct = budgetNum > 0 ? (amt / budgetNum) * 100 : 0
          return (
            <div key={ad.id} className="flex items-center gap-2">
              <input className="input flex-1" value={ad.name} onChange={e => setAd(ad.id, { name: e.target.value })} placeholder={`Anuncio ${i + 1}`} />
              <div className="w-[130px]"><MoneyInput value={ad.amount} onChange={v => setAd(ad.id, { amount: v })} placeholder="0" /></div>
              <div className="w-[86px] relative">
                <input className="input pr-7 text-right" inputMode="decimal"
                  value={pct ? String(Number(pct.toFixed(1))) : ''}
                  onChange={e => { const p = parseFloat(e.target.value) || 0; setAd(ad.id, { amount: Math.round(budgetNum * p / 100) }) }}
                  disabled={budgetNum <= 0} placeholder="0" title="% del presupuesto total" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-tx-3 text-[13px] pointer-events-none">%</span>
              </div>
              <button className="icon-btn shrink-0" title="Quitar anuncio" onClick={() => removeAd(ad.id)}
                disabled={c.ads.length <= 1} style={{ opacity: c.ads.length <= 1 ? 0.4 : 1 }}>
                <Icon name="close" size={15} />
              </button>
            </div>
          )
        })}
      </div>

      {/* Resumen de la distribución */}
      {budgetNum > 0 && (
        <div className="mt-3.5 bg-bg-1 border border-line rounded-[8px] p-3 grid grid-cols-3 gap-2 text-center">
          <div><div className="label-k">Presupuesto</div><div className="font-display font-bold text-[15px] mt-0.5">{fmtMoney(budgetNum)}</div></div>
          <div><div className="label-k">Distribuido</div><div className="font-display font-bold text-[15px] mt-0.5">{fmtMoney(distribuido)}</div></div>
          <div><div className="label-k">Restante</div><div className="font-display font-bold text-[15px] mt-0.5" style={{ color: cuadra ? 'var(--ok)' : Math.abs(restante) > 0.5 ? 'var(--warn)' : 'var(--tx-1)' }}>{fmtMoney(restante)}</div></div>
        </div>
      )}
      {budgetNum > 0 && !cuadra && (
        <div className="text-[11.5px] mt-2" style={{ color: 'var(--warn)' }}>
          {restante > 0 ? `Falta distribuir ${fmtMoney(restante)} del presupuesto.` : `Los anuncios superan el presupuesto por ${fmtMoney(-restante)}.`}
        </div>
      )}
      {guard}
    </Modal>
  )
}

/* ---- Fila de campaña (expandible) ---- */
function CampaignRow({ campaign, onEdit, readOnly }: { campaign: Campaign; onEdit: () => void; readOnly?: boolean }) {
  const { dispatch } = useStore()
  const [open, setOpen] = React.useState(false)
  const [confirmDel, setConfirmDel] = React.useState(false)
  const distribuido = campaign.ads.reduce((a, ad) => a + (ad.amount || 0), 0)

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-bg-1" onClick={() => setOpen(o => !o)}>
        <Icon name={open ? 'chevronDown' : 'chevron'} size={16} className="text-tx-3 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-[14px] font-semibold text-tx-0 truncate">{campaign.name}</div>
          <div className="meta mt-px">{campaign.ads.length} {campaign.ads.length === 1 ? 'anuncio' : 'anuncios'}</div>
        </div>
        <div className="mono font-display font-extrabold text-[17px] mr-1">{fmtMoney(campaign.budget)}</div>
        {!readOnly && <button className="btn btn-sm btn-ghost shrink-0" onClick={e => { e.stopPropagation(); onEdit() }}><Icon name="edit" size={13} /> Editar</button>}
        {!readOnly && <button className="icon-btn shrink-0" title="Eliminar campaña" onClick={e => { e.stopPropagation(); setConfirmDel(true) }}><Icon name="trash" size={15} /></button>}
      </div>

      {open && (
        <div className="border-t border-line bg-bg-1">
          <table className="tbl">
            <thead><tr><th>Anuncio</th><th className="num">Presupuesto</th><th className="num">% del total</th></tr></thead>
            <tbody>
              {campaign.ads.length === 0 ? (
                <tr><td colSpan={3} className="text-tx-3 text-[12.5px]">Sin anuncios</td></tr>
              ) : campaign.ads.map(ad => {
                const pct = campaign.budget > 0 ? (ad.amount / campaign.budget) * 100 : 0
                return (
                  <tr key={ad.id}>
                    <td className="text-[12.5px] text-tx-1">{ad.name}</td>
                    <td className="num font-semibold">{fmtMoney(ad.amount)}</td>
                    <td className="num text-[12.5px] text-tx-2">{pct.toFixed(1)}%</td>
                  </tr>
                )
              })}
              {campaign.ads.length > 0 && (
                <tr style={{ borderTop: '2px solid var(--line)' }}>
                  <td className="text-[12px] font-semibold text-tx-2">Distribuido</td>
                  <td className="num font-semibold" style={{ color: Math.abs(campaign.budget - distribuido) < 0.5 ? 'var(--ok)' : 'var(--warn)' }}>{fmtMoney(distribuido)}</td>
                  <td className="num text-[12px] text-tx-3">{campaign.budget > 0 ? ((distribuido / campaign.budget) * 100).toFixed(0) : 0}%</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {confirmDel && <Confirm title="Eliminar campaña" message={`¿Eliminar la campaña "${campaign.name}"?`} onConfirm={() => { dispatch({ type: 'DELETE_CAMPAIGN', id: campaign.id }); setConfirmDel(false) }} onClose={() => setConfirmDel(false)} />}
    </div>
  )
}

export function CampaignsPage() {
  const { state } = useStore()
  const readOnly = isDireccion(state.currentUser?.role)   // dirección: ver sin registrar/editar/eliminar
  const [form, setForm] = React.useState<Campaign | {} | null>(null)

  const campaigns = [...state.campaigns].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  const totalPresupuesto = campaigns.reduce((a, c) => a + (c.budget || 0), 0)
  const totalAnuncios = campaigns.reduce((a, c) => a + c.ads.length, 0)

  return (
    <div>
      <SecTitle title="Campañas" sub="Presupuesto de marketing por campaña y anuncio"
        right={readOnly ? undefined : <button className="btn btn-primary" onClick={() => setForm({})}><Icon name="plus" size={15} /> Registrar campaña</button>} />

      <div className="grid grid-cols-3 gap-3.5 mb-4">
        <KPI label="Campañas" value={campaigns.length} icon="layers" accent />
        <KPI label="Presupuesto total" value={totalPresupuesto} format={fmtMoney} icon="money" />
        <KPI label="Anuncios" value={totalAnuncios} icon="kanban" />
      </div>

      {campaigns.length === 0 ? (
        <div className="card"><div className="card-b"><Empty icon="trendUp">Aún no hay campañas registradas</Empty></div></div>
      ) : (
        <div className="flex flex-col gap-3">
          {campaigns.map(c => <CampaignRow key={c.id} campaign={c} onEdit={() => setForm(c)} readOnly={readOnly} />)}
        </div>
      )}

      {form && <CampaignForm campaign={'id' in form ? form : undefined} onClose={() => setForm(null)} />}
    </div>
  )
}
