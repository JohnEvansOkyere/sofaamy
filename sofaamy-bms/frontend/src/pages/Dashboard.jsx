import { Link } from 'react-router-dom'
import { PageHead, Card, Stat, Badge, Person, Progress } from '../components/ui.jsx'
import { AreaChart, Donut, BarList } from '../components/charts.jsx'
import {
  KPIS, REVENUE_TREND, PIPELINE_MIX, PRODUCT_DEMAND, JOBS, ACTIVITY, STAGES,
} from '../data/seed.js'
import {
  IconWallet, IconFactory, IconFile, IconTrend, IconCube, IconPlus, IconChart,
} from '../components/icons.jsx'

const KPI_ICON = { revenue:<IconWallet/>, jobs:<IconFactory/>, quotes:<IconFile/>, convert:<IconTrend/> }
const stageLabel = (k) => STAGES.find(s=>s.key===k)?.label || k

export default function Dashboard() {
  return (
    <>
      <PageHead title="Welcome back, Kwame 👋" subtitle="Here's what's happening across Sofaamy today.">
        <Link to="/configurator" className="btn btn-gold"><IconCube/> New Design</Link>
        <Link to="/crm" className="btn btn-ghost"><IconPlus/> Add Lead</Link>
      </PageHead>

      <div className="demo-banner">
        ⚡ Live prototype — figures are demonstration data. The Design Configurator is fully interactive.
      </div>

      <div className="grid g-4 mb">
        {KPIS.map(k => (
          <Stat key={k.key} label={k.label} value={k.value} trend={k.trend} dir={k.dir} tone={k.tone} icon={KPI_ICON[k.key]} />
        ))}
      </div>

      <div className="grid mb" style={{ gridTemplateColumns:'1.6fr 1fr' }}>
        <Card title="Revenue Trend" sub="Last 8 weeks (₵ thousands)"
          action={<span className="badge b-green"><span className="bdot"/>+18.4%</span>}>
          <AreaChart data={REVENUE_TREND} />
        </Card>
        <Card title="Jobs in Production" sub="By current stage">
          <Donut data={PIPELINE_MIX} />
        </Card>
      </div>

      <div className="grid mb" style={{ gridTemplateColumns:'1.6fr 1fr' }}>
        <Card title="Active Jobs" sub="Live factory pipeline"
          action={<Link to="/production" className="btn btn-ghost btn-sm">View all</Link>} pad={false}>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Job</th><th>Client</th><th>Stage</th><th>Progress</th><th>Due</th><th>Paid</th></tr></thead>
              <tbody>
                {JOBS.map(j => (
                  <tr key={j.id}>
                    <td className="t-mono">{j.id}</td>
                    <td className="t-strong">{j.client}</td>
                    <td><Badge tone="blue">{stageLabel(j.stage)}</Badge></td>
                    <td style={{ minWidth:120 }}>
                      <div className="flex items-center gap-sm"><Progress value={j.progress} /><span className="muted" style={{fontSize:12}}>{j.progress}%</span></div>
                    </td>
                    <td className="t-muted">{j.due}</td>
                    <td><Badge tone={j.paid==='100%'?'green':'orange'}>{j.paid}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Recent Activity">
          <div>
            {ACTIVITY.map((a,i) => (
              <div key={i} className="flex gap" style={{ padding:'9px 0', borderBottom:i<ACTIVITY.length-1?'1px solid var(--line-soft)':'none' }}>
                <span style={{ width:8,height:8,borderRadius:'50%',marginTop:6,flexShrink:0,background:`var(--${a.tone==='gold'?'gold':a.tone})`}}/>
                <div style={{ fontSize:13 }}>
                  <b>{a.who}</b> <span className="t-muted">{a.what}</span>
                  <div className="muted" style={{ fontSize:11.5, marginTop:1 }}>{a.when}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid g-2">
        <Card title="Product Demand" sub="Orders by product type (this quarter)">
          <BarList data={PRODUCT_DEMAND} />
        </Card>
        <Card title="Quick Insights" action={<Link to="/reports" className="btn btn-ghost btn-sm"><IconChart/> Reports</Link>}>
          <div className="grid g-2" style={{ gap:12 }}>
            {[
              ['Avg. cycle time','6.4 days','per job, cut → dispatch'],
              ['Material waste','8.2%','↓ 1.5% vs last month'],
              ['On-time delivery','91%','last 30 days'],
              ['Avg. order value','₵42,800','across 34 jobs'],
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
    </>
  )
}
