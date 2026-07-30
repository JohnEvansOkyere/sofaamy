import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout.jsx'
import Dashboard from './pages/Dashboard.jsx'
import ConfiguratorPage from './pages/ConfiguratorPage.jsx'
import CRM from './pages/CRM.jsx'
import Quotations from './pages/Quotations.jsx'
import Surveys from './pages/Surveys.jsx'
import Production from './pages/Production.jsx'
import ProductionJob from './pages/ProductionJob.jsx'
import Inventory from './pages/Inventory.jsx'
import Dispatch from './pages/Dispatch.jsx'
import Quality from './pages/Quality.jsx'
import Reports from './pages/Reports.jsx'
import Settings from './pages/Settings.jsx'
import ShareViewer from './pages/ShareViewer.jsx'
import TechnicalWorkflow from './pages/TechnicalWorkflow.jsx'
import Accounts from './pages/Accounts.jsx'
import Insights from './pages/Insights.jsx'

export default function App() {
  return (
    <Routes>
      {/* public client view — no app chrome, opened from a WhatsApp link */}
      <Route path="share/:token" element={<ShareViewer />} />
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="configurator" element={<ConfiguratorPage />} />
        <Route path="crm" element={<CRM />} />
        <Route path="quotations" element={<Quotations />} />
        <Route path="surveys" element={<Surveys />} />
        <Route path="technical-workflow" element={<TechnicalWorkflow />} />
        <Route path="accounts" element={<Accounts />} />
        <Route path="production" element={<Production />} />
        <Route path="production/:jobNumber" element={<ProductionJob />} />
        <Route path="production/:jobNumber/:section" element={<ProductionJob />} />
        <Route path="inventory" element={<Inventory />} />
        <Route path="dispatch" element={<Dispatch />} />
        <Route path="quality" element={<Quality />} />
        <Route path="reports" element={<Reports />} />
        <Route path="insights" element={<Insights />} />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
  )
}
