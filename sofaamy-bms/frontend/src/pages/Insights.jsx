import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHead, Card, Stat, Badge } from '../components/ui.jsx'
import { BarList, ComparisonChart, Donut } from '../components/charts.jsx'
import { getDashboard } from '../lib/api.js'
import { GHS0 } from '../lib/whatsapp.js'
import {
  IconChart, IconCheck, IconFactory, IconFile, IconTrend, IconWallet,
} from '../components/icons.jsx'
import '../styles/insights.css'

const STAGE_COLORS = {
  pending:'#CA6F1E', cutting:'#2471A3', processing:'#2E86C1',
  holes:'#5DADE2', assembly:'#1E8449', glazing:'#16A085',
  qa:'#6C3483', dispatch:'#D4AC0D', install:'#C0392B',
}
const WORKFLOW_COLORS = [
  '#2471A3','#CA6F1E','#6C3483','#1E8449','#D4AC0D','#16A085',
  '#5DADE2','#C0392B',
]

export default function Insights() {
  const [data, setData] = useState(null)
  useEffect(() => { getDashboard().then(setData).catch(() => {}) }, [])

  if (!data) return (
    <>
      <PageHead title="Insights & KPIs" subtitle="Loading live management numbers…"/>
      <div className="card card-pad insights-loading">Connecting to the live business data…</div>
    </>
  )

  const metrics = data.insights
  const productionMix = data.stage_mix.map(stage => ({
    label:stage.label,
    value:stage.value,
    color:STAGE_COLORS[stage.key] || '#90A0AE',
  }))
  const workflowMix = metrics.workflow_mix.map((row, index) => ({
    ...row, color:WORKFLOW_COLORS[index % WORKFLOW_COLORS.length],
  }))
  const maxFunnel = Math.max(...metrics.quote_funnel.map(row => row.value), 1)

  return (
    <>
      <PageHead title="Insights & KPIs"
        subtitle="Live commercial, cash, project and factory performance—without invented margin or waste figures.">
        <Badge tone="green">Live · from database</Badge>
        <Link to="/" className="btn btn-ghost">← Command Centre</Link>
        <Link to="/reports" className="btn btn-primary"><IconFile/> Documents & Reports</Link>
      </PageHead>

      <div className="insights-note">
        <IconChart />
        <p><b>Management view</b><span>Current-month cash is combined with live all-time pipeline and operational positions. Margin and waste will appear only after those costs are captured reliably.</span></p>
      </div>

      <div className="grid g-4 insights-kpis">
        <Stat label="Collected This Month" value={GHS0(data.revenue_month)}
          trend={`${metrics.collection_pct}% lifetime collection rate`} dir="up"
          tone="green" icon={<IconWallet/>} />
        <Stat label="Open Quote Pipeline" value={GHS0(metrics.open_quote_value)}
          trend={`${data.open_quotes} quotations in play`} dir="flat"
          tone="orange" icon={<IconFile/>} />
        <Stat label="Active Contract Backlog" value={GHS0(metrics.backlog_value)}
          trend={`${data.active_jobs} active customer jobs`} dir="flat"
          tone="blue" icon={<IconFactory/>} />
        <Stat label="Outstanding Receivables" value={GHS0(data.outstanding)}
          trend={`${data.accounts_queue.length} open accounts`} dir="flat"
          tone="purple" icon={<IconWallet/>} />
        <Stat label="Quote Win Rate" value={`${data.convert_pct}%`}
          trend={`${metrics.quote_funnel.find(row => row.label === 'Won')?.value || 0} won decisions`} dir="up"
          tone="green" icon={<IconTrend/>} />
        <Stat label="Average Won Order" value={GHS0(metrics.average_order_value)}
          trend="accepted quotation value" dir="flat"
          tone="blue" icon={<IconFile/>} />
        <Stat label="Average Job Progress" value={`${metrics.average_progress}%`}
          trend={`${data.active_jobs} active customer jobs`} dir="flat"
          tone="purple" icon={<IconFactory/>} />
        <Stat label="Completed This Month" value={String(metrics.completed_month)}
          trend={`${metrics.total_jobs} jobs recorded`} dir="up"
          tone="gold" icon={<IconCheck/>} />
      </div>

      <div className="insights-primary-grid">
        <Card title="Commercial momentum" sub="Last 8 weeks · values in GHS thousands">
          <ComparisonChart primary={data.trend} secondary={data.quote_trend}
            primaryLabel="Cash collected" secondaryLabel="Quotes created"
            primaryColor="#1E8449" secondaryColor="#CA6F1E" />
        </Card>
        <Card title="Quotation funnel" sub="Where every quotation currently sits">
          <div className="insights-funnel">
            {metrics.quote_funnel.map((row, index) => (
              <div key={row.label}>
                <span>{index + 1}</span>
                <p><b>{row.label}</b><small>{row.value} quotation{row.value === 1 ? '' : 's'}</small></p>
                <i style={{width:`${Math.max(10, row.value / maxFunnel * 100)}%`}} />
              </div>
            ))}
          </div>
          <div className="insights-funnel-summary">
            <div><span>Quoted this month</span><b>{GHS0(data.quoted_month)}</b></div>
            <div><span>Average won order</span><b>{GHS0(metrics.average_order_value)}</b></div>
          </div>
        </Card>
      </div>

      <div className="insights-operations-grid">
        <Card title="Factory workload" sub={`${data.active_jobs} active jobs by current stage`}>
          {productionMix.length
            ? <Donut data={productionMix} />
            : <div className="insights-empty">No active factory work.</div>}
        </Card>
        <Card title="Project workflow position" sub={`${data.projects} controlled client projects`}>
          {workflowMix.length
            ? <Donut data={workflowMix} />
            : <div className="insights-empty">No projects have been created.</div>}
        </Card>
        <Card title="Receivable aging" sub="Outstanding contract balances by job age">
          <div className="insights-aging">
            {metrics.receivable_aging.map(row => (
              <div key={row.label}>
                <span>{row.label}<small>{row.count} account{row.count === 1 ? '' : 's'}</small></span>
                <b>{GHS0(row.value)}</b>
              </div>
            ))}
          </div>
          <Link to="/accounts" className="insights-card-link">Open Accounts →</Link>
        </Card>
      </div>

      <div className="insights-bottom-grid">
        <Card title="Top client accounts" sub="Contract value, collection and exposure" pad={false}>
          <div className="tbl-wrap">
            <table className="tbl insights-client-table">
              <thead><tr><th>Client</th><th>Jobs</th><th>Contracted</th><th>Collected</th><th>Outstanding</th></tr></thead>
              <tbody>
                {metrics.top_clients.map(row => (
                  <tr key={row.label}>
                    <td className="t-strong">{row.label}</td>
                    <td>{row.jobs}</td>
                    <td className="t-mono">{GHS0(row.value)}</td>
                    <td className="t-mono">{GHS0(row.received)}</td>
                    <td className="t-mono">{GHS0(row.outstanding)}</td>
                  </tr>
                ))}
                {!metrics.top_clients.length && <tr><td colSpan={5} className="insights-empty">No contracted client jobs yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
        <Card title="Contract value by product" sub="Largest products across recorded jobs">
          <BarList data={metrics.product_mix} valueFormatter={GHS0} color="#2471A3" />
          {!metrics.product_mix.length && <div className="insights-empty">No product value recorded.</div>}
        </Card>
      </div>
    </>
  )
}
