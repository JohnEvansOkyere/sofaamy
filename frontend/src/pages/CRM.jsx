import { useEffect, useState } from 'react'
import { PageHead, Card, Stat, Badge, Person } from '../components/ui.jsx'
import WhatsAppModal from '../components/WhatsAppModal.jsx'
import { listClients, addClient, getClient } from '../lib/api.js'
import { useLiveRefresh } from '../lib/live.js'
import { GHS0, greetingMessage } from '../lib/whatsapp.js'
import { IconPlus, IconUsers, IconWallet, IconTrend, IconPhone, IconPin, IconWhatsApp } from '../components/icons.jsx'
import '../styles/ops.css'

const EMPTY = { name: '', phone: '', location: '', type: 'company' }

const STAGE_TONE = { enquiry:'gray', contacted:'blue', quoted:'purple', won:'green', lost:'red' }
const STAGE_LABEL = { enquiry:'Enquiry', contacted:'Contacted', quoted:'Quoted', won:'Won', lost:'Lost' }

export default function CRM() {
  const [clients, setClients] = useState([])
  const [live, setLive] = useState(false)
  const [wa, setWa] = useState(null)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [toast, setToast] = useState(null)
  const [detail, setDetail] = useState(null)
  const fire = (m) => { setToast(m); setTimeout(() => setToast(null), 3000) }

  const refresh = () => listClients().then(cs => { setClients(cs); setLive(true) }).catch(() => {})
  useEffect(() => { refresh() }, [])
  useLiveRefresh(refresh)

  const totalValue = clients.reduce((s, c) => s + (c.value || 0), 0)

  const save = async () => {
    try {
      await addClient(form)
      setAdding(false); setForm(EMPTY); refresh()
      fire(`✓ Customer "${form.name}" added`)
    } catch (e) { fire(`⚠️ ${e.message}`) }
  }

  const openDetail = async (client) => {
    setDetail({ ...client, leads: null })
    try { setDetail(await getClient(client.id)) } catch (e) { fire(`⚠️ ${e.message}`) }
  }

  return (
    <>
      <PageHead title="Customers" subtitle="Every customer account, from first enquiry to lifetime value.">
        {live
          ? <span className="badge b-green"><span className="bdot"/>Live · from database</span>
          : <span className="badge b-orange"><span className="bdot"/>Backend offline</span>}
        <button className="btn btn-primary" onClick={() => setAdding(true)}><IconPlus/> New Customer</button>
      </PageHead>

      <div className="grid g-4 mb">
        <Stat label="Total Customers" value={String(clients.length)} trend={`${clients.filter(c => c.type === 'company').length} companies`} dir="up" tone="blue" icon={<IconUsers/>} />
        <Stat label="Lifetime Value" value={GHS0(totalValue)} trend="all contracted jobs" dir="up" tone="green" icon={<IconWallet/>} />
        <Stat label="Active Accounts" value={String(clients.filter(c => c.jobs > 0).length)} trend="with jobs" dir="flat" tone="purple" icon={<IconTrend/>} />
        <Stat label="Individual Accounts" value={String(clients.filter(c => c.type === 'individual').length)} trend="non-company" dir="flat" tone="orange" icon={<IconUsers/>} />
      </div>

      <Card title="Customers" sub="All accounts — live from the database" pad={false} className="mb"
        action={<span className="badge b-gray">{clients.length} total</span>}>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Customer</th><th>Contact</th><th>Location</th><th>Jobs</th><th>Lifetime Value</th><th></th></tr></thead>
            <tbody>
              {clients.map((c, i) => (
                <tr key={c.id} className="row-clickable" onClick={() => openDetail(c)}>
                  <td><Person name={c.name} sub={c.type === 'company' ? 'Company' : 'Individual'} i={i} /></td>
                  <td className="t-muted"><span className="flex items-center gap-sm"><IconPhone style={{width:14,height:14}}/>{c.phone || '—'}</span></td>
                  <td className="t-muted"><span className="flex items-center gap-sm"><IconPin style={{width:14,height:14}}/>{c.location || '—'}</span></td>
                  <td><Badge tone="blue">{c.jobs} job{c.jobs === 1 ? '' : 's'}</Badge></td>
                  <td className="t-mono">{GHS0(c.value)}</td>
                  <td className="right">
                    <button className="btn btn-ghost btn-sm" style={{color:'#1da851'}} disabled={!c.phone}
                      onClick={(e) => { e.stopPropagation(); setWa(c) }}>
                      <IconWhatsApp style={{width:15,height:15}}/> Message
                    </button>
                  </td>
                </tr>
              ))}
              {!clients.length && <tr><td colSpan={6} className="muted center" style={{ padding:24 }}>No customers yet — add your first.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      {adding && (
        <div className="modal-back" onClick={() => setAdding(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h4>New Customer</h4>
            <label className="modal-full">Customer name <span className="req">*</span>
              <input autoFocus value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}/>
            </label>
            <div className="modal-grid">
              <label>WhatsApp number
                <input placeholder="+233 24 000 0000" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}/>
              </label>
              <label>Type
                <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                  <option value="company">Company</option><option value="individual">Individual</option>
                </select>
              </label>
            </div>
            <label className="modal-full">Location
              <input placeholder="e.g. East Legon, Accra" value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))}/>
            </label>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setAdding(false)}>Cancel</button>
              <button className="btn btn-primary" disabled={!form.name} onClick={save}>Add Customer</button>
            </div>
          </div>
        </div>
      )}

      {detail && (
        <div className="modal-back" onClick={() => setDetail(null)}>
          <div className="modal customer-detail-modal" onClick={e => e.stopPropagation()}>
            <h4>{detail.name}</h4>
            <p className="muted" style={{ marginTop:-6, marginBottom:16 }}>
              {detail.contact || 'No contact person'}{detail.phone ? ` · ${detail.phone}` : ''}{detail.location ? ` · ${detail.location}` : ''}
            </p>
            <div className="grid g-3 mb">
              <Stat label="Jobs" value={String(detail.jobs ?? 0)} tone="blue" icon={<IconTrend/>} />
              <Stat label="Lifetime Value" value={GHS0(detail.value || 0)} tone="green" icon={<IconWallet/>} />
              <Stat label="Win Rate" value={detail.win_rate == null ? '—' : `${detail.win_rate}%`}
                trend={detail.leads ? `${detail.won || 0} won · ${detail.lost || 0} lost` : ''} tone="purple" icon={<IconTrend/>} />
            </div>
            <div className="section-title" style={{ marginTop:0 }}>Lead history</div>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr><th>Lead</th><th>Stage</th><th className="num">Est. value</th><th>Created</th></tr></thead>
                <tbody>
                  {(detail.leads || []).map(lead => (
                    <tr key={lead.id}>
                      <td><b>{lead.name}</b><small style={{ display:'block' }}>{lead.lead_number}</small></td>
                      <td><Badge tone={STAGE_TONE[lead.stage] || 'gray'}>{STAGE_LABEL[lead.stage] || lead.stage}</Badge></td>
                      <td className="num t-mono">{GHS0(lead.estimated_value)}</td>
                      <td className="t-muted">{lead.created_at ? lead.created_at.slice(0, 10) : '—'}</td>
                    </tr>
                  ))}
                  {detail.leads && !detail.leads.length && <tr><td colSpan={4} className="muted center" style={{ padding:20 }}>No leads recorded for this customer yet.</td></tr>}
                  {!detail.leads && <tr><td colSpan={4} className="muted center" style={{ padding:20 }}>Loading…</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setDetail(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {wa && <WhatsAppModal to={{ phone: wa.phone, name: wa.name }}
        message={greetingMessage({ client: wa.contact || wa.name })}
        onClose={() => setWa(null)}/>}
      {toast && <div className="toast">{toast}</div>}
    </>
  )
}
