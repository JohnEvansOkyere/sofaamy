import { useState, useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar.jsx'
import Topbar from './Topbar.jsx'

const META = {
  '/':            ['Dashboard', 'Business overview'],
  '/configurator':['Design Configurator', 'Build · price · quote in real time'],
  '/leads':       ['Leads', 'Enquiries and their conversion'],
  '/projects':    ['Projects', 'Every client job, its owner and its next step'],
  '/quotations':  ['Quotations', 'Estimates and quote pipeline'],
  '/surveys':     ['Surveys', 'Site measurement & verification'],
  '/technical-workflow':['Technical Workflow', 'Controlled project release chain'],
  '/accounts':    ['Accounts', 'Payments and customer balances'],
  '/production':  ['Production', 'Factory floor tracking'],
  '/inventory':   ['Inventory', 'Materials and reorder alerts'],
  '/dispatch':    ['Dispatch', 'Delivery and installation tracking'],
  '/quality':     ['Quality', 'Release & final checks'],
  '/reports':     ['Documents & Reports', 'Operational documents and downloads'],
  '/insights':    ['Insights & KPIs', 'Commercial and operational performance'],
  '/settings':    ['Settings', 'Company & system configuration'],
}

// Focus pages hide the navigation entirely so the work surface owns the screen.
// A project carries its own header bar (back, name, work areas, running total),
// so the application chrome steps aside completely while you are inside one.
const FOCUS = ['/configurator']
const isProjectWorkspace = pathname => /^\/projects\/[^/]+$/.test(pathname)

export default function Layout() {
  const { pathname } = useLocation()
  const inProject = isProjectWorkspace(pathname)
  const [title, subtitle] = inProject
    ? ['Project Workspace', 'Complete project context and next action']
    : META[pathname] || ['Fabra', '']
  const isFocus = FOCUS.includes(pathname) || inProject
  const [navHidden, setNavHidden] = useState(isFocus)
  useEffect(() => { setNavHidden(isFocus) }, [isFocus])
  return (
    <div className="shell">
      <Sidebar hidden={navHidden} onToggle={() => setNavHidden(v => !v)} />
      <div className="main-col">
        {/* a project renders its own header bar, so the app topbar steps aside */}
        {!inProject && <Topbar title={title} subtitle={subtitle}
          navHidden={navHidden} onShowNav={() => setNavHidden(false)} />}
        <main className={`content${isFocus ? ' content-wide' : ''}`}><Outlet /></main>
      </div>
    </div>
  )
}
