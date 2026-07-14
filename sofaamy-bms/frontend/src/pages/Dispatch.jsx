import { PageHead, Card, Stat, Badge } from '../components/ui.jsx'
import { DISPATCH } from '../data/seed.js'
import { IconTruck, IconQr, IconCheck, IconClock } from '../components/icons.jsx'

export default function Dispatch() {
  return (
    <>
      <PageHead title="Dispatch & Installation" subtitle="QR-tracked from the factory gate to the client's site." >
        <button className="btn btn-primary"><IconQr/> Scan Unit</button>
      </PageHead>

      <div className="grid g-4 mb">
        <Stat label="Out for Delivery" value="1" trend="Kumasi City Mall" dir="flat" tone="blue" icon={<IconTruck/>} />
        <Stat label="Delivered Today" value="2" trend="on time" dir="up" tone="green" icon={<IconCheck/>} />
        <Stat label="Scheduled" value="1" trend="Trasacco" dir="flat" tone="orange" icon={<IconClock/>} />
        <Stat label="Installed (Month)" value="28" trend="+9" dir="up" tone="purple" icon={<IconCheck/>} />
      </div>

      <Card title="Dispatch Log" sub="Barcode / QR scan tracking" pad={false}>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Dispatch</th><th>Job</th><th>Client</th><th>Units</th><th>Driver</th><th>Vehicle</th><th>Status</th><th>QR Scan</th></tr></thead>
            <tbody>
              {DISPATCH.map(d => (
                <tr key={d.id}>
                  <td className="t-mono">{d.id}</td>
                  <td className="t-mono t-muted">{d.job}</td>
                  <td className="t-strong">{d.client}</td>
                  <td>{d.units}</td>
                  <td className="t-muted">{d.driver}</td>
                  <td className="t-mono t-muted">{d.vehicle}</td>
                  <td><Badge>{d.status}</Badge></td>
                  <td>{d.qr==='scanned'
                    ? <span className="flex items-center gap-sm" style={{color:'var(--green)',fontSize:12,fontWeight:600}}><IconQr style={{width:15,height:15}}/> Scanned</span>
                    : <span className="flex items-center gap-sm muted" style={{fontSize:12}}><IconQr style={{width:15,height:15}}/> Pending</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid g-3 mt">
        {[['Scan at Dispatch','Every unit is QR-labelled and scanned as it leaves the factory — no more lost or mismatched items.'],
          ['Scan on Site','The installation team scans on arrival, confirming the right units reached the right client.'],
          ['Client Notified','On delivery and install, the client gets an automatic WhatsApp update with photos.']].map(([t,d],i)=>(
          <Card key={i} title={t}><p className="t-muted" style={{fontSize:13}}>{d}</p></Card>
        ))}
      </div>
    </>
  )
}
