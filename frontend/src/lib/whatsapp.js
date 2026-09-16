// ============================================================
// WHATSAPP COMPOSER — builds the actual client messages and the
// wa.me deep link that opens WhatsApp with the message ready to
// send from Sofaamy's own number. Real transport, no API needed;
// Africa's Talking automation replaces the manual tap later.
// ============================================================

export const GHS0 = (n) => '₵' + Number(n || 0).toLocaleString('en-GH', { maximumFractionDigits: 0 })

export const waLink = (phone, text) => {
  const digits = String(phone || '').replace(/\D/g, '')
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`
}

export const firstName = (name = '') => (name.split(/[\s,]+/)[0] || 'there')

export function quoteMessage({ client, product, quoteNumber, total, shareUrl, depositPercent = 80 }) {
  return [
    `Hello ${firstName(client)}! 👋`,
    ``,
    `Your quotation from *Fabra* is ready:`,
    ``,
    `📋 *${product}*`,
    `Ref: ${quoteNumber}`,
    `Total: *${GHS0(total)}* (VAT excl.)`,
    ...(shareUrl ? [``, `Review and approve your quotation here:`, shareUrl] : []),
    ``,
    `Terms: ${depositPercent}% deposit before fabrication, balance before completion.`,
    ``,
    `Thank you for choosing Fabra! 🙏`,
  ].join('\n')
}

export function stageMessage({ client, jobNumber, product, stageLabel, progress }) {
  return [
    `Hello ${firstName(client)}! Quick update on your order:`,
    ``,
    `🏭 *${product}* (${jobNumber})`,
    `has moved to *${stageLabel}* — ${progress}% complete.`,
    ``,
    `We'll keep you posted at every stage.`,
    `— Fabra`,
  ].join('\n')
}

export function deliveryMessage({ client, jobNumber, product, dnNumber, driver, vehicle }) {
  return [
    `Hello ${firstName(client)}! 🚚`,
    ``,
    `Your *${product}* (${jobNumber}) is scheduled for delivery.`,
    `Delivery note: ${dnNumber}`,
    driver ? `Driver: ${driver}${vehicle ? ` · ${vehicle}` : ''}` : null,
    ``,
    `— Fabra`,
  ].filter(l => l !== null).join('\n')
}

export function greetingMessage({ client }) {
  return [
    `Hello ${firstName(client)}! 👋`,
    ``,
    `This is *Fabra* — fabrication operations for Africa.`,
    `How can we help with your project today?`,
  ].join('\n')
}

// relative timestamps for feeds ("2h ago")
export function timeAgo(iso) {
  if (!iso) return ''
  const s = (Date.now() - new Date(iso + (iso.endsWith('Z') ? '' : 'Z')).getTime()) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d ago`
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export const dateShort = (iso) => iso
  ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  : '—'
