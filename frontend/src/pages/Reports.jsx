import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { PageHead, Card, Badge } from '../components/ui.jsx'
import { availableReportGroups, reportKind } from '../lib/reports.js'
import {
  listDesigns, listProjects, listJobs, downloadReport,
  downloadProjectQuoteSummary, downloadProjectMaterialBOQ, downloadProjectCuttingList,
  downloadQuotationPdf, downloadDeliveryNote,
} from '../lib/api.js'
import { useLiveRefresh } from '../lib/live.js'
import {
  IconBox, IconChart, IconDownload, IconFactory, IconFile, IconTruck,
} from '../components/icons.jsx'
import '../styles/reports.css'

const DEPARTMENT_ICON = {
  technical:IconFile,
  factory:IconFactory,
  site:IconTruck,
}

function messageFrom(error) {
  return String(error?.message || error)
    .replace(/^API \d+: /, '')
    .replace(/^\{"detail":"|"\}$/g, '')
}

function ReportAction({ name, desc, busy, onDownload }) {
  return (
    <div className="report-action">
      <div>
        <b>{name}</b>
        <span>{desc}</span>
      </div>
      <button className="btn btn-ghost btn-sm" disabled={busy} onClick={onDownload}>
        <IconDownload/>{busy ? 'Preparing…' : 'Download PDF'}
      </button>
    </div>
  )
}

