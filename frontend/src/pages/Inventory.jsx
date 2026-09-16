import { useEffect, useMemo, useState } from 'react'
import { PageHead, Card, Stat, Badge, Progress } from '../components/ui.jsx'
import { listMaterials, listStockMoves, receiveStock, updateMaterial, createMaterial } from '../lib/api.js'
import { setMaterialPrices } from '../lib/frameMaterials.js'
import { useLiveRefresh } from '../lib/live.js'
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
  const [edit, setEdit] = useState(null)      // material being corrected
  const [adding, setAdding] = useState(null)  // new material being added
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState(null)
  const fire = (m) => { setToast(m); setTimeout(() => setToast(null), 3000) }

  // the take-off prices off these rows, so every refresh re-primes it
  const refresh = () => Promise.all([listMaterials(), listStockMoves()])
    .then(([ms, mv]) => { setMats(ms); setMoves(mv); setLive(true); setMaterialPrices(ms) })
    .catch(() => {})

  const saveEdit = async () => {
    setBusy(true)
    try {
      await updateMaterial(edit.id, {
        name:edit.name, category:edit.category, unit:edit.unit,
        unit_price:Number(edit.unit_price), reorder_level:Number(edit.reorder_level),
      })
      fire(`✓ ${edit.code} updated — quotes, BOM and cutting lists now use ₵${edit.unit_price}/${edit.unit}`)
      setEdit(null); await refresh()
    } catch (e) { fire(`⚠️ ${e.message}`) } finally { setBusy(false) }
  }

  const saveNew = async () => {
    setBusy(true)
    try {
      const created = await createMaterial({ ...adding,
        unit_price:Number(adding.unit_price) || 0, stock:Number(adding.stock) || 0,
        reorder_level:Number(adding.reorder_level) || 0 })
      fire(`✓ ${created.code} added to the catalogue`)
      setAdding(null); await refresh()
    } catch (e) { fire(`⚠️ ${e.message}`) } finally { setBusy(false) }
  }
  useEffect(() => { refresh() }, [])
  useLiveRefresh(refresh)

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
      <PageHead title="Inventory & Stock" subtitle="Issued automatically from the approved extraction when a job enters Cutting; catalogue opening balances and prices are provisional until the physical count and supplier rate update.">
        <div className="flex gap-sm items-center">
          {live
            ? <span className="badge b-green"><span className="bdot"/>Live · from database</span>
            : <span className="badge b-orange"><span className="bdot"/>Backend offline</span>}
          <button className="btn btn-primary btn-sm" onClick={() => setAdding({
            code:'', name:'', category:'Accessory', unit:'pcs', unit_price:'', stock:'', reorder_level:'' })}>
            <IconPlus style={{ width:13, height:13 }}/> Add material
          </button>
        </div>
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
                        <button className="btn btn-ghost btn-sm" onClick={() => setEdit({ ...m })}>Edit</button>
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
                <div className="muted" style={{ fontSize:11 }}>
                  {mv.job ? `${mv.job} · ` : ''}
                  {mv.extraction_revision ? `Extraction E${mv.extraction_revision} · ` : ''}
                  {timeAgo(mv.at)}
                </div>
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
      {edit && (
        <div className="modal-back" onClick={() => setEdit(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h4>Correct material — <span className="t-mono">{edit.code}</span></h4>
            <div className="muted" style={{ fontSize:12.5, marginBottom:12 }}>
              The quote, BOM, cutting list and factory pack all price from this row.
            </div>
            <label className="modal-full">Description
              <input autoFocus value={edit.name} onChange={e => setEdit({ ...edit, name:e.target.value })}/>
            </label>
            <div className="grid g-2">
              <label>Unit price (GHS)
                <input type="number" min="0" step="0.01" value={edit.unit_price}
                  onChange={e => setEdit({ ...edit, unit_price:e.target.value })}/>
              </label>
              <label>Unit of measure
                <select value={edit.unit} onChange={e => setEdit({ ...edit, unit:e.target.value })}>
                  {['bar', 'm', 'm²', 'pcs', 'set', 'tube', 'roll', 'sheet', 'kg', 'litre']
                    .map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </label>
            </div>
            <div className="grid g-2">
              <label>Category
                <select value={edit.category} onChange={e => setEdit({ ...edit, category:e.target.value })}>
                  {['Profile', 'Glass', 'Hardware', 'Accessory'].map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <label>Reorder level ({edit.unit})
                <input type="number" min="0" step="0.01" value={edit.reorder_level}
                  onChange={e => setEdit({ ...edit, reorder_level:e.target.value })}/>
              </label>
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setEdit(null)}>Cancel</button>
              <button className="btn btn-primary" disabled={busy} onClick={saveEdit}>
                {busy ? 'Saving…' : 'Save correction'}</button>
            </div>
          </div>
        </div>
      )}

      {adding && (
        <div className="modal-back" onClick={() => setAdding(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h4>Add a material</h4>
            <div className="muted" style={{ fontSize:12.5, marginBottom:12 }}>
              For a part the supplied workbooks never listed — a joint member, an
              ECO-line profile, or an accessory the factory actually uses.
            </div>
            <div className="grid g-2">
              <label>Code <span className="req">*</span>
                <input autoFocus placeholder="e.g. 40X40" value={adding.code}
                  onChange={e => setAdding({ ...adding, code:e.target.value })}/>
              </label>
              <label>Category
                <select value={adding.category} onChange={e => setAdding({ ...adding, category:e.target.value })}>
                  {['Profile', 'Glass', 'Hardware', 'Accessory'].map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
            </div>
            <label className="modal-full">Description
              <input placeholder="e.g. 40 × 40 corner joint member" value={adding.name}
                onChange={e => setAdding({ ...adding, name:e.target.value })}/>
            </label>
            <div className="grid g-2">
              <label>Unit price (GHS)
                <input type="number" min="0" step="0.01" value={adding.unit_price}
                  onChange={e => setAdding({ ...adding, unit_price:e.target.value })}/>
              </label>
              <label>Unit of measure
                <select value={adding.unit} onChange={e => setAdding({ ...adding, unit:e.target.value })}>
                  {['bar', 'm', 'm²', 'pcs', 'set', 'tube', 'roll', 'sheet', 'kg', 'litre']
                    .map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </label>
            </div>
            <div className="grid g-2">
              <label>Opening stock
                <input type="number" min="0" step="0.01" value={adding.stock}
                  onChange={e => setAdding({ ...adding, stock:e.target.value })}/>
              </label>
              <label>Reorder level
                <input type="number" min="0" step="0.01" value={adding.reorder_level}
                  onChange={e => setAdding({ ...adding, reorder_level:e.target.value })}/>
              </label>
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setAdding(null)}>Cancel</button>
              <button className="btn btn-primary" disabled={busy || !adding.code.trim()} onClick={saveNew}>
                {busy ? 'Adding…' : 'Add material'}</button>
            </div>
          </div>
        </div>
      )}
      {toast && <div className="toast">{toast}</div>}
    </>
  )
}
