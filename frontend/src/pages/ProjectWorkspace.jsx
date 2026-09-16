import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import Configurator from '../components/configurator/Configurator.jsx'
import WhatsAppModal from '../components/WhatsAppModal.jsx'
import { Badge, Card, Progress } from '../components/ui.jsx'
import {
  downloadDeliveryNote, downloadProjectMaterialBOQ,
  downloadProjectQuoteSummary, downloadProjectCuttingList, downloadQuotationPdf,
  drawingFileUrl, getProjectQuoteSummary, getProjectWorkflow, setQuoteWorkspaceStatus,
  listDesigns, previewDesignPrice, saveDesign,
} from '../lib/api.js'
import { useLiveRefresh } from '../lib/live.js'
import { GHS0, quoteMessage, timeAgo } from '../lib/whatsapp.js'
import {
  IconCheck, IconClock, IconCopy, IconCube, IconDownload, IconFactory,
  IconFile, IconLayers, IconPlus, IconWallet,
  IconWhatsApp,
} from '../components/icons.jsx'
import '../styles/ops.css'
import '../styles/project-workspace.css'

const ALERT_TONE = { critical:'red', warning:'orange', info:'blue' }

const PROJECT_TABS = [
  ['overview', 'Overview', IconLayers],
  ['design', 'Design', IconCube],
  ['pricing', 'Pricing', IconWallet],
  ['production', 'Production', IconFactory],
  ['documents', 'Documents', IconFile],
]

const QUOTE_TABS = [
  ['documents', 'Documents', IconFile],
  ['design', 'Design', IconCube],
  ['pricing', 'Pricing', IconWallet],
  ['report', 'Report', IconFile],
]

function messageFrom(error) {
  return String(error?.message || error || 'Unable to load project')
    .replace(/^API \d+:\s*/, '')
}

function quoteTone(status) {
  if (status === 'Accepted') return 'green'
  if (status === 'Declined') return 'red'
  if (status === 'Sent') return 'blue'
  return 'orange'
}

function currentQuotePosition(project) {
  const quotes = (project.items || [])
    .map(item => item.quotes?.at(-1))
    .filter(Boolean)
  if (!project.items?.length || quotes.length !== project.items.length) {
    return { status:'Not ready', ready:false, quotes }
  }
  if (quotes.every(quote => ['Accepted', 'Approved'].includes(quote.status))) {
    return { status:'Accepted', ready:true, quotes }
  }
  if (quotes.every(quote => quote.status === 'Declined')) {
    return { status:'Declined', ready:true, quotes }
  }
  if (quotes.every(quote => quote.status === 'Sent')) {
    return { status:'Sent', ready:true, quotes }
  }
  return { status:'Draft', ready:true, quotes }
}

function documentBusyKey(document) {
  if (document.kind === 'project_quote') return 'project-quote'
  if (document.kind === 'project_boq') return 'project-boq'
  if (document.kind === 'project_cutting') return 'project-cutting'
  if (document.kind === 'quotation') return `quote-${document.quote_number}`
  if (document.kind === 'delivery') return `delivery-${document.job_number}`
  return ''
}

