import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Badge } from '../components/ui.jsx'
import {
  addClient, convertLead, createLead, listClients, listLeads, listTeam, updateLead,
} from '../lib/api.js'
import { useLiveRefresh } from '../lib/live.js'
import { GHS0 } from '../lib/whatsapp.js'
import { IconPlus, IconUsers } from '../components/icons.jsx'
import '../styles/leads.css'

// Ghana-local vocabulary. These are the dimensions the dashboard breaks down
// by, so they stay a fixed list rather than free text.
const SOURCES = ['WhatsApp', 'Referral', 'Walk-in', 'Website', 'Site signage', 'Repeat client', 'Tender']
const PROJECT_TYPES = ['Residential', 'Commercial', 'Institutional', 'Industrial', 'Hospitality']
const PRODUCT_TYPES = ['Sliding windows', 'Casement windows', 'Sliding doors', 'Swing doors',
  'Frameless', 'Curtain wall', 'Balustrades', 'Partitions', 'Canopy', 'Mixed']
const CUSTOMER_SIZES = ['Individual', 'Small', 'Medium', 'Large', 'Corporate']
const LOST_REASONS = ['Price too high', 'Lost to competitor', 'Project cancelled',
  'No budget', 'Went quiet', 'Timeline too long', 'Other']

const STAGES = [
  ['enquiry', 'Enquiry', 'gray'],
  ['contacted', 'Contacted', 'blue'],
  ['quoted', 'Quoted', 'purple'],
  ['won', 'Won', 'green'],
  ['lost', 'Lost', 'red'],
]

const SCOPES = [
  ['active', 'Active', lead => !['won', 'lost'].includes(lead.stage)],
  ['won', 'Won', lead => lead.stage === 'won'],
  ['lost', 'Lost', lead => lead.stage === 'lost'],
  ['all', 'All', () => true],
]

const EMPTY = {
  name:'', email:'', site:'', city:'',
  source:'', project_type:'', product_type:'', customer_size:'',
  sales_executive:'', stage:'enquiry', note:'',
}

const EMPTY_CUSTOMER = { name:'', phone:'', location:'', type:'company' }

function messageFrom(error) {
  return String(error?.message || error || 'Something went wrong')
    .replace(/^API \d+:\s*/, '').replace(/^\{"detail":"|"\}$/g, '')
}

function stageTone(stage) {
  return (STAGES.find(([key]) => key === stage) || [, , 'gray'])[2]
}

function stageLabel(stage) {
  return (STAGES.find(([key]) => key === stage) || [, stage])[1]
}

