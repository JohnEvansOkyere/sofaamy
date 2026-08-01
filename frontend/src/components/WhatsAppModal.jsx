import { useState } from 'react'
import { IconWhatsApp } from './icons.jsx'
import { waLink } from '../lib/whatsapp.js'

// WhatsApp send modal — shows the message EXACTLY as the client will
// receive it (phone preview), then opens WhatsApp with it prefilled
// via wa.me so it goes out from Sofaamy's own number.
export default function WhatsAppModal({ to, message, link, attachment, onClose, onSent }) {
  const [phone, setPhone] = useState(to?.phone || '')
  const name = to?.name || 'Client'
  const initials = name.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()
  const now = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

  // message body without the raw URL (the link renders as its own card)
  const bodyLines = message.split('\n').filter(l => !link || l.trim() !== link)

  const send = () => {
    window.open(waLink(phone, message), '_blank', 'noopener')
    onSent?.()
    onClose()
  }
  const copy = async () => {
    try { await navigator.clipboard.writeText(message) } catch { /* headless */ }
  }

  return (
    <div className="modal-back" onClick={e => { e.stopPropagation(); onClose() }}>
      <div className="wa-modal" onClick={e => e.stopPropagation()}>
        <div className="wa-phone">
          <div className="wa-head">
            <span className="wa-ava">{initials}</span>
            <div>
              <div className="wa-name">{name}</div>
              <div className="wa-status">online</div>
            </div>
            <IconWhatsApp style={{ width: 20, height: 20, marginLeft: 'auto', opacity: .9 }}/>
          </div>
          <div className="wa-chat">
            <div className="wa-day">Today</div>
            <div className="wa-bubble">
              {bodyLines.map((l, i) => {
                const parts = l.split(/\*([^*]+)\*/g)
                return (
                  <div key={i} className="wa-line">
                    {l === '' ? ' ' : parts.map((p, k) => k % 2 ? <b key={k}>{p}</b> : p)}
                  </div>
                )
              })}
              {link && (
                <a className="wa-linkcard" href={link} target="_blank" rel="noreferrer">
                  <div className="wa-linkthumb">S</div>
                  <div>
                    <div className="wa-linktitle">Sofaamy Co. Ltd — Your Design</div>
                    <div className="wa-linksub">View in 2D & 3D · {link.replace(/^https?:\/\//, '').slice(0, 34)}…</div>
                  </div>
                </a>
              )}
              <span className="wa-meta">{now} ✓✓</span>
            </div>
            {attachment && (
              <div className="wa-bubble">
                <div className="wa-doc">
                  <span className="wa-docicon">PDF</span>
                  <div>
                    <div className="wa-doctitle">{attachment}</div>
                    <div className="wa-linksub">PDF document</div>
                  </div>
                </div>
                <span className="wa-meta">{now} ✓✓</span>
              </div>
            )}
          </div>
        </div>

        <div className="wa-side">
          <h4><IconWhatsApp style={{ width: 17, height: 17, color: '#25D366' }}/> Send on WhatsApp</h4>
          <p className="wa-hint">This is exactly what {name.split(' ')[0]} receives. It opens in your WhatsApp, ready to send from Sofaamy's number.</p>
          <label className="wa-field">Client WhatsApp number
            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+233 24 000 0000"/>
          </label>
          <button className="btn btn-gold btn-block" onClick={send} disabled={!phone.replace(/\D/g, '')}>
            <IconWhatsApp style={{ width: 16, height: 16 }}/> Open WhatsApp &amp; Send
          </button>
          <button className="btn btn-ghost btn-block" onClick={copy}>Copy message</button>
          <button className="btn btn-ghost btn-block" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
