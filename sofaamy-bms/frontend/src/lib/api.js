// ============================================================
// API CLIENT — Sofaamy Cloud API (FastAPI).
// Base URL: VITE_API_URL, default http://localhost:8000
// (run the backend with:  uvicorn app.main:app --reload)
// ============================================================
const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`)
  return res
}

// POST design → persisted quote + branded PDF; triggers browser download.
// Returns the issued quote number.
export async function downloadQuotePdf(clientName, design) {
  const res = await post('/api/quotes/design/pdf', { client_name: clientName, design })
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
  const res = await post('/api/jobs/from-design', { client_name: clientName, design })
  return res.json()
}

async function downloadBlob(res, fallbackName) {
  const cd = res.headers.get('Content-Disposition') || ''
  const name = /filename="([^"]+)"/.exec(cd)?.[1] || fallbackName
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = name
  document.body.appendChild(a); a.click(); a.remove()
  URL.revokeObjectURL(url)
  return name
}

// kind: 'cutting-list' | 'work-order' | 'boq' → downloads the PDF
export async function downloadReport(kind, clientName, design) {
  const res = await post(`/api/reports/${kind}`, { client_name: clientName, design })
  return downloadBlob(res, `${kind}.pdf`)
}

// Persist a design so it can be reopened later (saved templates)
export async function saveDesign(clientName, design) {
  const res = await post('/api/designs', { client_name: clientName, design })
  return res.json()
}

export async function listDesigns() {
  const res = await fetch(`${BASE}/api/designs`)
  if (!res.ok) throw new Error(`API ${res.status}`)
  return res.json()
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
