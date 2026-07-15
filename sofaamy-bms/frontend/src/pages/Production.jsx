import { useEffect, useState } from 'react'
import { PageHead, Stat, Badge, Progress } from '../components/ui.jsx'
import JobDrawer from '../components/JobDrawer.jsx'
import { listJobs } from '../lib/api.js'
import { GHS0 } from '../lib/whatsapp.js'
import { IconFactory, IconWallet, IconCheck, IconTruck } from '../components/icons.jsx'

const BOARD_STAGES = [
  { key: 'pending',    label: 'Awaiting Deposit' },
  { key: 'cutting',    label: 'Cutting' },
  { key: 'processing', label: 'Processing' },
  { key: 'holes',      label: 'Holes / Routing' },
  { key: 'assembly',   label: 'Assembly' },
  { key: 'glazing',    label: 'Glazing' },
  { key: 'qa',         label: 'Quality Check' },
  { key: 'dispatch',   label: 'Dispatch' },
  { key: 'install',    label: 'Installation' },
  { key: 'done',       label: 'Completed' },
]

export default function Production() {
  const [jobs, setJobs] = useState([])
  const [live, setLive] = useState(false)
  const [open, setOpen] = useState(null)   // job_number in the drawer

  const refresh = () => listJobs().then(js => { setJobs(js); setLive(true) }).catch(() => {})
  useEffect(() => { refresh() }, [])

  const active = jobs.filter(j => j.stage !== 'done')
  const inFactory = active.filter(j => !['pending', 'dispatch', 'install'].includes(j.stage))
  const outstanding = active.reduce((s, j) => s + j.balance, 0)
  const BOARD = BOARD_STAGES.map(st => ({ ...st, jobs: jobs.filter(j => j.stage === st.key) }))

  return (
    <>
      <PageHead title="Production Pipeline" subtitle="Every job from deposit to installation — click a card to run it.">
        {live
          ? <span className="badge b-green"><span className="bdot"/>Live · from database</span>
          : <span className="badge b-orange"><span className="bdot"/>Backend offline — start the API</span>}
      </PageHead>

      <div className="grid g-4 mb">
        <Stat label="Jobs in Factory" value={String(inFactory.length)} trend={`${active.length} active total`} dir="flat" tone="blue" icon={<IconFactory/>} />
        <Stat label="Awaiting Deposit" value={String(jobs.filter(j => j.stage === 'pending').length)} trend="50% gate" dir="flat" tone="orange" icon={<IconWallet/>} />
        <Stat label="Awaiting QA" value={String(jobs.filter(j => j.stage === 'qa').length)} trend={jobs.some(j => j.stage === 'qa' && j.qc === 'rework') ? 'rework flagged' : 'on track'} dir="flat" tone="purple" icon={<IconCheck/>} />
        <Stat label="Outstanding Balance" value={GHS0(outstanding)} trend={`${jobs.filter(j => ['dispatch','install'].includes(j.stage)).length} in delivery`} dir="flat" tone="green" icon={<IconTruck/>} />
      </div>

      <div className="section-title">Factory Board</div>
      <div style={{ overflowX:'auto', paddingBottom:8 }}>
        <div style={{ display:'flex', gap:12, minWidth:1500 }}>
          {BOARD.map((col, ci) => (
            <div key={col.key} style={{ flex:'1 0 165px' }}>
              <div className="flex between items-center" style={{ padding:'0 4px 10px' }}>
                <span className="flex items-center gap-sm">
                  <span style={{ width:22,height:22,borderRadius:6,background:col.key==='pending'?'var(--orange)':col.key==='done'?'var(--green)':'var(--navy-600)',color:'#fff',fontSize:11,fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center' }}>{ci+1}</span>
                  <b style={{ fontSize:12 }}>{col.label}</b>
                </span>
                <span className="muted" style={{ fontSize:11 }}>{col.jobs.length}</span>
              </div>
              <div style={{ background:'var(--bg)', borderRadius:10, padding:8, minHeight:140 }}>
                {col.jobs.map(j => (
                  <div key={j.id} className="card" style={{ padding:12, marginBottom:8, cursor:'pointer' }}
                    onClick={() => setOpen(j.job_number)} title="Open job">
                    <div className="flex between items-center">
                      <span className="t-mono" style={{ fontSize:11.5 }}>{j.id}</span>
                      <Badge tone={j.paid==='100%'?'green':j.paid==='0%'?'red':'orange'}>{j.paid}</Badge>
                    </div>
                    <div className="t-strong" style={{ fontSize:12.5, margin:'6px 0 2px' }}>{j.client}</div>
                    <div className="muted" style={{ fontSize:11.5, marginBottom:6 }}>{j.product}</div>
                    <div style={{ fontSize:12.5, fontWeight:800, color:'var(--navy-600)', marginBottom:7 }}>{GHS0(j.value)}</div>
                    <Progress value={j.progress} />
                    <div className="flex between" style={{ marginTop:7, fontSize:11 }}>
                      <span className="muted">{j.qc === 'rework' && col.key === 'qa' ? '⟲ rework' : `Opened ${j.due}`}</span>
                      <span className="muted">{j.progress}%</span>
                    </div>
                    {j.block && col.key === 'pending' &&
                      <div className="muted" style={{ fontSize:10.5, marginTop:6, color:'var(--orange)' }}>🔒 deposit gate</div>}
                  </div>
                ))}
                {!col.jobs.length && <div className="muted center" style={{ fontSize:11.5, padding:'20px 0' }}>—</div>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {open && <JobDrawer jobNumber={open} onClose={() => setOpen(null)} onChanged={refresh}/>}
    </>
  )
}
