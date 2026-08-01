import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHead, Card, Badge, Progress } from '../components/ui.jsx'
import WhatsAppModal from '../components/WhatsAppModal.jsx'
import { Donut } from '../components/charts.jsx'
import { getDashboard, setQuoteStatus } from '../lib/api.js'
import { GHS0, timeAgo } from '../lib/whatsapp.js'
import {
  IconBox, IconChart, IconClock, IconCube, IconFactory, IconFile,
  IconLayers, IconTrend, IconWallet, IconWhatsApp,
} from '../components/icons.jsx'
import '../styles/dashboard.css'

const STAGE_COLORS = {
  pending:'#CA6F1E', cutting:'#2471A3', processing:'#2E86C1',
  holes:'#5DADE2', assembly:'#1E8449', glazing:'#16A085',
  qa:'#6C3483', dispatch:'#D4AC0D', install:'#C0392B',
}
const EV_TONE = {
  stage:'blue-400', payment:'gold', qc:'purple', dispatch:'green',
  quote:'green', stock:'orange', system:'blue-400',
}
const PIPELINE_ICON = {
  quotation: IconFile,
  accounts: IconWallet,
  technical: IconLayers,
  production: IconFactory,
  handover: IconTrend,
}
const STATUS_TONE = {
  measurement_received:'gray',
  extraction_in_progress:'blue',
  extraction_ready:'blue',
  quote_in_preparation:'orange',
  quote_sent:'orange',
  awaiting_payment:'purple',
  drawing_authorized:'blue',
  drawing_in_progress:'blue',
  drawing_under_review:'gold',
  client_overview_sent:'gold',
  drawing_approved:'green',
  production_pack_ready:'green',
  released_to_factory:'green',
}

function AttentionChip({ to, tone, value, label }) {
  return (
    <Link to={to} className={`command-attention-chip ${tone}`}>
      <b>{value}</b><span>{label}</span>
    </Link>
  )
}

function PipelineCard({ item }) {
  const Icon = PIPELINE_ICON[item.key] || IconTrend
  return (
    <Link to={item.url} className={`command-pipeline-card ${item.tone}`}>
      <span className="command-pipeline-icon"><Icon /></span>
      <div>
        <small>{item.label}</small>
        <strong>{item.count}</strong>
        <p>{item.value > 0 ? GHS0(item.value) : item.detail}</p>
        {item.value > 0 && <em>{item.detail}</em>}
      </div>
      <i>→</i>
    </Link>
  )
}

