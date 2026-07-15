import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHead, Card, Stat, Badge } from '../components/ui.jsx'
import WhatsAppModal from '../components/WhatsAppModal.jsx'
import JobDrawer from '../components/JobDrawer.jsx'
import { listQuotes, listClients, setQuoteStatus } from '../lib/api.js'
import { GHS0, dateShort, quoteMessage } from '../lib/whatsapp.js'
import { IconFile, IconCube, IconWhatsApp, IconWallet, IconCheck } from '../components/icons.jsx'
import '../styles/ops.css'

const FILTERS = ['All', 'Draft', 'Sent', 'Accepted', 'Declined']

export default function Quotations() {
  const [quotes, setQuotes] = useState([])
  const [clients, setClients] = useState([])
  const [live, setLive] = useState(false)
  const [filter, setFilter] = useState('All')
  const [wa, setWa] = useState(null)          // quote being sent
  const [openJob, setOpenJob] = useState(null)
  const [toast, setToast] = useState(null)
  const fire = (m) => { setToast(m); setTimeout(() => setToast(null), 3200) }

  const refresh = () => Promise.all([listQuotes(), listClients()])
    .then(([qs, cs]) => { setQuotes(qs); setClients(cs); setLive(true) }).catch(() => {})
  useEffect(() => { refresh() }, [])

  const phoneFor = (name) => clients.find(c => c.name === name)?.phone || ''
  const greetFor = (name) => {
    const c = clients.find(c => c.name === name)
    return c?.contact || name           // greet the contact person, not the company
  }
  const rows = useMemo(() => filter === 'All' ? quotes
    : quotes.filter(q => q.status === filter || (filter === 'Accepted' && q.status === 'Approved')), [quotes, filter])

  const open = quotes.filter(q => ['Draft', 'Sent'].includes(q.status))
  const won = quotes.filter(q => ['Accepted', 'Approved'].includes(q.status))
  const wonValue = won.reduce((s, q) => s + q.total, 0)

  const accept = async (q) => {
    try {
      const r = await setQuoteStatus(q.quote_number, 'Accepted')
      refresh()
      fire(r.job_number
        ? `✅ ${q.client_name} accepted — job ${r.job_number} opened, awaiting 50% deposit`
        : `✅ Quote marked accepted`)
    } catch (e) { fire(`⚠️ ${e.message}`) }
  }
  const decline = async (q) => {
    try { await setQuoteStatus(q.quote_number, 'Declined'); refresh(); fire('Quote marked declined') }
    catch (e) { fire(`⚠️ ${e.message}`) }
  }

  return (
    <>
      <PageHead title="Quotations" subtitle="From configurator to client's WhatsApp to accepted job — one flow.">
        {live
          ? <span className="badge b-green"><span className="bdot"/>Live · from database</span>
          : <span className="badge b-orange"><span className="bdot"/>Backend offline</span>}
        <Link to="/configurator" className="btn btn-gold"><IconCube/> New Quote</Link>
      </PageHead>

      <div className="grid g-4 mb">
        <Stat label="Open Quotations" value={String(open.length)} trend={`${quotes.filter(q => q.status === 'Sent').length} awaiting reply`} dir="flat" tone="orange" icon={<IconFile/>} />
        <Stat label="Pipeline Value" value={GHS0(open.reduce((s, q) => s + q.total, 0))} trend={`${open.length} open`} dir="up" tone="blue" icon={<IconWallet/>} />
        <Stat label="Won" value={String(won.length)} trend={`${GHS0(wonValue)} accepted`} dir="up" tone="green" icon={<IconCheck/>} />
        <Stat label="Quote → Order" value={quotes.length ? `${Math.round(won.length / quotes.length * 100)}%` : '—'} trend={`${quotes.length} total`} dir="up" tone="purple" icon={<IconFile/>} />
      </div>

      <Card title="All Quotations" pad={false}
        action={<div className="flex gap-sm">{FILTERS.map(f =>
          <span key={f} className={`chip ${filter===f?'on':''}`} style={{ cursor:'pointer' }}
            onClick={() => setFilter(f)}>{f}</span>)}</div>}>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Quote No.</th><th>Client</th><th>Product</th><th>Total</th><th>Status</th><th>Date</th><th style={{minWidth:210}}></th></tr></thead>
            <tbody>
              {rows.map(q => (
                <tr key={q.quote_number}>
                  <td className="t-mono">{q.quote_number}</td>
                  <td className="t-strong">{q.client_name}</td>
                  <td className="t-muted">{q.product}</td>
                  <td className="t-mono">{GHS0(q.total)}</td>
                  <td><Badge>{q.status}</Badge></td>
                  <td className="t-muted">{dateShort(q.created_at)}</td>
                  <td className="right">
                    <div className="flex gap-sm" style={{ justifyContent:'flex-end' }}>
                      {q.job_number
                        ? <button className="btn btn-ghost btn-sm" onClick={() => setOpenJob(q.job_number)}>
                            Job {q.job_number.slice(-3)} →</button>
                        : <>
                            <button className="btn btn-ghost btn-sm" style={{ color:'#1da851' }} title="Send on WhatsApp"
                              onClick={() => setWa(q)}>
                              <IconWhatsApp style={{ width:15, height:15 }}/> Send
                            </button>
                            {q.status !== 'Declined' && <>
                              <button className="btn btn-primary btn-sm" onClick={() => accept(q)}>Accept</button>
                              <button className="btn btn-ghost btn-sm" style={{ color:'var(--red)' }} onClick={() => decline(q)}>✕</button>
                            </>}
                          </>}
                    </div>
                  </td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={7} className="muted center" style={{ padding:24 }}>No quotations{filter !== 'All' ? ` in ${filter}` : ''} — create one in the configurator.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      {wa && <WhatsAppModal
        to={{ phone: phoneFor(wa.client_name), name: wa.client_name }}
        message={quoteMessage({ client: greetFor(wa.client_name), product: wa.product,
          quoteNumber: wa.quote_number, total: wa.total })}
        attachment={`${wa.quote_number}.pdf`}
        onClose={() => setWa(null)}
        onSent={() => setQuoteStatus(wa.quote_number, 'Sent')
          .then(() => { refresh(); fire(`Quote ${wa.quote_number} marked Sent`) })
          .catch(() => {})}/>}

      {openJob && <JobDrawer jobNumber={openJob} onClose={() => setOpenJob(null)} onChanged={refresh}/>}
      {toast && <div className="toast">{toast}</div>}
    </>
  )
}
