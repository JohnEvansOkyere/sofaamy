import { PageHead, Card, Badge, Person } from '../components/ui.jsx'
import { TEAM, COMPANY } from '../data/seed.js'
import { RATES, GLASS } from '../lib/products.js'
import { IconPlus } from '../components/icons.jsx'

export default function Settings() {
  return (
    <>
      <PageHead title="Settings" subtitle="Company profile, team, roles and pricing rules." />

      <div className="grid mb" style={{ gridTemplateColumns:'1fr 1.4fr' }}>
        <Card title="Company Profile">
          {[['Name',COMPANY.name],['Industry',COMPANY.tagline],['Location',COMPANY.location],
            ['Currency','Ghana Cedi (₵ GHS)'],['WhatsApp','+233 30 000 0000 (business)'],['Job format','SOF-YYYY-NNN']].map(([k,v])=>(
            <div key={k} className="flex between" style={{ padding:'9px 0', borderBottom:'1px solid var(--line-soft)', fontSize:13 }}>
              <span className="muted">{k}</span><b>{v}</b>
            </div>
          ))}
        </Card>

        <Card title="Pricing Rules" sub="Feeds the configurator's quote engine">
          <div className="grid g-2" style={{ gap:12 }}>
            {[['Profile rate',`₵${RATES.profilePerMetre} / m`],['Labour rate',`₵${RATES.labourPerM2} / m²`],
              ['Install rate',`₵${RATES.installPerM2} / m²`],['Default margin',`${RATES.marginPercent}%`]].map(([k,v])=>(
              <div key={k} style={{ padding:12, background:'var(--bg)', borderRadius:10 }}>
                <div className="muted" style={{ fontSize:12 }}>{k}</div>
                <div style={{ fontSize:17, fontWeight:800 }}>{v}</div>
              </div>
            ))}
          </div>
          <div className="section-title" style={{ margin:'18px 0 10px' }}>Glass price list (₵/m²)</div>
          <div className="flex gap-sm wrap">
            {Object.values(GLASS).map(g => <span key={g.label} className="chip">{g.label} · ₵{g.price}</span>)}
          </div>
          <p className="muted mt" style={{ fontSize:12 }}>Placeholder rates — replaced by Sofaamy's confirmed material list (see docs/CHECKLIST.md).</p>
        </Card>
      </div>

      <Card title="Team & Roles" sub="Role-based access control" pad={false}
        action={<button className="btn btn-primary btn-sm"><IconPlus/> Add User</button>}>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>User</th><th>Role</th><th>Phone</th><th>Access</th></tr></thead>
            <tbody>
              {TEAM.map((t,i) => (
                <tr key={t.name}>
                  <td><Person name={t.name} i={i} /></td>
                  <td><Badge tone="blue">{t.role}</Badge></td>
                  <td className="t-muted t-mono">{t.phone}</td>
                  <td><Badge tone="green">Active</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  )
}