export default function Dashboard() {
  const [data, setData] = useState(null)
  const [followupTab, setFollowupTab] = useState('clients')
  const [whatsApp, setWhatsApp] = useState(null)

  const refresh = () => getDashboard().then(setData).catch(() => {})
  useEffect(() => { refresh() }, [])

  if (!data) return (
    <>
      <PageHead title="Business Command Centre" subtitle="Connecting every project, payment and factory action…"/>
      <div className="card card-pad command-loading">
        <IconTrend /><b>Loading the live Sofaamy business position…</b>
        <span>Start the backend if this message remains on screen.</span>
      </div>
    </>
  )

  const productionMix = data.stage_mix.map(stage => ({
    label:stage.label,
    value:stage.value,
    color:STAGE_COLORS[stage.key] || '#90A0AE',
  }))
  const dueClientFollowups = data.client_followups.filter(row => row.priority !== 'watch')
  const paymentFollowups = data.accounts_queue.filter(row => row.status === 'payment_due')

  const openWhatsApp = followup => setWhatsApp({
    ...followup,
    message: `Hello ${followup.client}, just following up on quotation ${followup.quote_number} for ${followup.product}. Please let us know if you would like any clarification or if we can help you move forward. Thank you.`,
  })

  return (
    <>
      <PageHead title="Business Command Centre"
        subtitle="A live view of projects, sales, accounts, technical work and production.">
        <Link to="/insights" className="btn btn-primary"><IconChart/> Insights & KPIs</Link>
        <Link to="/configurator" className="btn btn-gold"><IconCube/> New Design</Link>
      </PageHead>

      <section className="command-attention">
        <div className="command-attention-title">
          <span><IconClock /></span>
          <div>
            <b>{data.attention.total
              ? `${data.attention.total} actions need attention`
              : 'Business queues are clear'}</b>
            <small>Open a queue below to continue the work.</small>
          </div>
        </div>
        <div className="command-attention-chips">
          <AttentionChip to="/quotations" tone="orange"
            value={data.attention.client_followups} label="client follow-ups" />
          <AttentionChip to="/accounts" tone="purple"
            value={data.attention.payment_holds} label="payment holds" />
          <AttentionChip to="/production" tone="blue"
            value={data.attention.cutting_blockers} label="cutting blockers" />
          <AttentionChip to="/quality" tone="gold"
            value={data.attention.qa_actions} label="QA actions" />
          <AttentionChip to="/inventory" tone="green"
            value={data.attention.stock_alerts} label="stock alerts" />
        </div>
      </section>

      <div className="command-section-head">
        <div><span>Overall business pipeline</span><h2>Work by department</h2></div>
        <small>Queues can overlap when a project needs action from more than one team.</small>
      </div>
      <div className="command-pipeline">
        {data.pipeline.map(item => <PipelineCard item={item} key={item.key} />)}
      </div>

      <div className="command-main-grid">
        <Card title="Current projects"
          sub={`${data.current_projects.length} client projects · open the exact next workspace`}
          action={<Link to="/technical-workflow" className="btn btn-ghost btn-sm">All workflows →</Link>}
          pad={false}>
          <div className="tbl-wrap">
            <table className="tbl command-project-table">
              <thead>
                <tr>
                  <th>Project / client</th><th>Current position</th>
                  <th>Commercial</th><th>Last activity</th><th></th>
                </tr>
              </thead>
              <tbody>
                {data.current_projects.map(project => (
                  <tr key={project.id}>
                    <td>
                      <b>{project.name}</b>
                      <small>{project.project_number} · {project.client}</small>
                      <em>{project.product || project.location || 'Project setup'}</em>
                    </td>
                    <td>
                      <Badge tone={STATUS_TONE[project.workflow_status] || 'blue'}>
                        {project.workflow_status_label}
                      </Badge>
                      <div className="command-project-progress">
                        <Progress value={project.workflow_progress} />
                        <span>{project.workflow_progress}%</span>
                      </div>
                    </td>
                    <td>
                      <b className="t-mono">{project.contract_value
                        ? GHS0(project.contract_value)
                        : project.quote_count
                          ? `${project.quote_count} quote${project.quote_count === 1 ? '' : 's'}`
                          : 'Not quoted'}</b>
                      <small>{project.balance > 0
                        ? `${GHS0(project.balance)} balance`
                        : project.paid > 0
                          ? 'Fully collected'
                          : 'No customer payment yet'}</small>
                    </td>
                    <td><span>{timeAgo(project.last_activity)}</span></td>
                    <td className="right">
                      <Link to={project.url} className="btn btn-ghost btn-sm">
                        {project.action} →
                      </Link>
                    </td>
                  </tr>
                ))}
                {!data.current_projects.length && (
                  <tr><td colSpan={5} className="muted center" style={{padding:28}}>
                    Create a client project to start the controlled workflow.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Follow-up desk" sub="Client decisions and payments holding work"
          action={<div className="command-tabs">
            <button className={followupTab === 'clients' ? 'active' : ''}
              onClick={() => setFollowupTab('clients')}>Clients {dueClientFollowups.length}</button>
            <button className={followupTab === 'payments' ? 'active' : ''}
              onClick={() => setFollowupTab('payments')}>Payments {paymentFollowups.length}</button>
          </div>}>
          {followupTab === 'clients' && <div className="command-followups">
            {dueClientFollowups.slice(0, 6).map(row => (
              <div className={`command-followup ${row.priority}`} key={row.quote_number}>
                <span className="command-followup-age">{row.days_waiting}<small>days</small></span>
                <div>
                  <b>{row.client}</b>
                  <p>{row.quote_number} · {row.product}</p>
                  <strong>{GHS0(row.value)}</strong>
                </div>
                <div className="command-followup-actions">
                  <button title="Follow up on WhatsApp" disabled={!row.phone}
                    onClick={() => openWhatsApp(row)}><IconWhatsApp /></button>
                  <Link to={row.url} title="Open quotation">→</Link>
                </div>
              </div>
            ))}
            {!dueClientFollowups.length && <div className="command-empty">
              No client quotation follow-ups are overdue.
            </div>}
          </div>}
          {followupTab === 'payments' && <div className="command-followups">
            {paymentFollowups.slice(0, 6).map(row => (
              <Link to={row.url} className="command-followup payment" key={row.job_number}>
                <span className="command-followup-age">{row.days_open}<small>days</small></span>
                <div>
                  <b>{row.client}</b>
                  <p>{row.job_number} · {row.product}</p>
                  <strong>{GHS0(row.required_now)} required now</strong>
                </div>
                <i>→</i>
              </Link>
            ))}
            {!paymentFollowups.length && <div className="command-empty">
              No customer payment is currently holding work.
            </div>}
          </div>}
          <div className="command-followup-foot">
            {followupTab === 'clients'
              ? <Link to="/quotations">Open all quotations →</Link>
              : <Link to="/accounts">Open customer accounts →</Link>}
          </div>
        </Card>
      </div>

      <div className="command-secondary-grid">
        <Card title="Production now" sub="Released work by factory stage"
          action={<Link to="/production" className="btn btn-ghost btn-sm">Factory board →</Link>}>
          {productionMix.length
            ? <Donut data={productionMix} />
            : <div className="command-empty">
                No project is currently active on the factory floor.
              </div>}
          {!!data.production_jobs.length && <div className="command-production-list">
            {data.production_jobs.slice(0, 4).map(job => (
              <Link to={`/production/${job.job_number}`} key={job.job_number}>
                <div><b>{job.job_number}</b><small>{job.client} · {job.product}</small></div>
                <Badge tone={job.block ? 'orange' : 'blue'}>{job.stage_label}</Badge>
              </Link>
            ))}
          </div>}
        </Card>

        <Card title="Live business activity" sub="Latest actions recorded by the team"
          action={<Link to="/insights" className="btn btn-ghost btn-sm">Numbers →</Link>}>
          <div className="command-activity">
            {data.activity.map((item, index) => (
              <div key={`${item.at}-${index}`}>
                <span style={{background:`var(--${EV_TONE[item.kind] || 'blue-400'})`}} />
                <p><b>{item.who}</b> {item.note}<small>{timeAgo(item.at)}</small></p>
              </div>
            ))}
            {!data.activity.length && <div className="command-empty">No activity recorded yet.</div>}
          </div>
        </Card>

        <Card title="Inventory readiness" sub={`${data.low_stock.length} alerts · ${GHS0(data.stock_value)} working stock value`}
          action={<Link to="/inventory" className="btn btn-ghost btn-sm"><IconBox/> Inventory →</Link>}>
          {data.low_stock.length
            ? <div className="command-stock-list">{data.low_stock.slice(0, 5).map(item => (
                <Link to="/inventory" key={item.code}>
                  <div><b>{item.name}</b><small>{item.code}</small></div>
                  <Badge tone={item.stock <= item.reorder / 2 ? 'red' : 'orange'}>
                    {item.stock} {item.unit}
                  </Badge>
                </Link>
              ))}</div>
            : <div className="command-ready">
                <span>✓</span><div><b>Materials are above reorder level</b>
                <small>Provisional opening balances remain subject to physical count.</small></div>
              </div>}
        </Card>
      </div>

      {whatsApp && <WhatsAppModal
        to={{phone:whatsApp.phone, name:whatsApp.client}}
        message={whatsApp.message}
        onClose={() => setWhatsApp(null)}
        onSent={() => setQuoteStatus(whatsApp.quote_number, 'Sent')
          .then(refresh).catch(() => {})} />}
    </>
  )
}
