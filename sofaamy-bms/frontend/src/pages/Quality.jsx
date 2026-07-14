import { PageHead, Card, Stat, Badge, Person } from '../components/ui.jsx'
import { QA_CHECKS } from '../data/seed.js'
import { IconShield, IconCheck, IconClock } from '../components/icons.jsx'

export default function Quality() {
  return (
    <>
      <PageHead title="Quality Control" subtitle="Post-production and post-installation checks matched to Sofaamy's standards." >
        <button className="btn btn-primary"><IconShield/> New Inspection</button>
      </PageHead>

      <div className="grid g-4 mb">
        <Stat label="Pass Rate (Month)" value="94%" trend="+2%" dir="up" tone="green" icon={<IconCheck/>} />
        <Stat label="Inspections" value="42" trend="this month" dir="flat" tone="blue" icon={<IconShield/>} />
        <Stat label="Rework Items" value="3" trend="↓ 2" dir="up" tone="orange" icon={<IconClock/>} />
        <Stat label="Avg. QA Score" value="93.5%" trend="stable" dir="flat" tone="purple" icon={<IconShield/>} />
      </div>

      <Card title="Inspection Log" pad={false}>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Check</th><th>Job</th><th>Product</th><th>Checkpoint</th><th>Inspector</th><th>Score</th><th>Result</th><th>When</th></tr></thead>
            <tbody>
              {QA_CHECKS.map((q,i) => (
                <tr key={q.id}>
                  <td className="t-mono">{q.id}</td>
                  <td className="t-mono t-muted">{q.job}</td>
                  <td className="t-strong">{q.product}</td>
                  <td><Badge tone="gray">{q.stage}</Badge></td>
                  <td><Person name={q.inspector} i={i+4} /></td>
                  <td className="t-mono">{q.score}</td>
                  <td><Badge>{q.result}</Badge></td>
                  <td className="t-muted">{q.when}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid g-2 mt">
        <Card title="QA Checklist Template" sub="Applied at each checkpoint">
          {['Frame squareness within ±2mm','Glass free of chips & scratches','Hardware operates smoothly','Seals & gaskets fitted','Finish matches spec','Dimensions match survey'].map((c,i)=>(
            <div key={i} className="flex items-center gap-sm" style={{ padding:'7px 0', fontSize:13, borderBottom:'1px solid var(--line-soft)' }}>
              <span style={{ width:18,height:18,borderRadius:5,background:'var(--green-soft)',color:'var(--green)',display:'flex',alignItems:'center',justifyContent:'center' }}>
                <IconCheck style={{ width:12,height:12 }}/></span>{c}
            </div>
          ))}
        </Card>
        <Card title="Rework Flow" sub="What happens on a fail">
          <p className="t-muted" style={{ fontSize:13 }}>A failed check sends the job back to the responsible factory stage with a note and photo. The supervisor is notified instantly, and the job re-enters the pipeline at that stage — nothing slips through.</p>
          <div className="mt flex gap-sm wrap">
            <Badge tone="orange">Rework → Glazing</Badge><Badge tone="blue">Supervisor notified</Badge>
          </div>
        </Card>
      </div>
    </>
  )
}
