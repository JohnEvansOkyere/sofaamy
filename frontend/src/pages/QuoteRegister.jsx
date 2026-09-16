import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Badge } from '../components/ui.jsx'
import { IconPlus } from '../components/icons.jsx'
import {
  createQuoteWorkspace, listLeads, listQuoteWorkspaces,
} from '../lib/api.js'
import { useLiveRefresh } from '../lib/live.js'
import { GHS0 } from '../lib/whatsapp.js'
import '../styles/quote-register.css'

const SCOPES = [
  ['active', 'Active'], ['won', 'Won'], ['lost', 'Lost'], ['all', 'All'],
]

const EMPTY = { lead_id:'' }

function messageFrom(error) {
  const raw = String(error?.message || error || 'Unable to continue')
    .replace(/^API \d+:\s*/, '')
  try { return JSON.parse(raw).detail || raw } catch { return raw }
}

function toneFor(scope) {
  return scope === 'won' ? 'green' : scope === 'lost' ? 'red' : 'purple'
}

function labelFor(stage) {
  return String(stage || 'active').replaceAll('_', ' ')
}

export default function QuoteRegister() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [rows, setRows] = useState([])
  const [leads, setLeads] = useState([])
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const scope = SCOPES.some(([key]) => key === searchParams.get('scope'))
    ? searchParams.get('scope') : 'active'
  const refresh = () => Promise.all([listQuoteWorkspaces(), listLeads()])
    .then(([workspaces, leadData]) => {
      setRows(workspaces)
      setLeads(leadData.leads || [])
    })
    .catch(error => setError(messageFrom(error)))
  useEffect(() => { refresh() }, [])
  useLiveRefresh(refresh)

  const availableLeads = useMemo(() => leads.filter(lead => (
    !lead.project_id && lead.stage !== 'lost'
  )), [leads])
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase()
    return rows.filter(row => (
      (scope === 'all' || row.scope === scope)
      && (!term || [row.project_name, row.project_number, row.client_name,
        row.opportunity_number, row.default_quote].some(value => (
        String(value || '').toLowerCase().includes(term))))
    ))
  }, [rows, scope, search])

  async function submit(event) {
    event.preventDefault()
    setBusy(true); setError('')
    try {
      const workspace = await createQuoteWorkspace({
        lead_id:Number(form.lead_id),
      })
      setCreating(false); setForm(EMPTY)
      navigate(`/projects/${workspace.project_id}?mode=quote&tab=design`)
    } catch (error) {
      setError(messageFrom(error))
    } finally {
      setBusy(false)
    }
  }

  return <>
    {error && <div className="quote-register-notice">⚠ {error}</div>}

    <div className="register-bar">
      <div className="register-scopes">
        {SCOPES.map(([key, label]) => <button key={key}
          type="button"
          className={scope === key ? 'active' : ''}
          onClick={() => setSearchParams(key === 'active' ? {} : { scope:key })}>
          {label}<em>{rows.filter(row => key === 'all' || row.scope === key).length}</em>
        </button>)}
      </div>
      <input className="register-search" value={search}
        placeholder="Search project, lead, client or quote…"
        onChange={event => setSearch(event.target.value)}/>
      <button type="button" className="btn btn-primary" onClick={() => {
        setError(''); setCreating(true)
      }}><IconPlus/> Create quote</button>
    </div>

    <div className="register-table-wrap">
      <table className="register-table quote-register-table">
        <thead><tr>
          <th>Project</th><th>Default quote</th><th>Schedule</th>
          <th className="num">Area</th><th className="num">Quantity</th>
          <th className="num">Lead value</th><th>Deal stage</th>
          <th aria-label="Actions"/>
        </tr></thead>
        <tbody>
          {visible.map(row => <tr key={row.project_id}>
            <td><b>{row.project_name}</b><small>
              {row.project_number}{row.opportunity_number ? ` · ${row.opportunity_number}` : ''}
            </small></td>
            <td><b>{row.default_quote || 'Generated after design'}</b>
              <small>{row.quote_count
                ? `${row.quote_count} item quote${row.quote_count === 1 ? '' : 's'} · ${GHS0(row.quote_value)}`
                : 'Waiting for measurements'}</small></td>
            <td>{row.planned_start || row.due_date
              ? <><b>{row.planned_start || 'Not set'}</b>
                  <small>to {row.due_date || 'Not set'}</small></>
              : <em>Not scheduled</em>}</td>
            <td className="num">{row.area ? `${row.area.toFixed(2)} m²` : '—'}</td>
            <td className="num">{row.quantity || '—'}</td>
            <td className="num">{GHS0(row.value)}</td>
            <td><Badge tone={toneFor(row.scope)}>{labelFor(row.deal_stage)}</Badge></td>
            <td className="row-actions"><Link
              to={`/projects/${row.project_id}?mode=quote&tab=design`}>View</Link></td>
          </tr>)}
          {!visible.length && <tr className="register-empty"><td colSpan={8}>
            No quotes in this view yet.
          </td></tr>}
        </tbody>
      </table>
    </div>

    {creating && <div className="modal-back" role="presentation" onMouseDown={event => {
      if (event.target === event.currentTarget) setCreating(false)
    }}>
      <form className="modal quote-create-modal" aria-labelledby="create-quote-title"
        onSubmit={submit}>
        <h4 id="create-quote-title">Create first quote</h4>
        <p>Select the lead. Client, site and sales information will be carried forward automatically. Project dates are set only after client acceptance and payment clearance.</p>
        <label>Lead <span className="req">*</span>
          <select required autoFocus value={form.lead_id}
            onChange={event => setForm(current => ({ ...current, lead_id:event.target.value }))}>
            <option value="">Select lead…</option>
            {availableLeads.map(lead => <option key={lead.id} value={lead.id}>
              {lead.lead_number} · {lead.name}
            </option>)}
          </select>
        </label>
        {!availableLeads.length && <div className="quote-create-empty">
          Every active lead already has a quote. <Link to="/leads">Open Leads</Link>
        </div>}
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost"
            onClick={() => setCreating(false)}>Cancel</button>
          <button className="btn btn-primary" disabled={!form.lead_id || busy}>
            {busy ? 'Creating…' : 'Add'}
          </button>
        </div>
      </form>
    </div>}
  </>
}
