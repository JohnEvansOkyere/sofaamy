import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { PageHead, Card, Stat, Badge } from '../components/ui.jsx'
import WhatsAppModal from '../components/WhatsAppModal.jsx'
import {
  listQuotes, listClients, listProjects, getProjectWorkflow,
  createQuoteFromExtraction, updateQuoteFromExtraction,
  setQuoteStatus, downloadQuotationPdf,
  releaseProjectToFactory,
  listDesigns, saveDesign, downloadReport, previewDesignPrice,
} from '../lib/api.js'
import { GHS0, dateShort, quoteMessage } from '../lib/whatsapp.js'
import {
  IconFile, IconCube, IconWhatsApp, IconWallet, IconCheck, IconPlus,
} from '../components/icons.jsx'
import '../styles/ops.css'
import '../styles/technical-workflow.css'

const FILTERS = ['All', 'Draft', 'Sent', 'Accepted', 'Declined']
const QUOTE_PAGES = [
  ['workbench', 'Quote Preparation'],
  ['configurator', 'Configurator Quotes'],
  ['client', 'Client Approval'],
  ['approval', 'Production Approval'],
  ['register', 'Quote Register'],
]
// Matches FRAME_COLOUR_LABELS in backend/app/pdf.py — the PDF's "Profile /
// colour" line reads design.frame ahead of any free-text colour field, so
// this must stay a fixed choice, not a text input.
const FRAME_COLOURS = [
  ['mill', 'Mill Finish'], ['white', 'White'], ['bronze', 'Bronze'],
  ['black', 'Matte Black'], ['charcoal', 'Charcoal Grey'], ['wood', 'Wood Grain'],
]
const EMPTY_ADDITION = {
  extraction_item_id: null, code: '', description: '',
  quantity: 1, unit: 'item', unit_price: 0,
}

const percent = value => Math.min(100, Math.max(0, Number(value || 0)))

function pageForWorkflow(workflow) {
  const status = workflow?.project?.workflow_status
  if (['quote_sent'].includes(status)) return 'client'
  if (['awaiting_payment', 'drawing_authorized', 'drawing_in_progress',
    'drawing_under_review', 'client_overview_sent', 'drawing_approved',
    'production_pack_ready', 'released_to_factory'].includes(status)) return 'approval'
  return 'workbench'
}

function QuotationPipeline({ steps, onSelect }) {
  const firstPending = steps.findIndex(step => !step.complete)
  const currentIndex = firstPending
  return (
    <div className="quote-pipeline" aria-label="Quotation project pipeline">
      {steps.map((step, index) => (
        <button type="button" className={`${step.complete ? 'done' : ''} ${index === currentIndex ? 'current' : ''}`}
          onClick={() => onSelect(step.page)} key={step.label}>
          <i>{step.complete ? '✓' : index + 1}</i>
          <span><b>{step.label}</b><small>{step.detail}</small></span>
        </button>
      ))}
    </div>
  )
}

function messageFrom(error) {
  const raw = String(error?.message || error || 'Something went wrong')
  try {
    const json = JSON.parse(raw.replace(/^API \d+:\s*/, ''))
    return json.detail || raw
  } catch {
    return raw.replace(/^API \d+:\s*/, '')
  }
}

// Mirrors Technical Workflow's item picker exactly — one item worked on at a
// time, standalone, all the way through the pipeline. Only shown once a
// project has more than one item; a single-item project behaves exactly as
// it always has.
function ItemPicker({ items, itemSummary, selectedKey, onSelect }) {
  return (
    <nav className="tw-item-tabs" aria-label="Project items">
      {items.map(item => {
        const key = item.design_id === null ? 'ungrouped' : item.design_id
        const summary = itemSummary?.[item.design_id === null ? 'null' : String(item.design_id)] || {}
        return (
          <button type="button" key={key} className={selectedKey === key ? 'active' : ''}
            onClick={() => onSelect(key)}>
            <b>{item.design_id === null ? 'Ungrouped (legacy)' : (item.ref || item.name)}</b>
            {item.design_id !== null && item.name && <small>{item.name}</small>}
            <span>{summary.approved_extraction_revision
              ? `E${summary.approved_extraction_revision} approved`
              : 'No approved extraction'}</span>
          </button>
        )
      })}
    </nav>
  )
}

// The item's own extraction chain the workbench is currently pricing.
// key: a design_id, 'ungrouped', or null (project has 0-1 items — no picker).
function resolveItemExtraction(workflow, key) {
  const items = workflow?.items || []
  const showPicker = items.length > 1
  const designId = showPicker ? (key === 'ungrouped' ? null : key) : null
  const summaryKey = designId === null ? 'null' : String(designId)
  const summary = workflow?.item_summary?.[summaryKey]
  return summary?.approved_extraction_id
    ? workflow?.extractions?.find(row => row.id === summary.approved_extraction_id) || null
    : null
}

function defaultItemKey(workflow) {
  const items = workflow?.items || []
  if (items.length <= 1) return null
  const firstReal = items.find(item => item.design_id !== null)
  return firstReal ? firstReal.design_id : 'ungrouped'
}

function extractionIdsFromCommercial(commercial) {
  return commercial?.extraction_ids?.length ? commercial.extraction_ids
    : [commercial?.extraction_id].filter(Boolean)
}

