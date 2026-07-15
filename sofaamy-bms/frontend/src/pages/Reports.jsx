import { useEffect, useState } from 'react'
import { PageHead, Card, Stat, Badge } from '../components/ui.jsx'
import { AreaChart, Donut, BarList } from '../components/charts.jsx'
import { REVENUE_TREND, PIPELINE_MIX, PRODUCT_DEMAND } from '../data/seed.js'
import { REPORT_GROUPS, REPORT_STATUS, reportKind } from '../lib/reports.js'
import { listDesigns, downloadReport } from '../lib/api.js'
import { IconWallet, IconTrend, IconChart, IconFactory, IconDownload } from '../components/icons.jsx'

function ReportRow({ r, project, busy, onDownload }) {
  const st = REPORT_STATUS[r.status]
  const kind = project ? reportKind(r, project.design?.category || 'frame') : null
  return (
    <div className="flex between items-center" style={{ padding:'8px 0', borderBottom:'1px solid var(--line-soft)', gap:10 }}>
      <div style={{ minWidth:0 }}>
        <div className="t-strong" style={{ fontSize:12.5 }}>{r.name}</div>
        <div className="muted" style={{ fontSize:11.5 }}>{r.desc}</div>
      </div>
      {kind ? (
        <button className="btn btn-ghost btn-sm" disabled={busy === r.name}
          onClick={() => onDownload(kind, r.name)}>
          <IconDownload style={{ width:13, height:13 }}/> {busy === r.name ? 'Preparing…' : 'PDF'}
        </button>
      ) : <Badge tone={st.tone}>{st.label}</Badge>}
    </div>
  )
}

export default function Reports() {
  const [designs, setDesigns] = useState([])
  const [selId, setSelId] = useState('')
  const [busy, setBusy] = useState(null)
  const [msg, setMsg] = useState('')
  const [offline, setOffline] = useState(false)

  useEffect(() => { listDesigns().then(setDesigns).catch(() => setOffline(true)) }, [])

  const project = designs.find(d => String(d.id) === selId)

  async function onDownload(kind, name) {
    setBusy(name); setMsg('')
    try {
      await downloadReport(kind, project.client_name || '', project.design)
      setMsg(`📄 ${name} — ${project.ref || project.name} downloaded`)
    } catch (e) {
      setMsg(`⚠️ ${String(e.message || e)}`)
    }
    setBusy(null)
  }

  return (
    <>
      <PageHead title="Reports" subtitle="Every document the system produces — from quotation to factory floor to handover.">
        {offline
          ? <Badge tone="orange">backend offline — start the API to download documents</Badge>
          : <select className="rep-select" value={selId} onChange={e => { setSelId(e.target.value); setMsg('') }}>
              <option value="">Select a project to download its documents…</option>
              {designs.map(d => (
                <option key={d.id} value={d.id}>
                  {(d.ref || d.name)} — {d.name}{d.client_name ? ` · ${d.client_name}` : ''}
                </option>
              ))}
            </select>}
      </PageHead>
      {msg && <div className="muted mb" style={{ fontSize:12.5 }}>{msg}</div>}

      <div className="grid g-2 mb">
        {REPORT_GROUPS.map(g => (
          <Card key={g.id} title={g.title} sub={g.sub}>
            {g.reports.map((r, i) => (
              <ReportRow key={i} r={r} project={project} busy={busy} onDownload={onDownload} />
            ))}
          </Card>
        ))}
      </div>

      <div className="section-title">Management Analytics</div>

      <div className="grid g-4 mb">
        <Stat label="Total Revenue" value="₵486,200" trend="+18.4%" dir="up" tone="green" icon={<IconWallet/>} />
        <Stat label="Jobs Completed" value="41" trend="+7" dir="up" tone="blue" icon={<IconFactory/>} />
        <Stat label="Gross Margin" value="21.4%" trend="+1.1%" dir="up" tone="purple" icon={<IconTrend/>} />
        <Stat label="Material Waste" value="8.2%" trend="↓ 1.5%" dir="up" tone="orange" icon={<IconChart/>} />
      </div>

      <div className="grid mb" style={{ gridTemplateColumns:'1.6fr 1fr' }}>
        <Card title="Revenue" sub="Weekly (₵ thousands)"><AreaChart data={REVENUE_TREND} color="#1E8449" /></Card>
        <Card title="Work in Progress" sub="Jobs by stage"><Donut data={PIPELINE_MIX} /></Card>
      </div>

      <div className="grid g-2">
        <Card title="Revenue by Product" sub="Share of orders"><BarList data={PRODUCT_DEMAND} color="#2471A3" /></Card>
        <Card title="Team Performance" sub="Jobs handled this month">
          <BarList data={[
            { label:'Kwame Mensah (Supervisor)', value:12 },
            { label:'Yaa Boateng (Supervisor)', value:9 },
            { label:'Kofi Adjei (Field Rep)', value:14 },
            { label:'Abena Sarpong (Field Rep)', value:11 },
          ]} color="#6C3483" />
        </Card>
      </div>
    </>
  )
}
