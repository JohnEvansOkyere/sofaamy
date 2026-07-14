import { PageHead, Card, Stat, Badge } from '../components/ui.jsx'
import { AreaChart, Donut, BarList } from '../components/charts.jsx'
import { REVENUE_TREND, PIPELINE_MIX, PRODUCT_DEMAND } from '../data/seed.js'
import { REPORT_GROUPS, REPORT_STATUS } from '../lib/reports.js'
import { IconWallet, IconTrend, IconChart, IconFactory, IconDownload } from '../components/icons.jsx'

function ReportRow({ r }) {
  const st = REPORT_STATUS[r.status]
  return (
    <div className="flex between items-center" style={{ padding:'8px 0', borderBottom:'1px solid var(--line-soft)' }}>
      <div style={{ minWidth:0 }}>
        <div className="t-strong" style={{ fontSize:12.5 }}>{r.name}</div>
        <div className="muted" style={{ fontSize:11.5 }}>{r.desc}</div>
      </div>
      <Badge tone={st.tone}>{st.label}</Badge>
    </div>
  )
}

export default function Reports() {
  return (
    <>
      <PageHead title="Reports" subtitle="Every document the system produces — from quotation to factory floor to handover.">
        <button className="btn btn-ghost"><IconDownload/> Export</button>
      </PageHead>

      <div className="grid g-2 mb">
        {REPORT_GROUPS.map(g => (
          <Card key={g.id} title={g.title} sub={g.sub}>
            {g.reports.map((r, i) => <ReportRow key={i} r={r} />)}
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