function quoteDraft(extraction, workflow, project, commercial = null) {
  const existing = commercial?.lines || []
  // A commercial line only stays a locked technical row if it belongs to the
  // item currently being priced — anything else (e.g. a line left over from
  // a quote that once combined several items) becomes an editable addition
  // instead of silently disappearing.
  const extractionItemIds = new Set((extraction?.items || []).map(item => String(item.id)))
  const existingByItem = new Map(existing
    .filter(line => line.extraction_item_id != null && extractionItemIds.has(String(line.extraction_item_id)))
    .map(line => [String(line.extraction_item_id), line]))
  const technicalLines = (extraction?.items || []).map(item => {
    const saved = existingByItem.get(String(item.id))
    return {
      extraction_item_id: item.id,
      code: item.code || '',
      description: item.material,
      quantity: item.quantity,
      unit: item.unit || 'item',
      unit_price: saved?.unit_price ?? item.unit_price ?? 0,
    }
  })
  const additions = existing
    .filter(line => line.extraction_item_id == null || !extractionItemIds.has(String(line.extraction_item_id)))
    .map(line => ({ ...EMPTY_ADDITION, ...line }))
  const family = workflow?.project?.product_family || ''
  const system = workflow?.project?.product_system || ''
  return {
    product: commercial?.product
      || [family && family[0].toUpperCase() + family.slice(1), system].filter(Boolean).join(' — ')
      || project?.name || '',
    lines: [...technicalLines, ...additions],
    service_charge_percent: commercial?.service_charge_percent
      ?? commercial?.installation_percent ?? 0,
    discount_percent: commercial?.discount_percent ?? 0,
    getf_nhis_percent: commercial?.getf_nhis_percent ?? 5,
    vat_percent: commercial?.vat_percent ?? 15,
    deposit_percent: commercial?.deposit_percent
      ?? workflow?.project?.drawing_release_percent ?? 80,
    valid_days: commercial?.valid_days ?? 3,
    client_phone: commercial?.client_phone || project?.client_phone || '',
    client_email: commercial?.client_email || '',
    notes: commercial?.notes || '',
  }
}

