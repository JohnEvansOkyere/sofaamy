import { useState, useEffect } from 'react'
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
  // the configurator needs every pixel for the drawing sheet:
  // sidebar auto-minimizes (toggle re-expands it) and content goes full-width
  const isCfg = pathname === '/configurator'
  const [sbMin, setSbMin] = useState(isCfg)
  useEffect(() => { setSbMin(isCfg) }, [isCfg])
  return (
    <div className="shell">
      <Sidebar collapsed={sbMin} onToggle={() => setSbMin(v => !v)} />
      <div className="main-col">
        <Topbar title={title} subtitle={subtitle} />
        <main className={`content${isCfg ? ' content-wide' : ''}`}><Outlet /></main>
      </div>
    </div>
  )
}
