import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getPublicProjectQuote, acceptPublicProjectQuote } from '../lib/api.js'
import { GHS } from '../lib/pricing.js'
import '../styles/share.css'

// PUBLIC CLIENT VIEW — the project-wide quote a client opens from the
// WhatsApp link to review and approve. Same client-facing figures as the
// quotation PDF; no internal costs or technical detail. Sofaamy-branded,
// standalone (no app chrome).
export default function QuoteApproval() {
  const { token } = useParams()
  const [data, setData] = useState(null)
  const [err, setErr] = useState(false)
  const [confirmedBy, setConfirmedBy] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [accepted, setAccepted] = useState(false)
  const [acceptError, setAcceptError] = useState('')

  const load = () => getPublicProjectQuote(token)
    .then(d => setData(d))
    .catch(() => setErr(true))

  useEffect(() => { load() }, [token])

  const approve = async () => {
    setConfirming(true)
    setAcceptError('')
    try {
      await acceptPublicProjectQuote(token, confirmedBy)
      setAccepted(true)
      await load()
    } catch (error) {
      setAcceptError('Something went wrong recording your approval. Please try again or contact your Fabra team.')
    } finally {
      setConfirming(false)
    }
  }

  if (err) return (
    <div className="share-page"><ShareHeader/>
      <div className="share-card share-empty">
        <h2>Link not found</h2>
        <p>This quotation link is invalid or has been removed. Please ask your Fabra team for a new link.</p>
      </div>
      <ShareFooter/>
    </div>
  )
  if (!data) return (
    <div className="share-page"><ShareHeader/>
      <div className="share-card share-empty"><p>Loading your quotation…</p></div>
      <ShareFooter/>
    </div>
  )

  const decided = data.status === 'accepted' || data.status === 'declined'

  return (
    <div className="share-page">
      <ShareHeader/>

      <div className="share-card">
        <div className="share-title">
          <div>
            <h2>{data.project_number} — {data.name}</h2>
            <div className="share-sub">Prepared for {data.client_name || 'you'}</div>
          </div>
        </div>
        <table className="share-table">
          <thead><tr><th>Item</th><th>Location</th><th>Qty</th><th>Total</th></tr></thead>
          <tbody>
            {data.items.map((item, index) => (
              <tr key={index}>
                <td>{item.ref ? `${item.ref} — ` : ''}{item.name}</td>
                <td>{item.location || '—'}</td>
                <td>{item.qty}</td>
                <td>{GHS(item.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="share-card share-price">
        <div>
          <div className="lbl">Total contract value</div>
          <div className="amt">{GHS(data.grand_total)}</div>
          <div className="terms">{data.deposit_percent}% deposit before production, balance on delivery · prices in Ghana Cedi, VAT exclusive</div>
        </div>
        <a className="share-cta" href="https://wa.me/233000000000" target="_blank" rel="noreferrer">
          Chat with us on WhatsApp
        </a>
      </div>

      <div className="share-card">
        {data.status === 'accepted' || accepted
          ? <div className="approve-done">✓ You've approved this quotation{data.project_number ? ` — ${data.project_number}` : ''} is confirmed.</div>
          : data.status === 'declined'
            ? <p>This quotation was declined. Please contact your Fabra team if you'd like to revisit it.</p>
            : <>
                <h3>Approve this quotation</h3>
                <p className="share-note">Confirming below authorizes the Fabra team to open the job and begin work once the deposit is received.</p>
                <label className="approve-name">
                  <span>Your name (optional)</span>
                  <input value={confirmedBy} onChange={e => setConfirmedBy(e.target.value)} placeholder="For our records"/>
                </label>
                <button className="share-cta approve-cta" disabled={confirming} onClick={approve}>
                  {confirming ? 'Confirming…' : 'Approve this quotation'}
                </button>
                {acceptError && <p className="approve-error">{acceptError}</p>}
              </>}
        {!decided && !accepted && <p className="share-note">Prefer to decline or discuss changes? Message us on WhatsApp instead.</p>}
      </div>

      <ShareFooter/>
    </div>
  )
}

function ShareHeader() {
  return (
    <div className="share-head">
      <div className="share-logo">F</div>
      <div>
        <div className="n">Fabra</div>
        <div className="s">Fabrication operations for Africa</div>
      </div>
    </div>
  )
}

function ShareFooter() {
  return <div className="share-foot">Powered by Fabra</div>
}
