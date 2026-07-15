import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHead, Card, Stat, Badge, Progress } from '../components/ui.jsx'
import { AreaChart, Donut } from '../components/charts.jsx'
import JobDrawer from '../components/JobDrawer.jsx'
import { getDashboard } from '../lib/api.js'
import { GHS0, timeAgo } from '../lib/whatsapp.js'
import { IconWallet, IconFactory, IconFile, IconTrend, IconCube, IconPlus, IconBox } from '../components/icons.jsx'
import '../styles/ops.css'

const STAGE_COLORS = {
  pending:'#CA6F1E', cutting:'#2471A3', processing:'#2E86C1', holes:'#5DADE2',
  assembly:'#1E8449', glazing:'#16A085', qa:'#6C3483', dispatch:'#D4AC0D', install:'#C0392B',
}
const EV_TONE = { stage:'blue-400', payment:'gold', qc:'purple', dispatch:'green', quote:'green', stock:'orange', system:'blue-400' }

export default function Dashboard() {
  const [d, setD] = useState(null)
  const [openJob, setOpenJob] = useState(null)

  const refresh = () => getDashboard().then(setD).catch(() => {})
  useEffect(() => { refresh() }, [])

  if (!d) return (
    <>
      <PageHead title="Welcome back, Kwame 👋" subtitle="Here's what's happening across Sofaamy today."/>
      <div className="card card-pad" style={{ padding: 40, textAlign: 'center' }}>
        <div className="muted">Connecting to the Sofaamy database…</div>
        <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
          If this doesn't load, start the backend: <span className="t-mono">cd sofaamy-bms/backend && .venv/bin/uvicorn app.main:app</span>
        </div>
      </div>
    </>
  )

  const mix = d.stage_mix.map(s => ({ label: s.label, value: s.value, color: STAGE_COLORS[s.key] || '#90A0AE' }))

  return (
    <>
      <PageHead title="Welcome back, Kwame 👋" subtitle="Here's what's happening across Sofaamy today.">
        <Link to="/configurator" className="btn btn-gold"><IconCube/> New Design</Link>
        <Link to="/crm" className="btn btn-ghost"><IconPlus/> Add Client</Link>
      </PageHead>

      <div className="grid g-4 mb">
        <Stat label="Received (This Month)" value={GHS0(d.revenue_month)} trend={`${GHS0(d.outstanding)} outstanding`} dir="up" tone="green" icon={<IconWallet/>} />
        <Stat label="Active Jobs" value={String(d.active_jobs)} trend={`${d.awaiting_deposit} awaiting deposit`} dir="flat" tone="blue" icon={<IconFactory/>} />
        <Stat label="Open Quotations" value={String(d.open_quotes)} trend={`${GHS0(d.quoted_month)} quoted this month`} dir="flat" tone="orange" icon={<IconFile/>} />
        <Stat label="Quote → Order Rate" value={`${d.convert_pct}%`} trend={`${d.clients} clients`} dir="up" tone="purple" icon={<IconTrend/>} />
      </div>

      <div className="grid mb" style={{ gridTemplateColumns:'1.6fr 1fr' }}>
        <Card title="Payments Received" sub="Last 8 weeks (₵ thousands) — deposits & balances"
          action={<Link to="/production" className="btn btn-ghost btn-sm">Pipeline →</Link>}>
          <AreaChart data={d.trend} />
        </Card>
        <Card title="Jobs in Production" sub="By current stage">
          {mix.length ? <Donut data={mix} /> : <div className="muted center" style={{ padding: 30 }}>No active jobs</div>}
        </Card>
      </div>

      <div className="grid mb" style={{ gridTemplateColumns:'1.6fr 1fr' }}>
        <Card title="Recent Jobs" sub="Click a job to run it"
          action={<Link to="/production" className="btn btn-ghost btn-sm">View all</Link>} pad={false}>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Job</th><th>Client</th><th>Stage</th><th>Progress</th><th>Value</th><th>Paid</th></tr></thead>
              <tbody>
                {d.recent_jobs.map(j => (
                  <tr key={j.id} style={{ cursor:'pointer' }} onClick={() => setOpenJob(j.job_number)}>
                    <td className="t-mono">{j.id}</td>
                    <td className="t-strong">{j.client}</td>
                    <td><Badge tone={j.stage === 'pending' ? 'orange' : j.stage === 'done' ? 'green' : 'blue'}>{j.stage_label}</Badge></td>
                    <td style={{ minWidth:110 }}>
                      <div className="flex items-center gap-sm"><Progress value={j.progress} /><span className="muted" style={{fontSize:12}}>{j.progress}%</span></div>
                    </td>
                    <td className="t-mono">{GHS0(j.value)}</td>
                    <td><Badge tone={j.paid==='100%'?'green':j.paid==='0%'?'red':'orange'}>{j.paid}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Live Activity" sub="Everything the team does, as it happens">
          <div>
            {d.activity.map((a, i) => (
              <div key={i} className="flex gap" style={{ padding:'8px 0', borderBottom:i<d.activity.length-1?'1px solid var(--line-soft)':'none' }}>
                <span style={{ width:8,height:8,borderRadius:'50%',marginTop:6,flexShrink:0,background:`var(--${EV_TONE[a.kind] || 'blue-400'})` }}/>
                <div style={{ fontSize:13 }}>
                  <b>{a.who}</b> <span className="t-muted">{a.note}</span>
                  <div className="muted" style={{ fontSize:11.5, marginTop:1 }}>{timeAgo(a.at)}</div>
                </div>
              </div>
            ))}
            {!d.activity.length && <div className="muted">No activity yet today.</div>}
          </div>
        </Card>
      </div>

      <div className="grid g-2">
        <Card title="Stock Alerts" sub={`Stock value ${GHS0(d.stock_value)}`}
          action={<Link to="/inventory" className="btn btn-ghost btn-sm"><IconBox/> Inventory</Link>}>
          {d.low_stock.length === 0
            ? <div className="muted" style={{ padding: '14px 0' }}>✓ All materials above reorder level.</div>
            : d.low_stock.map(m => (
                <div key={m.code} className="flex between items-center" style={{ padding:'8px 0', borderBottom:'1px solid var(--line-soft)', fontSize:13 }}>
                  <div><b>{m.name}</b> <span className="muted t-mono" style={{ fontSize:11.5 }}>{m.code}</span></div>
                  <Badge tone={m.stock <= m.reorder / 2 ? 'red' : 'orange'}>{m.stock} {m.unit} left · reorder @ {m.reorder}</Badge>
                </div>
              ))}
        </Card>
        <Card title="Money Position" sub="Across active jobs">
          <div className="grid g-2" style={{ gap:12 }}>
            {[
              ['Received this month', GHS0(d.revenue_month), 'deposits + balances'],
              ['Outstanding balance', GHS0(d.outstanding), `across ${d.active_jobs} active jobs`],
              ['Awaiting deposit', String(d.awaiting_deposit), 'jobs gated at 50%'],
              ['In delivery', String(d.in_dispatch), 'dispatch + installation'],
            ].map(([l,v,s],i)=>(
              <div key={i} style={{ padding:'14px', background:'var(--bg)', borderRadius:10 }}>
                <div className="muted" style={{ fontSize:12 }}>{l}</div>
                <div style={{ fontSize:20, fontWeight:800, margin:'2px 0' }}>{v}</div>
                <div className="muted" style={{ fontSize:11 }}>{s}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {openJob && <JobDrawer jobNumber={openJob} onClose={() => setOpenJob(null)} onChanged={refresh}/>}
    </>
  )
}
