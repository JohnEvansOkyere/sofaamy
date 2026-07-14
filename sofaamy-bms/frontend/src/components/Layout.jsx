import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar.jsx'
import Topbar from './Topbar.jsx'

const META = {
  '/':            ['Dashboard', 'Business overview'],
  '/configurator':['Design Configurator', 'Build · price · quote in real time'],
  '/crm':         ['CRM & Leads', 'Opportunities and clients'],
  '/quotations':  ['Quotations', 'Estimates and quote pipeline'],
  '/surveys':     ['Surveys', 'Site measurement & verification'],
  '/production':  ['Production Pipeline', 'Factory floor tracking'],
  '/inventory':   ['Inventory & Stock', 'Materials and reorder alerts'],
  '/dispatch':    ['Dispatch & Install', 'Delivery and installation tracking'],
  '/quality':     ['Quality Control', 'QA checkpoints'],
  '/reports':     ['Reports', 'Analytics and performance'],
  '/settings':    ['Settings', 'Company & system configuration'],
}

export default function Layout() {
  const { pathname } = useLocation()
  const [title, subtitle] = META[pathname] || ['Sofaamy Cloud', '']
  return (
    <div className="shell">
      <Sidebar />
      <div className="main-col">
        <Topbar title={title} subtitle={subtitle} />
        <main className="content"><Outlet /></main>
      </div>
    </div>
  )
}
