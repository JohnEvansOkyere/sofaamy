// Lightweight hand-rolled SVG charts — no dependency, theme-matched.

export function AreaChart({ data, height = 180, color = '#2471A3' }) {
  const w = 560, h = height, pad = 8
  const max = Math.max(...data.map(d => d.value), 1) * 1.15
  const step = (w - pad*2) / (data.length - 1)
  const pts = data.map((d,i) => [pad + i*step, h - 24 - (d.value/max)*(h - 44)])
  const line = pts.map((p,i)=>`${i?'L':'M'}${p[0]},${p[1]}`).join(' ')
  const area = `${line} L${pts.at(-1)[0]},${h-24} L${pts[0][0]},${h-24} Z`
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width:'100%', height }}>
      <defs>
        <linearGradient id="ag" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.28"/>
          <stop offset="1" stopColor={color} stopOpacity="0"/>
        </linearGradient>
      </defs>
      {[0.25,0.5,0.75].map(g=>(
        <line key={g} x1={pad} x2={w-pad} y1={24+g*(h-44)} y2={24+g*(h-44)} stroke="#EEF3F8"/>
      ))}
      <path d={area} fill="url(#ag)"/>
      <path d={line} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round"/>
      {pts.map((p,i)=>(
        <g key={i}>
          <circle cx={p[0]} cy={p[1]} r="3.5" fill="#fff" stroke={color} strokeWidth="2"/>
          <text x={p[0]} y={h-6} textAnchor="middle" fontSize="10" fill="#90A0AE">{data[i].label}</text>
        </g>
      ))}
    </svg>
  )
}

export function Donut({ data, size = 168 }) {
  const total = data.reduce((s,d)=>s+d.value,0)
  const r = 62, c = 2*Math.PI*r
  let off = 0
  return (
    <div className="flex items-center gap" style={{ gap:24 }}>
      <svg viewBox="0 0 168 168" width={size} height={size} style={{ flexShrink:0 }}>
        <g transform="rotate(-90 84 84)">
          {data.map((d,i)=>{
            const frac = d.value/total, len = frac*c
            const el = <circle key={i} cx="84" cy="84" r={r} fill="none" stroke={d.color}
              strokeWidth="20" strokeDasharray={`${len} ${c-len}`} strokeDashoffset={-off}/>
            off += len; return el
          })}
        </g>
        <text x="84" y="80" textAnchor="middle" fontSize="26" fontWeight="800" fill="#1C2833">{total}</text>
        <text x="84" y="98" textAnchor="middle" fontSize="10" fill="#90A0AE">JOBS</text>
      </svg>
      <div style={{ flex:1 }}>
        {data.map((d,i)=>(
          <div key={i} className="flex items-center between" style={{ padding:'5px 0', fontSize:13 }}>
            <span className="flex items-center gap-sm"><span style={{ width:10,height:10,borderRadius:3,background:d.color }}/>{d.label}</span>
            <b>{d.value}</b>
          </div>
        ))}
      </div>
    </div>
  )
}

export function BarList({ data, color = '#1B4F72' }) {
  const max = Math.max(...data.map(d=>d.value))
  return (
    <div>
      {data.map((d,i)=>(
        <div key={i} style={{ marginBottom:14 }}>
          <div className="flex between" style={{ fontSize:12.5, marginBottom:5 }}>
            <span className="t-muted">{d.label}</span><b>{d.value}</b>
          </div>
          <div className="progress"><i style={{ width:`${(d.value/max)*100}%`, background:color }}/></div>
        </div>
      ))}
    </div>
  )
}
