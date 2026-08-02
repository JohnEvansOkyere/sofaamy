// ============================================================
// API CLIENT — Sofaamy Cloud API (FastAPI).
// Base URL: VITE_API_URL if set; otherwise same-origin in production
// (Vercel routes /api/* to the backend service) and 127.0.0.1:8000 in dev
// (run the backend with:  uvicorn app.main:app --reload)
// ============================================================
const BASE = import.meta.env.VITE_API_URL ??
  (import.meta.env.PROD ? '' : 'http://127.0.0.1:8000')

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`)
  return res
}

async function put(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`)
  return res
}

// Live pricing preview for a saved design's current commercial terms —
// no persistence, used to show totals while editing before saving.
export async function previewDesignPrice(clientName, design) {
  const res = await post('/api/quotes/design', { client_name: clientName, project_id: design.projectId || null, design })
  return res.json()
}

// POST design → persisted quote + branded PDF; triggers browser download.
// Returns the issued quote number.
export async function downloadQuotePdf(clientName, design) {
  const res = await post('/api/quotes/design/pdf', { client_name: clientName, project_id: design.projectId || null, design })
  const quoteNumber = res.headers.get('X-Quote-Number') || 'quote'
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${quoteNumber}.pdf`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
  return quoteNumber
}

// POST design → client + accepted quote + job in one step.
// Returns { job_number, quote_number, total }.
export async function createJobFromDesign(clientName, design) {
  const res = await post('/api/jobs/from-design', { client_name: clientName, project_id: design.projectId || null, design })
  return res.json()
}

async function downloadBlob(res, fallbackName) {
  const file = await responseFile(res, fallbackName)
  const a = document.createElement('a')
  a.href = file.url; a.download = file.name
  document.body.appendChild(a); a.click(); a.remove()
  URL.revokeObjectURL(file.url)
  return file.name
}

async function responseFile(res, fallbackName) {
  const cd = res.headers.get('Content-Disposition') || ''
  const name = /filename="([^"]+)"/.exec(cd)?.[1] || fallbackName
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  return { name, url }
}

// kind: 'cutting-list' | 'work-order' | 'boq' → downloads the PDF
export async function downloadReport(kind, clientName, design) {
  const res = await post(`/api/reports/${kind}`, { client_name: clientName, project_id: design.projectId || null, design })
  return downloadBlob(res, `${kind}.pdf`)
}

// Generate a temporary browser URL for the in-app PDF viewer.
// The caller owns the URL and must revoke it when the viewer closes.
export async function previewReport(kind, clientName, design) {
  const res = await post(`/api/reports/${kind}`, { client_name: clientName, project_id: design.projectId || null, design })
  return responseFile(res, `${kind}.pdf`)
}

// Persist a design so it can be reopened later (saved templates)
export async function saveDesign(clientName, design) {
  const res = await post('/api/designs', { client_name: clientName, project_id: design.projectId || null, design })
  return res.json()
}

export async function listDesigns() {
  const res = await fetch(`${BASE}/api/designs`)
  if (!res.ok) throw new Error(`API ${res.status}`)
  return res.json()
}

export async function listProjects() {
  const res = await fetch(`${BASE}/api/projects`)
  if (!res.ok) throw new Error(`API ${res.status}`)
  return res.json()
}

export async function createProject(data) {
  const res = await post('/api/projects', data)
  return res.json()
}

export async function getProject(projectId) {
  const res = await fetch(`${BASE}/api/projects/${projectId}`)
  if (!res.ok) throw new Error(`API ${res.status}`)
  return res.json()
}

export const getProjectWorkflow = (projectId) =>
  getJSON(`/api/projects/${projectId}/workflow`)

export const updateProjectWorkflow = (projectId, data) =>
  post(`/api/projects/${projectId}/workflow`, data).then(r => r.json())

export const createExtraction = (projectId, data) =>
  post(`/api/projects/${projectId}/extractions`, data).then(r => r.json())

export const generateExtractionFromDesign = (projectId, data = {}) =>
  post(`/api/projects/${projectId}/extractions/from-design`, data).then(r => r.json())

export const approveExtraction = (extractionId, approvedBy = 'Technical Supervisor') =>
  post(`/api/extractions/${extractionId}/approve`, { approved_by: approvedBy }).then(r => r.json())

export const createQuoteFromExtraction = (projectId, data) =>
  post(`/api/projects/${projectId}/quotes/from-extraction`, data).then(r => r.json())

export const updateQuoteFromExtraction = (quoteNumber, data) =>
  put(`/api/quotes/${quoteNumber}/commercial`, data).then(r => r.json())

export const createDrawingTask = (projectId, data) =>
  post(`/api/projects/${projectId}/drawing-tasks`, data).then(r => r.json())

export const approveExistingConfiguratorDesign = (projectId, data = {}) =>
  post(`/api/projects/${projectId}/drawing-tasks/use-existing-design`, {
    design_id: data.design_id ?? null,
    approved_by: data.approved_by || 'Technical Supervisor',
    notes: data.notes || 'Existing saved configurator design accepted without changes.',
  }).then(r => r.json())

export const assignExtractionsToItem = (projectId, data) =>
  post(`/api/projects/${projectId}/extractions/assign-to-item`, data).then(r => r.json())

export const createDrawingRevision = (taskId, data) =>
  post(`/api/drawing-tasks/${taskId}/revisions`, data).then(r => r.json())

export async function uploadDrawingFile(revisionId, kind, file) {
  const res = await fetch(
    `${BASE}/api/drawing-revisions/${revisionId}/files/${kind}?filename=${encodeURIComponent(file.name)}`,
    { method: 'PUT', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file },
  )
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`)
  return res.json()
}

