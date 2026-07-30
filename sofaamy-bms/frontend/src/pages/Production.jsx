import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHead, Stat, Badge, Progress } from '../components/ui.jsx'
import { listProductionJobs } from '../lib/api.js'
import { dateShort, GHS0 } from '../lib/whatsapp.js'
import { IconFactory, IconLayers, IconCheck, IconTruck } from '../components/icons.jsx'
import '../styles/production.css'

const BOARD_STAGES = [
  { key: 'pending',    label: 'Ready for Cutting' },
  { key: 'cutting',    label: 'Cutting' },
  { key: 'processing', label: 'Processing' },
  { key: 'holes',      label: 'Holes / Routing' },
  { key: 'assembly',   label: 'Assembly' },
  { key: 'glazing',    label: 'Glazing' },
  { key: 'qa',         label: 'Quality Check' },
  { key: 'dispatch',   label: 'Dispatch' },
  { key: 'install',    label: 'Installation' },
]

const COMPLETED_PAGE_SIZE = 10

export default function Production() {
  const [jobs, setJobs] = useState([])
  const [live, setLive] = useState(false)
  const [completedSearch, setCompletedSearch] = useState('')
  const [completedPage, setCompletedPage] = useState(1)

  const refresh = () => listProductionJobs().then(js => { setJobs(js); setLive(true) }).catch(() => {})
  useEffect(() => { refresh() }, [])

  const factoryJobs = jobs
  const active = factoryJobs.filter(j => j.stage !== 'done')
  const completed = factoryJobs
    .filter(j => j.stage === 'done')
    .sort((a, b) => new Date(b.delivered_at || b.created_at)
      - new Date(a.delivered_at || a.created_at))
  const inFactory = active.filter(j => !['pending', 'dispatch', 'install'].includes(j.stage))
  const BOARD = BOARD_STAGES.map(st => ({
    ...st, jobs: active.filter(j => j.stage === st.key),
  }))
  const filteredCompleted = useMemo(() => {
    const query = completedSearch.trim().toLowerCase()
    if (!query) return completed
    return completed.filter(job => [
      job.job_number, job.client, job.product,
      job.factory_release?.release_number,
    ].some(value => String(value || '').toLowerCase().includes(query)))
  }, [completed, completedSearch])
  const completedPages = Math.max(
    1, Math.ceil(filteredCompleted.length / COMPLETED_PAGE_SIZE))
  const visibleCompleted = filteredCompleted.slice(
    (completedPage - 1) * COMPLETED_PAGE_SIZE,
    completedPage * COMPLETED_PAGE_SIZE)

  useEffect(() => { setCompletedPage(1) }, [completedSearch])
  useEffect(() => {
    if (completedPage > completedPages) setCompletedPage(completedPages)
  }, [completedPage, completedPages])

  return (
    <>
      <PageHead title="Production Pipeline" subtitle="Only projects released by Technical with a current approved factory pack appear here.">
        {live
          ? <span className="badge b-green"><span className="bdot"/>Live · from database</span>
          : <span className="badge b-orange"><span className="bdot"/>Backend offline — start the API</span>}
      </PageHead>

      <div className="grid g-4 mb">
        <Stat label="Jobs in Factory" value={String(inFactory.length)} trend={`${active.length} active total`} dir="flat" tone="blue" icon={<IconFactory/>} />
        <Stat label="Ready for Cutting" value={String(factoryJobs.filter(j => j.stage === 'pending').length)} trend="Approved factory releases" dir="flat" tone="green" icon={<IconLayers/>} />
        <Stat label="Awaiting QA" value={String(factoryJobs.filter(j => j.stage === 'qa').length)} trend={factoryJobs.some(j => j.stage === 'qa' && j.qc === 'rework') ? 'rework flagged' : 'on track'} dir="flat" tone="purple" icon={<IconCheck/>} />
        <Stat label="Dispatch & Install" value={String(factoryJobs.filter(j => ['dispatch','install'].includes(j.stage)).length)} trend="Released production jobs" dir="flat" tone="blue" icon={<IconTruck/>} />
      </div>

      <div className="section-title">Factory Board</div>
      <div style={{ overflowX:'auto', paddingBottom:8 }}>
        <div style={{ display:'flex', gap:12, minWidth:1350 }}>
          {BOARD.map((col, ci) => (
            <div key={col.key} style={{ flex:'1 0 165px' }}>
              <div className="flex between items-center" style={{ padding:'0 4px 10px' }}>
                <span className="flex items-center gap-sm">
                  <span style={{ width:22,height:22,borderRadius:6,background:col.key==='done'?'var(--green)':'var(--navy-600)',color:'#fff',fontSize:11,fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center' }}>{ci+1}</span>
                  <b style={{ fontSize:12 }}>{col.label}</b>
                </span>
                <span className="muted" style={{ fontSize:11 }}>{col.jobs.length}</span>
              </div>
              <div style={{ background:'var(--bg)', borderRadius:10, padding:8, minHeight:140 }}>
                {col.jobs.map(j => (
                  <Link key={j.id} className="card" style={{ display:'block', padding:12, marginBottom:8, cursor:'pointer' }}
                    to={`/production/${j.job_number}`} title="Open factory workspace">
                    <div className="flex between items-center">
                      <span className="t-mono" style={{ fontSize:11.5 }}>{j.id}</span>
                      <Badge tone={j.legacy_active ? 'gold' : 'green'}>
                        {j.legacy_active ? 'Existing work' : 'Released'}
                      </Badge>
                    </div>
                    <div className="t-strong" style={{ fontSize:12.5, margin:'6px 0 2px' }}>{j.client}</div>
                    <div className="muted" style={{ fontSize:11.5, marginBottom:6 }}>{j.product}</div>
                    <div className="t-mono" style={{ fontSize:10.5, color:'var(--navy-500)', marginBottom:7 }}>
                      {j.factory_release?.release_number || 'Pre-release-chain production record'}
                    </div>
                    <Progress value={j.progress} />
                    <div className="flex between" style={{ marginTop:7, fontSize:11 }}>
                      <span className="muted">{j.qc === 'rework' && col.key === 'qa' ? '⟲ rework' : `Opened ${j.due}`}</span>
                      <span className="muted">{j.progress}%</span>
                    </div>
                    {j.block && col.key === 'pending' &&
                      <div className="muted" style={{ fontSize:10.5, marginTop:6, color:'var(--orange)' }}>⚠ {j.block}</div>}
                  </Link>
                ))}
                {!col.jobs.length && <div className="muted center" style={{ fontSize:11.5, padding:'20px 0' }}>—</div>}
              </div>
            </div>
          ))}
        </div>
      </div>
      {!active.length && <div className="quote-empty">
        No active projects are currently moving through production. Technically released projects will appear here automatically.
      </div>}

      <section className="completed-projects card">
        <div className="completed-projects-head">
          <div>
            <span>Production archive</span>
            <h2>Completed Projects <small>{completed.length}</small></h2>
            <p>Completed jobs leave the active factory pipeline but retain their approved release and production history.</p>
          </div>
          <label className="completed-search">
            <span>Search completed projects</span>
            <input type="search" value={completedSearch}
              placeholder="Job, client, product or release…"
              onChange={event => setCompletedSearch(event.target.value)} />
          </label>
        </div>

        <div className="tbl-wrap">
          <table className="tbl completed-projects-table">
            <thead>
              <tr>
                <th>Job</th>
                <th>Client</th>
                <th>Product</th>
                <th>Factory release</th>
                <th>Completed</th>
                <th>Project value</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visibleCompleted.map(job => (
                <tr key={job.job_number}>
                  <td className="t-mono">{job.job_number}</td>
                  <td className="t-strong">{job.client}</td>
                  <td className="t-muted">{job.product}</td>
                  <td className="t-mono">{job.factory_release?.release_number || '—'}</td>
                  <td>{dateShort(job.delivered_at || job.created_at)}</td>
                  <td className="t-mono">{GHS0(job.value)}</td>
                  <td><Badge tone="green">Completed</Badge></td>
                  <td className="right">
                    <Link className="btn btn-ghost btn-sm"
                      to={`/production/${job.job_number}`}>Open project</Link>
                  </td>
                </tr>
              ))}
              {!visibleCompleted.length && (
                <tr>
                  <td colSpan={8} className="completed-empty">
                    {completed.length
                      ? 'No completed projects match this search.'
                      : 'Completed projects will be archived here automatically.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {filteredCompleted.length > COMPLETED_PAGE_SIZE && (
          <div className="completed-pagination">
            <span>
              Showing {(completedPage - 1) * COMPLETED_PAGE_SIZE + 1}–
              {Math.min(completedPage * COMPLETED_PAGE_SIZE, filteredCompleted.length)}
              {' '}of {filteredCompleted.length}
            </span>
            <div>
              <button className="btn btn-ghost btn-sm"
                disabled={completedPage === 1}
                onClick={() => setCompletedPage(page => page - 1)}>Previous</button>
              <b>Page {completedPage} of {completedPages}</b>
              <button className="btn btn-ghost btn-sm"
                disabled={completedPage === completedPages}
                onClick={() => setCompletedPage(page => page + 1)}>Next</button>
            </div>
          </div>
        )}
      </section>
    </>
  )
}