export default function ProjectWorkspace() {
  const { projectId } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const [workflow, setWorkflow] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')
  const [whatsAppOpen, setWhatsAppOpen] = useState(false)
  const [decision, setDecision] = useState('')
  const [lostReason, setLostReason] = useState('')

  // Pricing tab — one item's cost breakdown open for review/edit at a time.
  const [designs, setDesigns] = useState([])
  const [pricingItemId, setPricingItemId] = useState(null)
  const [pricingPage, setPricingPage] = useState('cost')
  const [pricingDraft, setPricingDraft] = useState(null)
  const [pricingPreview, setPricingPreview] = useState(null)
  const [newLineDesc, setNewLineDesc] = useState('')
  const [newLineAmount, setNewLineAmount] = useState('')
  // Selling Price shows every item combined, not just the one open above —
  // clicking through items one at a time to see the client-facing total
  // doesn't scale past a couple of items.
  const [projectQuoteSummary, setProjectQuoteSummary] = useState(null)

  const refresh = () => {
    setError('')
    return getProjectWorkflow(projectId).then(setWorkflow)
      .catch(error => setError(messageFrom(error)))
  }
  const refreshDesigns = () => listDesigns()
    .then(rows => setDesigns(rows.filter(row => String(row.project_id) === String(projectId))))
    .catch(() => {})

  useEffect(() => { refresh() }, [projectId])
  useEffect(() => { refreshDesigns() }, [projectId])
  useLiveRefresh(refresh)

  useEffect(() => {
    if (!pricingItemId || !pricingDraft) return
    const rec = designs.find(row => row.id === pricingItemId)
    if (!rec) return
    let cancelled = false
    previewDesignPrice(rec.client_name || '', {
      ...rec.design, ...pricingDraft, projectId: rec.project_id || null,
    }).then(result => { if (!cancelled) setPricingPreview(result) }).catch(() => {})
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pricingItemId, pricingDraft, designs])

  function togglePricing(item) {
    if (pricingItemId === item.id) return
    const rec = designs.find(row => row.id === item.id)
    setPricingItemId(item.id)
    setPricingPage('cost')
    setPricingPreview(null)
    setNewLineDesc(''); setNewLineAmount('')
    setPricingDraft(rec ? {
      discountPercent: rec.design.discountPercent ?? 0,
      getfNhisPercent: rec.design.getfNhisPercent ?? 5,
      vatPercent: rec.design.vatPercent ?? 15,
      extraLines: rec.design.extraLines || [],
      pricingMode: rec.design.pricingMode || 'auto',
      manualSellingPrice: rec.design.manualSellingPrice || 0,
      materialPriceOverrides: rec.design.materialPriceOverrides || {},
      accessoryOverrides: rec.design.accessoryOverrides || [],
    } : null)
  }
  const changePricingField = (key, value) =>
    setPricingDraft(current => ({ ...current, [key]:value }))
  const togglePricingMode = () => setPricingDraft(current => {
    const pricingMode = current.pricingMode === 'manual' ? 'auto' : 'manual'
    const manualSellingPrice = pricingMode === 'manual' && !current.manualSellingPrice
      ? (pricingPreview?.grand_total || 0) : current.manualSellingPrice
    return { ...current, pricingMode, manualSellingPrice }
  })
  // Trialco rows (identified by a stable `id`, unlike other Frame systems'
  // rows) price the client from a cost-plus model, so their edits go through
  // the existing accessoryOverrides mechanism to actually move the bill.
  // Every other Frame system prices the client from a fixed GHS/m² rate
  // card, so their edits stay internal-only (Cost Heads visibility).
  const isRowManual = row => row.price_source === 'manual' || row.fixed_price === false
  const changeMaterialOverride = (row, value) => {
    const unitPrice = Number(value)
    if (row.id) {
      setPricingDraft(current => ({
        ...current,
        accessoryOverrides:[...(current.accessoryOverrides || []).filter(o => o.code !== row.code),
          { code:row.code, qty:row.quantity, unit_price:unitPrice, name:row.description }],
      }))
    } else {
      setPricingDraft(current => ({
        ...current, materialPriceOverrides:{ ...current.materialPriceOverrides, [row.code]:unitPrice },
      }))
    }
  }
  const resetMaterialOverride = row => {
    if (row.id) {
      setPricingDraft(current => ({
        ...current, accessoryOverrides:(current.accessoryOverrides || []).filter(o => o.code !== row.code),
      }))
    } else {
      setPricingDraft(current => {
        const next = { ...current.materialPriceOverrides }
        delete next[row.code]
        return { ...current, materialPriceOverrides:next }
      })
    }
  }
  const addPricingLine = () => {
    const amount = Number(newLineAmount)
    if (!newLineDesc.trim() || !Number.isFinite(amount) || amount === 0) return
    setPricingDraft(current => ({
      ...current, extraLines:[...(current.extraLines || []), { description:newLineDesc.trim(), amount }],
    }))
    setNewLineDesc(''); setNewLineAmount('')
  }
  const removePricingLine = index => setPricingDraft(current => ({
    ...current, extraLines:current.extraLines.filter((_, i) => i !== index),
  }))
  const savePricing = () => {
    const rec = designs.find(row => row.id === pricingItemId)
    if (!rec || !pricingDraft) return
    run(`pricing-${pricingItemId}`, async () => {
      await saveDesign(rec.client_name || '', {
        ...rec.design, ...pricingDraft, projectId: rec.project_id || null,
      })
      await refreshDesigns()
      await refresh()
    }, 'Pricing saved to this item.')
  }

  const workspace = workflow?.workspace
  const quoteMode = searchParams.get('mode') === 'quote'
  const activeTabs = quoteMode ? QUOTE_TABS : PROJECT_TABS
  const tab = activeTabs.some(([key]) => key === searchParams.get('tab'))
    ? searchParams.get('tab') : quoteMode ? 'design' : 'overview'
  // the design board stays a drawing surface: no work-area tabs, no quotation
  // decisions, and the drawing owns the whole window
  const designBoard = quoteMode && tab === 'design'

  useEffect(() => {
    document.body.classList.toggle('design-board', designBoard)
    return () => document.body.classList.remove('design-board')
  }, [designBoard])

  useEffect(() => {
    if (!quoteMode || tab !== 'pricing') return
    let cancelled = false
    getProjectQuoteSummary(projectId).then(result => {
      if (!cancelled) setProjectQuoteSummary(result)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [quoteMode, tab, projectId, designs])

  useEffect(() => {
    if (!quoteMode || tab !== 'pricing' || pricingItemId) return
    const items = workflow?.project?.items || []
    const first = items.find(item => designs.some(row => row.id === item.id))
    if (first) togglePricing(first)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteMode, tab, pricingItemId, workflow, designs])

  function updateContext(values) {
    const next = new URLSearchParams(searchParams)
    Object.entries(values).forEach(([key, value]) => {
      if (value) next.set(key, value)
      else next.delete(key)
    })
    setSearchParams(next)
  }

  async function copyClientLink() {
    if (!project.share_token) { setError('No shareable link for this project yet'); return }
    const url = `${window.location.origin}/share/quote/${project.share_token}`
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      window.prompt('Copy this link:', url)
      return
    }
    setMessage('Client approval link copied')
  }

  async function run(key, action, success) {
    setBusy(key)
    setMessage('')
    setError('')
    try {
      await action()
      setMessage(success)
      return true
    } catch (error) {
      setError(messageFrom(error))
      return false
    } finally {
      setBusy('')
    }
  }

  async function recordQuoteDecision(status, reason = '') {
    const saved = await run(`quote-${status.toLowerCase()}`, async () => {
      await setQuoteWorkspaceStatus(projectId, status, reason)
      await refresh()
    }, status === 'Accepted'
      ? 'Client acceptance recorded. The project is now awaiting payment.'
      : status === 'Declined'
        ? 'Client decision recorded with its lost reason.'
        : 'Project quotation marked as sent.')
    if (saved) {
      setDecision('')
      setLostReason('')
    }
  }

  function downloadDocument(document) {
    if (document.kind === 'project_quote') {
      return run('project-quote', () => downloadProjectQuoteSummary(projectId),
        'Project quotation downloaded.')
    }
    if (document.kind === 'project_boq') {
      return run('project-boq', () => downloadProjectMaterialBOQ(projectId),
        'Project material and BOQ pack downloaded.')
    }
    if (document.kind === 'project_cutting') {
      return run('project-cutting', () => downloadProjectCuttingList(projectId),
        'Project cutting and bundle pack downloaded.')
    }
    if (document.kind === 'quotation') {
      return run(`quote-${document.quote_number}`,
        () => downloadQuotationPdf(document.quote_number),
        `${document.quote_number} downloaded.`)
    }
    if (document.kind === 'delivery') {
      return run(`delivery-${document.job_number}`,
        () => downloadDeliveryNote(document.job_number),
        `${document.label} downloaded.`)
    }
  }

  if (!workflow && !error) return (
    <div className="project-workspace-loading">
      <IconLayers/><b>Loading the complete project position…</b>
    </div>
  )

  if (!workflow) return (
    <Card className="project-workspace-error">
      <h2>Project workspace unavailable</h2>
      <p>{error}</p>
      <button className="btn btn-primary" onClick={refresh}>Try again</button>
    </Card>
  )

  const { header, commercial, next_action:nextAction, rollups } = workspace
  const project = workflow.project
  const currentQuote = project.quotes?.at(-1)
  const quotePosition = currentQuotePosition(project)
  const firstJobNumber = quotePosition.quotes.find(quote => quote.job_number)?.job_number
  // commercial.contract_value is the one figure that always includes the
  // project-wide labour line (see _project_client_quote_totals) — project.total
  // is just the sum of each item's own price, which excludes it.
  const quoteValue = commercial.contract_value
  const quoteQuantity = quoteMode
    ? project.items.reduce((sum, item) => sum + Number(item.qty || 1), 0)
    : rollups.items.total_qty

  return (
    <>
      {/* the project carries its own chrome: the application sidebar and topbar
          step aside so design, pricing and documents are work areas of this job,
          not separate destinations you navigate away to */}
      {/* on the design board only the project name stays, and it is the way
          back to the quotation — the drawing takes the rest of the window */}
      <header className={designBoard ? 'project-bar slim' : 'project-bar'}>
        {designBoard ? <button type="button" className="project-bar-name"
          title="Back to the quotation" onClick={() => updateContext({ tab:'pricing' })}>
          ‹ {header.name}
        </button> : <>
          <Link to={quoteMode ? '/quotations' : '/projects'} className="project-bar-back">‹ Back</Link>
          <div className="project-bar-id">
            <b>{header.name}</b>
            <small>{header.project_number} · {header.client_name}
              {quoteMode && ` · ${currentQuote?.quote_number || 'Automatic draft pending'}`}
            </small>
          </div>
          <nav className="project-tabs">
            {activeTabs.map(([key, label, Icon]) => (
              <button key={key} className={tab === key ? 'active' : ''}
                onClick={() => updateContext({ tab:key === (quoteMode ? 'design' : 'overview') ? '' : key })}>
                <Icon/>{label}
              </button>
            ))}
          </nav>
          <div className="project-bar-total">
            <span><IconWallet/></span>
            <div>
              <b>{GHS0(quoteValue)}</b>
              <small>{quoteQuantity} unit{quoteQuantity === 1 ? '' : 's'}</small>
            </div>
          </div>
          <Badge tone="blue">{header.status_label}</Badge>
        </>}
      </header>

      {message && <div className="project-workspace-notice success">✓ {message}</div>}
      {error && <div className="project-workspace-notice error">⚠ {error}</div>}

      {quoteMode && !designBoard && tab !== 'pricing' && <section className="quote-lifecycle-bar">
        <div className="quote-lifecycle-state">
          <span>Project quotation</span>
          <div><Badge tone={quoteTone(quotePosition.status)}>{quotePosition.status}</Badge>
            <small>{quotePosition.ready
              ? `${quotePosition.quotes.length} current item quote${quotePosition.quotes.length === 1 ? '' : 's'}`
              : 'Save every design to generate the quotation'}</small></div>
        </div>
        <div className="quote-lifecycle-actions">
          <button type="button" className="btn btn-ghost btn-sm"
            disabled={!quotePosition.ready || !!busy}
            onClick={() => run('project-quote', () => downloadProjectQuoteSummary(projectId),
              'Project quotation downloaded.')}>
            <IconDownload/> PDF
          </button>
          <button type="button" className="btn btn-ghost btn-sm"
            disabled={!quotePosition.ready} onClick={copyClientLink}>
            <IconCopy/> Copy client link
          </button>
          {!['Accepted', 'Declined'].includes(quotePosition.status) && <button
            type="button" className="btn btn-ghost btn-sm quote-whatsapp"
            disabled={!quotePosition.ready || !!busy}
            onClick={() => setWhatsAppOpen(true)}>
            <IconWhatsApp/> {quotePosition.status === 'Sent' ? 'Resend' : 'Send'}
          </button>}
          {!['Accepted', 'Declined'].includes(quotePosition.status) && <button
            type="button" className="btn btn-primary btn-sm"
            disabled={!quotePosition.ready || !!busy}
            onClick={() => setDecision('Accepted')}>Client accepted</button>}
          {!['Accepted', 'Declined'].includes(quotePosition.status) && <button
            type="button" className="btn btn-ghost btn-sm quote-decline"
            disabled={!quotePosition.ready || !!busy}
            onClick={() => setDecision('Declined')}>Lost</button>}
          {['Sent', 'Declined'].includes(quotePosition.status) && <button
            type="button" className="btn btn-ghost btn-sm"
            onClick={() => {
              updateContext({ tab:'' })
              setMessage('Update the design and save it. A new draft revision will be generated automatically.')
            }}>Revise quote</button>}
          {quotePosition.status === 'Accepted' && firstJobNumber && <Link
            className="btn btn-primary btn-sm" to={`/accounts?job=${firstJobNumber}`}>
            Record payment →
          </Link>}
        </div>
      </section>}

      {tab === 'design' && <div className="project-design-area">
        <Configurator projectId={projectId} embedded/>
      </div>}

      {quoteMode && tab === 'pricing' && (() => {
        if (!project.items.length) {
          return <Card
            title={`Pricing — ${header.project_number}`}
            sub="Draft quotations are calculated automatically from each saved design's measurements and configured rates.">
            <div className="quote-workspace-empty">
              Add a design and save its width and height. Pricing and the draft quotation will appear here automatically.
            </div>
          </Card>
        }

        const selectedItem = project.items.find(item => item.id === pricingItemId) || project.items[0]
        const selectedRec = designs.find(row => row.id === selectedItem.id)
        const ready = selectedRec && pricingDraft && pricingItemId === selectedItem.id

        return <Card
          title={`Pricing — ${header.project_number}`}
          sub="Draft quotations are calculated automatically from each saved design's measurements and configured rates. Selling Price combines every item; the other tabs are that item's own working estimate.">
          <div className="quote-workspace-summary">
            <span><small>Design items</small><b>{project.item_count}</b></span>
            <span><small>Total quantity</small><b>{quoteQuantity}</b></span>
            <span><small>Current quote value</small><b>{GHS0(commercial.contract_value)}</b></span>
          </div>

          <nav className="pricing-item-tabs">
            {project.items.map(item => {
              const rec = designs.find(row => row.id === item.id)
              return <button key={item.id} type="button" disabled={!rec}
                className={selectedItem.id === item.id ? 'active' : ''}
                onClick={() => togglePricing(item)}>
                <b>{item.ref || item.name}</b>
                <small>{item.qty} unit{item.qty === 1 ? '' : 's'} · {GHS0(item.total)}</small>
              </button>
            })}
          </nav>

          {!ready || !pricingPreview ? <div className="quote-empty">Calculating…</div> : <div className="pricing-layout">
            <nav className="pricing-subnav">
              <button className={pricingPage === 'cost' ? 'active' : ''} onClick={() => setPricingPage('cost')}>Cost Heads</button>
              <button className={pricingPage === 'materials' ? 'active' : ''} onClick={() => setPricingPage('materials')}>Material List</button>
              <button className={pricingPage === 'selling' ? 'active' : ''} onClick={() => setPricingPage('selling')}>Selling Price</button>
              {pricingPreview.client_lines && <button className={pricingPage === 'terms' ? 'active' : ''} onClick={() => setPricingPage('terms')}>Terms</button>}
            </nav>

            <div className="pricing-page">
              {pricingPage === 'cost' && <>
                <h5>Cost structure (internal) — {selectedItem.ref || selectedItem.name}</h5>
                <div className="tbl-wrap"><table className="tbl">
                  <thead><tr><th>Cost head</th><th>Detail</th><th style={{ textAlign:'right' }}>Amount</th></tr></thead>
                  <tbody>
                    {(pricingPreview.lines || []).map((line, i) => <tr key={i}>
                      <td>{line.key}</td>
                      <td className="t-muted">{line.detail}</td>
                      <td className="t-mono" style={{ textAlign:'right' }}>{GHS0(line.amount)}</td>
                    </tr>)}
                    <tr>
                      <td><b>Margin</b></td>
                      <td className="t-muted">{pricingPreview.margin_pct || 0}% markup</td>
                      <td className="t-mono" style={{ textAlign:'right' }}><b>{GHS0(pricingPreview.margin)}</b></td>
                    </tr>
                  </tbody>
                </table></div>
              </>}

              {pricingPage === 'materials' && <>
                <h5>Material list — {selectedItem.ref || selectedItem.name}</h5>
                <p className="quote-help">
                  {pricingPreview.pricing_model === 'cost-plus'
                    ? 'Editing a unit price here changes what the client is billed (this system is priced material cost + margin).'
                    : 'Editing a unit price here updates the cost breakdown above for accuracy — this system bills from a fixed GHS/m² rate, so it does not change the client total.'}
                </p>
                <div className="tbl-wrap"><table className="tbl">
                  <thead><tr><th>Material</th><th>Code</th><th>Qty</th><th>Unit</th><th>Unit price</th><th style={{ textAlign:'right' }}>Total</th><th aria-label="Status"/></tr></thead>
                  <tbody>
                    {(pricingPreview.material_rows || []).map((row, i) => <tr key={i}>
                      <td><b>{row.description}</b>
                        {(row.note || row.formula) && <small className="t-muted" style={{ display:'block' }}>{row.note || row.formula}</small>}
                      </td>
                      <td className="t-mono">{row.code || '—'}</td>
                      <td>{row.quantity}</td>
                      <td>{row.unit}</td>
                      <td className="t-mono">
                        {row.code
                          ? <input type="number" min="0" step="0.01" className="material-price-input"
                              value={(row.id
                                ? pricingDraft.accessoryOverrides.find(o => o.code === row.code)?.unit_price
                                : pricingDraft.materialPriceOverrides[row.code]) ?? row.unit_price}
                              onChange={event => changeMaterialOverride(row, Number(event.target.value))}/>
                          : GHS0(row.unit_price)}
                      </td>
                      <td className="t-mono" style={{ textAlign:'right' }}><b>{GHS0(row.total)}</b></td>
                      <td>
                        {isRowManual(row) ? <>
                          <Badge tone="purple">Manual</Badge>
                          <button className="material-price-reset" title="Use system price"
                            onClick={() => resetMaterialOverride(row)}>reset</button>
                        </> : row.code ? <Badge tone="blue">Auto</Badge> : null}
                      </td>
                    </tr>)}
                    {!(pricingPreview.material_rows || []).length && <tr><td colSpan={7} className="t-muted">No itemized material list for this system yet — cost heads above are the working estimate.</td></tr>}
                  </tbody>
                </table></div>
              </>}

              {pricingPage === 'selling' && (
                !projectQuoteSummary ? <div className="quote-empty">Calculating…</div> : <>
                  <h5>Selling price — every item in this project</h5>
                  <div className="tbl-wrap"><table className="tbl">
                    <thead><tr><th>Item</th><th>Location</th><th>Qty</th><th style={{ textAlign:'right' }}>Total</th></tr></thead>
                    <tbody>
                      {projectQuoteSummary.items.map(item => <tr key={item.id}>
                        <td><b>{item.ref || item.name}</b><small className="t-muted" style={{ display:'block' }}>{item.name}</small></td>
                        <td className="t-muted">{item.location || '—'}</td>
                        <td>{item.qty}</td>
                        <td className="t-mono" style={{ textAlign:'right' }}><b>{GHS0(item.total)}</b></td>
                      </tr>)}
                      <tr>
                        <td><b>Labour</b><small className="t-muted" style={{ display:'block' }}>Billed once for the whole project, not per item</small></td>
                        <td className="t-muted">{projectQuoteSummary.project_labour_area} m² total</td>
                        <td>—</td>
                        <td className="t-mono" style={{ textAlign:'right' }}><b>{GHS0(projectQuoteSummary.project_labour_with_margin)}</b></td>
                      </tr>
                    </tbody>
                  </table></div>
                  <div className="quote-total-card" style={{ marginTop:14 }}>
                    <div><span>Subtotal</span><b>{GHS0(projectQuoteSummary.client_subtotal)}</b></div>
                    <div><span>Discount</span><b>−{GHS0(projectQuoteSummary.discount_amount)}</b></div>
                    <div><span>GETF + NHIS</span><b>{GHS0(projectQuoteSummary.getf_nhis)}</b></div>
                    <div><span>VAT</span><b>{GHS0(projectQuoteSummary.vat)}</b></div>
                    <div className="grand"><span>Project grand total</span><b>{GHS0(projectQuoteSummary.client_grand_total)}</b></div>
                  </div>
                </>
              )}

              {pricingPage === 'terms' && pricingPreview.client_lines && <>
                <h5>Commercial terms — {selectedItem.ref || selectedItem.name}</h5>
                <div className="quote-terms-grid">
                  <label><span>Discount %</span><input type="number" min="0" max="100" value={pricingDraft.discountPercent} onChange={event => changePricingField('discountPercent', Number(event.target.value))} /></label>
                  <label><span>GETF + NHIS %</span><input type="number" min="0" max="100" value={pricingDraft.getfNhisPercent} onChange={event => changePricingField('getfNhisPercent', Number(event.target.value))} /></label>
                  <label><span>VAT %</span><input type="number" min="0" max="100" value={pricingDraft.vatPercent} onChange={event => changePricingField('vatPercent', Number(event.target.value))} /></label>
                </div>

                <h5>Additional cost lines</h5>
                {!!pricingDraft.extraLines.length && <div className="tbl-wrap"><table className="tbl">
                  <tbody>
                    {pricingDraft.extraLines.map((line, i) => <tr key={i}>
                      <td>{line.description}</td>
                      <td className="t-mono" style={{ textAlign:'right' }}>{GHS0(line.amount)}</td>
                      <td style={{ width:34 }}><button className="quote-line-remove" title="Remove line" onClick={() => removePricingLine(i)}>×</button></td>
                    </tr>)}
                  </tbody>
                </table></div>}
                <div className="pricing-add-line">
                  <input placeholder="e.g. Transport, packing" value={newLineDesc} onChange={event => setNewLineDesc(event.target.value)} />
                  <input type="number" step="0.01" placeholder="Amount GHS" value={newLineAmount} onChange={event => setNewLineAmount(event.target.value)} />
                  <button className="btn btn-ghost btn-sm" onClick={addPricingLine}><IconPlus/> Add line</button>
                </div>
              </>}

              {!pricingPreview.client_lines && pricingPage === 'terms' &&
                <p className="quote-help">Commercial-term editing and extra cost lines are available for Frame products. This item's family shows the computed cost breakdown as visibility only, for now.</p>}
            </div>

            <aside className="pricing-summary-sticky">
              <div className="quote-total-card">
                <div className="pricing-mode-row">
                  <Badge tone={pricingDraft.pricingMode === 'manual' ? 'purple' : 'blue'}>
                    {pricingDraft.pricingMode === 'manual' ? 'Manual' : 'Auto'}
                  </Badge>
                  <button className="pricing-mode-toggle" onClick={togglePricingMode}>
                    {pricingDraft.pricingMode === 'manual' ? 'Use system price' : 'Set price manually'}
                  </button>
                </div>
                {pricingPreview.client_lines ? <>
                  <div><span>Subtotal</span><b>{GHS0(pricingPreview.client_subtotal)}</b></div>
                  <div><span>Discount</span><b>−{GHS0(pricingPreview.discount_amount)}</b></div>
                  <div><span>GETF + NHIS</span><b>{GHS0(pricingPreview.getf_nhis)}</b></div>
                  <div><span>VAT</span><b>{GHS0(pricingPreview.vat)}</b></div>
                </> : <>
                  <div><span>Subtotal</span><b>{GHS0(pricingPreview.subtotal)}</b></div>
                  <div><span>Margin</span><b>{GHS0(pricingPreview.margin)}</b></div>
                </>}
                {pricingDraft.pricingMode === 'manual' ? (
                  <div className="grand pricing-manual-price">
                    <span>Selling price</span>
                    <input type="number" min="0" step="0.01" value={pricingDraft.manualSellingPrice}
                      onChange={event => changePricingField('manualSellingPrice', Number(event.target.value))} />
                  </div>
                ) : (
                  <div className="grand"><span>Grand total</span><b>{GHS0(pricingPreview.grand_total)}</b></div>
                )}
              </div>
              <button className="btn btn-primary btn-sm" disabled={busy === `pricing-${selectedItem.id}`}
                onClick={savePricing} style={{ width:'100%', marginTop:10 }}><IconCheck/> Save pricing</button>
            </aside>
          </div>}
        </Card>
      })()}

      {quoteMode && tab === 'documents' && <Card
        title={`Documents — ${header.project_number}`}
        sub="The client quotation is generated from the current saved project designs.">
        <div className="quote-workspace-actions">
          <button className="btn btn-primary" disabled={!project.items.length || !!busy}
            onClick={() => run('project-quote', () => downloadProjectQuoteSummary(projectId),
              'Project quotation downloaded.')}>
            <IconDownload/> Download project quotation
          </button>
          {project.quotes.map(quote => <button className="btn btn-ghost" key={quote.quote_number}
            disabled={!!busy} onClick={() => run(`quote-${quote.quote_number}`,
              () => downloadQuotationPdf(quote.quote_number), `${quote.quote_number} downloaded.`)}>
            <IconDownload/> {quote.quote_number}
          </button>)}
        </div>
        {!project.items.length && <div className="quote-workspace-empty">
          Documents become available after the first measured design is saved.
        </div>}
      </Card>}

      {quoteMode && tab === 'report' && <Card
        title={`Reports — ${header.project_number}`}
        sub="Essential commercial and factory reports stay inside this quote.">
        <div className="quote-workspace-actions">
          <button className="btn btn-primary" disabled={!project.items.length || !!busy}
            onClick={() => run('project-quote', () => downloadProjectQuoteSummary(projectId),
              'Project quotation downloaded.')}><IconDownload/> Quotation summary</button>
          <button className="btn btn-ghost" disabled={!project.items.length || !!busy}
            onClick={() => run('project-boq', () => downloadProjectMaterialBOQ(projectId),
              'Project material and BOQ pack downloaded.')}><IconDownload/> Material & BOQ</button>
          <button className="btn btn-ghost" disabled={!project.items.length || !!busy}
            onClick={() => run('project-cutting', () => downloadProjectCuttingList(projectId),
              'Project cutting and optimization report downloaded.')}><IconDownload/> Cutting optimization</button>
        </div>
      </Card>}

      {whatsAppOpen && <WhatsAppModal
        to={{ name:header.client_name, phone:project.client_phone }}
        message={quoteMessage({
          client:header.client_name,
          product:project.name,
          quoteNumber:currentQuote?.quote_number || header.project_number,
          total:quoteValue,
          depositPercent:commercial.deposit_percent,
          shareUrl:project.share_token
            ? `${window.location.origin}/share/quote/${project.share_token}` : '',
        })}
        attachment={`${header.project_number}-quotation.pdf`}
        onClose={() => setWhatsAppOpen(false)}
        onSent={() => recordQuoteDecision('Sent')}/>} 

      {decision && <div className="modal-back" role="presentation"
        onMouseDown={event => {
          if (event.target === event.currentTarget) setDecision('')
        }}>
        <section className="modal quote-decision-modal" role="dialog" aria-modal="true"
          aria-labelledby="quote-decision-title">
          <h4 id="quote-decision-title">
            {decision === 'Accepted' ? 'Record client acceptance' : 'Record lost quotation'}
          </h4>
          {decision === 'Accepted' ? <p>
            Confirm that {header.client_name} accepted the project quotation for {GHS0(quoteValue)}.
            Production jobs will open and Accounts will collect the required deposit.
          </p> : <label>Why was this quotation lost? <span className="req">*</span>
            <textarea autoFocus maxLength={160} rows={3} value={lostReason}
              placeholder="For example: price, delivery timeline, competitor, postponed project…"
              onChange={event => setLostReason(event.target.value)}/>
          </label>}
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost"
              onClick={() => setDecision('')}>Cancel</button>
            <button type="button"
              className={decision === 'Accepted' ? 'btn btn-primary' : 'btn btn-danger'}
              disabled={!!busy || (decision === 'Declined' && !lostReason.trim())}
              onClick={() => recordQuoteDecision(decision, lostReason)}>
              {busy ? 'Saving…' : decision === 'Accepted' ? 'Confirm acceptance' : 'Mark as lost'}
            </button>
          </div>
        </section>
      </div>}

      {!quoteMode && tab !== 'overview' && tab !== 'design' && <Card
        title={`${activeTabs.find(([key]) => key === tab)[1]} — ${header.project_number}`}
        sub="This work area still opens the department page. Moving it inside the project is the next step.">
        <div className="project-tab-links">
          {tab === 'pricing' && <>
            <Link className="btn btn-primary" to={`/projects/${projectId}?mode=quote&tab=pricing`}>Open quote pricing</Link>
          </>}
          {tab === 'production' && <>
            <Link className="btn btn-primary" to="/production">Factory board</Link>
            <Link className="btn btn-ghost" to={`/quality?scope=preproduction&project=${projectId}`}>Pre-production QC</Link>
            <Link className="btn btn-ghost" to="/dispatch">Dispatch & delivery</Link>
          </>}
          {tab === 'documents' && <>
            <Link className="btn btn-primary" to={`/reports?project=${projectId}`}>Project document pack</Link>
          </>}
        </div>
      </Card>}

      {tab === 'overview' && <>
      <section className="project-workspace-header">
        <div><span>Project owner</span><b>{header.owner || 'Not assigned'}</b></div>
        <div><span>Planned start</span><b>{header.planned_start || 'Not set'}</b></div>
        <div><span>Due date</span><b>{header.due_date || 'Not set'}</b></div>
        <div><span>Last activity</span><b>{header.last_activity ? timeAgo(header.last_activity) : 'No activity yet'}</b></div>
      </section>

      <div className="project-command-grid">
        <section className="project-next-action">
          <span className="project-command-icon"><IconClock/></span>
          <div>
            <small>Next action · {nextAction.responsible}</small>
            <h2>{nextAction.label}</h2>
            <p>{nextAction.blocking_reason || 'Continue the current project stage.'}</p>
          </div>
          <Link className="btn btn-primary" to={nextAction.url}>Open action →</Link>
        </section>

        <section className={`project-payment-card ${commercial.payment_gate_cleared ? 'clear' : 'hold'}`}>
          <div className="project-payment-head"><span><IconWallet/></span><Badge tone={commercial.payment_gate_cleared ? 'green' : 'purple'}>
            {commercial.payment_gate_cleared ? 'Gate cleared' : 'Payment hold'}
          </Badge></div>
          <small>Combined project contract</small>
          <h2>{GHS0(commercial.contract_value)}</h2>
          <div className="project-payment-values">
            <span>Paid <b>{GHS0(commercial.paid_amount)}</b></span>
            <span>Balance <b>{GHS0(commercial.outstanding_balance)}</b></span>
          </div>
          <Progress value={commercial.contract_value
            ? Math.min(100, commercial.paid_amount / commercial.contract_value * 100) : 0}/>
        </section>
      </div>

      <div className="project-rollups">
        <div><span>Project items</span><b>{rollups.items.count}</b><small>{rollups.items.total_qty} total units</small></div>
        <div><span>Approved E / R / F</span><b>{rollups.technical.approved_extractions} / {rollups.technical.approved_drawings} / {rollups.technical.factory_releases}</b><small>of {rollups.items.count} items</small></div>
        <div><span>Procurement</span><b>{rollups.procurement.shortage_count}</b><small>material lines needing action</small></div>
        <div><span>Production</span><b>{rollups.production.average_progress}%</b><small>{rollups.production.completed_jobs} of {rollups.production.job_count} jobs complete</small></div>
        <div><span>Quality</span><b>{rollups.quality.passed}</b><small>{rollups.quality.rework} in rework</small></div>
        <div><span>Delivery</span><b>{rollups.delivery.completed}/{rollups.delivery.total}</b><small>jobs delivered</small></div>
      </div>

      {!!workspace.alerts.length && <Card title="Project alerts" sub="Operational issues derived from the current project records." className="project-alerts-card">
        <div className="project-alert-list">
          {workspace.alerts.map((alert, index) => <div key={`${alert.title}-${index}`} className={alert.severity}>
            <Badge tone={ALERT_TONE[alert.severity] || 'blue'}>{alert.severity}</Badge>
            <div><b>{alert.title}</b><span>{alert.detail}</span></div>
          </div>)}
        </div>
      </Card>}

      <div className="project-bottom-grid">
        <Card title="Current documents" sub="Only the current project and item outputs belong here.">
          <div className="project-documents">
            {workspace.documents.current.map((document, index) => (
              <div key={`${document.kind}-${document.label}-${index}`}>
                <span><IconFile/></span>
                <div><b>{document.label}</b><small>{document.scope}</small></div>
                {document.kind === 'item_reports'
                  ? <Link to={`/reports?project=${projectId}&item=${document.design_id}`}>Open →</Link>
                  : document.download_url
                    ? <a href={drawingFileUrl(document.download_url)} target="_blank" rel="noreferrer">View →</a>
                    : <button disabled={!!busy} onClick={() => downloadDocument(document)}>
                        <IconDownload/>{busy === documentBusyKey(document) ? 'Preparing…' : 'PDF'}
                      </button>}
              </div>
            ))}
            {!workspace.documents.current.length && <div className="project-workspace-empty">No current documents yet.</div>}
          </div>
          {!!workspace.documents.audit.length && <details className="project-audit-documents">
            <summary>Superseded audit documents ({workspace.documents.audit.length})</summary>
            {workspace.documents.audit.map((document, index) => <div key={`${document.label}-${index}`}>
              <div><b>{document.label}</b><span>{document.scope}</span></div>
              {document.download_url && <a href={drawingFileUrl(document.download_url)} target="_blank" rel="noreferrer">Audit copy</a>}
            </div>)}
          </details>}
        </Card>

        <Card title="Project activity" sub="Technical and factory activity in one chronological timeline.">
          <div className="project-timeline">
            {workspace.timeline.map(event => <div key={event.id}>
              <i className={event.kind}/>
              <p><b>{event.who}</b> {event.note}
                <span>{event.job_number ? `${event.job_number} · ` : ''}{event.at ? timeAgo(event.at) : ''}</span>
              </p>
            </div>)}
            {!workspace.timeline.length && <div className="project-workspace-empty">No project activity recorded yet.</div>}
          </div>
        </Card>
      </div>
      </>}
    </>
  )
}
