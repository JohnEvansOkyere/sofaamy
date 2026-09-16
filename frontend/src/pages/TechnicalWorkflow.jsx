import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { PageHead, Card, Badge } from '../components/ui.jsx'
import {
  listProjects, getProjectWorkflow, updateProjectWorkflow,
  createExtraction, generateExtractionFromDesign,
  downloadQuotationPdf, assignExtractionsToItem,
  createDrawingTask, approveExistingConfiguratorDesign,
  createDrawingRevision, uploadDrawingFile,
  submitProjectToQc,
  drawingFileUrl,
} from '../lib/api.js'
import { GHS0, timeAgo } from '../lib/whatsapp.js'
import { useLiveRefresh } from '../lib/live.js'
import { FRAME_SYSTEMS } from '../lib/frameCatalog.js'
import { IconCheck, IconDownload, IconFile, IconLayers, IconPlus } from '../components/icons.jsx'
import '../styles/technical-workflow.css'

const systemLabel = system => FRAME_SYSTEMS[system]?.label || ''

const EMPTY_ITEM = {
  code: '', material: '', category: 'Material', quantity: 1,
  unit: 'pcs', unit_price: 0, source: 'manual', notes: '',
}

const FAMILY_LABEL = {
  frame: 'Frame', frameless: 'Frameless',
  balustrade: 'Balustrade', other: 'Other technical work',
}

const FILE_KINDS = [
  ['source_dwg', 'Source DWG'],
  ['client_overview', 'Client overview PDF'],
  ['factory_breakdown', 'Factory breakdown PDF'],
  ['cutting_list', 'Cutting / glass list'],
  ['material_list', 'Material list'],
  ['other', 'Other technical file'],
]

const PROCUREMENT_STATUS = {
  available: 'Available',
  purchase_required: 'Purchase required',
  missing_code: 'Missing stock code',
  not_in_inventory: 'Not in inventory',
  unit_mismatch: 'Unit mismatch',
}

const PIPELINE_PHASES = [
  {
    key: 'setup', label: 'Measurement', page: 'extraction',
    statuses: ['measurement_received'],
    description: 'Site measurement received',
  },
  {
    key: 'extraction', label: 'Extraction', page: 'extraction',
    statuses: ['extraction_in_progress', 'extraction_ready'],
    description: 'Materials and quantities approved',
  },
  {
    key: 'commercial', label: 'Commercial gate', page: 'commercial',
    statuses: ['quote_in_preparation', 'quote_sent', 'awaiting_payment'],
    description: 'Quote accepted and payment cleared',
  },
  {
    key: 'drawing', label: 'Drawing approval', page: 'drawings',
    statuses: ['drawing_authorized', 'drawing_in_progress', 'drawing_under_review', 'client_overview_sent'],
    description: 'Current technical revision approved',
  },
  {
    key: 'production', label: 'Factory release', page: 'drawings',
    statuses: ['drawing_approved', 'production_pack_ready', 'released_to_factory'],
    description: 'Approved pack released',
  },
]

const TECHNICAL_PAGES = [
  ['extraction', 'Extraction'],
  ['commercial', 'Commercial Gate'],
  ['drawings', 'Drawings'],
  ['activity', 'Activity'],
]

