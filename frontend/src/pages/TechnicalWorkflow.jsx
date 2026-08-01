import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { PageHead, Card, Badge } from '../components/ui.jsx'
import {
  listProjects, getProjectWorkflow, updateProjectWorkflow,
  createExtraction, generateExtractionFromDesign, approveExtraction,
  downloadQuotationPdf,
  createDrawingTask, approveExistingConfiguratorDesign,
  createDrawingRevision, uploadDrawingFile,
  approveDrawingRevision, releaseProjectToFactory, drawingFileUrl,
} from '../lib/api.js'
import { timeAgo } from '../lib/whatsapp.js'
import { IconCheck, IconDownload, IconFile, IconLayers, IconPlus } from '../components/icons.jsx'
import '../styles/technical-workflow.css'

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

const METHOD_NOTE = {
  manual: 'Technical team enters the complete material take-off.',
  generated: 'System creates the first material list; technical approval is still required.',
  hybrid: 'System suggestions are reviewed and adjusted by technical.',
}

const PROCUREMENT_STATUS = {
  available: 'Available',
  purchase_required: 'Purchase required',
  missing_code: 'Missing stock code',
  not_in_inventory: 'Not in inventory',
  unit_mismatch: 'Unit mismatch',
}

const PIPELINE_PHASES = [
  {
    key: 'setup', label: 'Project setup', page: 'setup',
    statuses: ['measurement_received'],
    description: 'Measurement and technical defaults',
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
  ['setup', 'Project Setup'],
  ['extraction', 'Extraction'],
  ['commercial', 'Commercial Gate'],
  ['drawings', 'Drawings'],
  ['activity', 'Activity'],
]

function pageForStatus(status) {
  return PIPELINE_PHASES.find(phase => phase.statuses.includes(status))?.page || 'setup'
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

function ExtractionEditor({ project, seed, onSeedUsed, onSaved, busy, act }) {
  const [method, setMethod] = useState(project.extraction_method || 'manual')
  const [recipeStatus, setRecipeStatus] = useState(method === 'manual' ? 'manual' : 'provisional')
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState([{ ...EMPTY_ITEM }])

  useEffect(() => {
    setMethod(project.extraction_method || 'manual')
  }, [project.id, project.extraction_method])

  useEffect(() => {
    if (!seed) return
    setMethod('hybrid')
    setRecipeStatus('provisional')
    setNotes(`Edited from extraction E${seed.revision}.`)
    setItems(seed.items.map(item => ({
      code: item.code || '',
      material: item.material,
      category: item.category || 'Material',
      quantity: item.quantity,
      unit: item.unit || 'pcs',
      unit_price: 0,
      source: 'hybrid',
      notes: item.notes || '',
    })))
  }, [seed])

  const change = (index, key, value) =>
    setItems(rows => rows.map((row, i) => i === index ? { ...row, [key]: value } : row))

  const save = () => act(async () => {
    const clean = items.filter(item => item.material.trim())
    const data = await createExtraction(project.id, {
      method,
      recipe_status: method === 'manual' ? 'manual' : recipeStatus,
      notes,
      created_by: 'Technical Team',
      items: clean.map(item => ({
        ...item,
        quantity: Number(item.quantity),
        unit_price: 0,
        source: method,
      })),
    })
    setItems([{ ...EMPTY_ITEM }])
    setNotes('')
    onSeedUsed?.()
    onSaved(data)
  }, 'Extraction revision created')

  return (
    <div className="tw-editor">
      {seed && <div className="tw-edit-banner">
        <div><b>Editing from E{seed.revision}</b><span>The original revision remains unchanged. Saving creates the next hybrid revision.</span></div>
        <button onClick={() => {
          setItems([{ ...EMPTY_ITEM }]); setNotes('')
          onSeedUsed?.()
        }}>Cancel</button>
      </div>}
      <div className="tw-form-grid">
        <Field label="Extraction method">
          <select value={method} onChange={e => {
            setMethod(e.target.value)
            setRecipeStatus(e.target.value === 'manual' ? 'manual' : 'provisional')
          }}>
            <option value="manual">Manual</option>
            <option value="generated">System-generated</option>
            <option value="hybrid">Hybrid</option>
          </select>
        </Field>
        {method !== 'manual' && <Field label="Recipe confidence">
          <select value={recipeStatus} onChange={e => setRecipeStatus(e.target.value)}>
            <option value="provisional">Working / provisional</option>
            <option value="approved">Approved recipe</option>
          </select>
        </Field>}
      </div>
      <p className="tw-help">{METHOD_NOTE[method]}</p>
      <div className="tw-extraction-rows">
        {items.map((item, index) => (
          <div className="tw-extraction-row" key={index}>
            <input placeholder="Code" value={item.code} onChange={e => change(index, 'code', e.target.value)} />
            <input className="tw-material" placeholder="Material / accessory" value={item.material} onChange={e => change(index, 'material', e.target.value)} />
            <input type="number" min="0.001" step="any" placeholder="Qty" value={item.quantity} onChange={e => change(index, 'quantity', e.target.value)} />
            <input placeholder="Unit" value={item.unit} onChange={e => change(index, 'unit', e.target.value)} />
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
        {project.item_count > 0 && <button className="btn btn-ghost" disabled={busy}
          onClick={() => act(async () => {
            const data = await generateExtractionFromDesign(project.id, { created_by: 'Technical Team' })
            onSaved(data)
          }, 'Provisional extraction generated from the latest configurator item')}>
          Generate from configurator
        </button>}
      </div>
    </div>
  )
}

function ExtractionHistory({ workflow, onEdit, onSaved, busy, act }) {
  if (!workflow.extractions.length) {
    return <div className="tw-empty">No extraction revision yet. Create one manually or generate it from a saved configurator item.</div>
  }
  return (
    <div className="tw-history">
      {workflow.extractions.some(row => row.status === 'approved') && (
        <>
          <div className="tw-approved-source">
            <div><b>Technical source</b><span>All new material quantities and downstream reports read the latest approved extraction. Pricing is handled on the Quotations page.</span></div>
          </div>
          <div className="tw-procurement">
            <div className="tw-revision-head">
              <div>
                <b>Stock and procurement requirement · E{workflow.procurement.extraction_revision}</b>
                <span>Required, available and shortfall quantities use the same approved extraction.</span>
              </div>
              <Badge tone={workflow.procurement.ready ? 'green' : 'orange'}>
                {workflow.procurement.ready
                  ? 'All tracked stock available'
                  : `${workflow.procurement.shortage_count} item${workflow.procurement.shortage_count === 1 ? '' : 's'} need attention`}
              </Badge>
            </div>
            <div className="tbl-wrap">
              <table className="tbl tw-mini-table">
                <thead><tr><th>Code</th><th>Material</th><th>Required</th><th>Available</th><th>Shortfall</th><th>Status</th></tr></thead>
                <tbody>{workflow.procurement.rows.map(item => (
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
      {workflow.extractions.map(extraction => (
        <div className="tw-revision" key={extraction.id}>
          <div className="tw-revision-head">
            <div>
              <b>E{extraction.revision} · {extraction.method}</b>
              <span>{extraction.items.length} material rows</span>
            </div>
            <div className="flex gap-sm">
              <Badge tone={extraction.recipe_status === 'approved' ? 'green' : extraction.recipe_status === 'provisional' ? 'orange' : 'gray'}>
                {extraction.recipe_status}
              </Badge>
              <Badge tone={extraction.status === 'approved' ? 'green' : extraction.status === 'superseded' ? 'gray' : 'orange'}>{extraction.status}</Badge>
            </div>
          </div>
          <div className="tbl-wrap">
            <table className="tbl tw-mini-table">
              <thead><tr><th>Code</th><th>Material</th><th>Quantity</th></tr></thead>
              <tbody>{extraction.items.map(item => (
                <tr key={item.id}>
                  <td className="t-mono">{item.code || '—'}</td>
                  <td>{item.material}</td>
                  <td>{item.quantity}{item.unit ? ` ${item.unit}` : ''}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          {extraction.notes && <p className="tw-revision-note">{extraction.notes}</p>}
          <div className="flex gap-sm wrap">
            <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => onEdit(extraction)}>
              Duplicate & Edit
            </button>
            {!['approved', 'superseded'].includes(extraction.status) && <button className="btn btn-primary btn-sm" disabled={busy}
              onClick={() => act(async () => {
                const data = await approveExtraction(extraction.id)
                onSaved(data)
              }, `Extraction E${extraction.revision} approved for quotation`)}>
              <IconCheck /> Approve extraction
            </button>}
          </div>
        </div>
      ))}
    </div>
  )
}

function QuotationHandoff({ workflow, busy, act }) {
  const extraction = workflow.extractions.find(row => row.status === 'approved')

  return (
    <div>
      {extraction ? <div className="tw-editor tw-handoff-only">
        <div>
          <b>Extraction E{extraction.revision} is approved for quotation</b>
          <span>{extraction.items.length} material rows are locked as the technical basis.</span>
          <p>Rates, taxes, payment terms, client acceptance and production authorization are managed separately by the quotation team.</p>
        </div>
        <Link className="btn btn-primary" to={`/quotations?project=${workflow.project.id}`}>
          Open quotation workbench →
        </Link>
      </div> : <div className="tw-empty">Approve an extraction revision before handing it to the quotation team.</div>}

      {!!workflow.quotations.length && <>
        <div className="divider" />
        <div className="tw-quote-list">
          {workflow.quotations.map(quote => (
            <div key={quote.id}>
              <div><b>{quote.quote_number}</b><span>{quote.product} · from {quote.extraction_id ? `extraction E${workflow.extractions.find(row => row.id === quote.extraction_id)?.revision || '?'}` : 'configurator'}</span></div>
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

function DrawingArea({ workflow, onSaved, busy, act }) {
  const project = workflow.project
  const [method, setMethod] = useState(project.drawing_method || 'configurator')
  const [assignedTo, setAssignedTo] = useState('Technical Team')
  const [brief, setBrief] = useState('')
  const [revisionNotes, setRevisionNotes] = useState('')
  const approvedExtraction = workflow.extractions.find(row => row.status === 'approved')
  const latestTask = workflow.drawing_tasks.find(task => task.basis_status === 'current')
  const releasedRevisionIds = new Set(
    workflow.production_releases
      .filter(release => release.status === 'current')
      .map(release => release.drawing_revision_id))

  useEffect(() => setMethod(project.drawing_method || 'configurator'), [project.id, project.drawing_method])

  const makeTask = () => act(async () => {
    const data = await createDrawingTask(project.id, {
      method,
      extraction_id: approvedExtraction?.id || null,
      assigned_to: assignedTo,
      brief,
      created_by: 'Technical Supervisor',
    })
    onSaved(data)
  }, `${method === 'autocad' ? 'AutoCAD' : 'Configurator'} drawing task opened`)

  const acceptExistingDesign = () => {
    if (!window.confirm(
      'Confirm that the existing saved configurator design is final and no drawing changes are required?')) return
    act(async () => {
      const data = await approveExistingConfiguratorDesign(project.id, {
        approved_by: 'Technical Supervisor',
        notes: 'Existing saved configurator design accepted without changes.',
      })
      onSaved(data)
    }, 'Existing configurator design confirmed — drawing complete')
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
      <div className={`tw-gate ${workflow.payment_gate.authorized ? 'open' : ''}`}>
        <div>
          <b>{workflow.payment_gate.authorized ? 'Accounts confirmed — drawing authorized' : 'Commercial authorization pending'}</b>
          <span>{workflow.payment_gate.authorized
            ? 'The quotation team has confirmed the required client acceptance and payment gate.'
            : 'The quotation desk must confirm client acceptance and the required payment before drawing starts.'}</span>
        </div>
        <Badge tone={workflow.payment_gate.authorized ? 'green' : 'orange'}>
          {workflow.payment_gate.authorized ? 'Authorized' : 'Locked'}
        </Badge>
      </div>

      {!latestTask && (
        <div className="tw-editor">
          <div className="tw-existing-design">
            <div>
              <b>No drawing changes are required?</b>
              <span>Confirm the original saved configurator design as the final drawing. This records an immutable approved snapshot and moves the project to Factory Release.</span>
            </div>
            <button className="btn btn-gold btn-sm" disabled={busy || !workflow.payment_gate.authorized
              || !approvedExtraction || !project.item_count} onClick={acceptExistingDesign}>
              <IconCheck /> Confirm existing design is final
            </button>
          </div>
          {!project.item_count && <p className="tw-help">No saved configurator item is linked to this project yet.</p>}
          <div className="tw-route-divider"><span>or prepare a new drawing</span></div>
          <div className="tw-method-choice">
            <button className={method === 'configurator' ? 'on' : ''} onClick={() => setMethod('configurator')}>
              <IconLayers /><b>Use Configurator</b><span>Create or update the project drawing inside the platform.</span>
            </button>
            <button className={method === 'autocad' ? 'on' : ''} onClick={() => setMethod('autocad')}>
              <IconFile /><b>Use AutoCAD</b><span>Prepare complex drawings externally and return the files here.</span>
            </button>
          </div>
          <div className="tw-route-note">
            <b>{method === 'autocad' ? 'AutoCAD is an external handoff' : 'Configurator revision path'}</b>
            <span>{method === 'autocad'
              ? 'Selecting AutoCAD does not launch the desktop application. Create the task, prepare the DWG/PDF externally, then return here to submit and upload the files.'
              : 'Create the task, open this project in the Configurator, save the changes, then return here to submit the drawing for review.'}</span>
          </div>
          <div className="tw-form-grid">
            <Field label="Assigned technical person">
              <input placeholder="Name" value={assignedTo} onChange={e => setAssignedTo(e.target.value)} />
            </Field>
            <Field label="Approved extraction">
              <input readOnly value={approvedExtraction ? `E${approvedExtraction.revision}` : 'No approved extraction'} />
            </Field>
          </div>
          <textarea className="tw-notes" placeholder="Drawing brief: opening references, required outputs, site conditions and special details" value={brief} onChange={e => setBrief(e.target.value)} />
          <button className="btn btn-primary" disabled={busy || !workflow.payment_gate.authorized || !approvedExtraction || !assignedTo.trim()} onClick={makeTask}>
            {method === 'autocad' ? 'Create AutoCAD handoff' : 'Create Configurator revision task'}
          </button>
          {!approvedExtraction && <p className="tw-help">Approve an extraction revision before handing over the drawing.</p>}
        </div>
      )}

      {workflow.drawing_tasks.map(task => (
        <div className="tw-drawing-task" key={task.id}>
          <div className="tw-revision-head">
            <div>
              <b>{task.method === 'autocad' ? 'AutoCAD drawing work' : 'Configurator drawing work'}</b>
              <span>{task.assigned_to || 'Technical Team'} · {task.status === 'assigned' ? 'in progress' : task.status.replaceAll('_', ' ')}</span>
            </div>
            <div className="flex gap-sm wrap">
              <Badge tone={task.status === 'approved' ? 'green' : task.basis_status === 'stale' ? 'red' : 'blue'}>
                {task.status === 'assigned' ? 'In progress' : task.status.replaceAll('_', ' ')}
              </Badge>
              {task.basis_status === 'stale' && <Badge tone="red">Stale E/Q basis</Badge>}
            </div>
          </div>
          <p className="tw-chain-ref">
            Extraction {task.extraction_id
              ? `E${workflow.extractions.find(row => row.id === task.extraction_id)?.revision || '?'}`
              : 'unlinked'} · Quotation {task.quote_number || 'unlinked'}
          </p>
          {task.brief && <p className="tw-revision-note">{task.brief}</p>}
          {task.id === latestTask?.id && task.status !== 'approved' && <div className="tw-new-revision">
            <div className="tw-drawing-next">
              <div>
                <b>{task.method === 'configurator'
                  ? 'Next: prepare the project drawing'
                  : 'Next: prepare the drawing in AutoCAD'}</b>
                <span>{task.method === 'configurator'
                  ? 'Open this project in the Configurator, update and save its design items, then return here to submit the drawing for review.'
                  : 'Complete the DWG and PDF outputs, then return here to submit the drawing for review.'}</span>
              </div>
              {task.method === 'configurator' && <Link className="btn btn-primary btn-sm"
                to={`/configurator?project=${project.id}`}>
                <IconLayers /> Open project in Configurator
              </Link>}
              {task.method === 'configurator' && !task.revisions.length && <button
                className="btn btn-gold btn-sm" disabled={busy} onClick={acceptExistingDesign}>
                <IconCheck /> No changes needed — approve existing design
              </button>}
            </div>
            <label className="tw-revision-submit">
              <span>When the drawing is ready</span>
              <textarea className="tw-notes" placeholder="Describe the drawing completed and any changes made" value={revisionNotes} onChange={e => setRevisionNotes(e.target.value)} />
            </label>
            <button className="btn btn-ghost btn-sm" disabled={busy || !revisionNotes.trim()} onClick={submitRevision}>
              <IconPlus /> Submit drawing for review
            </button>
          </div>}
          {task.status === 'approved' && <div className="tw-drawing-complete">
            <IconCheck />
            <div>
              <b>Drawing complete</b>
              <span>The approved drawing is recorded. No further drawing work is required unless the project changes.</span>
            </div>
          </div>}
          {task.revisions.slice().reverse().map(revision => (
            <DrawingRevision key={revision.id} revision={revision} projectId={project.id}
              released={releasedRevisionIds.has(revision.id)}
              basisCurrent={task.basis_status === 'current'}
              onSaved={onSaved} busy={busy} act={act} />
          ))}
        </div>
      ))}

      {!!workflow.production_releases.length && <div className="tw-release-history">
        <b>Factory release history</b>
        {workflow.production_releases.map(release => (
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

function DrawingRevision({ revision, projectId, released, basisCurrent, onSaved, busy, act }) {
  const kinds = new Set(revision.files.map(file => file.kind))
  const readyForApproval = kinds.has('client_overview') && kinds.has('factory_breakdown')

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
      {revision.notes && <p className="tw-revision-note">{revision.notes}</p>}
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
        <button className="btn btn-primary btn-sm" disabled={busy || !readyForApproval}
          onClick={() => act(async () => {
            const data = await approveDrawingRevision(revision.id)
            onSaved(data)
          }, `Drawing R${revision.revision} approved`)}>
          <IconCheck /> Approve technical revision
        </button>
        {!readyForApproval && <p className="tw-help">Client overview and factory breakdown files are required for approval.</p>}
      </>}
      {revision.status === 'approved' && !released && basisCurrent && <button className="btn btn-gold btn-sm" disabled={busy}
        onClick={() => act(async () => {
          const data = await releaseProjectToFactory(projectId, revision.id)
          onSaved(data)
        }, `Drawing R${revision.revision} released to factory`)}>
        Release approved pack to factory
      </button>}
      {released && <Badge tone="green">Released to factory</Badge>}
    </div>
  )
}

export default function TechnicalWorkflow() {
  const [searchParams] = useSearchParams()
  const [projects, setProjects] = useState([])
  const [selectedId, setSelectedId] = useState(
    searchParams.get('project') ? Number(searchParams.get('project')) : null)
  const [workflow, setWorkflow] = useState(null)
  const [activePage, setActivePage] = useState('setup')
  const [extractionSeed, setExtractionSeed] = useState(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState(null)
  const [error, setError] = useState('')
  const [settings, setSettings] = useState({
    product_family: 'frame', product_system: '',
    extraction_method: 'manual', drawing_method: 'configurator',
  })

  const fire = message => {
    setToast(message)
    setTimeout(() => setToast(null), 3500)
  }
  const refreshProjects = () => listProjects().then(rows => {
    setProjects(rows)
    setSelectedId(current => current || rows[0]?.id || null)
  })
  useEffect(() => { refreshProjects().catch(error => setError(messageFrom(error))) }, [])
  useEffect(() => {
    if (!selectedId) return
    setWorkflow(null)
    setExtractionSeed(null)
    getProjectWorkflow(selectedId).then(data => {
      setWorkflow(data)
      setActivePage(pageForStatus(data.project.workflow_status))
      setSettings({
        product_family: data.project.product_family,
        product_system: data.project.product_system,
        extraction_method: data.project.extraction_method,
        drawing_method: data.project.drawing_method,
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
  }, 'Technical project settings saved')

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

            {activePage === 'setup' && <Card title="Project setup" sub="Confirm the technical defaults used for extraction and drawing work.">
              <div className="tw-form-grid four">
                <Field label="Product family">
                  <select value={settings.product_family} onChange={e => setSettings(s => ({ ...s, product_family: e.target.value }))}>
                    {Object.entries(FAMILY_LABEL).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
                  </select>
                </Field>
                <Field label="Product / profile system">
                  <input placeholder="e.g. Trialco" value={settings.product_system} onChange={e => setSettings(s => ({ ...s, product_system: e.target.value }))} />
                </Field>
                <Field label="Default extraction">
                  <select value={settings.extraction_method} onChange={e => setSettings(s => ({ ...s, extraction_method: e.target.value }))}>
                    <option value="manual">Manual</option><option value="generated">Generated</option><option value="hybrid">Hybrid</option>
                  </select>
                </Field>
                <Field label="Default drawing">
                  <select value={settings.drawing_method} onChange={e => setSettings(s => ({ ...s, drawing_method: e.target.value }))}>
                    <option value="configurator">Configurator</option><option value="autocad">AutoCAD</option>
                  </select>
                </Field>
              </div>
              <button className="btn btn-primary btn-sm" disabled={busy} onClick={saveSettings}>Save project settings</button>
            </Card>}

            {activePage === 'extraction' && <Card title="Technical extraction" sub="Prepare and approve the material quantities required before commercial pricing begins.">
              <ExtractionEditor project={{ ...workflow.project, item_count: activeProject?.item_count || 0 }}
                seed={extractionSeed} onSeedUsed={() => setExtractionSeed(null)}
                onSaved={setWorkflow} busy={busy} act={act} />
              <div className="divider" />
              <ExtractionHistory workflow={workflow} onEdit={extraction => {
                setExtractionSeed(extraction)
                window.scrollTo({ top: 0, behavior: 'smooth' })
              }} onSaved={setWorkflow} busy={busy} act={act} />
            </Card>}

            {activePage === 'commercial' && <Card title="Commercial gate" sub="Track the handoff only. Pricing, quote approval and payment work stay on the Quotations page.">
              <QuotationHandoff workflow={workflow} busy={busy} act={act} />
            </Card>}

            {activePage === 'drawings' && <Card title="Drawing handoff and revisions" sub="Use the configurator where supported or AutoCAD where complexity requires it. Both return to the same approval path.">
              <DrawingArea workflow={workflow} onSaved={setWorkflow} busy={busy} act={act} />
            </Card>}

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
