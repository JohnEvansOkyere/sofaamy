import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout.jsx'
import Dashboard from './pages/Dashboard.jsx'
import ConfiguratorPage from './pages/ConfiguratorPage.jsx'
import CRM from './pages/CRM.jsx'
import Quotations from './pages/Quotations.jsx'
import Surveys from './pages/Surveys.jsx'
import Production from './pages/Production.jsx'
import Inventory from './pages/Inventory.jsx'
import Dispatch from './pages/Dispatch.jsx'
import Quality from './pages/Quality.jsx'
import Reports from './pages/Reports.jsx'
import Settings from './pages/Settings.jsx'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="configurator" element={<ConfiguratorPage />} />
        <Route path="crm" element={<CRM />} />
        <Route path="quotations" element={<Quotations />} />
        <Route path="surveys" element={<Surveys />} />
        <Route path="production" element={<Production />} />
        <Route path="inventory" element={<Inventory />} />
        <Route path="dispatch" element={<Dispatch />} />
        <Route path="quality" element={<Quality />} />
        <Route path="reports" element={<Reports />} />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
  )
}
