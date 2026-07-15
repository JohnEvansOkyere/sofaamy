import { useEffect, useMemo, useState } from 'react'
import { PageHead, Card, Stat, Badge, Progress } from '../components/ui.jsx'
import { listMaterials, listStockMoves, receiveStock } from '../lib/api.js'
import { GHS0, timeAgo } from '../lib/whatsapp.js'
import { IconBox, IconPlus, IconTrend, IconFactory } from '../components/icons.jsx'
import '../styles/ops.css'

const CATS = ['All', 'Profile', 'Glass', 'Hardware', 'Accessory']
const statusOf = (m) => m.stock <= m.reorder_level / 2 ? 'critical' : m.stock <= m.reorder_level ? 'low' : 'ok'
const statusLabel = { ok: 'In Stock', low: 'Low', critical: 'Critical' }

export default function Inventory() {
  const [mats, setMats] = useState([])
  const [moves, setMoves] = useState([])
  const [live, setLive] = useState(false)
  const [cat, setCat] = useState('All')
  const [recv, setRecv] = useState(null)      // material being received
  const [qty, setQty] = useState('')
  const [toast, setToast] = useState(null)
  const fire = (m) => { setToast(m); setTimeout(() => setToast(null), 3000) }

  const refresh = () => Promise.all([listMaterials(), listStockMoves()])
    .then(([ms, mv]) => { setMats(ms); setMoves(mv); setLive(true) }).catch(() => {})
  useEffect(() => { refresh() }, [])

  const rows = useMemo(() => cat === 'All' ? mats : mats.filter(m => m.category === cat), [mats, cat])
  const low = mats.filter(m => statusOf(m) === 'low')
  const critical = mats.filter(m => statusOf(m) === 'critical')
  const stockValue = mats.reduce((s, m) => s + m.stock * m.unit_price, 0)

  const doReceive = async () => {
    try {
      const r = await receiveStock(recv.id, +qty, 'Goods received')
      fire(`✓ ${qty} ${recv.unit} ${recv.code} received — now ${r.stock} ${recv.unit}`)
      setRecv(null); setQty(''); refresh()
    } catch (e) { fire(`⚠️ ${e.message}`) }
  }

  return (
    <>
      <PageHead title="Inventory & Stock" subtitle="Issued automatically when a job enters Cutting; received here.">
        {live
          ? <span className="badge b-green"><span className="bdot"/>Live · from database</span>
          : <span className="badge b-orange"><span className="bdot"/>Backend offline</span>}
      </PageHead>

      <div className="grid g-4 mb">
        <Stat label="SKUs Tracked" value={String(mats.length)} trend={`${new Set(mats.map(m => m.category)).size} categories`} dir="flat" tone="blue" icon={<IconBox/>} />
        <Stat label="Stock Value" value={GHS0(stockValue)} trend="at unit cost" dir="up" tone="green" icon={<IconTrend/>} />
        <Stat label="Low Stock" value={String(low.length)} trend={low[0]?.name || 'all healthy'} dir="flat" tone="orange" icon={<IconBox/>} />
        <Stat label="Critical" value={String(critical.length)} trend={critical[0]?.name || '—'} dir={critical.length ? 'down' : 'flat'} tone="purple" icon={<IconFactory/>} />
      </div>

      <div className="grid mb" style={{ gridTemplateColumns: '1.7fr 1fr' }}>
        <Card title="Stock Levels" pad={false}
          action={<div className="flex gap-sm">{CATS.map(c =>
            <span key={c} className={`chip ${cat===c?'on':''}`} style={{ cursor:'pointer' }} onClick={() => setCat(c)}>{c}</span>)}</div>}>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Code</th><th>Material</th><th>Stock Level</th><th>Unit Price</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {rows.map(m => {
                  const st = statusOf(m)
                  const pct = Math.min(100, (m.stock / (m.reorder_level * 2 || 1)) * 100)
                  const color = st === 'ok' ? 'var(--green)' : st === 'low' ? 'var(--orange)' : 'var(--red)'
                  return (
                    <tr key={m.code}>
                      <td className="t-mono" style={{ fontSize:12 }}>{m.code}</td>
                      <td className="t-strong" style={{ fontSize:12.5 }}>{m.name}<div className="muted" style={{fontSize:11}}>{m.category}</div></td>
                      <td style={{ minWidth:150 }}>
                        <div className="flex between" style={{ fontSize:12, marginBottom:4 }}>
                          <span>{m.stock} {m.unit}</span><span className="muted">reorder @ {m.reorder_level}</span>
                        </div>
                        <Progress value={pct} color={color} />
                      </td>
                      <td className="t-mono">₵{m.unit_price}/{m.unit}</td>
                      <td><Badge>{statusLabel[st]}</Badge></td>
                      <td className="right">
                        <button className="btn btn-ghost btn-sm" onClick={() => { setRecv(m); setQty('') }}>
                          <IconPlus style={{ width:13, height:13 }}/> Receive
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Stock Movements" sub="Receipts and issues to jobs — live">
          {moves.map((mv, i) => (
            <div key={i} className="flex gap" style={{ padding:'8px 0', borderBottom:'1px solid var(--line-soft)', fontSize:12.5 }}>
              <b style={{ color: mv.delta > 0 ? 'var(--green)' : 'var(--orange)', minWidth:64, textAlign:'right' }}>
                {mv.delta > 0 ? '+' : ''}{mv.delta} {mv.unit}
              </b>
              <div>
                <b className="t-mono" style={{ fontSize:11.5 }}>{mv.code}</b> <span className="t-muted">{mv.reason}</span>
                <div className="muted" style={{ fontSize:11 }}>{mv.job ? `${mv.job} · ` : ''}{timeAgo(mv.at)}</div>
              </div>
            </div>
          ))}
          {!moves.length && <div className="muted">No movements yet — they appear when jobs enter Cutting.</div>}
        </Card>
      </div>

      {recv && (
        <div className="modal-back" onClick={() => setRecv(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h4>Receive Stock — {recv.name}</h4>
            <div className="muted" style={{ fontSize:12.5, marginBottom:12 }}>
              <span className="t-mono">{recv.code}</span> · current {recv.stock} {recv.unit} · reorder @ {recv.reorder_level}
            </div>
            <label className="modal-full">Quantity received ({recv.unit})
              <input autoFocus type="number" min="0" value={qty} onChange={e => setQty(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && +qty > 0 && doReceive()}/>
            </label>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setRecv(null)}>Cancel</button>
              <button className="btn btn-primary" disabled={!(+qty > 0)} onClick={doReceive}>Add to Stock</button>
            </div>
          </div>
        </div>
      )}
      {toast && <div className="toast">{toast}</div>}
    </>
  )
}
