import { PageHead, Card, Stat, Badge, Progress } from '../components/ui.jsx'
import { INVENTORY } from '../data/seed.js'
import { IconBox, IconPlus, IconTrend } from '../components/icons.jsx'

const statusLabel = { ok:'In Stock', low:'Low', critical:'Critical' }

export default function Inventory() {
  return (
    <>
      <PageHead title="Inventory & Stock" subtitle="Materials consumed automatically from each job's bill of materials.">
        <button className="btn btn-primary"><IconPlus/> Add Stock</button>
      </PageHead>

      <div className="grid g-4 mb">
        <Stat label="SKUs Tracked" value="7" trend="4 categories" dir="flat" tone="blue" icon={<IconBox/>} />
        <Stat label="Stock Value" value="₵184,500" trend="+₵12K restock" dir="up" tone="green" icon={<IconTrend/>} />
        <Stat label="Low Stock" value="2" trend="reorder soon" dir="flat" tone="orange" icon={<IconBox/>} />
        <Stat label="Critical" value="1" trend="Casement Hinge" dir="down" tone="purple" icon={<IconBox/>} />
      </div>

      <Card title="Stock Levels" pad={false}
        action={<div className="flex gap-sm"><span className="chip on">All</span><span className="chip">Profile</span><span className="chip">Glass</span><span className="chip">Hardware</span></div>}>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Code</th><th>Material</th><th>Category</th><th>Stock Level</th><th>Unit Price</th><th>Status</th></tr></thead>
            <tbody>
              {INVENTORY.map(it => {
                const pct = Math.min(100, (it.stock / (it.reorder*2)) * 100)
                const color = it.status==='ok'?'var(--green)':it.status==='low'?'var(--orange)':'var(--red)'
                return (
                  <tr key={it.code}>
                    <td className="t-mono">{it.code}</td>
                    <td className="t-strong">{it.name}</td>
                    <td><Badge tone="gray">{it.cat}</Badge></td>
                    <td style={{ minWidth:180 }}>
                      <div className="flex between" style={{ fontSize:12, marginBottom:4 }}>
                        <span>{it.stock} {it.unit}</span><span className="muted">reorder @ {it.reorder}</span>
                      </div>
                      <Progress value={pct} color={color} />
                    </td>
                    <td className="t-mono">{it.price}</td>
                    <td><Badge>{statusLabel[it.status]}</Badge></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  )
}
