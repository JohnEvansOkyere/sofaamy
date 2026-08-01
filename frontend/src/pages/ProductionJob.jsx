import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Badge, Card, PageHead, Progress } from '../components/ui.jsx'
import CutPlan from '../components/configurator/CutPlan.jsx'
import {
  advanceJob, downloadProjectMaterialBOQ, downloadReport,
  drawingFileUrl, getJob, getProjectWorkflow, listDesigns, previewReport,
} from '../lib/api.js'
import { timeAgo } from '../lib/whatsapp.js'
import { IconCheck, IconDownload, IconFactory, IconFile, IconLayers } from '../components/icons.jsx'
import '../components/configurator/configurator.css'
import '../styles/ops.css'
import '../styles/production-job.css'

const PROCUREMENT_LABEL = {
  available: 'Available',
  purchase_required: 'Purchase required',
  missing_code: 'Missing stock code',
  not_in_inventory: 'Not in inventory',
  unit_mismatch: 'Unit mismatch',
}

const JOB_PAGES = [
  ['progress', 'Progress'],
  ['designs', 'Designs & Cutting'],
  ['materials', 'Materials'],
  ['documents', 'Production Documents'],
  ['activity', 'Activity'],
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

function dimensions(item) {
  const design = item?.design || {}
  return design.width && design.height
    ? `${Number(design.width).toLocaleString()} × ${Number(design.height).toLocaleString()} mm`
    : 'Dimensions unavailable'
}

function documentKinds(item) {
  const category = item?.design?.category || 'frame'
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

export default function ProductionJob() {
  const { jobNumber, section } = useParams()
  const activePage = JOB_PAGES.some(([key]) => key === section) ? section : 'progress'
  const [job, setJob] = useState(null)
  const [workflow, setWorkflow] = useState(null)
  const [items, setItems] = useState([])
  const [selectedItemId, setSelectedItemId] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [preview, setPreview] = useState(null)

  const refresh = async () => {
    setError('')
    const jobData = await getJob(jobNumber)
    if (!jobData.production_authorized) {
      throw new Error('This job does not have a current approved factory release.')
    }
    const [workflowData, designRows] = await Promise.all([
      getProjectWorkflow(jobData.project_id),
      listDesigns(),
    ])
    const projectItems = designRows.filter(
      item => String(item.project_id) === String(jobData.project_id))
    setJob(jobData)
    setWorkflow(workflowData)
    setItems(projectItems)
    setSelectedItemId(current =>
      projectItems.some(item => String(item.id) === String(current))
        ? current : String(projectItems[0]?.id || ''))
  }

  useEffect(() => {
    refresh().catch(error => setError(messageFrom(error)))
  }, [jobNumber])

  useEffect(() => () => {
    if (preview?.url) URL.revokeObjectURL(preview.url)
  }, [preview])

  const selectedItem = items.find(
    item => String(item.id) === String(selectedItemId))
  const stages = job?.stages || []
  const currentStageIndex = stages.findIndex(stage => stage.key === job?.stage)
  const release = job?.factory_release
  const procurement = workflow?.procurement || { rows: [], ready: false, shortage_count: 0 }
  const approvedExtraction = workflow?.extractions?.find(
    extraction => extraction.status === 'approved')

  const itemSummary = useMemo(() => {
    if (!selectedItem) return []
    const design = selectedItem.design || {}
    return [
      ['Reference', selectedItem.ref || selectedItem.name],
      ['Dimensions', dimensions(selectedItem)],
      ['Quantity', selectedItem.qty || design.qty || 1],
      ['System', design.system || workflow?.project?.product_system || '—'],
      ['Finish', design.colourDescription || design.frame || '—'],
      ['Location', selectedItem.location || design.location || '—'],
    ]
  }, [selectedItem, workflow])

  const advance = async () => {
    if (!job?.next_stage) return
    setBusy('advance')
    setError('')
    try {
      await advanceJob(job.job_number)
      await refresh()
      setMessage(`Moved ${job.job_number} to ${job.next_stage}`)
    } catch (error) {
      setError(messageFrom(error))
    } finally {
      setBusy('')
    }
  }

  const downloadItemDocument = async (kind, label) => {
    if (!selectedItem) return
    setBusy(`${kind}-${selectedItem.id}`)
    setError('')
    try {
      await downloadReport(kind, selectedItem.client_name || job.client, {
        ...selectedItem.design,
        projectId: selectedItem.project_id,
      })
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
      const file = await previewReport(kind, selectedItem.client_name || job.client, {
        ...selectedItem.design,
        projectId: selectedItem.project_id,
      })
      setPreview({ ...file, label })
    } catch (error) {
      setError(messageFrom(error))
    } finally {
      setBusy('')
    }
  }

  const downloadMaterials = async () => {
    setBusy('materials')
    setError('')
    try {
      await downloadProjectMaterialBOQ(job.project_id)
      setMessage(`Approved E${release.extraction_revision} material pack downloaded`)
    } catch (error) {
      setError(messageFrom(error))
    } finally {
      setBusy('')
    }
  }

  if (error && !job) {
    return <>
      <PageHead title="Factory workspace" subtitle={jobNumber}>
        <Link className="btn btn-ghost" to="/production">← Factory Board</Link>
      </PageHead>
      <div className="production-alert">⚠ {error}</div>
    </>
  }

  if (!job || !workflow) {
    return <div className="production-loading">Loading approved factory pack…</div>
  }

  return (
    <>
      <PageHead title={job.product} subtitle={`${job.job_number} · ${job.client}`}>
        <Link className="btn btn-ghost" to="/production">← Factory Board</Link>
        <Badge tone="green">Technically released</Badge>
      </PageHead>

      {error && <div className="production-alert">⚠ {error}</div>}
      {message && <div className="production-message">✓ {message}</div>}

      <div className="production-release-banner">
        <IconFactory />
        <div>
          <b>{release.release_number}</b>
          <span>Approved factory basis: Extraction E{release.extraction_revision} · Quotation {release.quotation_number} · Drawing R{release.drawing_revision}</span>
        </div>
        <Badge tone="green">Current release</Badge>
      </div>

      <div className="production-pipeline">
        <div className="production-progress-head">
          <span>Production pipeline</span>
          <Progress value={job.progress} />
          <b>{job.progress}%</b>
        </div>
        <div className="production-stage-track">
          {stages.map((stage, index) => (
            <div className={index < currentStageIndex ? 'done' : index === currentStageIndex ? 'current' : ''}
              key={stage.key}>
              <i>{index < currentStageIndex ? '✓' : index + 1}</i>
              <span>{stage.label}</span>
            </div>
          ))}
        </div>
      </div>

      <nav className="production-job-nav" aria-label="Factory job pages">
        {JOB_PAGES.map(([key, label]) => (
          <Link className={activePage === key ? 'active' : ''}
            to={`/production/${jobNumber}/${key}`} key={key}>
            {label}
            {key === 'materials' && procurement.shortage_count > 0
              && <small>{procurement.shortage_count}</small>}
            {key === 'documents' && <small>{release.files?.length || 0}</small>}
          </Link>
        ))}
      </nav>

      <main className="production-job-page">
        {activePage === 'progress' && (
          <div className="production-progress-page">
            <Card title="Current production step"
              sub={`Step ${Math.max(1, currentStageIndex + 1)} of ${stages.length}`}>
              <div className="production-current-step">
                <div>
                  <span>Current status</span>
                  <strong>{job.stage_label}</strong>
                  <p>{job.block
                    ? 'This job cannot move forward until the issue below is resolved.'
                    : job.next_stage
                      ? `The next factory step is ${job.next_stage}.`
                      : 'All production stages have been completed.'}</p>
                </div>
                {job.next_stage
                  ? <button className="btn btn-primary"
                      disabled={busy === 'advance' || Boolean(job.block)}
                      onClick={advance}>
                      <IconCheck /> {busy === 'advance' ? 'Updating…' : `Advance to ${job.next_stage}`}
                    </button>
                  : <div className="production-complete"><IconCheck /> Production completed</div>}
              </div>
              {job.block && <div className="production-block">⚠ {job.block}</div>}
            </Card>

            <div className="production-page-shortcuts">
              <Link to={`/production/${jobNumber}/designs`}>
                <IconLayers />
                <span><b>Designs & Cutting</b><small>{items.length} released project item{items.length === 1 ? '' : 's'}</small></span>
                <em>Open →</em>
              </Link>
              <Link to={`/production/${jobNumber}/materials`}>
                <IconFactory />
                <span><b>Materials</b><small>{procurement.ready ? 'Ready for issue' : `${procurement.shortage_count} issue${procurement.shortage_count === 1 ? '' : 's'} require attention`}</small></span>
                <em>Open →</em>
              </Link>
              <Link to={`/production/${jobNumber}/documents`}>
                <IconFile />
                <span><b>Production Documents</b><small>{release.files?.length || 0} controlled release file{release.files?.length === 1 ? '' : 's'}</small></span>
                <em>Open →</em>
              </Link>
            </div>
          </div>
        )}

        {activePage === 'designs' && (
          <Card title="Released project designs" sub="Select an item to view its dimensions, cutting information and factory documents.">
            {items.length ? <>
              <div className="production-item-tabs">
                {items.map(item => (
                  <button className={String(item.id) === String(selectedItemId) ? 'active' : ''}
                    onClick={() => setSelectedItemId(String(item.id))} key={item.id}>
                    <IconLayers />
                    <span><b>{item.ref || item.name}</b><small>{item.name} · Qty {item.qty}</small></span>
                  </button>
                ))}
              </div>
              <div className="production-item-summary">
                {itemSummary.map(([label, value]) => (
                  <div key={label}><span>{label}</span><b>{value}</b></div>
                ))}
              </div>
              <div className="production-doc-actions">
                {documentKinds(selectedItem).map(([kind, label]) => (
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
              </div>
              {['frame', 'curtainwall'].includes(selectedItem.design?.category || 'frame')
                && <CutPlan design={selectedItem.design} />}
            </> : <div className="production-empty">
              No saved design items are linked to this released project. Use the approved drawing files in the Factory Pack.
            </div>}
          </Card>
        )}

        {activePage === 'materials' && (
          <Card title="Approved material list" sub={`Current production quantities from approved extraction E${approvedExtraction?.revision || release.extraction_revision}.`}
            action={<button className="btn btn-ghost btn-sm" disabled={busy === 'materials'}
              onClick={downloadMaterials}>
              <IconDownload /> {busy === 'materials' ? 'Preparing…' : 'Material pack PDF'}
            </button>}>
            <div className={`production-stock-summary ${procurement.ready ? 'ready' : 'warning'}`}>
              <b>{procurement.ready ? 'Materials available for issue' : `${procurement.shortage_count} material issue${procurement.shortage_count === 1 ? '' : 's'} require attention`}</b>
              <span>The cutting stage uses only these approved quantities.</span>
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
                  {!procurement.rows.length && <tr><td colSpan={6} className="production-empty">No approved material rows.</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {activePage === 'documents' && (
          <div className="production-documents-page">
          <Card title="Released factory pack" sub="Controlled documents from the approved drawing revision.">
            <div className="production-basis">
              <div><span>Release</span><b>{release.release_number}</b></div>
              <div><span>Extraction</span><b>E{release.extraction_revision}</b></div>
              <div><span>Quotation</span><b>{release.quotation_number}</b></div>
              <div><span>Drawing</span><b>R{release.drawing_revision}</b></div>
            </div>
            <div className="production-release-files">
              {(release.files || []).map(file => (
                <a href={drawingFileUrl(`/api/drawing-files/${file.file_id}`)} key={file.file_id}>
                  <IconFile />
                  <span><b>{file.filename}</b><small>{file.kind.replaceAll('_', ' ')}</small></span>
                  <IconDownload />
                </a>
              ))}
              {!release.files?.length && <div className="production-empty">No attached release files.</div>}
            </div>
          </Card>

          <Card title="Release checks" sub="The factory can work only from this aligned chain.">
            <div className="production-checks">
              <div><IconCheck /><span><b>Technical extraction approved</b><small>E{release.extraction_revision}</small></span></div>
              <div><IconCheck /><span><b>Commercial quotation accepted</b><small>{release.quotation_number}</small></span></div>
              <div><IconCheck /><span><b>Drawing approved</b><small>R{release.drawing_revision}</small></span></div>
              <div><IconCheck /><span><b>Factory release current</b><small>{release.release_number}</small></span></div>
            </div>
          </Card>
          </div>
        )}

        {activePage === 'activity' && (
          <Card title="Activity" sub="Latest actions on this production job.">
            <div className="production-events">
              {job.events.map((event, index) => (
                <div key={`${event.at}-${index}`}>
                  <i />
                  <p><b>{event.who}</b><span>{event.note}</span><small>{timeAgo(event.at)}</small></p>
                </div>
              ))}
              {!job.events.length && <div className="production-empty">No production activity yet.</div>}
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
