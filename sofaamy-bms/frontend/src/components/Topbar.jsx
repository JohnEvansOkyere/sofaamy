import { CURRENT_USER } from '../data/seed.js'
import { IconSearch, IconBell, IconWhatsApp } from './icons.jsx'

export default function Topbar({ title, subtitle }) {
  return (
    <header className="topbar">
      <div className="tb-title">{title}{subtitle && <small>{subtitle}</small>}</div>
      <div className="tb-search">
        <IconSearch style={{ width:17, height:17 }} />
        <input placeholder="Search jobs, clients, quotes…" />
      </div>
      <div className="tb-actions">
        <span className="tb-icon" title="WhatsApp connected" style={{ color:'#25D366' }}><IconWhatsApp style={{ width:20, height:20 }}/></span>
        <span className="tb-icon"><IconBell style={{ width:20, height:20 }}/><span className="dot"/></span>
        <div className="tb-user">
          <div className="right">
            <div className="nm">{CURRENT_USER.name}</div>
            <div className="rl">{CURRENT_USER.role}</div>
          </div>
          <div className="tb-avatar">{CURRENT_USER.initials}</div>
        </div>
      </div>
    </header>
  )
}
