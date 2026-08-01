import { useEffect, useState } from 'react'
import { PageHead, Card, Stat, Badge } from '../components/ui.jsx'
import JobDrawer from '../components/JobDrawer.jsx'
import WhatsAppModal from '../components/WhatsAppModal.jsx'
import { listJobs, advanceJob, downloadDeliveryNote } from '../lib/api.js'
import { GHS0, timeAgo, deliveryMessage } from '../lib/whatsapp.js'
import { IconTruck, IconCheck, IconDownload, IconWhatsApp, IconWallet } from '../components/icons.jsx'
import '../styles/ops.css'

export default function Dispatch() {
  const [jobs, setJobs] = useState([])
  const [live, setLive] = useState(false)
  const [open, setOpen] = useState(null)
  const [wa, setWa] = useState(null)
  const [toast, setToast] = useState(null)
  const fire = (m) => { setToast(m); setTimeout(() => setToast(null), 3200) }

  const refresh = () => listJobs().then(js => { setJobs(js); setLive(true) }).catch(() => {})
  useEffect(() => { refresh() }, [])

  const ready = jobs.filter(j => j.stage === 'dispatch')
  const installing = jobs.filter(j => j.stage === 'install')
  const delivered = jobs.filter(j => j.stage === 'done')
  const balanceDue = [...ready, ...installing].reduce((s, j) => s + j.balance, 0)

  const complete = async (j) => {
    try { const r = await advanceJob(j.job_number); refresh(); fire(`✓ ${j.job_number} → ${r.stage_label}`) }
    catch (e) { fire(`⚠️ ${String(e.message || e).replace(/^API \d+: /, '').replace(/^\{"detail":"|"\}$/g, '')}`) }
  }

  const Row = ({ j, actions }) => (
    <tr>
      <td className="t-mono" style={{ cursor:'pointer' }} onClick={() => setOpen(j.job_number)}>{j.job_number}</td>
      <td className="t-strong">{j.client}</td>
      <td className="t-muted">{j.product}</td>
      <td>{j.dn_number ? <span className="t-mono" style={{ fontSize:12 }}>{j.dn_number}</span> : <span className="muted">—</span>}</td>
      <td className="t-muted">{j.driver ? `${j.driver} · ${j.vehicle || '—'}` : '—'}</td>
      <td><Badge tone={j.balance > 0 ? 'orange' : 'green'}>{j.balance > 0 ? `${GHS0(j.balance)} due` : 'Paid in full'}</Badge></td>
      <td className="right"><div className="flex gap-sm" style={{ justifyContent:'flex-end' }}>{actions}</div></td>
    </tr>
  )

  return (
    <>
      <PageHead title="Dispatch & Install" subtitle="Deliveries, installation and job close-out — balance collected on delivery.">
        {live
          ? <span className="badge b-green"><span className="bdot"/>Live · from database</span>
          : <span className="badge b-orange"><span className="bdot"/>Backend offline</span>}
      </PageHead>

      <div className="grid g-4 mb">
        <Stat label="Ready to Dispatch" value={String(ready.length)} trend="passed QA" dir="flat" tone="blue" icon={<IconTruck/>} />
        <Stat label="On Site / Installing" value={String(installing.length)} trend="crews out" dir="flat" tone="orange" icon={<IconTruck/>} />
        <Stat label="Balance to Collect" value={GHS0(balanceDue)} trend="due on delivery" dir="flat" tone="purple" icon={<IconWallet/>} />
        <Stat label="Completed" value={String(delivered.length)} trend="delivered & closed" dir="up" tone="green" icon={<IconCheck/>} />
      </div>

      <Card title="Ready to Dispatch" sub="Assign a driver, print the delivery note, notify the client" pad={false} className="mb">
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Job</th><th>Client</th><th>Product</th><th>Delivery Note</th><th>Driver</th><th>Balance</th><th style={{minWidth:250}}></th></tr></thead>
            <tbody>
              {ready.map(j => (
                <Row key={j.id} j={j} actions={<>
                  <button className="btn btn-primary btn-sm" onClick={() => setOpen(j.job_number)}>
                    {j.dn_number ? 'Manage' : 'Assign driver'}
                  </button>
                  {j.dn_number && <>
                    <button className="btn btn-ghost btn-sm" title="Delivery note PDF"
                      onClick={() => downloadDeliveryNote(j.job_number).then(() => fire('📄 Delivery note downloaded')).catch(e => fire(`⚠️ ${e.message}`))}>
                      <IconDownload style={{width:14,height:14}}/>
                    </button>
                    <button className="btn btn-ghost btn-sm" style={{ color:'#1da851' }} title="WhatsApp client" onClick={() => setWa(j)}>
                      <IconWhatsApp style={{width:14,height:14}}/>
                    </button>
                    <button className="btn btn-gold btn-sm" onClick={() => complete(j)}>Out for delivery →</button>
                  </>}
                </>}/>
              ))}
              {!ready.length && <tr><td colSpan={7} className="muted center" style={{ padding:22 }}>Nothing at Dispatch — jobs arrive here after passing QA.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="On Site — Installation" sub="Close out when installed and the balance is settled" pad={false} className="mb">
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Job</th><th>Client</th><th>Product</th><th>Delivery Note</th><th>Driver</th><th>Balance</th><th></th></tr></thead>
            <tbody>
              {installing.map(j => (
                <Row key={j.id} j={j} actions={<>
                  <button className="btn btn-ghost btn-sm" style={{ color:'#1da851' }} onClick={() => setWa(j)}>
                    <IconWhatsApp style={{width:14,height:14}}/>
                  </button>
                  <button className="btn btn-primary btn-sm" title={j.balance > 0 ? 'Record the balance in the job first' : ''}
                    onClick={() => j.balance > 0 ? setOpen(j.job_number) : complete(j)}>
                    {j.balance > 0 ? 'Collect balance' : '✓ Complete job'}
                  </button>
                </>}/>
              ))}
              {!installing.length && <tr><td colSpan={7} className="muted center" style={{ padding:22 }}>No crews on site right now.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Recently Completed" pad={false}>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Job</th><th>Client</th><th>Product</th><th>Value</th><th>Delivered</th></tr></thead>
            <tbody>
              {delivered.map(j => (
                <tr key={j.id}>
                  <td className="t-mono" style={{ cursor:'pointer' }} onClick={() => setOpen(j.job_number)}>{j.job_number}</td>
                  <td className="t-strong">{j.client}</td>
                  <td className="t-muted">{j.product}</td>
                  <td className="t-mono">{GHS0(j.value)}</td>
                  <td><Badge tone="green">✓ {j.delivered_at ? timeAgo(j.delivered_at) : 'delivered'}</Badge></td>
                </tr>
              ))}
              {!delivered.length && <tr><td colSpan={5} className="muted center" style={{ padding:22 }}>No completed jobs yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      {open && <JobDrawer jobNumber={open} onClose={() => setOpen(null)} onChanged={refresh}/>}
      {wa && <WhatsAppModal to={{ phone: wa.client_phone, name: wa.client }}
        message={deliveryMessage({ client: wa.client, jobNumber: wa.job_number, product: wa.product,
          dnNumber: wa.dn_number, driver: wa.driver, vehicle: wa.vehicle, balance: wa.balance })}
        onClose={() => setWa(null)}/>}
      {toast && <div className="toast">{toast}</div>}
    </>
  )
}
