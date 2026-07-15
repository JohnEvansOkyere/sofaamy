import { useEffect, useState } from 'react'
import { PageHead, Card, Stat, Badge, Person } from '../components/ui.jsx'
import WhatsAppModal from '../components/WhatsAppModal.jsx'
import { LEADS } from '../data/seed.js'
import { listClients, addClient } from '../lib/api.js'
import { GHS0, greetingMessage } from '../lib/whatsapp.js'
import { IconPlus, IconUsers, IconWallet, IconTrend, IconPhone, IconPin, IconWhatsApp } from '../components/icons.jsx'
import '../styles/ops.css'

const COLS = ['New', 'Qualified', 'Survey', 'Proposal', 'Negotiation']
const EMPTY = { name: '', contact: '', phone: '', location: '', type: 'company' }

export default function CRM() {
  const [clients, setClients] = useState([])
  const [live, setLive] = useState(false)
  const [wa, setWa] = useState(null)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [toast, setToast] = useState(null)
  const fire = (m) => { setToast(m); setTimeout(() => setToast(null), 3000) }

  const refresh = () => listClients().then(cs => { setClients(cs); setLive(true) }).catch(() => {})
  useEffect(() => { refresh() }, [])

  const totalValue = clients.reduce((s, c) => s + (c.value || 0), 0)

  const save = async () => {
    try {
      await addClient(form)
      setAdding(false); setForm(EMPTY); refresh()
      fire(`✓ Client "${form.name}" added`)
    } catch (e) { fire(`⚠️ ${e.message}`) }
  }

  return (
    <>
      <PageHead title="CRM & Leads" subtitle="Every client and opportunity, from first WhatsApp to won job.">
        {live
          ? <span className="badge b-green"><span className="bdot"/>Live · from database</span>
          : <span className="badge b-orange"><span className="bdot"/>Backend offline</span>}
        <button className="btn btn-primary" onClick={() => setAdding(true)}><IconPlus/> New Client</button>
      </PageHead>

      <div className="grid g-4 mb">
        <Stat label="Total Clients" value={String(clients.length)} trend={`${clients.filter(c => c.type === 'company').length} companies`} dir="up" tone="blue" icon={<IconUsers/>} />
        <Stat label="Lifetime Value" value={GHS0(totalValue)} trend="all contracted jobs" dir="up" tone="green" icon={<IconWallet/>} />
        <Stat label="Active Accounts" value={String(clients.filter(c => c.jobs > 0).length)} trend="with jobs" dir="flat" tone="purple" icon={<IconTrend/>} />
        <Stat label="Open Opportunities" value={String(LEADS.length)} trend="sales pipeline below" dir="flat" tone="orange" icon={<IconUsers/>} />
      </div>

      <Card title="Clients" sub="All accounts — live from the database" pad={false} className="mb"
        action={<span className="badge b-gray">{clients.length} total</span>}>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Client</th><th>Contact</th><th>Location</th><th>Jobs</th><th>Lifetime Value</th><th></th></tr></thead>
            <tbody>
              {clients.map((c, i) => (
                <tr key={c.id}>
                  <td><Person name={c.name} sub={c.type === 'company' ? 'Company' : 'Individual'} i={i} /></td>
                  <td className="t-muted"><span className="flex items-center gap-sm"><IconPhone style={{width:14,height:14}}/>{c.phone || '—'}</span></td>
                  <td className="t-muted"><span className="flex items-center gap-sm"><IconPin style={{width:14,height:14}}/>{c.location || '—'}</span></td>
                  <td><Badge tone="blue">{c.jobs} job{c.jobs === 1 ? '' : 's'}</Badge></td>
                  <td className="t-mono">{GHS0(c.value)}</td>
                  <td className="right">
                    <button className="btn btn-ghost btn-sm" style={{color:'#1da851'}} disabled={!c.phone}
                      onClick={() => setWa(c)}>
                      <IconWhatsApp style={{width:15,height:15}}/> Message
                    </button>
                  </td>
                </tr>
              ))}
              {!clients.length && <tr><td colSpan={6} className="muted center" style={{ padding:24 }}>No clients yet — add your first.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="section-title">Sales Pipeline <span className="muted" style={{ fontWeight:400, fontSize:12 }}>(lead tracking — next module)</span></div>
      <div className="grid" style={{ gridTemplateColumns:`repeat(${COLS.length},1fr)`, gap:14 }}>
        {COLS.map(col => {
          const items = LEADS.filter(l => l.stage === col)
          return (
            <div key={col} className="card" style={{ background:'var(--bg)' }}>
              <div className="flex between items-center" style={{ padding:'12px 14px' }}>
                <b style={{ fontSize:13 }}>{col}</b>
                <span style={{ background:'#dde5ec', color:'var(--ink-2)', fontSize:11, padding:'1px 8px', borderRadius:20 }}>{items.length}</span>
              </div>
              <div style={{ padding:'0 10px 10px' }}>
                {items.map(l => (
                  <div key={l.id} className="card card-pad" style={{ padding:13, marginBottom:9 }}>
                    <div className="t-strong" style={{ fontSize:13 }}>{l.name}</div>
                    <div className="muted" style={{ fontSize:11.5, margin:'2px 0 8px' }}>{l.contact}</div>
                    <div style={{ fontSize:15, fontWeight:800, color:'var(--navy-600)' }}>{l.value}</div>
                    <div className="flex between items-center" style={{ marginTop:9 }}>
                      <Badge tone={l.source==='WhatsApp'?'green':'gray'}>{l.source}</Badge>
                      <span className="muted" style={{ fontSize:11 }}>{l.age}</span>
                    </div>
                  </div>
                ))}
                {!items.length && <div className="muted center" style={{ fontSize:12, padding:'14px 0' }}>—</div>}
              </div>
            </div>
          )
        })}
      </div>

      {adding && (
        <div className="modal-back" onClick={() => setAdding(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h4>New Client</h4>
            <div className="modal-grid">
              <label>Client name <span className="req">*</span>
                <input autoFocus value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}/>
              </label>
              <label>Contact person
                <input value={form.contact} onChange={e => setForm(f => ({ ...f, contact: e.target.value }))}/>
              </label>
            </div>
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
              <button className="btn btn-primary" disabled={!form.name} onClick={save}>Add Client</button>
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
