import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout.jsx'
import { listMaterials } from './lib/api.js'
import { setMaterialPrices } from './lib/frameMaterials.js'
import Dashboard from './pages/Dashboard.jsx'
import ConfiguratorPage from './pages/ConfiguratorPage.jsx'
import Leads from './pages/Leads.jsx'
import QuoteRegister from './pages/QuoteRegister.jsx'
import Surveys from './pages/Surveys.jsx'
import Production from './pages/Production.jsx'
import ProductionJob from './pages/ProductionJob.jsx'
import Inventory from './pages/Inventory.jsx'
import Dispatch from './pages/Dispatch.jsx'
import Quality from './pages/Quality.jsx'
import QualityCheck from './pages/QualityCheck.jsx'
import Reports from './pages/Reports.jsx'
import Settings from './pages/Settings.jsx'
import ShareViewer from './pages/ShareViewer.jsx'
import QuoteApproval from './pages/QuoteApproval.jsx'
import TechnicalWorkflow from './pages/TechnicalWorkflow.jsx'
import Accounts from './pages/Accounts.jsx'
import Drawings from './pages/Drawings.jsx'
import Insights from './pages/Insights.jsx'
import ProjectWorkspace from './pages/ProjectWorkspace.jsx'
import ProjectBoard from './pages/ProjectBoard.jsx'
import Customers from './pages/CRM.jsx'

export default function App() {
  // material prices come from Inventory (Supabase); the catalogue values
  // shipped in the code are only the fallback until they load
  useEffect(() => {
    listMaterials().then(setMaterialPrices).catch(() => {})
  }, [])

  return (
    <Routes>
      {/* public client view — no app chrome, opened from a WhatsApp link */}
      <Route path="share/:token" element={<ShareViewer />} />
      <Route path="share/quote/:token" element={<QuoteApproval />} />
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="configurator" element={<ConfiguratorPage />} />
        <Route path="projects" element={<ProjectBoard />} />
        <Route path="projects/:projectId" element={<ProjectWorkspace />} />
        <Route path="leads" element={<Leads />} />
        <Route path="customers" element={<Customers />} />
        {/* superseded paths — kept so existing links and bookmarks still land */}
        <Route path="project-board" element={<Navigate to="/projects" replace />} />
        <Route path="crm" element={<Navigate to="/customers" replace />} />
        <Route path="quotations" element={<QuoteRegister />} />
        <Route path="surveys" element={<Surveys />} />
        <Route path="technical-workflow" element={<TechnicalWorkflow />} />
        <Route path="accounts" element={<Accounts />} />
        <Route path="drawings" element={<Drawings />} />
        <Route path="production" element={<Production />} />
        <Route path="production/:jobNumber" element={<ProductionJob />} />
        <Route path="production/:jobNumber/:section" element={<ProductionJob />} />
        <Route path="inventory" element={<Inventory />} />
        <Route path="dispatch" element={<Dispatch />} />
        <Route path="quality" element={<Quality />} />
        <Route path="quality/:projectId" element={<QualityCheck />} />
        <Route path="quality/:projectId/:section" element={<QualityCheck />} />
        <Route path="reports" element={<Reports />} />
        <Route path="insights" element={<Insights />} />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
  )
}
