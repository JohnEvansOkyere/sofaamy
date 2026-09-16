import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { COMPANY } from '../data/seed.js'
import { getDashboard } from '../lib/api.js'
import {
  IconDashboard, IconUsers, IconFactory, IconFile,
  IconBox, IconTruck, IconShield, IconGear,
  IconLayers, IconWallet, IconRuler,
} from './icons.jsx'

// Ten primary destinations. Everything project-specific (configurator,
// technical chain, reports, surveys) is reached inside the project it belongs
// to; Quotes and Drawings stay in the rail as cross-project queues.
const NAV = [
  { to:'/',           label:'Dashboard',  icon:IconDashboard, end:true },
  { to:'/leads',      label:'Leads',      icon:IconUsers },
  { to:'/projects',   label:'Projects',   icon:IconLayers },
  { to:'/quotations', label:'Quotes',     icon:IconFile,    countKey:'quotation' },
  { to:'/accounts',   label:'Accounts',   icon:IconWallet,  countKey:'accounts' },
  { to:'/drawings',   label:'Drawings',   icon:IconRuler },
  { to:'/production', label:'Production', icon:IconFactory, countKey:'production' },
  { to:'/quality',    label:'Quality',    icon:IconShield },
  { to:'/inventory',  label:'Inventory',  icon:IconBox },
  { to:'/dispatch',   label:'Dispatch',   icon:IconTruck },
]

export default function Sidebar({ hidden = false, onToggle }) {
  const [counts, setCounts] = useState({})
  useEffect(() => {
    getDashboard().then(data => setCounts(Object.fromEntries(
      (data.pipeline || []).map(item => [item.key, item.count]),
    ))).catch(() => {})
  }, [])

  return (
    <aside className={`sidebar ${hidden ? 'hidden' : ''}`}>
      <div className="sb-brand">
          <div className="sb-logo">F</div>
          <div className="sb-brand-txt">
          <div className="n">Fabra</div>
          <div className="s">Fabrication operations</div>
        </div>
        <button className="sb-toggle" onClick={onToggle} title="Hide menu">«</button>
      </div>
      <nav className="sb-scroll">
        {NAV.map(it => {
          const Icon = it.icon
          return (
            <NavLink key={it.to} to={it.to} end={it.end} title={it.label}
              className={({isActive}) => `sb-link ${isActive?'active':''}`}>
              <Icon /><span>{it.label}</span>
              {it.countKey && counts[it.countKey] != null &&
                <span className="count">{counts[it.countKey]}</span>}
            </NavLink>
          )
        })}
      </nav>
      <div className="sb-tail">
        <NavLink to="/settings" title="Settings"
          className={({isActive}) => `sb-link ${isActive?'active':''}`}>
          <IconGear /><span>Settings</span>
        </NavLink>
      </div>
      <div className="sb-foot">
        <b>{COMPANY.name}</b><br/>Powered by {COMPANY.poweredBy}
      </div>
    </aside>
  )
}