export default function Quotations() {
  const [searchParams] = useSearchParams()
  const [quotes, setQuotes] = useState([])
  const [clients, setClients] = useState([])
  const [projects, setProjects] = useState([])
  const [workflow, setWorkflow] = useState(null)
  const [activePage, setActivePage] = useState('workbench')
  const [projectId, setProjectId] = useState(searchParams.get('project') || '')
  const [draft, setDraft] = useState(null)
  // Which item's own extraction is being priced — a design_id, 'ungrouped',
  // or null when the project has 0-1 items (no picker needed).
  const [selectedItemKey, setSelectedItemKey] = useState(null)
  const [revisionSeed, setRevisionSeed] = useState(null)
  const [editing, setEditing] = useState(null)
  const [live, setLive] = useState(false)
  const [busy, setBusy] = useState(false)
  const [filter, setFilter] = useState('All')
  const [wa, setWa] = useState(null)
  const [toast, setToast] = useState(null)
  const [designs, setDesigns] = useState([])
  const [selectedDesignId, setSelectedDesignId] = useState('')
  const [designDraft, setDesignDraft] = useState(null)
  const [designPreview, setDesignPreview] = useState(null)
  const [previewBusy, setPreviewBusy] = useState(false)
  const fire = message => {
    setToast(message)
    setTimeout(() => setToast(null), 3600)
  }

  const refreshLists = () => Promise.all([listQuotes(), listClients(), listProjects(), listDesigns()])
    .then(([quoteRows, clientRows, projectRows, designRows]) => {
      setQuotes(quoteRows)
      setClients(clientRows)
      setProjects(projectRows)
      setDesigns(designRows)
      setLive(true)
      if (!projectId) {
        const preferred = projectRows.find(project => project.approved_extraction_revision)
        if (preferred) setProjectId(String(preferred.id))
      }
    })
  useEffect(() => { refreshLists().catch(() => {}) }, [])

  const selectedDesign = designs.find(row => String(row.id) === String(selectedDesignId))
  useEffect(() => {
    setDesignDraft(selectedDesign ? { ...selectedDesign.design } : null)
    setDesignPreview(null)
  }, [selectedDesignId])

  useEffect(() => {
    if (!selectedDesign || !designDraft) return
    setPreviewBusy(true)
    previewDesignPrice(selectedDesign.client_name || '', {
      ...designDraft, projectId: selectedDesign.project_id || null,
    }).then(setDesignPreview).catch(() => {}).finally(() => setPreviewBusy(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [designDraft])

  const changeDesignField = (key, value) =>
    setDesignDraft(current => ({ ...current, [key]: value }))

  const saveDesignCommercial = () => {
    if (!selectedDesign || !designDraft) return
    setBusy(true)
    saveDesign(selectedDesign.client_name || '', {
      ...designDraft, projectId: selectedDesign.project_id || null,
    }).then(() => {
      fire(`✅ ${selectedDesign.ref || selectedDesign.name} — quote terms saved`)
      return refreshLists()
    }).catch(error => fire(`⚠️ ${messageFrom(error)}`))
      .finally(() => setBusy(false))
  }

  const downloadDesignQuote = () => {
    if (!selectedDesign || !designDraft) return
    setBusy(true)
    downloadReport('quotation', selectedDesign.client_name || '', {
      ...designDraft, projectId: selectedDesign.project_id || null,
    }).then(() => fire(`📄 Client quotation — ${selectedDesign.ref || selectedDesign.name} downloaded`))
      .catch(error => fire(`⚠️ ${messageFrom(error)}`))
      .finally(() => setBusy(false))
  }

  const activeProject = projects.find(project => String(project.id) === String(projectId))

  // Set which item is being priced, and rebuild the draft to match it. Used
  // for the initial default selection, a manual item-tab click, and loading
  // an existing quote's own item for edit/revise.
  const selectItem = (workflowData, key, project, seedCommercial = null) => {
    setSelectedItemKey(key)
    setDraft(quoteDraft(resolveItemExtraction(workflowData, key), workflowData, project, seedCommercial))
  }

  // Figure out which item an existing quote's extraction belongs to, so its
  // own tab is selected automatically when loading it for edit/revise.
  const seedItemKey = (workflowData, commercial) => {
    const seedExtraction = workflowData?.extractions?.find(
      row => row.id === extractionIdsFromCommercial(commercial)[0])
    return seedExtraction
      ? (seedExtraction.design_id === null ? 'ungrouped' : seedExtraction.design_id)
      : defaultItemKey(workflowData)
  }

  useEffect(() => {
    if (!projectId) {
      setWorkflow(null)
      setDraft(null)
      setSelectedItemKey(null)
      return
    }
    setBusy(true)
    getProjectWorkflow(projectId)
      .then(data => {
        setWorkflow(data)
        setActivePage(pageForWorkflow(data))
        const project = projects.find(p => String(p.id) === String(projectId))
        const seed = revisionSeed?.project_id
          && String(revisionSeed.project_id) === String(projectId)
          ? revisionSeed.commercial : null
        if (seed) {
          selectItem(data, seedItemKey(data, seed), project, seed)
          setRevisionSeed(null)
        } else {
          selectItem(data, defaultItemKey(data), project)
        }
        // Editing follows its own quote; switching project abandons the edit.
        setEditing(current =>
          current && String(current.project_id) === String(projectId) ? current : null)
      })
      .catch(error => fire(`⚠️ ${messageFrom(error)}`))
      .finally(() => setBusy(false))
  }, [projectId, projects.length])

  const items = workflow?.items || []
  const showItemPicker = items.length > 1
  const primaryExtraction = resolveItemExtraction(workflow, selectedItemKey)
  const extractionsFloor = primaryExtraction?.subtotal || 0

  const onSelectItem = key => {
    setEditing(null) // switching item abandons an in-progress edit, same as switching project
    selectItem(workflow, key, activeProject)
  }
  const totals = useMemo(() => {
    const pricedLines = (draft?.lines || []).reduce(
      (sum, line) => sum + Number(line.quantity || 0) * Number(line.unit_price || 0), 0)
    const pricedTechnicalMaterials = (draft?.lines || [])
      .filter(line => line.extraction_item_id != null)
      .reduce(
        (sum, line) => sum + Number(line.quantity || 0) * Number(line.unit_price || 0), 0)
    const serviceChargeAmount = pricedTechnicalMaterials
      * percent(draft?.service_charge_percent) / 100
    const subtotal = pricedLines + serviceChargeAmount
    const discountAmount = subtotal * percent(draft?.discount_percent) / 100
    const net = subtotal - discountAmount
    const getf = net * percent(draft?.getf_nhis_percent) / 100
    const vat = net * percent(draft?.vat_percent) / 100
    return {
      pricedLines, pricedTechnicalMaterials, serviceChargeAmount,
      subtotal, discountAmount, net, getf, vat,
      grandTotal: net + getf + vat,
    }
  }, [draft])

  const changeLine = (index, key, value) => setDraft(current => ({
    ...current,
    lines: current.lines.map((line, i) => i === index ? { ...line, [key]: value } : line),
  }))
  const removeLine = index => setDraft(current => ({
    ...current,
    lines: current.lines.filter((_, i) => i !== index),
  }))
  const addLine = () => setDraft(current => ({
    ...current, lines: [...current.lines, { ...EMPTY_ADDITION }],
  }))

  const generateQuote = async () => {
    if (!primaryExtraction || !draft) return
    setBusy(true)
    try {
      const payload = {
        extraction_id: primaryExtraction.id,
        product: draft.product,
        lines: draft.lines.map(line => ({
          ...line,
          quantity: Number(line.quantity),
          unit_price: Number(line.unit_price),
        })),
        service_charge_percent: Number(draft.service_charge_percent),
        discount_percent: Number(draft.discount_percent),
        getf_nhis_percent: Number(draft.getf_nhis_percent),
        vat_percent: Number(draft.vat_percent),
        deposit_percent: Number(draft.deposit_percent),
        valid_days: Number(draft.valid_days),
        client_phone: draft.client_phone,
        client_email: draft.client_email,
        notes: draft.notes,
        created_by: 'Quotation Team',
      }
      const data = editing
        ? await updateQuoteFromExtraction(editing.quote_number, payload)
        : await createQuoteFromExtraction(projectId, payload)
      setWorkflow(data)
      await refreshLists()
      if (editing) {
        fire(`✅ ${editing.quote_number} updated — same quote number kept`)
        setEditing(null)
      } else {
        const latest = data.quotations?.[0]
        fire(`✅ ${latest?.quote_number || 'Draft quotation'} generated from extraction E${primaryExtraction.revision}`)
      }
      setActivePage('client')
    } catch (error) {
      fire(`⚠️ ${messageFrom(error)}`)
    } finally {
      setBusy(false)
    }
  }

  const phoneFor = name => clients.find(client => client.name === name)?.phone || ''
  const greetFor = name => {
    const client = clients.find(row => row.name === name)
    return client?.contact || name
  }
  const rows = useMemo(() => filter === 'All' ? quotes
    : quotes.filter(quote => quote.status === filter
      || (filter === 'Accepted' && quote.status === 'Approved')), [quotes, filter])
  const open = quotes.filter(quote => ['Draft', 'Sent'].includes(quote.status))
  const won = quotes.filter(quote => ['Accepted', 'Approved'].includes(quote.status))
  const wonValue = won.reduce((sum, quote) => sum + quote.total, 0)

  const updateStatus = async (quote, status) => {
    setBusy(true)
    try {
      const result = await setQuoteStatus(quote.quote_number, status)
      await refreshLists()
      if (quote.project_id && String(quote.project_id) === String(projectId)) {
        setWorkflow(await getProjectWorkflow(projectId))
      }
      if (status === 'Accepted') {
        setActivePage('approval')
        fire(result.job_number
          ? `✅ Client acceptance recorded — job ${result.job_number} opened`
          : '✅ Client acceptance recorded')
      } else {
        fire(`Quote marked ${status.toLowerCase()}`)
      }
    } catch (error) {
      fire(`⚠️ ${messageFrom(error)}`)
    } finally {
      setBusy(false)
    }
  }

  const edit = quote => {
    if (!quote.commercial) return
    setEditing(quote)
    setRevisionSeed(quote)
    setActivePage('workbench')
    setProjectId(String(quote.project_id))
    if (String(quote.project_id) === String(projectId) && workflow) {
      selectItem(workflow, seedItemKey(workflow, quote.commercial), activeProject, quote.commercial)
      setRevisionSeed(null)
    }
    window.scrollTo({ top: 0, behavior: 'smooth' })
    fire(`Editing ${quote.quote_number} — it keeps the same quote number`)
  }

  const cancelEdit = () => {
    const quote = editing
    setEditing(null)
    if (workflow) selectItem(workflow, selectedItemKey, activeProject)
    if (quote) fire(`Left ${quote.quote_number} unchanged`)
  }

  const revise = quote => {
    if (!quote.commercial) return
    setEditing(null)
    setRevisionSeed(quote)
    setActivePage('workbench')
    setProjectId(String(quote.project_id))
    if (String(quote.project_id) === String(projectId) && workflow) {
      selectItem(workflow, seedItemKey(workflow, quote.commercial), activeProject, quote.commercial)
      setRevisionSeed(null)
    }
    window.scrollTo({ top: 0, behavior: 'smooth' })
    fire(`Loaded ${quote.quote_number} as a new draft revision`)
  }

  const currentQuote = workflow?.quotations?.find(
    quote => quote.basis_status === 'current' && quote.status !== 'Declined')
  const currentAcceptedQuote = workflow?.quotations?.find(
    quote => ['Accepted', 'Approved'].includes(quote.status)
      && quote.basis_status === 'current')
  const currentDrawingTask = workflow?.drawing_tasks?.find(
    task => task.basis_status === 'current')
  const approvedDrawing = currentDrawingTask?.revisions
    ?.slice().reverse().find(revision => revision.status === 'approved')
  const currentRelease = workflow?.production_releases?.find(
    release => release.status === 'current')
  const productionComplete = currentAcceptedQuote?.job_stage === 'done'
  const releaseReady = Boolean(
    currentAcceptedQuote && workflow?.payment_gate?.authorized
    && approvedDrawing && !currentRelease)
  const projectQuotes = quotes.filter(
    quote => String(quote.project_id) === String(projectId))
  const pipelineSteps = workflow ? [
    {
      label: 'Technical scope', page: 'workbench', complete: Boolean(primaryExtraction),
      detail: primaryExtraction ? `E${primaryExtraction.revision}` : 'Approval pending',
    },
    {
      label: 'Quote prepared', page: 'workbench', complete: Boolean(currentQuote),
      detail: currentQuote ? `${currentQuote.quote_number} · ${currentQuote.status}` : 'Not prepared',
    },
    {
      label: 'Client accepted', page: 'client', complete: Boolean(currentAcceptedQuote),
      detail: currentAcceptedQuote?.quote_number || 'Response pending',
    },
    {
      label: 'Payment cleared', page: 'approval',
      complete: Boolean(workflow.payment_gate?.authorized),
      detail: workflow.payment_gate?.authorized
        ? `${GHS0(workflow.payment_gate.paid_amount)} received`
        : `${GHS0(workflow.payment_gate?.outstanding || 0)} due`,
    },
    {
      label: 'Drawing approved', page: 'approval', complete: Boolean(approvedDrawing),
      detail: approvedDrawing ? `Drawing R${approvedDrawing.revision}` : 'Technical approval pending',
    },
    {
      label: productionComplete ? 'Production completed' : 'Production',
      page: 'approval',
      complete: productionComplete,
      detail: productionComplete
        ? `Completed ${dateShort(currentAcceptedQuote.job_completed_at)}`
        : currentRelease
          ? currentAcceptedQuote?.job_stage_label || 'Factory production in progress'
          : 'Not authorized',
    },
  ] : []

  const authorizeProduction = async () => {
    if (!releaseReady) return
    setBusy(true)
    try {
      const data = await releaseProjectToFactory(projectId, approvedDrawing.id, {
        released_by: 'Quotation Supervisor',
        notes: `Commercial authorization from ${currentAcceptedQuote.quote_number}`,
      })
      setWorkflow(data)
      await refreshLists()
      fire(`✅ ${data.production_releases?.[0]?.release_number || 'Project'} authorized for production`)
    } catch (error) {
      fire(`⚠️ ${messageFrom(error)}`)
    } finally {
      setBusy(false)
    }
  }

  const quoteTable = (tableRows, emptyMessage) => (
    <div className="tbl-wrap">
      <table className="tbl">
        <thead><tr><th>Quote No.</th><th>Client</th><th>Project</th><th>Product / profile</th><th>Total</th><th>Status</th><th>Date</th><th style={{minWidth:260}}></th></tr></thead>
        <tbody>
          {tableRows.map(quote => (
            <tr key={quote.quote_number}>
              <td className="t-mono">{quote.quote_number}{quote.extraction_revision ? <small className="quote-revision">E{quote.extraction_revision}</small> : null}</td>
              <td className="t-strong">{quote.client_name}</td>
              <td className="t-muted">{quote.project_number || '—'}</td>
              <td className="t-muted">{quote.product}</td>
              <td className="t-mono">{GHS0(quote.total)}</td>
              <td><Badge>{quote.status}</Badge></td>
              <td className="t-muted">{dateShort(quote.created_at)}</td>
              <td className="right">
                <div className="flex gap-sm wrap" style={{ justifyContent:'flex-end' }}>
                  {quote.commercial && quote.status === 'Draft' && <button className="btn btn-ghost btn-sm" onClick={() => edit(quote)}>Edit</button>}
                  {quote.commercial && <button className="btn btn-ghost btn-sm" onClick={() => revise(quote)}>Revise</button>}
                  <button className="btn btn-ghost btn-sm" title="Download customer quotation"
                    onClick={() => downloadQuotationPdf(quote.quote_number)
                      .then(() => fire(`📄 ${quote.quote_number} downloaded`))
                      .catch(error => fire(`⚠️ ${messageFrom(error)}`))}>
                    <IconFile style={{ width:14, height:14 }}/> PDF
                  </button>
                  {!['Accepted', 'Approved', 'Declined'].includes(quote.status) && <button className="btn btn-ghost btn-sm" style={{ color:'#1da851' }} title="Send on WhatsApp" onClick={() => setWa(quote)}>
                    <IconWhatsApp style={{ width:15, height:15 }}/> Send
                  </button>}
                  {!['Accepted', 'Approved', 'Declined'].includes(quote.status) && <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => updateStatus(quote, 'Accepted')}>Client accepted</button>}
                  {quote.job_number && <Link className="btn btn-ghost btn-sm"
                    to={`/accounts?job=${quote.job_number}`}>Accounts →</Link>}
                  {!['Accepted', 'Approved', 'Declined'].includes(quote.status) && <button className="btn btn-ghost btn-sm" style={{ color:'var(--red)' }} onClick={() => updateStatus(quote, 'Declined')}>✕</button>}
                </div>
              </td>
            </tr>
          ))}
          {!tableRows.length && <tr><td colSpan={8} className="muted center" style={{ padding:24 }}>{emptyMessage}</td></tr>}
        </tbody>
      </table>
    </div>
  )

  return (
    <>
      <PageHead title="Quotations" subtitle="Price approved technical scopes, issue client quotes, record acceptance, and authorize ready projects.">
        {live
          ? <span className="badge b-green"><span className="bdot"/>Live · from database</span>
          : <span className="badge b-orange"><span className="bdot"/>Backend offline</span>}
      </PageHead>

      <Card title="Quotation pipeline" sub="Choose a project, then use the stages or pages below to continue its commercial workflow."
        className="quote-pipeline-card">
        <div className="quote-project-select">
          <label>
            <span>Project</span>
            <select value={projectId} onChange={event => {
              setWorkflow(null)
              setProjectId(event.target.value)
            }}>
              <option value="">Choose a project</option>
              {projects.map(project => (
                <option key={project.id} value={project.id}>
                  {project.project_number} · {project.name} · {project.client_name || 'Walk-in Client'}
                </option>
              ))}
            </select>
          </label>
          {workflow?.project && <div className="quote-project-context">
            <b>{workflow.project.client_name || 'Walk-in Client'}</b>
            <span>{workflow.project.location || 'No site location'} · {workflow.project.product_system || workflow.project.product_family}</span>
          </div>}
        </div>
        {workflow
          ? <QuotationPipeline steps={pipelineSteps} onSelect={setActivePage} />
          : <div className="quote-empty">Choose a project to view its quotation pipeline.</div>}
      </Card>

      <nav className="quote-page-tabs" aria-label="Quotation pages">
        {QUOTE_PAGES.map(([key, label]) => (
          <button type="button" className={activePage === key ? 'active' : ''}
            aria-current={activePage === key ? 'page' : undefined}
            onClick={() => setActivePage(key)} key={key}>{label}</button>
        ))}
      </nav>

      {activePage === 'workbench' && <Card title="Quote preparation" sub="Technical quantities stay locked; selling rates and commercial additions are managed here.">
        {editing && <div className="quote-editing-banner">
          <div>
            <b>Editing draft {editing.quote_number}</b>
            <span>Saving replaces this draft and keeps the same quote number. It has not been sent to the client.</span>
          </div>
          <button className="btn btn-ghost btn-sm" disabled={busy} onClick={cancelEdit}>Cancel</button>
        </div>}
        {!projectId && <div className="quote-empty">Choose a project to prepare its quotation.</div>}

        {showItemPicker && <ItemPicker items={items} itemSummary={workflow.item_summary}
          selectedKey={selectedItemKey} onSelect={onSelectItem} />}

        {projectId && workflow && !primaryExtraction && <div className="quote-empty">
          <p>The technical team must approve a material extraction before pricing can begin.</p>
          <Link className="btn btn-ghost btn-sm" to={`/technical-workflow?project=${projectId}`}>Open technical workflow</Link>
        </div>}

        {primaryExtraction && draft && <>
          <div className="quote-basis">
            <div><span>Approved technical basis</span><b>E{primaryExtraction.revision}</b></div>
            <div><span>Material rows</span><b>{primaryExtraction.items.length}</b></div>
            <div><span>Internal extracted floor</span><b>{GHS0(extractionsFloor)}</b></div>
            <p>Descriptions, quantities and units come from technical approval. Set each selling rate, then set the company service charge applied to those priced technical materials. Discount is the amount the company removes afterward for the client.</p>
          </div>

          <div className="quote-meta-grid">
            <label><span>Customer description</span><input value={draft.product} onChange={event => setDraft(current => ({ ...current, product:event.target.value }))} /></label>
            <label><span>Client phone</span><input value={draft.client_phone} onChange={event => setDraft(current => ({ ...current, client_phone:event.target.value }))} /></label>
            <label><span>Client email</span><input value={draft.client_email} onChange={event => setDraft(current => ({ ...current, client_email:event.target.value }))} /></label>
            <label><span>Valid days</span><input type="number" min="1" max="90" value={draft.valid_days} onChange={event => setDraft(current => ({ ...current, valid_days:event.target.value }))} /></label>
          </div>

          <div className="tbl-wrap quote-lines-wrap">
            <table className="tbl quote-lines">
              <thead><tr><th>Code</th><th>Material / commercial line</th><th>Quantity</th><th>Unit</th><th>Selling rate</th><th>Total</th><th></th></tr></thead>
              <tbody>
                {draft.lines.map((line, index) => {
                  const technical = line.extraction_item_id != null
                  const lineTotal = Number(line.quantity || 0) * Number(line.unit_price || 0)
                  return <tr key={`${line.extraction_item_id ?? 'extra'}-${index}`} className={technical ? 'technical-line' : 'commercial-line'}>
                    <td>{technical
                      ? <span className="t-mono">{line.code || '—'}</span>
                      : <input value={line.code} placeholder="Optional" onChange={event => changeLine(index, 'code', event.target.value)} />}</td>
                    <td>{technical
                      ? <div><b>{line.description}</b><small>Approved technical row</small></div>
                      : <input value={line.description} placeholder="e.g. Installation labour" onChange={event => changeLine(index, 'description', event.target.value)} />}</td>
                    <td>{technical
                      ? <span>{line.quantity}</span>
                      : <input type="number" min="0.001" step="any" value={line.quantity} onChange={event => changeLine(index, 'quantity', event.target.value)} />}</td>
                    <td>{technical
                      ? <span>{line.unit}</span>
                      : <input value={line.unit} onChange={event => changeLine(index, 'unit', event.target.value)} />}</td>
                    <td><input type="number" min="0" step="0.01" value={line.unit_price} onFocus={event => event.target.select()} onChange={event => changeLine(index, 'unit_price', event.target.value)} /></td>
                    <td className="t-mono"><b>{GHS0(lineTotal)}</b></td>
                    <td>{!technical && <button className="quote-line-remove" title="Remove line" onClick={() => removeLine(index)}>×</button>}</td>
                  </tr>
                })}
              </tbody>
            </table>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={addLine}><IconPlus/> Add commercial line</button>

          <div className="quote-commercial">
            <div className="quote-terms-grid">
              <label><span>Service charge %</span><input type="number" min="0" max="100" value={draft.service_charge_percent} onFocus={event => event.target.select()} onChange={event => setDraft(current => ({ ...current, service_charge_percent:event.target.value }))} /></label>
              <label><span>Discount %</span><input type="number" min="0" max="100" value={draft.discount_percent} onChange={event => setDraft(current => ({ ...current, discount_percent:event.target.value }))} /></label>
              <label><span>GETF + NHIS %</span><input type="number" min="0" max="100" value={draft.getf_nhis_percent} onChange={event => setDraft(current => ({ ...current, getf_nhis_percent:event.target.value }))} /></label>
              <label><span>VAT %</span><input type="number" min="0" max="100" value={draft.vat_percent} onChange={event => setDraft(current => ({ ...current, vat_percent:event.target.value }))} /></label>
              <label><span>Required payment %</span><input type="number" min="0" max="100" value={draft.deposit_percent} onChange={event => setDraft(current => ({ ...current, deposit_percent:event.target.value }))} /></label>
            </div>
            <div className="quote-total-card">
              <div><span>Priced lines</span><b>{GHS0(totals.pricedLines)}</b></div>
              <div><span>Service charge ({percent(draft.service_charge_percent)}%)</span><b>{GHS0(totals.serviceChargeAmount)}</b></div>
              <div><span>Subtotal</span><b>{GHS0(totals.subtotal)}</b></div>
              <div><span>Discount</span><b>−{GHS0(totals.discountAmount)}</b></div>
              <div><span>GETF + NHIS</span><b>{GHS0(totals.getf)}</b></div>
              <div><span>VAT</span><b>{GHS0(totals.vat)}</b></div>
              <div className="grand"><span>Grand total</span><b>{GHS0(totals.grandTotal)}</b></div>
              <div className={totals.net + .01 >= extractionsFloor ? 'floor-ok' : 'floor-bad'}>
                {totals.net + .01 >= extractionsFloor
                  ? `${GHS0(totals.net - extractionsFloor)} above extracted floor before tax`
                  : `${GHS0(extractionsFloor - totals.net)} below extracted floor`}
              </div>
            </div>
          </div>
          <textarea className="quote-notes" placeholder="Commercial notes or customer terms" value={draft.notes} onChange={event => setDraft(current => ({ ...current, notes:event.target.value }))} />
          <div className="flex gap wrap">
            <button className="btn btn-primary" disabled={busy || !draft.product.trim() || !draft.lines.length || totals.grandTotal <= 0} onClick={generateQuote}>
              <IconFile/> {editing ? `Save changes to ${editing.quote_number}` : 'Generate draft quotation'}
            </button>
            {editing && <button className="btn btn-ghost" disabled={busy} onClick={cancelEdit}>Cancel edit</button>}
            <Link className="btn btn-ghost" to={`/technical-workflow?project=${projectId}`}><IconCube/> View technical chain</Link>
          </div>
        </>}
      </Card>}

      {activePage === 'configurator' && <Card title="Configurator quotes" sub="Quotes priced directly from a saved configurator design (rate per m² or Trialco costing) — edit the client-facing terms here, then download.">
        <div className="quote-project-select">
          <label>
            <span>Saved design</span>
            <select value={selectedDesignId} onChange={event => setSelectedDesignId(event.target.value)}>
              <option value="">Choose a saved design…</option>
              {designs.map(row => (
                <option key={row.id} value={row.id}>
                  {(row.ref || row.name)} — {row.name}{row.client_name ? ` · ${row.client_name}` : ''}
                  {row.project_number ? ` · ${row.project_number}` : ''}
                </option>
              ))}
            </select>
          </label>
          {selectedDesign && <div className="quote-project-context">
            <b>{selectedDesign.client_name || 'Walk-in Client'}</b>
            <span>{selectedDesign.project_number || 'No project'} · {selectedDesign.ref || selectedDesign.name}</span>
          </div>}
        </div>
        {!selectedDesign && <div className="quote-empty">Choose a saved design to edit its client-facing quote terms.</div>}
        {selectedDesign && designDraft && <>
          <div className="quote-terms-grid">
            <label><span>Job description</span><input value={designDraft.jobDescription || ''} placeholder={`Fabrication and installation of ${selectedDesign.name}`} onChange={event => changeDesignField('jobDescription', event.target.value)} /></label>
            <label><span>Profile / colour</span>
              <select value={designDraft.frame || 'mill'} onChange={event => changeDesignField('frame', event.target.value)}>
                {FRAME_COLOURS.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
              </select>
            </label>
            <label><span>Client phone</span><input value={designDraft.clientPhone || ''} onChange={event => changeDesignField('clientPhone', event.target.value)} /></label>
            <label><span>Client email</span><input value={designDraft.clientEmail || ''} onChange={event => changeDesignField('clientEmail', event.target.value)} /></label>
            <label><span>Discount %</span><input type="number" min="0" max="100" value={designDraft.discountPercent ?? 0} onFocus={event => event.target.select()} onChange={event => changeDesignField('discountPercent', Number(event.target.value))} /></label>
            <label><span>GETF + NHIS %</span><input type="number" min="0" max="100" value={designDraft.getfNhisPercent ?? 5} onChange={event => changeDesignField('getfNhisPercent', Number(event.target.value))} /></label>
            <label><span>VAT %</span><input type="number" min="0" max="100" value={designDraft.vatPercent ?? 15} onChange={event => changeDesignField('vatPercent', Number(event.target.value))} /></label>
            <label><span>Required payment %</span><input type="number" min="0" max="100" value={designDraft.depositPercent ?? 80} onChange={event => changeDesignField('depositPercent', Number(event.target.value))} /></label>
            <label><span>Valid for (days)</span><input type="number" min="1" max="90" value={designDraft.quoteValidDays ?? 3} onChange={event => changeDesignField('quoteValidDays', Number(event.target.value))} /></label>
          </div>
          <div className="quote-total-card">
            {previewBusy && !designPreview && <div>Calculating…</div>}
            {designPreview && <>
              <div><span>Per-unit total</span><b>{GHS0(designPreview.total)}</b></div>
              <div><span>Quantity</span><b>× {designPreview.qty}</b></div>
              <div className="grand"><span>Grand total</span><b>{GHS0(designPreview.grand_total)}</b></div>
              <div><span>{percent(designDraft.depositPercent ?? 80)}% required payment</span><b>{GHS0(designPreview.grand_total * percent(designDraft.depositPercent ?? 80) / 100)}</b></div>
            </>}
          </div>
          <p className="quote-help">This edits the saved design's own commercial terms — dimensions, openings and glass stay untouched and are only changed in the Configurator. Saving updates every future download of this design's Client quotation PDF, including from Reports.</p>
          <div className="flex gap wrap">
            <button className="btn btn-primary" disabled={busy} onClick={saveDesignCommercial}>
              <IconCheck/> Save quote terms
            </button>
            <button className="btn btn-ghost" disabled={busy} onClick={downloadDesignQuote}>
              <IconFile/> Download client quotation PDF
            </button>
          </div>
        </>}
      </Card>}

      {activePage === 'client' && <Card title="Client approval" sub="Send, download, revise or record the client's decision for the selected project." pad={false}>
        {projectId
          ? quoteTable(projectQuotes, 'No quotations have been prepared for this project.')
          : <div className="quote-empty quote-page-empty">Choose a project above to review its client quotations.</div>}
      </Card>}

      {activePage === 'approval' && <Card title="Production approval" sub="Confirm the independent client, Accounts and Technical gates before authorizing factory production.">
        {!workflow && <div className="quote-empty">Choose a project above to review its production gates.</div>}
        {workflow && <>
        <div className="quote-approval-grid">
          <div className={currentAcceptedQuote ? 'done' : ''}>
            <span>{currentAcceptedQuote ? '✓' : '1'}</span>
            <p><b>Client approval</b><small>{currentAcceptedQuote?.quote_number || 'Return to Client Approval'}</small></p>
            {!currentAcceptedQuote && <button onClick={() => setActivePage('client')}>Open client quotes</button>}
          </div>
          <div className={workflow.payment_gate?.authorized ? 'done' : ''}>
            <span>{workflow.payment_gate?.authorized ? '✓' : '2'}</span>
            <p><b>Accounts clearance</b><small>{workflow.payment_gate?.authorized
              ? `${GHS0(workflow.payment_gate.paid_amount)} received`
              : `${GHS0(workflow.payment_gate?.outstanding || 0)} required now`}</small></p>
            {currentAcceptedQuote?.job_number && !workflow.payment_gate?.authorized && <Link
              to={`/accounts?job=${currentAcceptedQuote.job_number}`}>Open Accounts</Link>}
          </div>
          <div className={approvedDrawing ? 'done' : ''}>
            <span>{approvedDrawing ? '✓' : '3'}</span>
            <p><b>Technical approval</b><small>{approvedDrawing
              ? `Drawing R${approvedDrawing.revision} approved`
              : 'Approved drawing required'}</small></p>
            {!approvedDrawing && <Link to={`/technical-workflow?project=${projectId}`}>Open Technical</Link>}
          </div>
        </div>
        <div className="flex gap wrap">
          <button className="btn btn-primary" disabled={busy || !releaseReady} onClick={authorizeProduction}>
            <IconCheck/> {currentRelease ? 'Production already authorized' : 'Approve production of project'}
          </button>
        </div>
        {!releaseReady && !currentRelease && <p className="quote-gate-help">Complete client acceptance, required payment and technical drawing approval before production can be authorized.</p>}
        {currentRelease && <div className="quote-release-confirmed"><IconCheck /> {currentRelease.release_number} is authorized for production.</div>}
        </>}
      </Card>}

      {activePage === 'register' && <>
      <div className="grid g-4 mb">
        <Stat label="Open Quotations" value={String(open.length)} trend={`${quotes.filter(q => q.status === 'Sent').length} awaiting reply`} dir="flat" tone="orange" icon={<IconFile/>} />
        <Stat label="Pipeline Value" value={GHS0(open.reduce((sum, quote) => sum + quote.total, 0))} trend={`${open.length} open`} dir="up" tone="blue" icon={<IconWallet/>} />
        <Stat label="Won" value={String(won.length)} trend={`${GHS0(wonValue)} accepted`} dir="up" tone="green" icon={<IconCheck/>} />
        <Stat label="Quote → Order" value={quotes.length ? `${Math.round(won.length / quotes.length * 100)}%` : '—'} trend={`${quotes.length} total`} dir="up" tone="purple" icon={<IconFile/>} />
      </div>
      <Card title="Quote register" pad={false}
        action={<div className="flex gap-sm">{FILTERS.map(value =>
          <span key={value} className={`chip ${filter === value ? 'on' : ''}`} style={{ cursor:'pointer' }}
            onClick={() => setFilter(value)}>{value}</span>)}</div>}>
        {quoteTable(rows, `No quotations${filter !== 'All' ? ` in ${filter}` : ''}.`)}
      </Card>
      </>}

      {wa && <WhatsAppModal
        to={{ phone: wa.commercial?.client_phone || phoneFor(wa.client_name), name: wa.client_name }}
        message={quoteMessage({
          client: greetFor(wa.client_name), product: wa.product,
          quoteNumber: wa.quote_number, total: wa.total,
          depositPercent: wa.deposit_percent,
        })}
        attachment={`${wa.quote_number}.pdf`}
        onClose={() => setWa(null)}
        onSent={() => setQuoteStatus(wa.quote_number, 'Sent')
          .then(async () => {
            await refreshLists()
            if (wa.project_id && String(wa.project_id) === String(projectId)) {
              setWorkflow(await getProjectWorkflow(projectId))
            }
            fire(`Quote ${wa.quote_number} marked Sent`)
          })
          .catch(error => fire(`⚠️ ${messageFrom(error)}`))}/>}

      {toast && <div className="toast">{toast}</div>}
    </>
  )
}
