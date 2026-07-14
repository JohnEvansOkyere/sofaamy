import { useEffect, useState } from 'react'
import { PageHead, Card, Stat, Badge, Progress } from '../components/ui.jsx'
import { JOBS, STAGES } from '../data/seed.js'
import { listJobs } from '../lib/api.js'
import { IconFactory, IconClock, IconCheck, IconTruck } from '../components/icons.jsx'

export default function Production() {
  // live jobs from the API, seed data as fallback if the backend is down
  const [jobs, setJobs] = useState(JOBS)
  const [live, setLive] = useState(false)
  useEffect(() => {
    listJobs().then(js => { if (js.length) { setJobs([...js].reverse()); setLive(true) } }).catch(() => {})
  }, [])
  const BOARD = STAGES.map(st => ({ ...st, jobs: jobs.filter(j => j.stage === st.key) }))

  return (
    <>
      <PageHead title="Production Pipeline" subtitle="Every job from cutting to installation — matched to Sofaamy's factory floor." >
        {live
          ? <span className="badge b-green"><span className="bdot"/>Live · from database</span>
          : <span className="badge b-orange"><span className="bdot"/>Demo data · backend offline</span>}
      </PageHead>

      <div className="grid g-4 mb">
        <Stat label="Jobs in Production" value="34" trend="6 due this week" dir="flat" tone="blue" icon={<IconFactory/>} />
        <Stat label="Avg. Cycle Time" value="6.4 days" trend="↓ 0.8d" dir="up" tone="green" icon={<IconClock/>} />
        <Stat label="Awaiting QA" value="4" trend="1 rework" dir="flat" tone="orange" icon={<IconCheck/>} />
        <Stat label="Ready to Dispatch" value="7" trend="2 today" dir="up" tone="purple" icon={<IconTruck/>} />
      </div>

      <div className="section-title">Factory Board</div>
      <div style={{ overflowX:'auto', paddingBottom:8 }}>
        <div style={{ display:'flex', gap:14, minWidth:1200 }}>
          {BOARD.map((col, ci) => (
            <div key={col.key} style={{ flex:'1 0 190px' }}>
              <div className="flex between items-center" style={{ padding:'0 4px 10px' }}>
                <span className="flex items-center gap-sm">
                  <span style={{ width:22,height:22,borderRadius:6,background:'var(--navy-600)',color:'#fff',fontSize:11,fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center' }}>{ci+1}</span>
                  <b style={{ fontSize:12.5 }}>{col.label}</b>
                </span>
                <span className="muted" style={{ fontSize:11 }}>{col.jobs.length}</span>
              </div>
              <div style={{ background:'var(--bg)', borderRadius:10, padding:8, minHeight:120 }}>
                {col.jobs.map(j => (
                  <div key={j.id} className="card" style={{ padding:12, marginBottom:8 }}>
                    <div className="flex between items-center">
                      <span className="t-mono" style={{ fontSize:12 }}>{j.id}</span>
                      <Badge tone={j.paid==='100%'?'green':'orange'}>{j.paid}</Badge>
                    </div>
                    <div className="t-strong" style={{ fontSize:12.5, margin:'6px 0 2px' }}>{j.client}</div>
                    <div className="muted" style={{ fontSize:11.5, marginBottom:9 }}>{j.product}</div>
                    <Progress value={j.progress} />
                    <div className="flex between" style={{ marginTop:7, fontSize:11 }}>
                      <span className="muted">Due {j.due}</span><span className="muted">{j.progress}%</span>
                    </div>
                  </div>
                ))}
                {!col.jobs.length && <div className="muted center" style={{ fontSize:11.5, padding:'20px 0' }}>Empty</div>}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid g-2 mt">
        <Card title="Production Optimization" sub="Cutting / nesting to reduce waste">
          <div className="flex between items-center mb">
            <span className="t-muted" style={{ fontSize:13 }}>Current profile utilization</span>
            <b style={{ fontSize:20, color:'var(--green)' }}>91.8%</b>
          </div>
          <Progress value={91.8} color="var(--green)" />
          <p className="t-muted mt" style={{ fontSize:12.5 }}>The optimizer nests cut lengths across the batch to minimise offcut waste — tuned to Sofaamy's standard 6m profile stock. Estimated saving this month: <b style={{color:'var(--ink)'}}>₵14,200</b>.</p>
        </Card>
        <Card title="Batch Scheduling" sub="Grouped work orders">
          {[['Batch A · Sliding Windows','12 units','In progress',68],
            ['Batch B · Curtain Wall','1 unit','Queued',10],
            ['Batch C · Doors','8 units','In progress',44]].map(([n,u,s,p],i)=>(
            <div key={i} style={{ marginBottom:14 }}>
              <div className="flex between" style={{ fontSize:13, marginBottom:5 }}>
                <b>{n}</b><span className="muted">{u} · {s}</span>
              </div>
              <Progress value={p} />
            </div>
          ))}
        </Card>
      </div>
    </>
  )
}
