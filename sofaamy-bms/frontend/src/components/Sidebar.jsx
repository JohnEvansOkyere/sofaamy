import { NavLink } from 'react-router-dom'
import { COMPANY } from '../data/seed.js'
import {
  IconDashboard, IconCube, IconUsers, IconFile, IconRuler, IconFactory,
  IconBox, IconTruck, IconShield, IconChart, IconGear,
} from './icons.jsx'

const NAV = [
  { group:'Overview', items:[
    { to:'/', label:'Dashboard', icon:IconDashboard, end:true },
  ]},
  { group:'Sales', items:[
    { to:'/configurator', label:'Design Configurator', icon:IconCube, tag:'CORE' },
    { to:'/crm',          label:'CRM & Leads',         icon:IconUsers, count:5 },
    { to:'/quotations',   label:'Quotations',          icon:IconFile,  count:19 },
    { to:'/surveys',      label:'Surveys',             icon:IconRuler },
  ]},
  { group:'Operations', items:[
    { to:'/production', label:'Production Pipeline', icon:IconFactory, count:34 },
    { to:'/inventory',  label:'Inventory & Stock',   icon:IconBox },
    { to:'/dispatch',   label:'Dispatch & Install',  icon:IconTruck },
    { to:'/quality',    label:'Quality Control',     icon:IconShield },
  ]},
  { group:'Insights', items:[
    { to:'/reports',  label:'Reports', icon:IconChart },
    { to:'/settings', label:'Settings', icon:IconGear },
  ]},
]

export default function Sidebar({ collapsed = false, onToggle }) {
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
                  {it.count != null && <span className="count">{it.count}</span>}
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
