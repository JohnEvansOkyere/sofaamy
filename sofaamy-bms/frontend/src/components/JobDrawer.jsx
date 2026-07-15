import { useEffect, useState } from 'react'
import { Badge } from './ui.jsx'
import WhatsAppModal from './WhatsAppModal.jsx'
import { IconWhatsApp, IconDownload, IconCheck, IconTruck } from './icons.jsx'
import { getJob, advanceJob, addPayment, addQc, assignDispatch,
         downloadDeliveryNote, downloadReport } from '../lib/api.js'
import { GHS0, timeAgo, stageMessage, deliveryMessage } from '../lib/whatsapp.js'
import '../styles/ops.css'

const QC_ITEMS = ['Dimensions within tolerance (±1 mm)', 'Glass free of chips / scratches',
                  'Edgework & polish clean', 'Hardware fitted & operating', 'Finish / colour matches spec']

// Slide-over with everything about one job: stage timeline with the
// commercial gates, payments, QA, dispatch, documents, activity.
export default function JobDrawer({ jobNumber, onClose, onChanged }) {
  const [job, setJob] = useState(null)
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)
  const [wa, setWa] = useState(null)          // { message, link?, attachment? }
  const [pay, setPay] = useState({ amount: '', kind: 'deposit', method: 'momo' })
  const [qcTicks, setQcTicks] = useState(QC_ITEMS.map(() => true))
  const [qcNote, setQcNote] = useState('')
  const [disp, setDisp] = useState({ driver: '', vehicle: '' })
  const [toast, setToast] = useState(null)

  const fire = (m) => { setToast(m); setTimeout(() => setToast(null), 3000) }
  const refresh = () => getJob(jobNumber)
    .then(j => {
      setJob(j)
      setDisp({ driver: j.driver || '', vehicle: j.vehicle || '' })
      const suggest = j.paid_amount <= 0 ? j.value / 2 : j.balance
      setPay(p => ({ ...p, amount: suggest > 0 ? String(Math.round(suggest * 100) / 100) : '',
                     kind: j.paid_amount <= 0 ? 'deposit' : 'balance' }))
    })
    .catch(e => setErr(String(e)))
  useEffect(() => { refresh() }, [jobNumber])

  const act = async (fn, okMsg) => {
    setBusy(true)
    try { await fn(); await refresh(); onChanged?.(); if (okMsg) fire(okMsg) }
    catch (e) { fire(`⚠️ ${String(e.message || e).replace(/^API \d+: /, '').replace(/^\{"detail":"|"\}$/g, '')}`) }
    setBusy(false)
  }

  if (err) return null
  if (!job) return (
    <div className="drawer-back" onClick={onClose}>
      <div className="drawer"><div className="muted" style={{ padding: 30 }}>Loading job…</div></div>
    </div>
  )

  const stages = job.stages || []
  const curIdx = stages.findIndex(s => s.key === job.stage)
  const cat = job.design?.category
  const docs = job.design
    ? (cat === 'frameless'
        ? [['glass-order', 'Glass Order (drawings)'], ['hardware-list', 'Hardware List'], ['work-order', 'Work Order']]
        : [['cutting-list', 'Cutting List'], ['work-order', 'Work Order'], ['boq', 'BOQ']])
    : []

  const waStage = () => setWa({
    message: stageMessage({ client: job.client, jobNumber: job.job_number,
      product: job.product, stageLabel: job.stage_label, progress: job.progress }),
  })
  const waDelivery = () => setWa({
    message: deliveryMessage({ client: job.client, jobNumber: job.job_number,
      product: job.product, dnNumber: job.dn_number, driver: job.driver,
      vehicle: job.vehicle, balance: job.balance }),
  })

  return (
    <div className="drawer-back" onClick={onClose}>
      <div className="drawer" onClick={e => e.stopPropagation()}>
        <div className="drawer-head">
          <div>
            <div className="t-mono" style={{ fontSize: 13, color: 'var(--ink-2)' }}>{job.job_number}</div>
            <h3>{job.product}</h3>
            <div className="muted" style={{ fontSize: 12.5 }}>{job.client}{job.client_phone ? ` · ${job.client_phone}` : ''}</div>
          </div>
          <button className="drawer-x" onClick={onClose}>×</button>
        </div>

        <div className="drawer-stats">
          <div><span>Contract</span><b>{GHS0(job.value)}</b></div>
          <div><span>Paid</span><b style={{ color: 'var(--green)' }}>{GHS0(job.paid_amount)}</b></div>
          <div><span>Balance</span><b style={{ color: job.balance > 0 ? 'var(--orange)' : 'var(--green)' }}>{GHS0(job.balance)}</b></div>
          <div><span>Status</span><Badge tone={job.paid === '100%' ? 'green' : 'orange'}>{job.paid} paid</Badge></div>
        </div>

        {/* ── stage timeline + gate ── */}
        <div className="drawer-sec">
          <h5>Production Stages</h5>
          <div className="stage-track">
            {stages.map((s, i) => (
              <div key={s.key} className={`stage-step ${i < curIdx ? 'done' : i === curIdx ? 'cur' : ''}`}>
                <span className="dot">{i < curIdx ? '✓' : ''}</span>
                <span className="lbl">{s.label}</span>
              </div>
            ))}
          </div>
          {job.next_stage ? (
            <>
              <button className="btn btn-primary btn-block" disabled={busy || !!job.block}
                onClick={() => act(() => advanceJob(job.job_number), `Moved to ${job.next_stage}`)}>
                <IconCheck style={{ width: 15, height: 15 }}/> Advance to {job.next_stage}
              </button>
              {job.block && <div className="gate-note">🔒 {job.block}</div>}
            </>
          ) : <div className="gate-note" style={{ background: 'var(--green-soft)', color: 'var(--green)' }}>✓ Job completed{job.delivered_at ? ` — delivered ${timeAgo(job.delivered_at)}` : ''}</div>}
          <button className="btn btn-ghost btn-block" style={{ color: '#1da851' }} onClick={waStage}>
            <IconWhatsApp style={{ width: 15, height: 15 }}/> WhatsApp progress update to client
          </button>
        </div>

        {/* ── payments ── */}
        <div className="drawer-sec">
          <h5>Payments</h5>
          {job.payments.length === 0 && <div className="muted" style={{ fontSize: 12.5, marginBottom: 8 }}>No payments recorded — 50% deposit required to start production.</div>}
          {job.payments.map((p, i) => (
            <div key={i} className="pay-row">
              <Badge tone={p.kind === 'deposit' ? 'blue' : 'green'}>{p.kind}</Badge>
              <span className="muted" style={{ fontSize: 12 }}>{p.method}{p.ref ? ` · ${p.ref}` : ''} · {timeAgo(p.at)}</span>
              <b>{GHS0(p.amount)}</b>
            </div>
          ))}
          {job.balance > 0 && (
            <div className="pay-form">
              <input type="number" placeholder="Amount (GHS)" value={pay.amount}
                onChange={e => setPay(p => ({ ...p, amount: e.target.value }))}/>
              <select value={pay.kind} onChange={e => setPay(p => ({ ...p, kind: e.target.value }))}>
                <option value="deposit">Deposit</option><option value="balance">Balance</option><option value="other">Other</option>
              </select>
              <select value={pay.method} onChange={e => setPay(p => ({ ...p, method: e.target.value }))}>
                <option value="momo">MoMo</option><option value="bank">Bank</option><option value="cash">Cash</option><option value="cheque">Cheque</option>
              </select>
              <button className="btn btn-gold" disabled={busy || !(+pay.amount > 0)}
                onClick={() => act(() => addPayment(job.job_number, { ...pay, amount: +pay.amount }),
                  `${GHS0(+pay.amount)} ${pay.kind} recorded`)}>Record</button>
            </div>
          )}
        </div>

        {/* ── QA (at the QA stage) ── */}
        {job.stage === 'qa' && (
          <div className="drawer-sec">
            <h5>Quality Inspection</h5>
            {QC_ITEMS.map((item, i) => (
              <label key={i} className="qc-item">
                <input type="checkbox" checked={qcTicks[i]}
                  onChange={e => setQcTicks(t => t.map((v, k) => k === i ? e.target.checked : v))}/>
                <span>{item}</span>
              </label>
            ))}
            <input className="qc-note" placeholder="Inspection notes (required for rework)"
              value={qcNote} onChange={e => setQcNote(e.target.value)}/>
            <div className="flex gap-sm" style={{ marginTop: 8 }}>
              <button className="btn btn-primary" style={{ flex: 1 }} disabled={busy}
                onClick={() => act(() => addQc(job.job_number, {
                  result: 'pass', score: Math.round(qcTicks.filter(Boolean).length / QC_ITEMS.length * 100),
                  notes: qcNote, checklist: QC_ITEMS.map((item, i) => ({ item, ok: qcTicks[i] })),
                }), 'QA pass recorded')}>✓ Pass</button>
              <button className="btn btn-ghost" style={{ flex: 1, color: 'var(--red)' }} disabled={busy || !qcNote}
                onClick={() => act(() => addQc(job.job_number, {
                  result: 'rework', score: Math.round(qcTicks.filter(Boolean).length / QC_ITEMS.length * 100),
                  notes: qcNote, checklist: QC_ITEMS.map((item, i) => ({ item, ok: qcTicks[i] })),
                }), 'Rework flagged')}>⟲ Rework</button>
            </div>
          </div>
        )}
        {job.qc_checks.length > 0 && (
          <div className="drawer-sec">
            <h5>QA History</h5>
            {job.qc_checks.map((q, i) => (
              <div key={i} className="pay-row">
                <Badge tone={q.result === 'pass' ? 'green' : 'orange'}>{q.result === 'pass' ? 'Pass' : 'Rework'}</Badge>
                <span className="muted" style={{ fontSize: 12 }}>{q.inspector} · {q.notes || '—'} · {timeAgo(q.at)}</span>
                <b>{q.score}%</b>
              </div>
            ))}
          </div>
        )}

        {/* ── dispatch (from dispatch stage onwards) ── */}
        {['dispatch', 'install', 'done'].includes(job.stage) && (
          <div className="drawer-sec">
            <h5><IconTruck style={{ width: 15, height: 15 }}/> Dispatch & Delivery</h5>
            <div className="pay-form" style={{ gridTemplateColumns: '1fr 1fr auto' }}>
              <input placeholder="Driver" value={disp.driver} onChange={e => setDisp(d => ({ ...d, driver: e.target.value }))}/>
              <input placeholder="Vehicle (e.g. GT-4821-22)" value={disp.vehicle} onChange={e => setDisp(d => ({ ...d, vehicle: e.target.value }))}/>
              <button className="btn btn-primary" disabled={busy || !disp.driver}
                onClick={() => act(() => assignDispatch(job.job_number, disp), 'Delivery assigned')}>
                {job.dn_number ? 'Update' : 'Assign'}
              </button>
            </div>
            {job.dn_number && <>
              <div className="muted" style={{ fontSize: 12.5, margin: '6px 0' }}>Delivery note <b className="t-mono">{job.dn_number}</b>{job.driver ? ` · ${job.driver} (${job.vehicle || '—'})` : ''}</div>
              <div className="flex gap-sm">
                <button className="btn btn-ghost" style={{ flex: 1 }}
                  onClick={() => downloadDeliveryNote(job.job_number).then(() => fire('📄 Delivery note downloaded')).catch(e => fire(`⚠️ ${e.message}`))}>
                  <IconDownload style={{ width: 14, height: 14 }}/> Delivery Note PDF
                </button>
                <button className="btn btn-ghost" style={{ flex: 1, color: '#1da851' }} onClick={waDelivery}>
                  <IconWhatsApp style={{ width: 14, height: 14 }}/> Notify client
                </button>
              </div>
            </>}
          </div>
        )}

        {/* ── production documents ── */}
        {docs.length > 0 && (
          <div className="drawer-sec">
            <h5>Documents</h5>
            <div className="flex gap-sm wrap">
              {docs.map(([kind, label]) => (
                <button key={kind} className="btn btn-ghost btn-sm"
                  onClick={() => downloadReport(kind, job.client, job.design)
                    .then(() => fire(`📄 ${label} downloaded`)).catch(e => fire(`⚠️ ${e.message}`))}>
                  <IconDownload style={{ width: 13, height: 13 }}/> {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── activity ── */}
        <div className="drawer-sec">
          <h5>Activity</h5>
          {job.events.length === 0 && <div className="muted" style={{ fontSize: 12.5 }}>No activity yet.</div>}
          {job.events.map((e, i) => (
            <div key={i} className="ev-row">
              <span className={`ev-dot ev-${e.kind}`}/>
              <div><b>{e.who}</b> <span className="t-muted">{e.note}</span>
                <div className="muted" style={{ fontSize: 11 }}>{timeAgo(e.at)}</div></div>
            </div>
          ))}
        </div>

        {toast && <div className="toast" style={{ position: 'sticky', bottom: 12 }}>{toast}</div>}
      </div>

      {wa && <WhatsAppModal to={{ phone: job.client_phone, name: job.client }}
        message={wa.message} link={wa.link} attachment={wa.attachment}
        onClose={() => setWa(null)}/>}
    </div>
  )
}
