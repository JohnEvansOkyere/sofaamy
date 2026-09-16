import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Badge, Card, PageHead } from '../components/ui.jsx'
import CutPlan from '../components/configurator/CutPlan.jsx'
import {
  downloadReport, drawingFileUrl, getProjectWorkflow, listDesigns,
  previewReport, recordPreProductionQc,
} from '../lib/api.js'
import { useLiveRefresh } from '../lib/live.js'
import { timeAgo } from '../lib/whatsapp.js'
import { CHECKS, STATUS } from './Quality.jsx'
import {
  IconCheck, IconDownload, IconFile, IconLayers, IconRuler,
} from '../components/icons.jsx'
import '../components/configurator/configurator.css'
import '../styles/ops.css'
import '../styles/production-job.css'
import '../styles/quality.css'

const QC_PAGES = [
  ['overview', 'Overview'],
  ['items', 'Items & Measurements'],
  ['materials', 'Materials'],
  ['documents', 'Documents'],
  ['decision', 'Decision'],
]

const PROCUREMENT_LABEL = {
  available: 'Available',
  purchase_required: 'Purchase required',
  missing_code: 'Missing stock code',
  not_in_inventory: 'Not in inventory',
  unit_mismatch: 'Unit mismatch',
}

const MEASUREMENT_STATUS_LABEL = {
  preliminary: 'Preliminary — for quotation only',
  final: 'Final — production basis',
  'client-provided': 'Client-provided',
}

const MEASUREMENT_SOURCE_LABEL = {
  'sofaamy-site-rep': 'Site representative',
  client: 'Client-provided',
  'architect-drawing': 'Architect/drawing',
}

function messageFrom(error) {
  return String(error?.message || error || 'Unable to save QC check')
    .replace(/^API \d+:\s*/, '')
}

function dimensions(design) {
  return design.width && design.height
    ? `${Number(design.width).toLocaleString()} × ${Number(design.height).toLocaleString()} mm`
    : 'Dimensions unavailable'
}

function documentKinds(design) {
  const category = design?.category || 'frame'
  if (category === 'frameless') {
    return [
      ['elevation', 'Design / elevation'],
      ['glass-order', 'Glass order'],
      ['hardware-list', 'Hardware list'],
      ['work-order', 'Factory work order'],
    ]
  }
  return [
    ['elevation', 'Design / elevation'],
    ['cutting-list', 'Cutting list'],
    ['work-order', 'Factory work order'],
    ['internal-boq', 'Item material BOQ'],
  ]
}

function approvedDrawingFor(workflow, designId) {
  const task = (workflow.drawing_tasks || []).find(
    row => row.design_id === designId && row.basis_status === 'current')
  if (!task) return null
  const revision = [...(task.revisions || [])]
    .sort((a, b) => b.revision - a.revision)
    .find(row => row.status === 'approved')
  return revision ? { task, revision } : null
}