export default function Reports() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [designs, setDesigns] = useState([])
  const [projects, setProjects] = useState([])
  const [jobs, setJobs] = useState([])
  const [selectedProjectId, setSelectedProjectId] = useState(
    searchParams.get('project') || '')
  const [selectedItemId, setSelectedItemId] = useState(
    searchParams.get('item') || '')
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [offline, setOffline] = useState(false)

  const refresh = () => Promise.all([listProjects(), listDesigns(), listJobs()])
      .then(([projectRows, designRows, jobRows]) => {
        setProjects(projectRows)
        setDesigns(designRows)
        setJobs(jobRows)
        setOffline(false)
      })
      .catch(() => setOffline(true))
  useEffect(() => { refresh() }, [])
  useLiveRefresh(refresh)

  const selectedProject = projects.find(
    project => String(project.id) === String(selectedProjectId))
  const projectItems = useMemo(() => designs.filter(
    item => String(item.project_id || '') === String(selectedProjectId)),
  [designs, selectedProjectId])
  const projectJobs = useMemo(() => jobs.filter(
    job => String(job.project_id || '') === String(selectedProjectId)),
  [jobs, selectedProjectId])
  const selectedItem = projectItems.find(
    item => String(item.id) === String(selectedItemId))
  const itemGroups = selectedItem
    ? availableReportGroups(selectedItem.design?.category || 'frame') : []

  useEffect(() => {
    if (!selectedProjectId || !projectItems.length) {
      if (!selectedProjectId) setSelectedItemId('')
      return
    }
    if (!projectItems.some(item => String(item.id) === String(selectedItemId))) {
      setSelectedItemId(String(projectItems[0].id))
    }
  }, [selectedProjectId, selectedItemId, projectItems])

  function selectProject(value) {
    const firstItem = designs.find(
      item => String(item.project_id || '') === String(value))
    setSelectedProjectId(value)
    setSelectedItemId(firstItem ? String(firstItem.id) : '')
    setMessage('')
    setError('')
    setSearchParams(value ? { project:value } : {})
  }

  function selectItem(value) {
    setSelectedItemId(value)
    setMessage('')
    setError('')
    setSearchParams(selectedProjectId
      ? { project:selectedProjectId, ...(value ? { item:value } : {}) }
      : {})
  }

  async function run(key, action, success) {
    setBusy(key)
    setMessage('')
    setError('')
    try {
      await action()
      setMessage(success)
    } catch (error) {
      setError(messageFrom(error))
    } finally {
      setBusy('')
    }
  }

  const downloadItem = (report) => {
    if (!selectedItem) return
    const kind = reportKind(report, selectedItem.design?.category || 'frame')
    if (!kind) return
    run(
      `item-${kind}`,
      () => downloadReport(
        kind,
        selectedItem.client_name || selectedProject?.client_name || '',
        selectedItem.design,
        selectedItem.id,
      ),
      `${report.name} downloaded for ${selectedItem.ref || selectedItem.name}.`,
    )
  }

  return (
    <>
      <PageHead title="Department Reports"
        subtitle="Choose a project, then download only the documents each department uses.">
        <Link to="/insights" className="btn btn-ghost"><IconChart/> Insights & KPIs</Link>
        {offline
          ? <Badge tone="orange">Backend offline</Badge>
          : <select className="rep-select" value={selectedProjectId}
              onChange={event => selectProject(event.target.value)}>
              <option value="">Choose a project…</option>
              {projects.map(project => (
                <option key={project.id} value={project.id}>
                  {project.project_number} · {project.name} · {project.item_count} item{project.item_count === 1 ? '' : 's'}
                </option>
              ))}
            </select>}
      </PageHead>

      {message && <div className="report-notice success">✓ {message}</div>}
      {error && <div className="report-notice error">⚠ {error}</div>}

      {!selectedProject && !offline && (
        <div className="reports-empty">
          <IconFile/>
          <h2>Select a project</h2>
          <p>The report pack will show the current client, technical, factory and dispatch documents for that project.</p>
        </div>
      )}

      {selectedProject && <>
        <div className="report-project-context">
          <div>
            <span>Selected project</span>
            <h2>{selectedProject.name}</h2>
            <p>{selectedProject.project_number} · {selectedProject.client_name || 'Walk-in Client'}{selectedProject.location ? ` · ${selectedProject.location}` : ''}</p>
          </div>
          <Badge tone="blue">{selectedProject.workflow_status_label || 'Project open'}</Badge>
        </div>

        <div className="grid g-2 mb report-project-pack">
          <Card title="Sales & Accounts" sub="Client-facing project documents and issued quotation records."
            action={<span className="report-department"><IconFile/> Project scope</span>}>
            <ReportAction name="Current project quotation"
              desc="One client quotation containing every saved project item and its cost."
              busy={busy === 'project-quote'}
              onDownload={() => run(
                'project-quote',
                () => downloadProjectQuoteSummary(selectedProject.id),
                `Current project quotation downloaded for ${selectedProject.project_number}.`,
              )}/>
            {!!selectedProject.quotes?.length && <div className="report-issued">
              <div className="report-issued-title">Issued quotation copies</div>
              {selectedProject.quotes.map(quote => (
                <div className="report-issued-row" key={quote.quote_number}>
                  <div>
                    <b>{quote.quote_number}</b>
                    <span>{quote.product} · {quote.status}</span>
                  </div>
                  <button className="btn btn-ghost btn-sm"
                    disabled={busy === `quote-${quote.quote_number}`}
                    onClick={() => run(
                      `quote-${quote.quote_number}`,
                      () => downloadQuotationPdf(quote.quote_number),
                      `${quote.quote_number} downloaded.`,
                    )}>
                    <IconDownload/>{busy === `quote-${quote.quote_number}` ? 'Preparing…' : 'PDF'}
                  </button>
                </div>
              ))}
            </div>}
          </Card>

          <Card title="Procurement & Stores"
            sub="Combined project materials with item traceability and approved extraction quantities."
            action={<span className="report-department"><IconBox/> Project scope</span>}>
            <ReportAction name="Project material & BOQ pack"
              desc="Profiles, glass, hardware, costs and consolidated quantities for every item."
              busy={busy === 'project-materials'}
              onDownload={() => run(
                'project-materials',
                () => downloadProjectMaterialBOQ(selectedProject.id),
                `Project material and BOQ pack downloaded for ${selectedProject.project_number}.`,
              )}/>
          </Card>
        </div>

        {projectItems.some(item => ['frame', 'curtainwall'].includes(item.design?.category)) && <Card title="Production / Factory project pack"
          sub="One bundle-safe cutting document for every framed project item, with dimensioned members, end angles and combined stock-bar nesting."
          className="mb"
          action={<span className="report-department"><IconFactory/> Project scope</span>}>
          <ReportAction name="Project cutting & bundle pack"
            desc="Labels every cut as Window 1, Window 2, Door 1, etc., even when stock bars are optimized across the full project."
            busy={busy === 'project-cutting'}
            onDownload={() => run(
              'project-cutting',
              () => downloadProjectCuttingList(selectedProject.id),
              `Project cutting and bundle pack downloaded for ${selectedProject.project_number}.`,
            )}/>
        </Card>}

        <Card title="Selected project item"
          sub="Technical and factory documents are generated for one item so dimensions and approved revisions cannot be mixed."
          className="mb">
          {projectItems.length
            ? <div className="report-item-picker">
                {projectItems.map((item, index) => (
                  <button key={item.id}
                    className={String(item.id) === String(selectedItemId) ? 'active' : ''}
                    onClick={() => selectItem(String(item.id))}>
                    <span>{index + 1}</span>
                    <div><b>{item.ref || `Item ${index + 1}`}</b><small>{item.name}</small></div>
                  </button>
                ))}
              </div>
            : <div className="report-inline-empty">This project has no saved design items yet.</div>}
        </Card>

        {selectedItem && <div className="grid g-2 mb report-department-grid">
          {itemGroups.map(group => {
            const DepartmentIcon = DEPARTMENT_ICON[group.id] || IconFile
            return <Card key={group.id} title={group.title} sub={group.sub}
              action={<span className="report-department"><DepartmentIcon/> {group.department}</span>}>
              {group.reports.map(report => (
                <ReportAction key={report.name} name={report.name} desc={report.desc}
                  busy={busy === `item-${reportKind(report, selectedItem.design?.category || 'frame')}`}
                  onDownload={() => downloadItem(report)}/>
              ))}
            </Card>
          })}
        </div>}

        <Card title="Dispatch documents"
          sub="Delivery notes appear here after Dispatch assigns a driver and vehicle."
          action={<Link className="btn btn-ghost btn-sm" to="/dispatch">Open Dispatch</Link>}>
          {projectJobs.length
            ? <div className="report-deliveries">
                {projectJobs.map(job => (
                  <div className="report-delivery-row" key={job.job_number}>
                    <div>
                      <b>{job.job_number}</b>
                      <span>{job.product} · {job.stage_label}</span>
                    </div>
                    {job.dn_number
                      ? <button className="btn btn-ghost btn-sm"
                          disabled={busy === `delivery-${job.job_number}`}
                          onClick={() => run(
                            `delivery-${job.job_number}`,
                            () => downloadDeliveryNote(job.job_number),
                            `${job.dn_number} downloaded.`,
                          )}>
                          <IconDownload/>{busy === `delivery-${job.job_number}` ? 'Preparing…' : job.dn_number}
                        </button>
                      : <Badge tone="orange">Delivery note not assigned</Badge>}
                  </div>
                ))}
              </div>
            : <div className="report-inline-empty">No factory jobs have been opened for this project.</div>}
        </Card>
      </>}
    </>
  )
}