function pageForStatus(status) {
  return PIPELINE_PHASES.find(phase => phase.statuses.includes(status))?.page || 'extraction'
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

function Field({ label, children }) {
  return <label className="tw-field"><span>{label}</span>{children}</label>
}

function WorkflowTrack({ stages, onSelect }) {
  const currentStage = stages.find(stage => stage.current) || stages[0]
  const currentPhaseIndex = Math.max(0, PIPELINE_PHASES.findIndex(
    phase => phase.statuses.includes(currentStage?.key)))
  const workflowComplete = currentStage?.key === 'released_to_factory'
  return (
    <div className="tw-track" aria-label="Technical project workflow">
      {PIPELINE_PHASES.map((phase, index) => {
        const current = index === currentPhaseIndex && !workflowComplete
        const complete = index < currentPhaseIndex
          || (workflowComplete && index === currentPhaseIndex)
        return (
          <button type="button" onClick={() => onSelect(phase.page)}
            className={`tw-step ${complete ? 'done' : ''} ${current ? 'current' : ''}`} key={phase.key}>
            <i>{complete ? '✓' : index + 1}</i>
            <span>
              <b>{phase.label}</b>
              <small>{current ? currentStage?.label : phase.description}</small>
            </span>
          </button>
        )
      })}
    </div>
  )
}

function ChainIntegrity({ workflow }) {
  const integrity = workflow.integrity || {}
  const warnings = integrity.warnings || []
  const currentRelease = workflow.production_releases.find(
    row => row.status === 'current')
  const aligned = Boolean(
    integrity.approved_extraction_revision
    && integrity.current_quote_number
    && currentRelease)
  return (
    <div className={`tw-integrity ${warnings.length ? 'warning' : aligned ? 'aligned' : 'pending'}`}>
      <div>
        <b>{warnings.length
          ? 'Revision alignment requires attention'
          : aligned ? 'Current revision chain aligned' : 'Revision chain in progress'}</b>
        <span>
          {integrity.approved_extraction_revision
            ? `E${integrity.approved_extraction_revision}`
            : 'No approved extraction'}
          {' → '}
          {integrity.current_quote_number || 'quotation pending'}
          {' → '}
          {currentRelease?.release_number || 'factory release pending'}
        </span>
      </div>
      {!!warnings.length && <ul>{warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>}
    </div>
  )
}

function ExtractionEditor({ project, designId, isUngrouped, seed, onSeedUsed, onSaved, busy, act }) {
  const [notes, setNotes] = useState('')
  const [showManualEntry, setShowManualEntry] = useState(false)
  const [items, setItems] = useState([{ ...EMPTY_ITEM }])

  useEffect(() => {
    setShowManualEntry(false)
  }, [project.id, designId, isUngrouped])

  useEffect(() => {
    if (!seed) return
    setShowManualEntry(true)
    setNotes(`Edited from extraction E${seed.revision}.`)
    setItems(seed.items.map(item => ({
      code: item.code || '',
      material: item.material,
      category: item.category || 'Material',
      quantity: item.quantity,
      unit: item.unit || 'pcs',
      unit_price: item.unit_price || 0,
      source: 'manual',
      notes: item.notes || '',
    })))
  }, [seed])

  const change = (index, key, value) =>
    setItems(rows => rows.map((row, i) => i === index ? { ...row, [key]: value } : row))

  const save = () => act(async () => {
    const clean = items.filter(item => item.material.trim())
    const data = await createExtraction(project.id, {
      design_id: designId,
      method: 'manual',
      recipe_status: 'manual',
      notes,
      created_by: 'Technical Team',
      items: clean.map(item => ({
        ...item,
        quantity: Number(item.quantity),
        unit_price: Number(item.unit_price) || 0,
        source: 'manual',
      })),
    })
    setItems([{ ...EMPTY_ITEM }])
    setNotes('')
    setShowManualEntry(false)
    onSeedUsed?.()
    onSaved(data)
  }, 'Extraction revision created')

  return (
    <div className="tw-editor">
      {seed && <div className="tw-edit-banner">
        <div><b>Editing from E{seed.revision}</b><span>The original revision remains unchanged. Saving creates the next revision, marked Manual.</span></div>
        <button onClick={() => {
          setItems([{ ...EMPTY_ITEM }]); setNotes('')
          setShowManualEntry(false)
          onSeedUsed?.()
        }}>Cancel</button>
      </div>}
      {!isUngrouped && !seed && <div className="tw-generated-first">
        <div>
          <b>System-generated extraction</b>
          <span>The saved design creates the material rows automatically and they're ready to use right away — QC verifies materials before factory release.</span>
        </div>
        <button className="btn btn-primary" disabled={busy} onClick={() => act(async () => {
          const data = await generateExtractionFromDesign(project.id, {
            design_id: designId, created_by: 'Technical Team',
          })
          onSaved(data)
        }, 'Extraction generated from the configurator item')}>
          Generate material list
        </button>
        <button className="tw-exception-toggle" onClick={() => setShowManualEntry(value => !value)}>
          {showManualEntry ? 'Close manual entry' : 'Enter materials manually…'}
        </button>
      </div>}

      {(isUngrouped || seed || showManualEntry) && <>
      <p className="tw-help">Rows saved here are marked Manual, so anyone looking at this job can see it was set by a team member, not generated.</p>
      <div className="tw-extraction-rows">
        {items.map((item, index) => (
          <div className="tw-extraction-row" key={index}>
            <input placeholder="Code" value={item.code} onChange={e => change(index, 'code', e.target.value)} />
            <input className="tw-material" placeholder="Material / accessory" value={item.material} onChange={e => change(index, 'material', e.target.value)} />
            <input type="number" min="0.001" step="any" placeholder="Qty" value={item.quantity} onChange={e => change(index, 'quantity', e.target.value)} />
            <input placeholder="Unit" value={item.unit} onChange={e => change(index, 'unit', e.target.value)} />
            <input type="number" min="0" step="any" placeholder="Unit price" value={item.unit_price} onChange={e => change(index, 'unit_price', e.target.value)} />
            <button className="tw-remove" title="Remove row" onClick={() => setItems(rows => rows.length === 1 ? [{ ...EMPTY_ITEM }] : rows.filter((_, i) => i !== index))}>×</button>
          </div>
        ))}
      </div>
      <button className="btn btn-ghost btn-sm" onClick={() => setItems(rows => [...rows, { ...EMPTY_ITEM }])}>
        <IconPlus /> Add material
      </button>
      <textarea className="tw-notes" placeholder="Extraction assumptions, site conditions or technical notes" value={notes} onChange={e => setNotes(e.target.value)} />
      <div className="flex gap wrap">
        <button className="btn btn-primary" disabled={busy || !items.some(item => item.material.trim())} onClick={save}>
          Save extraction revision
        </button>
      </div>
      </>}
    </div>
  )
}

function ExtractionHistory({ extractions, procurement, onEdit, busy }) {
  if (!extractions.length) {
    return <div className="tw-empty">No extraction revision yet. Create one manually or generate it from a saved configurator item.</div>
  }
  return (
    <div className="tw-history">
      {extractions.some(row => row.status === 'approved') && (
        <>
          <div className="tw-approved-source">
            <div><b>Technical source</b><span>All new material quantities and downstream reports read the latest approved extraction. Pricing is handled on the Quotations page.</span></div>
          </div>
          <div className="tw-procurement">
            <div className="tw-revision-head">
              <div>
                <b>Stock and procurement requirement · E{procurement.extraction_revision}</b>
                <span>Required, available and shortfall quantities use the same approved extraction.</span>
              </div>
              <Badge tone={procurement.ready ? 'green' : 'orange'}>
                {procurement.ready
                  ? 'All tracked stock available'
                  : `${procurement.shortage_count} item${procurement.shortage_count === 1 ? '' : 's'} need attention`}
              </Badge>
            </div>
            <div className="tbl-wrap">
              <table className="tbl tw-mini-table">
                <thead><tr><th>Code</th><th>Material</th><th>Required</th><th>Available</th><th>Shortfall</th><th>Status</th></tr></thead>
                <tbody>{procurement.rows.map(item => (
                  <tr key={item.item_id}>
                    <td className="t-mono">{item.code || '—'}</td>
                    <td>{item.material}</td>
                    <td>{item.required} {item.unit}</td>
                    <td>{item.available} {item.unit}</td>
                    <td>{item.shortfall} {item.unit}</td>
                    <td><Badge tone={item.status === 'available' ? 'green' : 'orange'}>
                      {PROCUREMENT_STATUS[item.status] || item.status}
                    </Badge></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        </>
      )}
      {extractions.map(extraction => (
        <div className="tw-revision" key={extraction.id}>
          <div className="tw-revision-head">
            <div>
              <div className="flex gap-sm" style={{ alignItems:'center' }}>
                <b>E{extraction.revision}</b>
                <Badge tone={extraction.method === 'generated' ? 'blue' : 'purple'}>
                  {extraction.method === 'generated' ? 'Auto' : 'Manual'}
                </Badge>
              </div>
              <span>{extraction.items.length} material rows · by {extraction.created_by || 'Technical Team'}, {timeAgo(extraction.created_at)}</span>
            </div>
            <Badge tone={extraction.status === 'approved' ? 'green' : extraction.status === 'superseded' ? 'gray' : 'orange'}>{extraction.status}</Badge>
          </div>
          <div className="tbl-wrap">
            <table className="tbl tw-mini-table">
              <thead><tr><th>Code</th><th>Material</th><th>Quantity</th><th>Unit price</th></tr></thead>
              <tbody>{extraction.items.map(item => (
                <tr key={item.id}>
                  <td className="t-mono">{item.code || '—'}</td>
                  <td>{item.material}</td>
                  <td>{item.quantity}{item.unit ? ` ${item.unit}` : ''}</td>
                  <td className="t-mono">{GHS0(item.unit_price)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          {extraction.notes && <p className="tw-revision-note">{extraction.notes}</p>}
          <div className="flex gap-sm wrap">
            <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => onEdit(extraction)}>
              Duplicate & Edit
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

function QuotationHandoff({ workflow, busy, act }) {
  const items = workflow.items || []
  const multiItem = items.length > 1
  const itemLabel = designId => {
    const item = items.find(row => row.design_id === designId)
    if (!item) return designId === null ? 'Ungrouped' : `Item ${designId}`
    return item.design_id === null ? 'Ungrouped (legacy)' : (item.ref || item.name)
  }
  const anyApproved = items.some(item =>
    workflow.item_summary[item.design_id === null ? 'null' : String(item.design_id)]
      ?.approved_extraction_revision != null)

  return (
    <div>
      {multiItem && <div className="tw-item-status-list">
        {items.map(item => {
          const summary = workflow.item_summary[
            item.design_id === null ? 'null' : String(item.design_id)] || {}
          return (
            <div key={item.design_id ?? 'ungrouped'} className="flex gap-sm wrap" style={{ marginBottom: 6 }}>
              <b>{itemLabel(item.design_id)}</b>
              {summary.approved_extraction_revision
                ? <Badge tone="green">E{summary.approved_extraction_revision} approved</Badge>
                : <Badge tone="orange">No approved extraction</Badge>}
            </div>
          )
        })}
      </div>}
      {anyApproved ? <div className="tw-editor tw-handoff-only">
        <div>
          <b>Approved for quotation</b>
          <span>{multiItem
            ? 'Open the quotation workbench to price each approved item — every item gets its own client quote.'
            : 'Rates, taxes, payment terms, client acceptance and production authorization are managed separately by the quotation team.'}</span>
        </div>
        <Link className="btn btn-primary" to={`/quotations?project=${workflow.project.id}`}>
          Open quotation workbench →
        </Link>
      </div> : <div className="tw-empty">Generate an extraction revision before handing it to the quotation team.</div>}

      {!!workflow.quotations.length && <>
        <div className="divider" />
        <div className="tw-quote-list">
          {workflow.quotations.map(quote => (
            <div key={quote.id}>
              <div><b>{quote.quote_number}</b><span>{quote.product} · from {
                quote.extraction_ids.length
                  ? quote.extraction_ids.map(id => {
                      const row = workflow.extractions.find(e => e.id === id)
                      return row ? `${multiItem ? `${itemLabel(row.design_id)} ` : ''}E${row.revision}` : null
                    }).filter(Boolean).join(' + ')
                  : 'configurator'
              }</span></div>
              <div className="flex gap-sm wrap">
                <Badge tone={['Accepted', 'Approved'].includes(quote.status) ? 'green' : quote.status === 'Sent' ? 'blue' : 'orange'}>{quote.status}</Badge>
                {quote.requires_review && <Badge tone="red">Stale basis</Badge>}
              </div>
              <button className="btn btn-ghost btn-sm" disabled={busy}
                onClick={() => act(() => downloadQuotationPdf(quote.quote_number), `${quote.quote_number} downloaded`)}>
                <IconDownload /> PDF
              </button>
              {quote.job_number && <span className="t-mono">{quote.job_number}</span>}
            </div>
          ))}
          <Link className="btn btn-ghost btn-sm" to="/quotations">Open quotation desk →</Link>
        </div>
      </>}
    </div>
  )
}

const AUTO_APPROVE_BRIEF = 'Existing saved configurator design accepted without redraw.'
const AUTO_APPROVE_NOTES = 'Existing saved configurator design accepted without changes.'

function DrawingArea({ workflow, designId, isUngrouped, extractions, drawingTasks, productionReleases, onSaved, busy, act }) {
  const project = workflow.project
  const [method, setMethod] = useState(project.drawing_method || 'configurator')
  const [assignedTo, setAssignedTo] = useState('Technical Team')
  const [brief, setBrief] = useState('')
  const [revisionNotes, setRevisionNotes] = useState('')
  const [showNewDrawing, setShowNewDrawing] = useState(false)
  const approvedExtraction = extractions.find(row => row.status === 'approved')
  const latestTask = drawingTasks.find(task => task.basis_status === 'current')
  const releasedToTechnical = !!workflow.qc_submission.released_to_technical_at
  const releasedRevisionIds = new Set(
    productionReleases
      .filter(release => release.status === 'current')
      .map(release => release.drawing_revision_id))

  useEffect(() => setMethod(project.drawing_method || 'configurator'), [project.id, project.drawing_method])

  const makeTask = () => act(async () => {
    const data = await createDrawingTask(project.id, {
      design_id: designId,
      method,
      extraction_id: approvedExtraction?.id || null,
      assigned_to: assignedTo,
      brief,
      created_by: 'Technical Supervisor',
    })
    onSaved(data)
  }, `${method === 'autocad' ? 'AutoCAD' : 'Configurator'} drawing task opened`)

  const approveAndSubmit = () => {
    if (!window.confirm('Approve this drawing and submit to QC?')) return
    act(async () => {
      let data = await approveExistingConfiguratorDesign(project.id, {
        design_id: designId,
        approved_by: 'Technical Supervisor',
        notes: AUTO_APPROVE_NOTES,
      })
      if (data.qc_submission.ready && !data.qc_submission.released_to_qc_at) {
        data = await submitProjectToQc(project.id, { submitted_by: 'Technical Supervisor' })
      }
      onSaved(data)
    }, 'Drawing approved')
  }

  const submitRevision = () => act(async () => {
    const data = await createDrawingRevision(latestTask.id, {
      notes: revisionNotes, submitted_by: assignedTo || 'Technical Team',
    })
    setRevisionNotes('')
    onSaved(data)
  }, 'Drawing revision opened for review — attach its outputs below')

  return (
    <div>
      <div className={`tw-gate ${releasedToTechnical ? 'open' : ''}`}>
        <b>Technical release</b>
        <Badge tone={releasedToTechnical ? 'green' : 'orange'}>
          {releasedToTechnical ? 'Released' : 'Locked'}
        </Badge>
      </div>

      {isUngrouped && <div className="tw-help">
        This is the pre-existing ungrouped chain from before per-item items were tracked separately.
        Assign it to one item on the Extraction tab before preparing new drawing work here.
      </div>}

      {!latestTask && !isUngrouped && (
        <div className="tw-editor">
          <div className="tw-drawing-actions">
            <button className="btn btn-gold btn-sm" disabled={busy || !releasedToTechnical
              || !approvedExtraction || !project.item_count} onClick={approveAndSubmit}>
              <IconCheck /> Approve & submit
            </button>
            <button className="btn btn-ghost btn-sm" disabled={busy || !releasedToTechnical || !approvedExtraction}
              onClick={() => setShowNewDrawing(v => !v)}>
              <IconPlus /> New drawing
            </button>
          </div>

          {showNewDrawing && (
            <div className="tw-new-drawing-form">
              <div className="tw-method-choice">
                <button className={method === 'configurator' ? 'on' : ''} onClick={() => setMethod('configurator')}>
                  <IconLayers /> Configurator
                </button>
                <button className={method === 'autocad' ? 'on' : ''} onClick={() => setMethod('autocad')}>
                  <IconFile /> AutoCAD
                </button>
              </div>
              <div className="tw-form-grid">
                <Field label="Assigned to">
                  <input placeholder="Name" value={assignedTo} onChange={e => setAssignedTo(e.target.value)} />
                </Field>
                <Field label="Extraction">
                  <input readOnly value={approvedExtraction ? `E${approvedExtraction.revision}` : '—'} />
                </Field>
              </div>
              <textarea className="tw-notes" placeholder="Drawing brief (optional)" value={brief} onChange={e => setBrief(e.target.value)} />
              <button className="btn btn-primary btn-sm" disabled={busy || !assignedTo.trim()} onClick={makeTask}>
                <IconPlus /> {method === 'autocad' ? 'Create AutoCAD task' : 'Create drawing task'}
              </button>
            </div>
          )}
        </div>
      )}

      {drawingTasks.map(task => (
        <div className="tw-drawing-task" key={task.id}>
          <div className="tw-revision-head">
            <div>
              <b>{task.method === 'not_required' ? 'Drawing not required'
                : task.method === 'autocad' ? 'AutoCAD drawing work' : 'Configurator drawing work'}</b>
              <span>{task.assigned_to || task.created_by || 'Technical Team'} · {task.status === 'assigned' ? 'in progress' : task.status.replaceAll('_', ' ')}</span>
            </div>
            <div className="flex gap-sm wrap">
              <Badge tone={task.status === 'approved' || task.status === 'not_required' ? 'green' : task.basis_status === 'stale' ? 'red' : 'blue'}>
                {task.status === 'assigned' ? 'In progress' : task.status.replaceAll('_', ' ')}
              </Badge>
              {task.basis_status === 'stale' && <Badge tone="red">Stale E/Q basis</Badge>}
            </div>
          </div>
          {task.brief && task.brief !== AUTO_APPROVE_BRIEF && <p className="tw-revision-note">{task.brief}</p>}
          {task.id === latestTask?.id && task.status !== 'approved' && task.status !== 'not_required' && <div className="tw-new-revision">
            <div className="tw-drawing-next">
              {task.method === 'configurator' && <Link className="btn btn-primary btn-sm"
                to={`/configurator?project=${project.id}`}>
                <IconLayers /> Open in Configurator
              </Link>}
              {task.method === 'configurator' && !task.revisions.length && <button
                className="btn btn-gold btn-sm" disabled={busy} onClick={approveAndSubmit}>
                <IconCheck /> Approve & submit
              </button>}
            </div>
            <textarea className="tw-notes" placeholder="Describe the drawing completed" value={revisionNotes} onChange={e => setRevisionNotes(e.target.value)} />
            <button className="btn btn-ghost btn-sm" disabled={busy || !revisionNotes.trim()} onClick={submitRevision}>
              <IconPlus /> Submit for review
            </button>
          </div>}
          {task.status === 'approved' && <div className="tw-drawing-complete">
            <IconCheck /><b>Drawing complete</b>
          </div>}
          {task.status === 'not_required' && <div className="tw-drawing-complete">
            <IconCheck /><b>No drawing required</b>
          </div>}
          {task.revisions.slice().reverse().map(revision => (
            <DrawingRevision key={revision.id} revision={revision} projectId={project.id}
              released={releasedRevisionIds.has(revision.id)}
              onSaved={onSaved} busy={busy} act={act} />
          ))}
        </div>
      ))}

      {!!productionReleases.length && <div className="tw-release-history">
        <b>Factory release history</b>
        {productionReleases.map(release => (
          <div key={release.id}>
            <span>
              {release.release_number || `Factory pack ${release.id}`} ·
              {' '}E{release.extraction_revision || '?'} ·
              {' '}{release.quotation_number || 'quotation unlinked'} ·
              {' '}R{release.drawing_revision}
            </span>
            <Badge tone={release.status === 'current' ? 'green' : 'gray'}>
              {release.status === 'current' ? 'Current' : 'Superseded — do not produce'}
            </Badge>
          </div>
        ))}
      </div>}
    </div>
  )
}

function DrawingRevision({ revision, projectId, released, onSaved, busy, act }) {
  const kinds = new Set(revision.files.map(file => file.kind))

  const upload = (kind, file) => act(async () => {
    await uploadDrawingFile(revision.id, kind, file)
    onSaved(await getProjectWorkflow(projectId))
  }, `${file.name} uploaded to R${revision.revision}`)

  return (
    <div className="tw-drawing-revision">
      <div className="tw-revision-head">
        <div><b>Drawing R{revision.revision}</b><span>{revision.submitted_by || 'Technical Team'} · {timeAgo(revision.created_at)}</span></div>
        <Badge tone={revision.status === 'approved' ? 'green' : revision.status === 'superseded' ? 'gray' : 'orange'}>{revision.status.replaceAll('_', ' ')}</Badge>
      </div>
      {revision.notes && revision.notes !== AUTO_APPROVE_NOTES && <p className="tw-revision-note">{revision.notes}</p>}
      <div className="tw-files">
        {revision.files.map(file => (
          <a key={file.id} href={drawingFileUrl(file.download_url)} className="tw-file">
            <IconDownload /><span><b>{file.filename}</b><small>{file.kind.replaceAll('_', ' ')} · {(file.size_bytes / 1024).toFixed(1)} KB</small></span>
          </a>
        ))}
      </div>
      {revision.status !== 'approved' && revision.status !== 'superseded' && <>
        <div className="tw-upload-grid">
          {FILE_KINDS.map(([kind, label]) => (
            <label className={kinds.has(kind) ? 'uploaded' : ''} key={kind}>
              <span>{kinds.has(kind) ? '✓' : '+'}</span>{label}
              <input type="file" disabled={busy} accept={kind === 'source_dwg' ? '.dwg,.dxf' : '.pdf,.dwg,.dxf,.xlsx,.xls,.csv'}
                onChange={e => e.target.files?.[0] && upload(kind, e.target.files[0])} />
            </label>
          ))}
        </div>
      </>}
      {released && <Badge tone="green">Released to factory</Badge>}
    </div>
  )
}

function QcSubmissionPanel({ workflow, onSaved, busy, act }) {
  const qc = workflow.qc_submission

  const submit = () => act(async () => {
    const data = await submitProjectToQc(workflow.project.id, { submitted_by: 'Technical Supervisor' })
    onSaved(data)
  }, 'Project submitted to QC')

  if (qc.released_to_qc_at) {
    return (
      <Card title="Submitted to QC">
        <div className="tw-drawing-complete">
          <IconCheck />
          <div>
            <b>Submitted by {qc.released_to_qc_by || 'Technical Team'}</b>
            <span>QC now reviews this project for factory release.</span>
          </div>
        </div>
      </Card>
    )
  }

  return (
    <Card title="Submit to QC">
      {!qc.ready && !!qc.not_ready_items.length && (
        <p className="tw-help">Still pending: {qc.not_ready_items.join(', ')}</p>
      )}
      <button className="btn btn-primary" disabled={busy || !qc.ready} onClick={submit}>
        <IconCheck /> Submit project to QC
      </button>
    </Card>
  )
}

function ItemPicker({ items, itemSummary, selectedKey, onSelect }) {
  return (
    <nav className="tw-item-tabs" aria-label="Project items">
      {items.map(item => {
        const key = item.design_id === null ? 'ungrouped' : item.design_id
        const summary = itemSummary[item.design_id === null ? 'null' : String(item.design_id)] || {}
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

export default function TechnicalWorkflow() {
  const [searchParams] = useSearchParams()
  const [projects, setProjects] = useState([])
  const [selectedId, setSelectedId] = useState(
    searchParams.get('project') ? Number(searchParams.get('project')) : null)
  const [workflow, setWorkflow] = useState(null)
  const [activePage, setActivePage] = useState('extraction')
  const [extractionSeed, setExtractionSeed] = useState(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState(null)
  const [error, setError] = useState('')
  const [settings, setSettings] = useState({ product_family: 'frame', product_system: '' })
  // Which item's own extraction/drawing chain is in view. A number selects a
  // real item; 'ungrouped' selects a pre-existing chain from before per-item
  // scoping; null means "no picker needed" (0 or 1 item) — every existing
  // single-item project keeps working with no change in behaviour.
  const [selectedItemKey, setSelectedItemKey] = useState(null)
  const [assignTarget, setAssignTarget] = useState('')

  const items = workflow?.items || []
  const showItemPicker = items.length > 1
  const isUngrouped = showItemPicker && selectedItemKey === 'ungrouped'
  const designIdForApi = showItemPicker ? (isUngrouped ? null : selectedItemKey) : null
  const summaryKey = designIdForApi === null ? 'null' : String(designIdForApi)
  const itemSummary = workflow?.item_summary?.[summaryKey]
  const itemProcurement = itemSummary?.procurement
    || { rows: [], shortage_count: 0, ready: false, extraction_revision: null }
  const filteredExtractions = (workflow?.extractions || [])
    .filter(row => row.design_id === designIdForApi)
  const filteredDrawingTasks = (workflow?.drawing_tasks || [])
    .filter(row => row.design_id === designIdForApi)
  const filteredReleases = (workflow?.production_releases || [])
    .filter(row => row.design_id === designIdForApi)
  const realItems = items.filter(item => item.design_id !== null)

  useEffect(() => {
    if (!workflow) return
    if ((workflow.items || []).length <= 1) { setSelectedItemKey(null); return }
    setSelectedItemKey(current => {
      const keys = workflow.items.map(item => item.design_id === null ? 'ungrouped' : item.design_id)
      if (keys.includes(current)) return current
      const firstReal = workflow.items.find(item => item.design_id !== null)
      return firstReal ? firstReal.design_id : 'ungrouped'
    })
  }, [workflow])

  // The item being viewed (picker selection, or the project's only item when
  // there's no picker) already carries its own profile/system — no need to
  // make the technical team retype it.
  const viewedItem = showItemPicker
    ? items.find(item => (item.design_id === null ? 'ungrouped' : item.design_id) === selectedItemKey)
    : items.find(item => item.design_id !== null)
  useEffect(() => {
    const label = viewedItem ? systemLabel(viewedItem.system) : ''
    if (label) setSettings(s => ({ ...s, product_system: label }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewedItem?.design_id, workflow?.project?.id])

  const fire = message => {
    setToast(message)
    setTimeout(() => setToast(null), 3500)
  }
  const refreshProjects = () => listProjects().then(rows => {
    setProjects(rows)
    setSelectedId(current => current || rows[0]?.id || null)
  })
  useEffect(() => { refreshProjects().catch(error => setError(messageFrom(error))) }, [])
  useLiveRefresh(async () => {
    await refreshProjects()
    if (selectedId) setWorkflow(await getProjectWorkflow(selectedId))
  })
  useEffect(() => {
    if (!selectedId) return
    setWorkflow(null)
    setExtractionSeed(null)
    getProjectWorkflow(selectedId).then(data => {
      setWorkflow(data)
      setActivePage(searchParams.get('page') || pageForStatus(data.project.workflow_status))
      setSettings({
        product_family: data.project.product_family,
        product_system: data.project.product_system,
      })
    }).catch(error => setError(messageFrom(error)))
  }, [selectedId])

  const act = async (fn, success) => {
    setBusy(true); setError('')
    try {
      await fn()
      if (success) fire(success)
      await refreshProjects()
    } catch (error) {
      setError(messageFrom(error))
    } finally {
      setBusy(false)
    }
  }

  const activeProject = useMemo(
    () => projects.find(project => project.id === selectedId), [projects, selectedId])

  const saveSettings = () => act(async () => {
    const data = await updateProjectWorkflow(selectedId, settings)
    setWorkflow(data)
  }, 'Product details saved')

  return (
    <>
      <PageHead title="Technical Workflow" subtitle="One controlled path from site measurement and extraction to drawing approval and factory release.">
        <Badge tone="blue">Frame · Frameless · Balustrade</Badge>
      </PageHead>

      {error && <div className="tw-alert">⚠ {error}</div>}

      <div className="tw-layout">
        <aside className="tw-projects">
          <div className="tw-projects-head"><b>Client projects</b><span>{projects.length}</span></div>
          {projects.map(project => (
            <button className={project.id === selectedId ? 'active' : ''} key={project.id} onClick={() => setSelectedId(project.id)}>
              <b>{project.name}</b>
              <span>{project.project_number} · {FAMILY_LABEL[project.product_family] || project.product_family}</span>
              <small>{project.workflow_status_label || 'Measurement received'}</small>
            </button>
          ))}
          {!projects.length && <div className="tw-empty">Create a client project in the configurator first.</div>}
        </aside>

        <main className="tw-main">
          {!workflow && activeProject && <div className="tw-empty">Loading technical workflow…</div>}
          {workflow && <>
            <Card className="tw-overview tw-pipeline-card">
              <div className="tw-project-title">
                <div>
                  <span>{workflow.project.project_number}</span>
                  <h2>{workflow.project.name}</h2>
                  <p>{workflow.project.client_name || 'Walk-in Client'}{workflow.project.location ? ` · ${workflow.project.location}` : ''}</p>
                </div>
                <Badge tone={workflow.project.released_at ? 'green' : 'blue'}>{workflow.project.workflow_status_label}</Badge>
              </div>
              <WorkflowTrack stages={workflow.workflow_stages} onSelect={setActivePage} />
              <ChainIntegrity workflow={workflow} />
            </Card>

            <nav className="tw-page-tabs" aria-label="Technical workflow pages">
              {TECHNICAL_PAGES.map(([key, label]) => (
                <button type="button" className={activePage === key ? 'active' : ''}
                  aria-current={activePage === key ? 'page' : undefined}
                  onClick={() => setActivePage(key)} key={key}>
                  {label}
                </button>
              ))}
            </nav>

            {showItemPicker && (activePage === 'extraction' || activePage === 'drawings') && (
              <ItemPicker items={items} itemSummary={workflow.item_summary}
                selectedKey={selectedItemKey} onSelect={setSelectedItemKey} />
            )}

            {activePage === 'extraction' && <Card title="Technical extraction" sub="Prepare and approve the material quantities required before commercial pricing begins.">
              {isUngrouped && <div className="tw-existing-design" style={{ marginBottom: 12 }}>
                <div>
                  <b>Assign this pre-existing chain to one item</b>
                  <span>Made before items were tracked separately — a technical person confirms which item it was really for.</span>
                </div>
                <div className="flex gap-sm">
                  <select value={assignTarget} onChange={e => setAssignTarget(e.target.value)}>
                    <option value="">Choose item…</option>
                    {realItems.map(item => (
                      <option value={item.design_id} key={item.design_id}>{item.ref || item.name}</option>
                    ))}
                  </select>
                  <button className="btn btn-gold btn-sm" disabled={busy || !assignTarget}
                    onClick={() => act(async () => {
                      const data = await assignExtractionsToItem(workflow.project.id, {
                        design_id: Number(assignTarget), who: 'Technical Team',
                      })
                      setAssignTarget('')
                      setSelectedItemKey(Number(assignTarget))
                      setWorkflow(data)
                    }, 'Chain assigned to item')}>
                    Assign
                  </button>
                </div>
              </div>}
              <div className="tw-form-grid">
                <Field label="Product family">
                  <select value={settings.product_family} onChange={e => setSettings(s => ({ ...s, product_family: e.target.value }))}>
                    {Object.entries(FAMILY_LABEL).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
                  </select>
                </Field>
                <Field label="Product / profile system">
                  <input placeholder="e.g. Trialco" value={settings.product_system} onChange={e => setSettings(s => ({ ...s, product_system: e.target.value }))} />
                </Field>
              </div>
              {(settings.product_family !== workflow.project.product_family
                || settings.product_system !== workflow.project.product_system) && (
                <button className="btn btn-ghost btn-sm" disabled={busy} onClick={saveSettings}>Save product details</button>
              )}
              <div className="divider" />
              <ExtractionEditor project={{ ...workflow.project, item_count: activeProject?.item_count || 0 }}
                designId={designIdForApi} isUngrouped={isUngrouped}
                seed={extractionSeed} onSeedUsed={() => setExtractionSeed(null)}
                onSaved={setWorkflow} busy={busy} act={act} />
              <div className="divider" />
              <ExtractionHistory extractions={filteredExtractions} procurement={itemProcurement}
                onEdit={extraction => {
                  setExtractionSeed(extraction)
                  window.scrollTo({ top: 0, behavior: 'smooth' })
                }} busy={busy} />
            </Card>}

            {activePage === 'commercial' && <Card title="Commercial gate" sub="Track the handoff only. Pricing, quote approval and payment work stay on the Quotations page.">
              <QuotationHandoff workflow={workflow} busy={busy} act={act} />
            </Card>}

            {activePage === 'drawings' && <Card title="Drawing handoff and revisions">
              <DrawingArea workflow={workflow} designId={designIdForApi} isUngrouped={isUngrouped}
                extractions={filteredExtractions} drawingTasks={filteredDrawingTasks}
                productionReleases={filteredReleases} onSaved={setWorkflow} busy={busy} act={act} />
            </Card>}

            {activePage === 'drawings' &&
              <QcSubmissionPanel workflow={workflow} onSaved={setWorkflow} busy={busy} act={act} />}

            {activePage === 'activity' && <Card title="Project activity" sub="A traceable record of extraction, payment, drawings, approvals and factory release.">
              <div className="tw-events">
                {workflow.events.map(event => (
                  <div key={event.id}><i /><p><b>{event.who}</b> {event.note}<span>{event.at ? timeAgo(event.at) : ''}</span></p></div>
                ))}
                {!workflow.events.length && <div className="tw-empty">No technical workflow activity yet.</div>}
              </div>
            </Card>}
          </>}
        </main>
      </div>
      {toast && <div className="toast">{toast}</div>}
    </>
  )
}
