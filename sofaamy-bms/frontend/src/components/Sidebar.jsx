import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { COMPANY } from '../data/seed.js'
import { getDashboard } from '../lib/api.js'
import {
  IconDashboard, IconCube, IconUsers, IconFile, IconRuler, IconFactory,
  IconBox, IconTruck, IconShield, IconChart, IconGear,
  IconLayers, IconWallet,
} from './icons.jsx'

const NAV = [
  { group:'Overview', items:[
    { to:'/', label:'Dashboard', icon:IconDashboard, end:true },
  ]},
  { group:'Sales', items:[
    { to:'/configurator', label:'Design Configurator', icon:IconCube, tag:'CORE' },
    { to:'/crm',          label:'CRM & Leads',         icon:IconUsers },
    { to:'/quotations',   label:'Quotations',          icon:IconFile, countKey:'quotation' },
    { to:'/surveys',      label:'Surveys',             icon:IconRuler },
  ]},
  { group:'Finance', items:[
    { to:'/accounts', label:'Accounts', icon:IconWallet, countKey:'accounts' },
  ]},
  { group:'Operations', items:[
    { to:'/technical-workflow', label:'Technical Workflow', icon:IconLayers, countKey:'technical' },
    { to:'/production', label:'Production Pipeline', icon:IconFactory, countKey:'production' },
    { to:'/inventory',  label:'Inventory & Stock',   icon:IconBox },
    { to:'/dispatch',   label:'Dispatch & Install',  icon:IconTruck },
    { to:'/quality',    label:'Quality Control',     icon:IconShield },
  ]},
  { group:'Insights', items:[
    { to:'/insights', label:'Insights & KPIs', icon:IconChart },
    { to:'/reports',  label:'Documents & Reports', icon:IconFile },
    { to:'/settings', label:'Settings', icon:IconGear },
  ]},
]

export default function Sidebar({ collapsed = false, onToggle }) {
  const [counts, setCounts] = useState({})
  useEffect(() => {
    getDashboard().then(data => setCounts(Object.fromEntries(
      (data.pipeline || []).map(item => [item.key, item.count]),
    ))).catch(() => {})
  }, [])

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="sb-brand">
        <div className="sb-logo">S</div>
        <div className="sb-brand-txt">
          <div className="n">Sofaamy Cloud</div>
          <div className="s">Fabrication ERP</div>
        </div>
        <button className="sb-toggle" onClick={onToggle}
          title={collapsed ? 'Expand menu' : 'Minimize menu'}>
          {collapsed ? '»' : '«'}
        </button>
      </div>
      <nav className="sb-scroll">
        {NAV.map(sec => (
          <div key={sec.group}>
            <div className="sb-group">{sec.group}</div>
            {sec.items.map(it => {
              const Icon = it.icon
              return (
                <NavLink key={it.to} to={it.to} end={it.end} title={it.label}
                  className={({isActive}) => `sb-link ${isActive?'active':''}`}>
                  <Icon /><span>{it.label}</span>
                  {it.tag && <span className="tag">{it.tag}</span>}
                  {it.countKey && counts[it.countKey] != null &&
                    <span className="count">{counts[it.countKey]}</span>}
                </NavLink>
              )
            })}
          </div>
        ))}
      </nav>
      <div className="sb-foot">
        <b>{COMPANY.name}</b><br/>Powered by {COMPANY.poweredBy}
      </div>
    </aside>
  )
}
