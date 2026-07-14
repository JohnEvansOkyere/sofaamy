import { PageHead, Card, Stat, Badge, Person } from '../components/ui.jsx'
import { LEADS, CLIENTS } from '../data/seed.js'
import { IconPlus, IconUsers, IconWallet, IconTrend, IconPhone, IconPin, IconWhatsApp } from '../components/icons.jsx'

const COLS = ['New','Qualified','Survey','Proposal','Negotiation']

export default function CRM() {
  return (
    <>
      <PageHead title="CRM & Leads" subtitle="Track every opportunity from first contact to won.">
        <button className="btn btn-primary"><IconPlus/> New Lead</button>
      </PageHead>

      <div className="grid g-4 mb">
        <Stat label="Open Opportunities" value="5" trend="₵1.16M pipeline" dir="flat" tone="blue" icon={<IconUsers/>} />
        <Stat label="Weighted Pipeline" value="₵742K" trend="+12%" dir="up" tone="green" icon={<IconWallet/>} />
        <Stat label="Win Rate (90d)" value="58%" trend="+3.2%" dir="up" tone="purple" icon={<IconTrend/>} />
        <Stat label="Total Clients" value="6" trend="2 new this month" dir="up" tone="orange" icon={<IconUsers/>} />
      </div>

      <div className="section-title">Sales Pipeline</div>
      <div className="grid mb" style={{ gridTemplateColumns:`repeat(${COLS.length},1fr)`, gap:14 }}>
        {COLS.map(col => {
          const items = LEADS.filter(l => l.stage === col)
          return (
            <div key={col} className="card" style={{ background:'var(--bg)' }}>
              <div className="flex between items-center" style={{ padding:'12px 14px' }}>
                <b style={{ fontSize:13 }}>{col}</b>
                <span className="count" style={{ background:'#dde5ec', color:'var(--ink-2)', fontSize:11, padding:'1px 8px', borderRadius:20 }}>{items.length}</span>
              </div>
              <div style={{ padding:'0 10px 10px' }}>
                {items.map(l => (
                  <div key={l.id} className="card card-pad" style={{ padding:13, marginBottom:9 }}>
                    <div className="t-strong" style={{ fontSize:13 }}>{l.name}</div>
                    <div className="muted" style={{ fontSize:11.5, margin:'2px 0 8px' }}>{l.contact}</div>
                    <div style={{ fontSize:15, fontWeight:800, color:'var(--navy-600)' }}>{l.value}</div>
                    <div className="flex between items-center" style={{ marginTop:9 }}>
                      <Badge tone={l.source==='WhatsApp'?'green':'gray'}>{l.source}</Badge>
                      <span className="muted" style={{ fontSize:11 }}>{l.age}</span>
                    </div>
                  </div>
                ))}
                {!items.length && <div className="muted center" style={{ fontSize:12, padding:'14px 0' }}>—</div>}
              </div>
            </div>
          )
        })}
      </div>

      <Card title="Clients" sub="All accounts" pad={false}
        action={<span className="badge b-gray">{CLIENTS.length} total</span>}>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Client</th><th>Contact</th><th>Location</th><th>Jobs</th><th>Lifetime Value</th><th></th></tr></thead>
            <tbody>
              {CLIENTS.map((c,i) => (
                <tr key={c.id}>
                  <td><Person name={c.name} sub={c.type==='company'?'Company':'Individual'} i={i} /></td>
                  <td className="t-muted"><span className="flex items-center gap-sm"><IconPhone style={{width:14,height:14}}/>{c.phone}</span></td>
                  <td className="t-muted"><span className="flex items-center gap-sm"><IconPin style={{width:14,height:14}}/>{c.location}</span></td>
                  <td><Badge tone="blue">{c.jobs} jobs</Badge></td>
                  <td className="t-mono">{c.value}</td>
                  <td className="right"><button className="btn btn-ghost btn-sm" style={{color:'#25D366'}}><IconWhatsApp style={{width:15,height:15}}/> Message</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  )
}