export default function QualityCheck() {
  const { projectId, section } = useParams()
  const activePage = QC_PAGES.some(([key]) => key === section) ? section : 'overview'
  const [workflow, setWorkflow] = useState(null)
  const [items, setItems] = useState([])
  const [selectedItemId, setSelectedItemId] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState('')
  const [preview, setPreview] = useState(null)

  const [checks, setChecks] = useState(Object.fromEntries(CHECKS.map(([key]) => [key, false])))
  const [notes, setNotes] = useState('')
  const [inspector, setInspector] = useState('QA / QC')
  const [decisionBusy, setDecisionBusy] = useState(false)
  const [decisionError, setDecisionError] = useState('')
  const [decisionMessage, setDecisionMessage] = useState('')

  const refresh = async () => {
    setError('')
    const [workflowData, designRows] = await Promise.all([
      getProjectWorkflow(projectId), listDesigns(),
    ])
    const projectItems = designRows.filter(
      item => String(item.project_id) === String(projectId))
    setWorkflow(workflowData)
    setItems(projectItems)
    setSelectedItemId(current =>
      projectItems.some(item => String(item.id) === String(current))
        ? current : String(projectItems[0]?.id || ''))
  }

  useEffect(() => {
    refresh().catch(error => setError(messageFrom(error)))
  }, [projectId])
  useLiveRefresh(refresh)

  useEffect(() => () => {
    if (preview?.url) URL.revokeObjectURL(preview.url)
  }, [preview])

  if (error && !workflow) {
    return <>
      <PageHead title="Pre-production QC" subtitle={`Project #${projectId}`}>
        <Link className="btn btn-ghost" to="/quality">← Quality Control</Link>
      </PageHead>
      <div className="production-alert">⚠ {error}</div>
    </>
  }
  if (!workflow) return <div className="production-loading">Loading project QC pack…</div>

  const project = workflow.project
  const gate = workflow.preproduction_qc
  const [statusTone, statusLabel] = STATUS[gate.status] || STATUS.not_ready
  const selectedItem = items.find(item => String(item.id) === String(selectedItemId))
  const selectedDesign = selectedItem?.design || {}
  const selectedSummary = workflow.item_summary?.[String(selectedItem?.id ?? 'null')]
  const procurement = selectedSummary?.procurement || { rows: [], ready: false, shortage_count: 0 }
  const drawing = selectedItem ? approvedDrawingFor(workflow, selectedItem.id) : null

  const downloadItemDocument = async (kind, label) => {
    if (!selectedItem) return
    setBusy(`${kind}-${selectedItem.id}`)
    setError('')
    try {
      await downloadReport(kind, selectedItem.client_name || project.client_name, {
        ...selectedItem.design, projectId,
      }, selectedItem.id)
      setMessage(`${label} downloaded for ${selectedItem.ref || selectedItem.name}`)
    } catch (error) {
      setError(messageFrom(error))
    } finally {
      setBusy('')
    }
  }

  const previewItemDocument = async (kind, label) => {
    if (!selectedItem) return
    setBusy(`preview-${kind}-${selectedItem.id}`)
    setError('')
    try {
      const file = await previewReport(kind, selectedItem.client_name || project.client_name, {
        ...selectedItem.design, projectId,
      }, selectedItem.id)
      setPreview({ ...file, label })
    } catch (error) {
      setError(messageFrom(error))
    } finally {
      setBusy('')
    }
  }

  const allChecked = CHECKS.every(([key]) => checks[key])
  const submit = async (result) => {
    setDecisionBusy(true); setDecisionError(''); setDecisionMessage('')
    try {
      await recordPreProductionQc(projectId, { result, ...checks, notes, inspector })
      setDecisionMessage(result === 'approved'
        ? 'Project cleared for factory release.'
        : 'Project placed on hold. Factory release remains blocked.')
      await refresh()
    } catch (error) {
      setDecisionError(messageFrom(error))
    } finally {
      setDecisionBusy(false)
    }
  }

  return (
    <>
      <PageHead title={`${project.project_number} · ${project.name}`}
        subtitle={`${project.client_name || 'Walk-in client'}${project.location ? ` · ${project.location}` : ''}`}>
        <Link className="btn btn-ghost" to="/quality">← Quality Control</Link>
        <Badge tone={statusTone}>{statusLabel}</Badge>
      </PageHead>

      {error && <div className="production-alert">⚠ {error}</div>}
      {message && <div className="production-message">✓ {message}</div>}

      {!!gate.issues.length && <div className="quality-blockers" style={{ marginBottom:16 }}>
        <b>Blocking this project from reaching QC-ready state</b>
        {gate.issues.map(issue => <span key={issue}>• {issue}</span>)}
      </div>}

      <nav className="production-job-nav" aria-label="Pre-production QC pages">
        {QC_PAGES.map(([key, label]) => (
          <Link className={activePage === key ? 'active' : ''}
            to={`/quality/${projectId}/${key}`} key={key}>
            {label}
            {key === 'materials' && procurement.shortage_count > 0
              && <small>{procurement.shortage_count}</small>}
          </Link>
        ))}
      </nav>

      {['items', 'materials', 'documents'].includes(activePage) && items.length > 1 && (
        <div className="production-item-tabs" style={{ marginBottom:14 }}>
          {items.map(item => {
            const itemGate = gate.items.find(row => row.design_id === item.id)
            return <button className={String(item.id) === String(selectedItemId) ? 'active' : ''}
              onClick={() => setSelectedItemId(String(item.id))} key={item.id}>
              <IconLayers />
              <span><b>{item.ref || item.name}</b><small>{item.name} · Qty {item.qty}</small></span>
              {itemGate && !itemGate.procurement_ready
                && <Badge tone="orange">{itemGate.procurement_shortages}</Badge>}
            </button>
          })}
        </div>
      )}

      <main className="production-job-page">
        {activePage === 'overview' && (
          <div className="production-progress-page">
            <Card title="Item chain summary" sub="Extraction, quotation, drawing and material status feeding this QC decision.">
              <div className="quality-chain-list">
                {gate.items.map(row => <div key={row.design_id ?? 'ungrouped'}>
                  <b>{row.label}</b>
                  <span>E{row.extraction_revision || '—'} · {row.quote_number || 'No accepted quote'} · R{row.drawing_revision || '—'}</span>
                  <Badge tone={row.procurement_ready ? 'green' : 'red'}>{row.procurement_ready
                    ? 'Materials ready'
                    : row.extraction_revision
                      ? `${row.procurement_shortages} material issue${row.procurement_shortages === 1 ? '' : 's'}`
                      : 'Procurement pending'}</Badge>
                </div>)}
              </div>
            </Card>

            {gate.latest_check && (
              <Card title="Last QC decision" sub="Most recent recorded outcome for this project's current pack.">
                <p className="quality-last-check" style={{ margin:0, paddingTop:0, border:0 }}>
                  <b>{gate.latest_check.result}</b> by {gate.latest_check.inspector} · {timeAgo(gate.latest_check.checked_at)}
                  {gate.latest_check.notes ? ` · ${gate.latest_check.notes}` : ''}
                  {!gate.latest_check.current ? ' · Superseded by a change since this decision' : ''}
                </p>
              </Card>
            )}
          </div>
        )}

        {activePage === 'items' && (
          <Card title="Item measurements" sub="Cross-check the current dimensions and site measurement record against what will be cut.">
            {selectedItem ? <>
              <div className="production-item-summary">
                <div><span>Reference</span><b>{selectedItem.ref || selectedItem.name}</b></div>
                <div><span>Dimensions</span><b>{dimensions(selectedDesign)}</b></div>
                <div><span>Quantity</span><b>{selectedItem.qty || selectedDesign.qty || 1}</b></div>
                <div><span>System</span><b>{selectedDesign.system || '—'}</b></div>
                <div><span>Finish</span><b>{selectedDesign.colourDescription || selectedDesign.frame || '—'}</b></div>
                <div><span>Location</span><b>{selectedItem.location || selectedDesign.location || '—'}</b></div>
                <div><span>Measurement status</span><b>{MEASUREMENT_STATUS_LABEL[selectedDesign.measurementStatus] || 'Preliminary'}</b></div>
                <div><span>Measurement source</span><b>{MEASUREMENT_SOURCE_LABEL[selectedDesign.measurementSource] || '—'}</b></div>
                <div><span>Measured by</span><b>{selectedDesign.measuredBy || '—'}{selectedDesign.measurementDate ? ` · ${selectedDesign.measurementDate}` : ''}</b></div>
              </div>

              {selectedDesign.measurementStatus && selectedDesign.measurementStatus !== 'final' && (
                <div className="production-block" style={{ marginBottom:14 }}>
                  <IconRuler style={{ width:14, verticalAlign:'-2px', marginRight:6 }} />
                  This item's measurement record is not marked "Final — production basis". Confirm it is correct before releasing to the factory.
                </div>
              )}

              {selectedDesign.siteNotes && <Card title="Site notes" pad={false} className="mb">
                <p style={{ margin:0, padding:'12px 14px', color:'var(--ink-2)', fontSize:12, lineHeight:1.5 }}>{selectedDesign.siteNotes}</p>
              </Card>}

              {!!(selectedDesign.siteImages || []).length && (
                <div className="mb">
                  <div className="cfg-label" style={{ margin:'0 0 6px' }}>Site images / evidence</div>
                  <div className="site-image-grid">
                    {selectedDesign.siteImages.map(image => (
                      <div className="site-image-card" key={image.id}>
                        <img src={image.dataUrl} alt={image.caption || image.name || 'Site evidence'} />
                        <div className="site-image-name">{image.caption || image.name}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {['frame', 'curtainwall'].includes(selectedDesign.category || 'frame')
                && <CutPlan design={selectedDesign} />}
            </> : <div className="production-empty">No saved design item is linked to this project yet.</div>}
          </Card>
        )}

        {activePage === 'materials' && (
          <Card title="Required materials" sub={`Live procurement position for ${selectedItem?.ref || selectedItem?.name || 'this item'}, from approved extraction E${selectedSummary?.approved_extraction_revision || '—'}.`}>
            {selectedSummary?.approved_extraction_revision ? <>
              <div className={`production-stock-summary ${procurement.ready ? 'ready' : 'warning'}`}>
                <b>{procurement.ready ? 'Materials available for issue' : `${procurement.shortage_count} material issue${procurement.shortage_count === 1 ? '' : 's'} require attention`}</b>
                <span>The factory will cut only from these approved quantities.</span>
              </div>
              <div className="tbl-wrap">
                <table className="tbl production-material-table">
                  <thead><tr><th>Code</th><th>Material</th><th>Required</th><th>Available</th><th>Shortfall</th><th>Status</th></tr></thead>
                  <tbody>
                    {procurement.rows.map(row => (
                      <tr key={row.item_id}>
                        <td className="t-mono">{row.code || '—'}</td>
                        <td><b>{row.material}</b><small>{row.category}</small></td>
                        <td className="t-mono">{row.required} {row.unit}</td>
                        <td className="t-mono">{row.available} {row.unit}</td>
                        <td className="t-mono">{row.shortfall} {row.unit}</td>
                        <td><Badge tone={row.status === 'available' ? 'green' : 'orange'}>
                          {PROCUREMENT_LABEL[row.status] || row.status}
                        </Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </> : <div className="production-empty">No approved material extraction for this item yet — there is nothing to check.</div>}
          </Card>
        )}

        {activePage === 'documents' && (
          <div className="production-documents-page">
            <Card title="Factory documents" sub="Generate and cross-check the documents that will travel with this item to the floor.">
              {selectedItem ? <div className="production-doc-actions">
                {documentKinds(selectedDesign).map(([kind, label]) => (
                  <div className="production-doc-option" key={kind}>
                    <span><IconFile /><b>{label}</b></span>
                    <div>
                      <button className="btn btn-ghost btn-sm"
                        disabled={busy === `preview-${kind}-${selectedItem.id}`}
                        onClick={() => previewItemDocument(kind, label)}>
                        {busy === `preview-${kind}-${selectedItem.id}` ? 'Opening…' : 'Open'}
                      </button>
                      <button className="btn btn-ghost btn-sm"
                        disabled={busy === `${kind}-${selectedItem.id}`}
                        onClick={() => downloadItemDocument(kind, label)}>
                        <IconDownload /> {busy === `${kind}-${selectedItem.id}` ? 'Preparing…' : 'Download'}
                      </button>
                    </div>
                  </div>
                ))}
              </div> : <div className="production-empty">No saved design item is linked to this project yet.</div>}
            </Card>

            <Card title="Approved drawing" sub="Controlled files from the approved drawing revision for this item.">
              {drawing ? <>
                <div className="production-basis" style={{ gridTemplateColumns:'1fr' }}>
                  <div><span>Revision</span><b>R{drawing.revision.revision}</b></div>
                </div>
                <div className="production-release-files">
                  {(drawing.revision.files || []).map(file => (
                    <a href={drawingFileUrl(file.download_url)} key={file.id} target="_blank" rel="noreferrer">
                      <IconFile />
                      <span><b>{file.filename}</b><small>{file.kind.replaceAll('_', ' ')}</small></span>
                      <IconDownload />
                    </a>
                  ))}
                  {!drawing.revision.files?.length && <div className="production-empty">No attached drawing files.</div>}
                </div>
              </> : <div className="production-empty">No approved drawing on this item's current chain yet.</div>}
            </Card>
          </div>
        )}

        {activePage === 'decision' && (
          <Card title="Pre-production QC decision" sub="Verify the complete current project pack, then clear or hold factory release.">
            <div className="quality-check-grid">
              {CHECKS.map(([key, label]) => <label key={key}>
                <input type="checkbox" checked={checks[key]} onChange={event => setChecks(current => ({ ...current, [key]: event.target.checked }))} />
                <span>{label}</span>
              </label>)}
            </div>
            <div className="quality-form-grid">
              <label><span>Inspector / department</span><input value={inspector} maxLength={60} onChange={event => setInspector(event.target.value)} /></label>
              <label><span>QC notes / hold reason</span><textarea value={notes} maxLength={160} placeholder="Required when placing the project on hold" onChange={event => setNotes(event.target.value)} /></label>
            </div>
            {decisionError && <div className="quality-message error">{decisionError}</div>}
            {decisionMessage && <div className="quality-message success">{decisionMessage}</div>}
            <div className="quality-actions">
              <button className="btn btn-ghost" disabled={decisionBusy || !notes.trim() || !inspector.trim()} onClick={() => submit('hold')}>Place on hold</button>
              <button className="btn btn-primary" disabled={decisionBusy || !gate.ready || !allChecked || !inspector.trim()} onClick={() => submit('approved')}>
                <IconCheck /> Approve for factory release
              </button>
            </div>
          </Card>
        )}
      </main>

      {preview && (
        <div className="production-preview-backdrop" role="presentation"
          onMouseDown={event => {
            if (event.target === event.currentTarget) setPreview(null)
          }}>
          <section className="production-preview" role="dialog" aria-modal="true"
            aria-label={`${preview.label} preview`}>
            <header>
              <div><span>Document preview</span><b>{preview.label}</b><small>{preview.name}</small></div>
              <button className="btn btn-ghost btn-sm" onClick={() => setPreview(null)}
                aria-label="Close document preview">Close</button>
            </header>
            <iframe src={preview.url} title={`${preview.label} PDF`} />
          </section>
        </div>
      )}
    </>
  )
}
