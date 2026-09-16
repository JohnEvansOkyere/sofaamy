import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { PageHead, Card, Stat, Badge, Person } from '../components/ui.jsx'
import JobDrawer from '../components/JobDrawer.jsx'
import { listJobs, listPreProductionQc, listQcChecks } from '../lib/api.js'
import { useLiveRefresh } from '../lib/live.js'
import { timeAgo } from '../lib/whatsapp.js'
import { IconShield, IconCheck, IconClock, IconLayers } from '../components/icons.jsx'
import '../styles/ops.css'
import '../styles/quality.css'

export const CHECKS = [
  ['measurements_verified', 'Measurements match the approved project dimensions'],
  ['materials_verified', 'Material types, systems, finishes and specifications are correct'],
  ['quantities_verified', 'Required material and production quantities are correct'],
  ['drawings_verified', 'Current approved drawings match the work to be produced'],
  ['procurement_verified', 'Procurement is complete and materials are available'],
]

export const STATUS = {
  ready_for_check: ['blue', 'Ready for QC'],
  approved: ['green', 'Cleared for release'],
  hold: ['red', 'On hold'],
  stale: ['orange', 'Re-check required'],
  not_ready: ['gray', 'Not ready'],
}

function PreProductionQc({ projects }) {
  const visible = projects.filter(row => row.status !== 'not_ready' || row.latest_check)

  return <>
    <div className="grid g-4 mb">
      <Stat label="Ready for Check" value={String(projects.filter(row => row.status === 'ready_for_check').length)} trend="procurement complete" dir="flat" tone="blue" icon={<IconClock/>} />
      <Stat label="On Hold" value={String(projects.filter(row => row.status === 'hold').length)} trend="factory blocked" dir="flat" tone="orange" icon={<IconShield/>} />
      <Stat label="Re-check Required" value={String(projects.filter(row => row.status === 'stale').length)} trend="controlled input changed" dir="flat" tone="purple" icon={<IconLayers/>} />
      <Stat label="Cleared" value={String(projects.filter(row => row.status === 'approved').length)} trend="current approval" dir="up" tone="green" icon={<IconCheck/>} />
    </div>

    <Card title="Pre-production release checks" sub="A project cannot reach the factory floor until QA/QC clears its complete current pack." pad={false} className="mb">
      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th>Project</th><th>Client / site</th><th>Items</th><th>Status</th><th>Last check</th><th></th></tr></thead>
          <tbody>
            {visible.map(row => {
              const [tone, label] = STATUS[row.status] || STATUS.not_ready
              return <tr key={row.project_id}>
                <td><b>{row.project_name}</b><small className="quality-project-number">{row.project_number}</small></td>
                <td>{row.client_name}<small className="quality-project-number">{row.site || 'No site recorded'}</small></td>
                <td className="t-mono">{row.item_count}</td>
                <td><Badge tone={tone}>{label}</Badge></td>
                <td className="t-muted">{row.latest_check
                  ? `${row.latest_check.inspector} · ${timeAgo(row.latest_check.checked_at)}`
                  : 'Not checked'}</td>
                <td className="right"><Link className="btn btn-primary btn-sm" to={`/quality/${row.project_id}`}>
                  {row.status === 'approved' ? 'View / re-check' : 'Open check'}
                </Link></td>
              </tr>
            })}
            {!visible.length && <tr><td colSpan={6} className="muted center" style={{ padding:22 }}>No project has reached the pre-production QC gate yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </Card>
  </>
}

function FinalProductionQa({ jobs, checks, onOpen }) {
  const queue = jobs.filter(job => job.stage === 'qa')
  const passes = checks.filter(check => check.result === 'pass')
  const rework = checks.filter(check => check.result === 'rework')
  const avgScore = checks.length
    ? Math.round(checks.reduce((sum, check) => sum + check.score, 0) / checks.length) : 0

  return <>
    <div className="grid g-4 mb">
      <Stat label="Awaiting Inspection" value={String(queue.length)} trend="at the final QA gate" dir="flat" tone="orange" icon={<IconClock/>} />
      <Stat label="Pass Rate" value={checks.length ? `${Math.round(passes.length / checks.length * 100)}%` : '—'} trend={`${checks.length} inspections`} dir="up" tone="green" icon={<IconCheck/>} />
      <Stat label="Rework Flagged" value={String(rework.length)} trend={rework[0]?.job || 'none'} dir="flat" tone="purple" icon={<IconShield/>} />
      <Stat label="Avg. QA Score" value={checks.length ? `${avgScore}%` : '—'} trend="across all checks" dir="flat" tone="blue" icon={<IconShield/>} />
    </div>

    <Card title="Final production inspection queue" sub="Jobs reach this gate after factory production. Pass releases to dispatch; rework holds the job." pad={false} className="mb">
      <div className="tbl-wrap"><table className="tbl">
        <thead><tr><th>Job</th><th>Client</th><th>Product</th><th>Last Result</th><th></th></tr></thead>
        <tbody>
          {queue.map(job => <tr key={job.id}>
            <td className="t-mono">{job.job_number}</td><td className="t-strong">{job.client}</td><td className="t-muted">{job.product}</td>
            <td>{job.qc ? <Badge tone={job.qc === 'pass' ? 'green' : 'orange'}>{job.qc === 'pass' ? 'Passed — release' : 'Rework — re-inspect'}</Badge> : <Badge tone="gray">Not inspected</Badge>}</td>
            <td className="right"><button className="btn btn-primary btn-sm" onClick={() => onOpen(job.job_number)}><IconShield /> Inspect</button></td>
          </tr>)}
          {!queue.length && <tr><td colSpan={5} className="muted center" style={{ padding:22 }}>Final QA queue is clear.</td></tr>}
        </tbody>
      </table></div>
    </Card>

    <Card title="Final inspection log" sub="Every post-production inspection, newest first" pad={false}>
      <div className="tbl-wrap"><table className="tbl">
        <thead><tr><th>Job</th><th>Product</th><th>Inspector</th><th>Notes</th><th>Score</th><th>Result</th><th>When</th></tr></thead>
        <tbody>
          {checks.map((check, index) => <tr key={`${check.job}-${check.at}-${index}`}>
            <td className="t-mono t-muted">{check.job}</td><td className="t-strong">{check.product}</td>
            <td><Person name={check.inspector || '—'} i={index + 4} /></td><td className="t-muted" style={{ maxWidth:260 }}>{check.notes || '—'}</td>
            <td className="t-mono">{check.score}%</td><td><Badge tone={check.result === 'pass' ? 'green' : 'orange'}>{check.result === 'pass' ? 'Pass' : 'Rework'}</Badge></td>
            <td className="t-muted">{timeAgo(check.at)}</td>
          </tr>)}
          {!checks.length && <tr><td colSpan={7} className="muted center" style={{ padding:22 }}>No final inspections recorded yet.</td></tr>}
        </tbody>
      </table></div>
    </Card>
  </>
}

export default function Quality() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [jobs, setJobs] = useState([])
  const [checks, setChecks] = useState([])
  const [preproduction, setPreproduction] = useState([])
  const [live, setLive] = useState(false)
  const [open, setOpen] = useState(null)
  const scope = searchParams.get('scope') === 'final' ? 'final' : 'preproduction'

  const refresh = () => Promise.all([listJobs(), listQcChecks(), listPreProductionQc()])
    .then(([jobRows, checkRows, preproductionRows]) => {
      setJobs(jobRows); setChecks(checkRows); setPreproduction(preproductionRows); setLive(true)
    }).catch(() => setLive(false))
  useEffect(() => { refresh() }, [])
  useLiveRefresh(refresh)

  const pendingPreproduction = useMemo(() => preproduction.filter(
    row => ['ready_for_check', 'hold', 'stale'].includes(row.status)).length, [preproduction])
  const finalQueue = jobs.filter(job => job.stage === 'qa').length

  function setScope(nextScope) {
    const next = new URLSearchParams(searchParams)
    next.set('scope', nextScope)
    setSearchParams(next)
  }

  return <>
    <PageHead title="Quality Control" subtitle="Two enforced gates: verify the project before factory release, then inspect the finished work before dispatch.">
      {live
        ? <span className="badge b-green"><span className="bdot"/>Live · from database</span>
        : <span className="badge b-orange"><span className="bdot"/>Backend offline</span>}
    </PageHead>

    <nav className="quality-scopes" aria-label="Quality control scope">
      <button className={scope === 'preproduction' ? 'active' : ''} onClick={() => setScope('preproduction')}>
        <span>Before production</span><b>Pre-production QC</b><em>{pendingPreproduction} requiring action</em>
      </button>
      <button className={scope === 'final' ? 'active' : ''} onClick={() => setScope('final')}>
        <span>After production</span><b>Final QA inspection</b><em>{finalQueue} awaiting inspection</em>
      </button>
    </nav>

    {scope === 'preproduction'
      ? <PreProductionQc projects={preproduction} />
      : <FinalProductionQa jobs={jobs} checks={checks} onOpen={setOpen} />}
    {open && <JobDrawer jobNumber={open} onClose={() => setOpen(null)} onChanged={refresh}/>}
  </>
}
