import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PageHead, Card, Stat, Badge } from '../components/ui.jsx'
import { addPayment, getJob, listAccounts } from '../lib/api.js'
import { GHS0, timeAgo } from '../lib/whatsapp.js'
import { IconCheck, IconFile, IconWallet } from '../components/icons.jsx'
import '../styles/accounts.css'

const FILTERS = [
  ['due', 'Payment due'],
  ['cleared', 'Deposit cleared'],
  ['paid', 'Fully paid'],
  ['all', 'All accounts'],
]

function messageFrom(error) {
  const raw = String(error?.message || error || 'Something went wrong')
  try {
    const json = JSON.parse(raw.replace(/^API \d+:\s*/, ''))
    return json.detail || raw
  } catch {
    return raw.replace(/^API \d+:\s*/, '')
  }
}

function requiredNow(job) {
  if (!job) return 0
  const required = Number(job.value || 0) * Number(job.deposit_percent || 0) / 100
  return Math.max(required - Number(job.paid_amount || 0), 0)
}

function paymentState(job) {
  if (Number(job.balance || 0) <= 0.01) return 'paid'
  return requiredNow(job) <= 0.01 ? 'cleared' : 'due'
}

export default function Accounts() {
  const [searchParams] = useSearchParams()
  const [jobs, setJobs] = useState([])
  const [selected, setSelected] = useState(searchParams.get('job') || '')
  const [job, setJob] = useState(null)
  const [filter, setFilter] = useState('due')
  const [busy, setBusy] = useState(false)
  const [live, setLive] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState(null)
  const [payment, setPayment] = useState({
    amount: '', kind: 'deposit', method: 'momo', ref: '',
  })

  const fire = message => {
    setToast(message)
    setTimeout(() => setToast(null), 3500)
  }

  const refreshJobs = async (preferred = selected) => {
    const rows = await listAccounts()
    setJobs(rows)
    setLive(true)
    const next = rows.find(row => row.job_number === preferred)
      || rows.find(row => paymentState(row) === 'due')
      || rows[0]
    if (next && next.job_number !== selected) setSelected(next.job_number)
    if (!next) {
      setSelected('')
      setJob(null)
    }
    return next
  }

  useEffect(() => {
    refreshJobs(searchParams.get('job') || '')
      .catch(error => setError(messageFrom(error)))
  }, [])

  useEffect(() => {
    if (!selected) return
    setBusy(true)
    setError('')
    getJob(selected)
      .then(data => {
        setJob(data)
        const dueNow = requiredNow(data)
        const suggestion = dueNow > 0 ? dueNow : data.balance
        setPayment({
          amount: suggestion > 0 ? String(Math.round(suggestion * 100) / 100) : '',
          kind: data.paid_amount > 0 ? 'balance' : 'deposit',
          method: 'momo',
          ref: '',
        })
      })
      .catch(error => setError(messageFrom(error)))
      .finally(() => setBusy(false))
  }, [selected])

  const totals = useMemo(() => ({
    contract: jobs.reduce((sum, row) => sum + Number(row.value || 0), 0),
    received: jobs.reduce((sum, row) => sum + Number(row.paid_amount || 0), 0),
    required: jobs.reduce((sum, row) => sum + requiredNow(row), 0),
    balance: jobs.reduce((sum, row) => sum + Number(row.balance || 0), 0),
  }), [jobs])

  const rows = useMemo(() => jobs.filter(row =>
    filter === 'all' || paymentState(row) === filter), [jobs, filter])

  const recordPayment = async () => {
    const amount = Number(payment.amount)
    if (!job || !(amount > 0)) return
    setBusy(true)
    setError('')
    try {
      await addPayment(job.job_number, {
        ...payment,
        amount,
        who: 'Accounts Team',
      })
      await refreshJobs(job.job_number)
      const updated = await getJob(job.job_number)
      setJob(updated)
      const dueNow = requiredNow(updated)
      const suggestion = dueNow > 0 ? dueNow : updated.balance
      setPayment(current => ({
        ...current,
        amount: suggestion > 0 ? String(Math.round(suggestion * 100) / 100) : '',
        kind: updated.paid_amount > 0 ? 'balance' : 'deposit',
        ref: '',
      }))
      fire(`${GHS0(amount)} payment recorded for ${job.job_number}`)
    } catch (error) {
      setError(messageFrom(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageHead title="Accounts" subtitle="Record customer payments, clear drawing deposits and monitor outstanding balances.">
        {live
          ? <Badge tone="green">Live · from database</Badge>
          : <Badge tone="orange">Backend offline</Badge>}
      </PageHead>

      {error && <div className="accounts-alert">⚠ {error}</div>}

      <div className="grid g-4 mb">
        <Stat label="Contract value" value={GHS0(totals.contract)} trend={`${jobs.length} customer accounts`} dir="flat" tone="blue" icon={<IconFile />} />
        <Stat label="Payments received" value={GHS0(totals.received)} trend="Deposits and balances" dir="up" tone="green" icon={<IconCheck />} />
        <Stat label="Required now" value={GHS0(totals.required)} trend="To clear drawing gates" dir="flat" tone="orange" icon={<IconWallet />} />
        <Stat label="Total receivables" value={GHS0(totals.balance)} trend="Remaining contract balances" dir="flat" tone="purple" icon={<IconWallet />} />
      </div>

      <div className="accounts-layout">
        <Card title="Customer accounts" sub="Select an account to record or review its payments." pad={false}
          action={<div className="accounts-filters">
            {FILTERS.map(([key, label]) => (
              <button type="button" className={filter === key ? 'active' : ''}
                onClick={() => setFilter(key)} key={key}>{label}</button>
            ))}
          </div>}>
          <div className="tbl-wrap">
            <table className="tbl accounts-table">
              <thead>
                <tr><th>Job / client</th><th>Contract</th><th>Paid</th><th>Required now</th><th>Balance</th><th>Status</th></tr>
              </thead>
              <tbody>
                {rows.map(row => {
                  const state = paymentState(row)
                  return (
                    <tr className={selected === row.job_number ? 'selected' : ''}
                      onClick={() => setSelected(row.job_number)} key={row.job_number}>
                      <td><b>{row.project_number || row.job_number}</b>
                        <small>{row.client} · {row.product}{row.job_count > 1 ? ` · ${row.job_count} items` : ''}</small></td>
                      <td className="t-mono">{GHS0(row.value)}</td>
                      <td className="t-mono">{GHS0(row.paid_amount)}</td>
                      <td className="t-mono">{GHS0(requiredNow(row))}</td>
                      <td className="t-mono">{GHS0(row.balance)}</td>
                      <td><Badge tone={state === 'paid' ? 'green' : state === 'cleared' ? 'blue' : 'orange'}>
                        {state === 'paid' ? 'Fully paid' : state === 'cleared' ? 'Deposit cleared' : 'Payment due'}
                      </Badge></td>
                    </tr>
                  )
                })}
                {!rows.length && <tr><td colSpan={6} className="muted center accounts-empty">No customer accounts in this view.</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Payment desk" sub={job ? `${job.project_number || job.job_number} · ${job.client}${job.job_count > 1 ? ` · ${job.job_count} items` : ''}` : 'Select a customer account'}>
          {!job && <div className="accounts-empty">Select a job to manage its payments.</div>}
          {job && <>
            <div className="accounts-summary">
              <div><span>Contract</span><b>{GHS0(job.value)}</b></div>
              <div><span>Paid</span><b>{GHS0(job.paid_amount)}</b></div>
              <div><span>Required now</span><b>{GHS0(requiredNow(job))}</b></div>
              <div><span>Balance</span><b>{GHS0(job.balance)}</b></div>
            </div>

            {job.balance > 0.01 ? <div className="accounts-form">
              <label><span>Amount received</span><input type="number" min="0.01"
                max={job.balance} step="0.01" value={payment.amount}
                onFocus={event => event.target.select()}
                onChange={event => setPayment(current => ({ ...current, amount: event.target.value }))} /></label>
              <label><span>Payment type</span><select value={payment.kind}
                onChange={event => setPayment(current => ({ ...current, kind: event.target.value }))}>
                <option value="deposit">Deposit</option>
                <option value="balance">Balance</option>
                <option value="other">Other</option>
              </select></label>
              <label><span>Payment method</span><select value={payment.method}
                onChange={event => setPayment(current => ({ ...current, method: event.target.value }))}>
                <option value="momo">Mobile Money</option>
                <option value="bank">Bank transfer</option>
                <option value="cash">Cash</option>
                <option value="cheque">Cheque</option>
              </select></label>
              <label><span>Reference</span><input placeholder="Transaction or receipt reference"
                value={payment.ref}
                onChange={event => setPayment(current => ({ ...current, ref: event.target.value }))} /></label>
              <button className="btn btn-gold btn-block" disabled={busy
                || !(Number(payment.amount) > 0)
                || Number(payment.amount) > Number(job.balance)}
                onClick={recordPayment}>
                <IconCheck /> Record payment
              </button>
            </div> : <div className="accounts-paid"><IconCheck /> This account is fully paid.</div>}

            <div className="accounts-history">
              <h4>Payment history</h4>
              {job.payments.map((row, index) => (
                <div key={`${row.at}-${index}`}>
                  <Badge tone={row.kind === 'deposit' ? 'blue' : 'green'}>{row.kind}</Badge>
                  <p><b>{row.method}{row.ref ? ` · ${row.ref}` : ''}</b>
                    <small>{timeAgo(row.at)}{job.job_count > 1 ? ` · ${row.product} (${row.job_number})` : ''}</small></p>
                  <strong>{GHS0(row.amount)}</strong>
                </div>
              ))}
              {!job.payments.length && <div className="accounts-empty">No payments have been recorded.</div>}
            </div>
          </>}
        </Card>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </>
  )
}