export const approveDrawingRevision = (revisionId, approvedBy = 'Technical Supervisor') =>
  post(`/api/drawing-revisions/${revisionId}/approve`, { approved_by: approvedBy }).then(r => r.json())

export const releaseProjectToFactory = (projectId, drawingRevisionId, data = {}) =>
  post(`/api/projects/${projectId}/production-releases`, {
    drawing_revision_id: drawingRevisionId,
    released_by: data.released_by || 'Technical Supervisor',
    notes: data.notes || '',
  }).then(r => r.json())

export const drawingFileUrl = (downloadUrl) => `${BASE}${downloadUrl}`

export async function downloadProjectQuoteSummary(projectId) {
  const res = await fetch(`${BASE}/api/projects/${projectId}/quote-summary/pdf`)
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`)
  return downloadBlob(res, `project-quote-summary-${projectId}.pdf`)
}

export async function downloadProjectMaterialBOQ(projectId) {
  const res = await fetch(`${BASE}/api/projects/${projectId}/material-boq/pdf`)
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`)
  return downloadBlob(res, `project-material-boq-${projectId}.pdf`)
}

// Public client view of a shared design (no auth — signed token)
export async function getSharedDesign(token) {
  const res = await fetch(`${BASE}/api/share/${token}`)
  if (!res.ok) throw new Error(`API ${res.status}`)
  return res.json()
}

async function getJSON(path) {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) throw new Error(`API ${res.status}`)
  return res.json()
}

export const listJobs = () => getJSON('/api/jobs')
export const listAccounts = () => getJSON('/api/accounts')
export const listProductionJobs = () => getJSON('/api/production/jobs')
export const listQuotes = () => getJSON('/api/quotes')
export const getJob = (jobNumber) => getJSON(`/api/jobs/${jobNumber}`)
export const getDashboard = () => getJSON('/api/dashboard')
export const getActivity = () => getJSON('/api/activity')
export const listClients = () => getJSON('/api/clients')
export const listMaterials = () => getJSON('/api/materials')
export const listStockMoves = () => getJSON('/api/stock-moves')
export const listQcChecks = () => getJSON('/api/qc-checks')

// lifecycle actions — every one of these hits the real database
export const advanceJob = (jn) => post(`/api/jobs/${jn}/advance`, {}).then(r => r.json())
export const addPayment = (jn, data) => post(`/api/jobs/${jn}/payments`, data).then(r => r.json())
export const addQc = (jn, data) => post(`/api/jobs/${jn}/qc`, data).then(r => r.json())
export const assignDispatch = (jn, data) => post(`/api/jobs/${jn}/dispatch`, data).then(r => r.json())
export const setQuoteStatus = (qn, status) => post(`/api/quotes/${qn}/status`, { status }).then(r => r.json())
export const addClient = (data) => post('/api/clients', data).then(r => r.json())
export const receiveStock = (id, qty, note = '') => post(`/api/materials/${id}/receive`, { qty, note }).then(r => r.json())

export async function downloadDeliveryNote(jobNumber) {
  const res = await fetch(`${BASE}/api/jobs/${jobNumber}/delivery-note`)
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`)
  return downloadBlob(res, `delivery-note-${jobNumber}.pdf`)
}

export async function downloadQuotationPdf(quoteNumber) {
  const res = await fetch(`${BASE}/api/quotes/${quoteNumber}/pdf`)
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`)
  return downloadBlob(res, `${quoteNumber}.pdf`)
}
