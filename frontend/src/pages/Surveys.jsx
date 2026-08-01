import { PageHead, Card, Stat, Badge, Person } from '../components/ui.jsx'
import { SURVEYS } from '../data/seed.js'
import { IconRuler, IconPlus, IconCheck, IconClock, IconPin } from '../components/icons.jsx'

export default function Surveys() {
  return (
    <>
      <PageHead title="Surveys" subtitle="Field measurements captured on-site, verified against the quote.">
        <button className="btn btn-primary"><IconPlus/> Schedule Survey</button>
      </PageHead>

      <div className="grid g-4 mb">
        <Stat label="Surveys This Week" value="7" trend="+2" dir="up" tone="blue" icon={<IconRuler/>} />
        <Stat label="Completed" value="4" trend="on schedule" dir="flat" tone="green" icon={<IconCheck/>} />
        <Stat label="Scheduled" value="2" trend="next: 08 Jul" dir="flat" tone="orange" icon={<IconClock/>} />
        <Stat label="Avg. Quote Variance" value="±2.4%" trend="within tolerance" dir="flat" tone="purple" icon={<IconRuler/>} />
      </div>

      <Card title="Site Surveys" sub="Quote-vs-survey verification" pad={false}>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Survey</th><th>Job</th><th>Site</th><th>Field Rep</th><th>Units</th><th>Variance</th><th>Status</th><th>When</th></tr></thead>
            <tbody>
              {SURVEYS.map((s,i) => (
                <tr key={s.id}>
                  <td className="t-mono">{s.id}</td>
                  <td className="t-mono t-muted">{s.job}</td>
                  <td className="t-strong"><span className="flex items-center gap-sm"><IconPin style={{width:14,height:14,color:'var(--ink-3)'}}/>{s.site}</span></td>
                  <td><Person name={s.rep} i={i+2} /></td>
                  <td>{s.units || '—'}</td>
                  <td className={s.variance.startsWith('+')?'':''}><b>{s.variance}</b></td>
                  <td><Badge>{s.status}</Badge></td>
                  <td className="t-muted">{s.when}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid g-3 mt">
        <Card title="Mobile Capture">
          <p className="t-muted" style={{ fontSize:13 }}>Field reps capture dimensions, photos and GPS on their phone — even offline. Syncs the moment they're back on network.</p>
          <div className="mt flex gap-sm wrap">
            <span className="chip">📐 Dimensions</span><span className="chip">📷 Photos</span><span className="chip">📍 GPS</span><span className="chip">✈️ Offline</span>
          </div>
        </Card>
        <Card title="Auto Variance Check">
          <p className="t-muted" style={{ fontSize:13 }}>The system compares surveyed dimensions with the original quote and flags any unit outside tolerance for the supervisor.</p>
          <div className="mt"><Badge tone="green">4 within tolerance</Badge> <Badge tone="orange">1 flagged</Badge></div>
        </Card>
        <Card title="WhatsApp Confirmation">
          <p className="t-muted" style={{ fontSize:13 }}>Once a survey is approved, the client automatically receives a confirmation with the final measurements and updated timeline.</p>
        </Card>
      </div>
    </>
  )
}
