import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHead, Card, Badge } from '../components/ui.jsx'
import { REPORT_GROUPS, REPORT_STATUS, reportKind } from '../lib/reports.js'
import { listDesigns, listProjects, downloadReport, downloadProjectQuoteSummary, downloadProjectMaterialBOQ } from '../lib/api.js'
import { IconChart, IconDownload } from '../components/icons.jsx'
import CutPlan from '../components/configurator/CutPlan.jsx'
import '../components/configurator/configurator.css'

function ReportRow({ r, item, busy, onDownload }) {
  const st = REPORT_STATUS[r.status]
  const kind = item ? reportKind(r, item.design?.category || 'frame') : null
  return (
    <div className="flex between items-center" style={{ padding:'8px 0', borderBottom:'1px solid var(--line-soft)', gap:10 }}>
      <div style={{ minWidth:0 }}>
        <div className="t-strong" style={{ fontSize:12.5 }}>{r.name}</div>
        <div className="muted" style={{ fontSize:11.5 }}>{r.desc}</div>
      </div>
      {kind ? (
        <button className="btn btn-ghost btn-sm" disabled={busy === r.name}
          onClick={() => onDownload(kind, r.name)}>
          <IconDownload style={{ width:13, height:13 }}/> {busy === r.name ? 'Preparing…' : 'PDF'}
        </button>
      ) : <Badge tone={st.tone}>{st.label}</Badge>}
    </div>
  )
}

export default function Reports() {
  const [designs, setDesigns] = useState([])
  const [projects, setProjects] = useState([])
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [selectedItemId, setSelectedItemId] = useState('')
  const [busy, setBusy] = useState(null)
  const [msg, setMsg] = useState('')
  const [offline, setOffline] = useState(false)

  useEffect(() => {
    Promise.all([listProjects(), listDesigns()])
      .then(([projectRows, designRows]) => { setProjects(projectRows); setDesigns(designRows) })
      .catch(() => setOffline(true))
  }, [])

  const selectedProject = projects.find(p => String(p.id) === String(selectedProjectId))
  const projectItems = selectedProject
    ? designs.filter(d => String(d.project_id || '') === String(selectedProject.id))
    : designs
  const selectedItem = designs.find(d => String(d.id) === String(selectedItemId))

  function onProjectChange(value) {
    setSelectedProjectId(value)
    setSelectedItemId('')
    setMsg('')
  }

  function onItemChange(value) {
    setSelectedItemId(value)
    setMsg('')
  }

  async function onDownloadProjectQuote() {
    if (!selectedProject) return
    setBusy('project-quote'); setMsg('')
    try {
      await downloadProjectQuoteSummary(selectedProject.id)
      setMsg(`📄 Project quotation — ${selectedProject.project_number} downloaded`)
    } catch (e) {
      setMsg(`⚠️ ${String(e.message || e)}`)
    }
    setBusy(null)
  }

  async function onDownloadProjectMaterialBOQ() {
    if (!selectedProject) return
    setBusy('project-material-boq'); setMsg('')
    try {
      await downloadProjectMaterialBOQ(selectedProject.id)
      setMsg(`📦 Project material pack — ${selectedProject.project_number} downloaded`)
    } catch (e) {
      setMsg(`⚠️ ${String(e.message || e)}`)
    }
    setBusy(null)
  }

  async function onDownload(kind, name) {
    setBusy(name); setMsg('')
    try {
      await downloadReport(kind, selectedItem.client_name || '', {
        ...selectedItem.design,
        projectId: selectedItem.project_id || null,
      })
      setMsg(`📄 ${name} — ${selectedItem.ref || selectedItem.name} downloaded`)
    } catch (e) {
      setMsg(`⚠️ ${String(e.message || e)}`)
    }
    setBusy(null)
  }

  return (
    <>
      <PageHead title="Reports" subtitle="Every document the system produces — from quotation to factory floor to handover.">
        <Link to="/insights" className="btn btn-ghost"><IconChart/> Insights & KPIs</Link>
        {offline
          ? <Badge tone="orange">backend offline — start the API to download documents</Badge>
          : <>
              <select className="rep-select" value={selectedProjectId} onChange={e => onProjectChange(e.target.value)}>
                <option value="">Select a full project…</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.project_number} · {p.name} · {p.item_count} item{p.item_count === 1 ? '' : 's'}
                  </option>
                ))}
              </select>
              <select className="rep-select" value={selectedItemId} onChange={e => onItemChange(e.target.value)}>
                <option value="">Select an individual item…</option>
                {projectItems.map(d => (
                  <option key={d.id} value={d.id}>
                    {(d.ref || d.name)} — {d.name}{d.client_name ? ` · ${d.client_name}` : ''}
                  </option>
                ))}
              </select>
            </>}
      </PageHead>
      {msg && <div className="muted mb" style={{ fontSize:12.5 }}>{msg}</div>}

      {selectedProject && <Card title="Full project" sub="Project-level documents include every saved item under this project.">
        <div className="flex between items-center" style={{ gap:12 }}>
          <div>
            <div className="t-strong">{selectedProject.name}</div>
            <div className="muted" style={{ fontSize:11.5 }}>
              {selectedProject.project_number} · {selectedProject.client_name || 'Walk-in Client'} · {selectedProject.item_count} item{selectedProject.item_count === 1 ? '' : 's'}
            </div>
          </div>
          <div className="flex gap-sm wrap" style={{ justifyContent:'flex-end' }}>
            <button className="btn btn-ghost btn-sm" disabled={
              busy === 'project-material-boq'
              || (!selectedProject.item_count && !selectedProject.approved_extraction_revision)}
              onClick={onDownloadProjectMaterialBOQ}>
              <IconDownload style={{ width:13, height:13 }}/>{busy === 'project-material-boq'
                ? 'Preparing…'
                : selectedProject.approved_extraction_revision
                  ? `Approved E${selectedProject.approved_extraction_revision} material report`
                  : 'All material lists PDF'}
            </button>
            <button className="btn btn-primary btn-sm" disabled={busy === 'project-quote' || !selectedProject.item_count}
              onClick={onDownloadProjectQuote}>
              <IconDownload style={{ width:13, height:13 }}/>{busy === 'project-quote' ? 'Preparing…' : 'Project quotation PDF'}
            </button>
          </div>
        </div>
      </Card>}

      <div className="grid g-2 mb">
        {REPORT_GROUPS.map(g => (
          <Card key={g.id} title={g.title} sub={g.sub}>
            {g.reports.map((r, i) => (
              <ReportRow key={i} r={r} item={selectedItem} busy={busy} onDownload={onDownload} />
            ))}
          </Card>
        ))}
      </div>

      {selectedItem && ['frame', 'curtainwall'].includes(selectedItem.design?.category) && (
        <div className="reports-production-preview">
          <div className="section-title">Production workbench</div>
          <div className="muted reports-production-help">Select a saved item above to review its profile breakdown, glass sizes and optimized nesting. This belongs to the factory workflow, not the design canvas.</div>
          <CutPlan design={selectedItem.design} />
        </div>
      )}
    </>
  )
}
