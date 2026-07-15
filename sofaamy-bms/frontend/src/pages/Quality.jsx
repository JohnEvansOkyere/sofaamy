import { useEffect, useState } from 'react'
import { PageHead, Card, Stat, Badge, Person } from '../components/ui.jsx'
import JobDrawer from '../components/JobDrawer.jsx'
import { listJobs, listQcChecks } from '../lib/api.js'
import { timeAgo } from '../lib/whatsapp.js'
import { IconShield, IconCheck, IconClock } from '../components/icons.jsx'
import '../styles/ops.css'

export default function Quality() {
  const [jobs, setJobs] = useState([])
  const [checks, setChecks] = useState([])
  const [live, setLive] = useState(false)
  const [open, setOpen] = useState(null)

  const refresh = () => Promise.all([listJobs(), listQcChecks()])
    .then(([js, cs]) => { setJobs(js); setChecks(cs); setLive(true) }).catch(() => {})
  useEffect(() => { refresh() }, [])

  const queue = jobs.filter(j => j.stage === 'qa')
  const passes = checks.filter(c => c.result === 'pass')
  const rework = checks.filter(c => c.result === 'rework')
  const avgScore = checks.length ? Math.round(checks.reduce((s, c) => s + c.score, 0) / checks.length) : 0

  return (
    <>
      <PageHead title="Quality Control" subtitle="Inspect at the QA gate — pass releases to dispatch, rework holds the job.">
        {live
          ? <span className="badge b-green"><span className="bdot"/>Live · from database</span>
          : <span className="badge b-orange"><span className="bdot"/>Backend offline</span>}
      </PageHead>

      <div className="grid g-4 mb">
        <Stat label="Awaiting Inspection" value={String(queue.length)} trend="at the QA gate" dir="flat" tone="orange" icon={<IconClock/>} />
        <Stat label="Pass Rate" value={checks.length ? `${Math.round(passes.length / checks.length * 100)}%` : '—'} trend={`${checks.length} inspections`} dir="up" tone="green" icon={<IconCheck/>} />
        <Stat label="Rework Flagged" value={String(rework.length)} trend={rework[0]?.job || 'none'} dir="flat" tone="purple" icon={<IconShield/>} />
        <Stat label="Avg. QA Score" value={checks.length ? `${avgScore}%` : '—'} trend="across all checks" dir="flat" tone="blue" icon={<IconShield/>} />
      </div>

      <Card title="Inspection Queue" sub="Jobs at Quality Check — open one to run the checklist" pad={false} className="mb">
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Job</th><th>Client</th><th>Product</th><th>Last Result</th><th></th></tr></thead>
            <tbody>
              {queue.map(j => (
                <tr key={j.id}>
                  <td className="t-mono">{j.job_number}</td>
                  <td className="t-strong">{j.client}</td>
                  <td className="t-muted">{j.product}</td>
                  <td>{j.qc
                    ? <Badge tone={j.qc === 'pass' ? 'green' : 'orange'}>{j.qc === 'pass' ? 'Passed — release' : '⟲ Rework — re-inspect'}</Badge>
                    : <Badge tone="gray">Not inspected</Badge>}</td>
                  <td className="right">
                    <button className="btn btn-primary btn-sm" onClick={() => setOpen(j.job_number)}>
                      <IconShield style={{ width:14, height:14 }}/> Inspect
                    </button>
                  </td>
                </tr>
              ))}
              {!queue.length && <tr><td colSpan={5} className="muted center" style={{ padding:22 }}>QA queue is clear — jobs arrive here from Glazing.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Inspection Log" sub="Every inspection recorded, newest first" pad={false}>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Job</th><th>Product</th><th>Inspector</th><th>Notes</th><th>Score</th><th>Result</th><th>When</th></tr></thead>
            <tbody>
              {checks.map((q, i) => (
                <tr key={i}>
                  <td className="t-mono t-muted">{q.job}</td>
                  <td className="t-strong">{q.product}</td>
                  <td><Person name={q.inspector || '—'} i={i + 4} /></td>
                  <td className="t-muted" style={{ maxWidth:260 }}>{q.notes || '—'}</td>
                  <td className="t-mono">{q.score}%</td>
                  <td><Badge tone={q.result === 'pass' ? 'green' : 'orange'}>{q.result === 'pass' ? 'Pass' : 'Rework'}</Badge></td>
                  <td className="t-muted">{timeAgo(q.at)}</td>
                </tr>
              ))}
              {!checks.length && <tr><td colSpan={7} className="muted center" style={{ padding:22 }}>No inspections recorded yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      {open && <JobDrawer jobNumber={open} onClose={() => setOpen(null)} onChanged={refresh}/>}
    </>
  )
}