export default function Leads() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [data, setData] = useState({ leads:[], summary:null })
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const [step, setStep] = useState('project')
  const [clients, setClients] = useState([])
  const [customerQuery, setCustomerQuery] = useState('')
  const [selectedClient, setSelectedClient] = useState(null)
  const [newCustomer, setNewCustomer] = useState(false)
  const [customerForm, setCustomerForm] = useState(EMPTY_CUSTOMER)

  const scope = SCOPES.some(([key]) => key === searchParams.get('scope'))
    ? searchParams.get('scope') : 'active'

  const [team, setTeam] = useState([])

  const refresh = () => listLeads().then(setData).catch(error => setError(messageFrom(error)))
  useEffect(() => { refresh(); listTeam().then(setTeam); listClients().then(setClients) }, [])
  useLiveRefresh(refresh)

  const customerMatches = useMemo(() => {
    const term = customerQuery.trim().toLowerCase()
    if (!term) return []
    return clients.filter(client => client.name.toLowerCase().includes(term)
      || (client.phone || '').includes(term)).slice(0, 6)
  }, [clients, customerQuery])

  const salesTeam = useMemo(() => team.filter(user =>
    ['rep', 'supervisor', 'management'].includes(user.role)), [team])

  const leads = data.leads || []
  const visible = useMemo(() => {
    const match = (SCOPES.find(([key]) => key === scope) || SCOPES[3])[2]
    const term = search.trim().toLowerCase()
    return leads.filter(lead => match(lead) && (!term || [
      lead.lead_number, lead.name, lead.contact_name, lead.city,
      lead.site, lead.sales_executive, lead.source,
    ].some(field => String(field || '').toLowerCase().includes(term))))
  }, [leads, scope, search])

  async function run(key, action, success) {
    setBusy(key); setError(''); setMessage('')
    try {
      const result = await action()
      await refresh()
      setMessage(success)
      return result
    } catch (error) {
      setError(messageFrom(error))
    } finally {
      setBusy('')
    }
  }

  function closeCreate() {
    setCreating(false); setForm(EMPTY); setStep('project')
    setSelectedClient(null); setNewCustomer(false); setCustomerForm(EMPTY_CUSTOMER); setCustomerQuery('')
  }

  function submit(event) {
    event.preventDefault()
    if (!selectedClient && !(newCustomer && customerForm.name.trim())) {
      setError('Select an existing customer or create a new one'); return
    }
    run('create', async () => {
      let clientId = selectedClient?.id
      let contact_name = selectedClient?.contact || selectedClient?.name || ''
      let phone = selectedClient?.phone || ''
      if (!clientId) {
        const created = await addClient(customerForm)
        clientId = created.id
        contact_name = customerForm.name
        phone = customerForm.phone
        setClients(current => [...current, { ...customerForm, id: clientId, jobs:0, value:0 }])
      }
      return createLead({ ...form, client_id:clientId, contact_name, phone })
    }, `${form.name} added to leads.`).then(created => {
      if (created) closeCreate()
    })
  }

  function setStage(lead, stage) {
    run(`stage-${lead.id}`, () => updateLead(lead.id, { stage }),
      `${lead.lead_number} moved to ${stageLabel(stage)}.`)
  }

  // A won lead becomes the client project, carrying its context forward so
  // nobody re-types the client, site or product family.
  async function convert(lead) {
    const result = await run(`convert-${lead.id}`, () => convertLead(lead.id, {
      name:lead.name,
      client_id:lead.client_id || undefined,
      client_name:lead.contact_name || lead.name,
      location:lead.site || lead.city,
      product_family:/frameless/i.test(lead.product_type) ? 'frameless'
        : /curtain/i.test(lead.product_type) ? 'curtainwall' : 'frame',
    }), `${lead.lead_number} converted to a project.`)
    if (result?.project?.id) navigate(`/projects/${result.project.id}`)
  }

  const summary = data.summary

  return <>
    {message && <div className="leads-notice success">✓ {message}</div>}
    {error && <div className="leads-notice error">⚠ {error}</div>}

    <div className="register-bar">
      <div className="register-scopes">
        {SCOPES.map(([key, label, match]) => <button key={key}
          className={scope === key ? 'active' : ''}
          onClick={() => setSearchParams(key === 'active' ? {} : { scope:key })}>
          {label}<em>{leads.filter(match).length}</em>
        </button>)}
      </div>
      <input className="register-search" value={search} placeholder="Search lead, contact, city or assignee…"
        onChange={event => setSearch(event.target.value)}/>
      <button className="btn btn-ghost" onClick={() => navigate('/customers')}>
        <IconUsers/> Customers
      </button>
      <button className="btn btn-primary" onClick={() => setCreating(true)}>
        <IconPlus/> Create lead
      </button>
    </div>

    {summary && <div className="leads-kpis">
      {[['created', 'Created', summary.created], ['quoted', 'Quoted', summary.quoted],
        ['won', 'Won', summary.won], ['lost', 'Lost', summary.lost]].map(([key, label, value]) =>
        <div key={key} className={`leads-kpi ${key}`}>
          <b>{value.count}</b><span>{label}</span><small>{GHS0(value.value)}</small>
        </div>)}
    </div>}

    <div className="register-table-wrap">
      <table className="register-table">
        <thead><tr>
          <th>Lead</th><th>Contact</th><th>Location</th><th>Product</th>
          <th>Source</th><th>Assigned to</th><th className="num">Est. value</th>
          <th>Stage</th><th aria-label="Actions"/>
        </tr></thead>
        <tbody>
          {visible.map(lead => <tr key={lead.id}>
            <td><b>{lead.name}</b><small>{lead.lead_number}</small></td>
            <td>{lead.contact_name || <em>—</em>}{lead.phone && <small>{lead.phone}</small>}</td>
            <td>{lead.city || <em>—</em>}{lead.site && <small>{lead.site}</small>}</td>
            <td>{lead.product_type || <em>—</em>}{lead.project_type && <small>{lead.project_type}</small>}</td>
            <td>{lead.source || <em>—</em>}</td>
            <td>{lead.sales_executive || <em>Unassigned</em>}</td>
            <td className="num">{GHS0(lead.estimated_value)}</td>
            <td>
              <Badge tone={stageTone(lead.stage)}>{stageLabel(lead.stage)}</Badge>
              {lead.stage === 'lost' && lead.lost_reason && <small>{lead.lost_reason}</small>}
            </td>
            <td className="row-actions">
              {lead.stage === 'lost'
                ? <select className="leads-reason" value={lead.lost_reason} disabled={!!busy}
                    onChange={event => run(`reason-${lead.id}`,
                      () => updateLead(lead.id, { lost_reason:event.target.value }),
                      'Loss reason recorded.')}>
                    <option value="">Why lost?…</option>
                    {LOST_REASONS.map(reason => <option key={reason}>{reason}</option>)}
                  </select>
                : <select className="leads-stage" value={lead.stage} disabled={!!busy}
                    onChange={event => setStage(lead, event.target.value)}>
                    {STAGES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                  </select>}
              {lead.project_id
                ? <button onClick={() => navigate(`/projects/${lead.project_id}`)}>Open project</button>
                : lead.stage === 'won'
                  ? <button disabled={!!busy} onClick={() => convert(lead)}>
                      {busy === `convert-${lead.id}` ? 'Creating…' : 'Create project'}
                    </button>
                  : null}
            </td>
          </tr>)}
          {!visible.length && <tr className="register-empty">
            <td colSpan={9}>No leads in this view yet.</td>
          </tr>}
        </tbody>
      </table>
    </div>

    {creating && <div className="modal-back leads-create-page">
      <form className="modal leads-create-form" onSubmit={submit}>
        <header className="leads-create-head">
          <div><h1>Create lead</h1>
            <p>{step === 'project' ? 'Step 1 of 2 — Project details' : 'Step 2 of 2 — Client details'}</p>
          </div>
          <div className="leads-create-actions">
            <button type="button" className="btn btn-ghost" onClick={closeCreate}>Cancel</button>
            {step === 'project'
              ? <button type="button" className="btn btn-primary" disabled={!form.name.trim()}
                  onClick={() => setStep('client')}>Next</button>
              : <>
                  <button type="button" className="btn btn-ghost" onClick={() => setStep('project')}>Back</button>
                  <button className="btn btn-primary"
                    disabled={busy === 'create' || !form.name.trim()
                      || (!selectedClient && !(newCustomer && customerForm.name.trim()))}>
                    {busy === 'create' ? 'Saving…' : 'Create lead'}
                  </button>
                </>}
          </div>
        </header>

        <div className="leads-create-columns leads-create-single">
          {step === 'project' ? <section className="leads-create-col">
            <h2>Project</h2>

            <fieldset>
              <legend>Enquiry</legend>
              <label className="modal-full">Project / enquiry name <span className="req">*</span>
                <input autoFocus required value={form.name}
                  onChange={event => setForm({ ...form, name:event.target.value })}
                  placeholder="e.g. East Legon duplex glazing"/>
              </label>
              <div className="modal-grid">
                <label>City
                  <input value={form.city} placeholder="Accra"
                    onChange={event => setForm({ ...form, city:event.target.value })}/>
                </label>
                <label>Site
                  <input value={form.site} placeholder="East Legon"
                    onChange={event => setForm({ ...form, site:event.target.value })}/>
                </label>
              </div>
            </fieldset>

            <fieldset>
              <legend>Classification</legend>
              <div className="modal-grid">
                <label>Source
                  <select value={form.source} onChange={event => setForm({ ...form, source:event.target.value })}>
                    <option value="">Choose…</option>{SOURCES.map(item => <option key={item}>{item}</option>)}
                  </select>
                </label>
                <label>Project type
                  <select value={form.project_type} onChange={event => setForm({ ...form, project_type:event.target.value })}>
                    <option value="">Choose…</option>{PROJECT_TYPES.map(item => <option key={item}>{item}</option>)}
                  </select>
                </label>
              </div>
              <div className="modal-grid">
                <label>Product type
                  <select value={form.product_type} onChange={event => setForm({ ...form, product_type:event.target.value })}>
                    <option value="">Choose…</option>{PRODUCT_TYPES.map(item => <option key={item}>{item}</option>)}
                  </select>
                </label>
                <label>Stage
                  <select value={form.stage} onChange={event => setForm({ ...form, stage:event.target.value })}>
                    {STAGES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                  </select>
                </label>
              </div>
              <label className="modal-full">Customer size
                <select value={form.customer_size} onChange={event => setForm({ ...form, customer_size:event.target.value })}>
                  <option value="">Choose…</option>{CUSTOMER_SIZES.map(item => <option key={item}>{item}</option>)}
                </select>
              </label>
            </fieldset>

            <fieldset>
              <legend>Assignment</legend>
              <label className="modal-full">Assign to
                <select value={form.sales_executive}
                  onChange={event => setForm({ ...form, sales_executive:event.target.value })}>
                  <option value="">Unassigned</option>
                  {salesTeam.map(user => <option key={user.id} value={user.name}>{user.name} — {user.role}</option>)}
                </select>
              </label>
              <p className="leads-assign-hint">Owns this lead through to the quote.</p>
            </fieldset>

            <label className="modal-full">Note
              <textarea rows={3} value={form.note}
                onChange={event => setForm({ ...form, note:event.target.value })}
                placeholder="What did the client ask for?"/>
            </label>
          </section> : <section className="leads-create-col">
            <h2>Client</h2>

            {selectedClient ? <div className="leads-customer-selected">
              <div><b>{selectedClient.name}</b>
                <span>{selectedClient.contact || 'No contact person'}{selectedClient.phone ? ` · ${selectedClient.phone}` : ''}{selectedClient.location ? ` · ${selectedClient.location}` : ''}</span>
              </div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelectedClient(null)}>Change</button>
            </div> : newCustomer ? <fieldset>
              <legend>New customer profile</legend>
              <div className="modal-grid">
                <label>Customer name <span className="req">*</span>
                  <input value={customerForm.name}
                    onChange={event => setCustomerForm({ ...customerForm, name:event.target.value })}/>
                </label>
                <label>Type
                  <select value={customerForm.type}
                    onChange={event => setCustomerForm({ ...customerForm, type:event.target.value })}>
                    <option value="company">Company</option>
                    <option value="individual">Individual</option>
                  </select>
                </label>
              </div>
              <div className="modal-grid">
                <label>WhatsApp / phone
                  <input value={customerForm.phone} placeholder="+233 24 000 0000"
                    onChange={event => setCustomerForm({ ...customerForm, phone:event.target.value })}/>
                </label>
                <label>Location
                  <input value={customerForm.location} placeholder="e.g. East Legon, Accra"
                    onChange={event => setCustomerForm({ ...customerForm, location:event.target.value })}/>
                </label>
              </div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setNewCustomer(false)}>
                ← Search existing customers instead
              </button>
            </fieldset> : <fieldset>
              <legend>Search</legend>
              <label className="modal-full">Search by name or phone
                <input value={customerQuery} placeholder="Start typing…"
                  onChange={event => setCustomerQuery(event.target.value)}/>
              </label>
              {customerQuery.trim() && <div className="leads-customer-matches">
                {customerMatches.map(client => <button type="button" key={client.id}
                  onClick={() => { setSelectedClient(client); setCustomerQuery('') }}>
                  <b>{client.name}</b><span>{client.contact || 'No contact person'}{client.phone ? ` · ${client.phone}` : ''}</span>
                </button>)}
                {!customerMatches.length && <p className="leads-customer-empty">No matching customer.</p>}
              </div>}
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setNewCustomer(true)}>
                <IconPlus/> Create new customer
              </button>
            </fieldset>}

            <fieldset>
              <legend>Contact for this enquiry</legend>
              <label className="modal-full">Email (optional)
                <input type="email" value={form.email}
                  onChange={event => setForm({ ...form, email:event.target.value })}/>
              </label>
            </fieldset>
          </section>}
        </div>
      </form>
    </div>}
  </>
}
