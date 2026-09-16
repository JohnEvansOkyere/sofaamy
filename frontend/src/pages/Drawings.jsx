import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHead, Card, Stat, Badge } from '../components/ui.jsx'
import { getDrawingsQueue } from '../lib/api.js'
import { useLiveRefresh } from '../lib/live.js'
import { timeAgo } from '../lib/whatsapp.js'
import { IconRuler, IconCheck, IconClock, IconLayers } from '../components/icons.jsx'
import '../styles/ops.css'

const ITEM_STATUS = {
  approved: ['green', 'Drawn'],
  not_required: ['blue', 'Not required'],
  pending: ['orange', 'Pending'],
}

export default function Drawings() {
  const [projects, setProjects] = useState([])
  const [live, setLive] = useState(false)

  const refresh = () => getDrawingsQueue()
    .then(rows => { setProjects(rows); setLive(true) })
    .catch(() => setLive(false))
  useEffect(() => { refresh() }, [])
  useLiveRefresh(refresh)

  const submitted = projects.filter(row => row.released_to_qc_at)
  const readyToSubmit = projects.filter(row => row.ready_for_qc && !row.released_to_qc_at)
  const pending = projects.filter(row => !row.ready_for_qc && !row.released_to_qc_at)

  return <>
    <PageHead title="Drawings" subtitle="Every project Accounts has released to Technical — draw each item, mark items not required, then submit the project to QC.">
      {live
        ? <span className="badge b-green"><span className="bdot"/>Live · from database</span>
        : <span className="badge b-orange"><span className="bdot"/>Backend offline</span>}
    </PageHead>

    <div className="grid g-4 mb">
      <Stat label="Awaiting Drawing Work" value={String(pending.length)} trend="items still pending" dir="flat" tone="orange" icon={<IconClock/>} />
      <Stat label="Ready for QC" value={String(readyToSubmit.length)} trend="every item resolved" dir="flat" tone="blue" icon={<IconLayers/>} />
      <Stat label="Submitted to QC" value={String(submitted.length)} trend="handed to QA/QC" dir="up" tone="green" icon={<IconCheck/>} />
    </div>

    <Card title="Drawing queue" sub="Released by Accounts, in Technical's hands until every item is drawn or marked not required." pad={false}>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th>Project</th><th>Client</th><th>Released by</th><th>Items</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {projects.map(row => (
              <tr key={row.project_id}>
                <td><b>{row.project_name}</b><small className="quality-project-number">{row.project_number}</small></td>
                <td>{row.client_name}</td>
                <td className="t-muted">{row.released_to_technical_by || 'Accounts'} · {timeAgo(row.released_to_technical_at)}</td>
                <td>
                  <div className="flex gap-sm wrap">
                    {row.items.length
                      ? Object.entries(row.items.reduce((counts, item) => {
                          const key = ITEM_STATUS[item.status] ? item.status : 'pending'
                          counts[key] = (counts[key] || 0) + 1
                          return counts
                        }, {})).map(([status, count]) => {
                          const [tone, label] = ITEM_STATUS[status]
                          return <Badge tone={tone} key={status}>{count} {label}</Badge>
                        })
                      : <span className="t-muted">No measured items</span>}
                  </div>
                </td>
                <td>{row.released_to_qc_at
                  ? <Badge tone="green">Submitted to QC</Badge>
                  : row.ready_for_qc
                    ? <Badge tone="blue">Ready for QC</Badge>
                    : <Badge tone="orange">Pending</Badge>}
                </td>
                <td className="right"><Link className="btn btn-primary btn-sm"
                  to={`/technical-workflow?project=${row.project_id}&page=drawings`}>
                  <IconRuler /> Open drawings
                </Link></td>
              </tr>
            ))}
            {!projects.length && <tr><td colSpan={6} className="muted center" style={{ padding:22 }}>No project has been released to Technical yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </Card>
  </>
}
