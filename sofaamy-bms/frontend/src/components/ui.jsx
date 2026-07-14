import { avatarColor, statusTone } from '../data/seed.js'
import { IconArrowUp, IconArrowDown } from './icons.jsx'

export function PageHead({ title, subtitle, children }) {
  return (
    <div className="page-head">
      <div><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>
      {children && <div className="flex gap wrap">{children}</div>}
    </div>
  )
}

export function Card({ title, sub, action, children, pad = true, className = '' }) {
  return (
    <div className={`card ${className}`}>
      {title && (
        <div className="card-head">
          <div><h3>{title}</h3>{sub && <div className="sub">{sub}</div>}</div>
          {action}
        </div>
      )}
      {pad ? <div className="card-pad">{children}</div> : children}
    </div>
  )
}

const TONE = {
  green:{ bg:'var(--green-soft)', fg:'var(--green)' },
  blue:{ bg:'var(--blue-soft)', fg:'var(--navy-600)' },
  orange:{ bg:'var(--orange-soft)', fg:'var(--orange)' },
  purple:{ bg:'var(--purple-soft)', fg:'var(--purple)' },
  gold:{ bg:'var(--gold-soft)', fg:'#9A7D0A' },
}
export function Stat({ label, value, trend, dir = 'flat', tone = 'blue', icon }) {
  const t = TONE[tone] || TONE.blue
  return (
    <div className="stat">
      {icon && <div className="ico" style={{ background:t.bg, color:t.fg }}>{icon}</div>}
      <div className="lbl">{label}</div>
      <div className="val">{value}</div>
      {trend && (
        <div className={`trend ${dir}`}>
          {dir==='up' && <IconArrowUp style={{width:13,height:13}}/>}
          {dir==='down' && <IconArrowDown style={{width:13,height:13}}/>}
          {trend}
        </div>
      )}
    </div>
  )
}

export const Badge = ({ children, tone }) =>
  <span className={`badge ${tone?`b-${tone}`:statusTone(children)}`}><span className="bdot"/>{children}</span>

export function Person({ name, sub, i = 0 }) {
  const initials = name.split(' ').map(w=>w[0]).slice(0,2).join('')
  return (
    <div className="person">
      <span className="ava" style={{ background:avatarColor(i) }}>{initials}</span>
      <div><div className="nm">{name}</div>{sub && <div className="sub">{sub}</div>}</div>
    </div>
  )
}

export const Progress = ({ value, color }) =>
  <div className="progress"><i style={{ width:`${value}%`, background:color }}/></div>
