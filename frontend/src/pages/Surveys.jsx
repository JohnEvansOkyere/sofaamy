import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHead, Card, Stat, Badge, Person } from '../components/ui.jsx'
import { IconRuler, IconPlus, IconCheck, IconClock, IconPin } from '../components/icons.jsx'
import { createSurvey, listProjects, listSurveys, listTeam, updateSurvey } from '../lib/api.js'
import { useLiveRefresh } from '../lib/live.js'
import '../styles/surveys.css'

const EMPTY = {
  project_id:'', scheduled_for:'', assigned_to:'', units:0, notes:'',
}

const STATUS_TONE = {
  scheduled:'blue', in_progress:'orange', completed:'green', cancelled:'gray',
}

const statusLabel = status => ({
  scheduled:'Scheduled', in_progress:'In progress', completed:'Completed',
  cancelled:'Cancelled',
}[status] || status)

function messageFrom(error) {
  return String(error?.message || error || 'Unable to update the survey schedule')
    .replace(/^API \d+:\s*/, '').replace(/^\{"detail":"|"\}$/g, '')
}

function formatWhen(value) {
  if (!value) return 'Not scheduled'
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString([], {
    day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit',
  })
}

export default function Surveys() {
  const [payload, setPayload] = useState({ surveys:[], stats:{} })
  const [projects, setProjects] = useState([])
  const [team, setTeam] = useState([])
  const [form, setForm] = useState(EMPTY)
  const [editing, setEditing] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const refresh = () => listSurveys().then(setPayload)
  useEffect(() => {
    Promise.all([refresh(), listProjects().then(setProjects), listTeam().then(setTeam)])
      .catch(error => setError(messageFrom(error)))
  }, [])
  useLiveRefresh(refresh)

  const fieldTeam = useMemo(() => team.filter(user =>
    ['rep', 'supervisor', 'management'].includes(user.role)), [team])
  const stats = payload.stats || {}

  function openCreate() {
    setEditing(null)
    setForm({...EMPTY, project_id:String(projects[0]?.id || '')})
    setError(''); setMessage(''); setShowForm(true)
  }

  function openEdit(survey) {
    setEditing(survey)
    setForm({
      project_id:String(survey.project_id),
      scheduled_for:survey.scheduled_for || '',
      assigned_to:survey.assigned_to || '',
      units:survey.units || 0,
      notes:survey.notes || '',
    })
    setError(''); setMessage(''); setShowForm(true)
  }

  async function submit(event) {
    event.preventDefault()
    setBusy('save'); setError(''); setMessage('')
    try {
      if (editing) {
        await updateSurvey(editing.project_id, editing.id, {
          scheduled_for:form.scheduled_for,
          assigned_to:form.assigned_to,
          units:Number(form.units || 0), notes:form.notes,
        })
        setMessage(`${editing.survey_number} rescheduled.`)
      } else {
        await createSurvey(Number(form.project_id), {
          scheduled_for:form.scheduled_for,
          assigned_to:form.assigned_to,
          units:Number(form.units || 0), notes:form.notes,
        })
        setMessage('Site survey scheduled and added to Project Control.')
      }
      setShowForm(false); setEditing(null); setForm(EMPTY)
      await refresh()
    } catch (error) {
      setError(messageFrom(error))
    } finally {
      setBusy('')
    }
  }

  async function changeStatus(survey, status) {
    setBusy(`${survey.id}-${status}`); setError(''); setMessage('')
    try {
      await updateSurvey(survey.project_id, survey.id, { status })
      setMessage(`${survey.survey_number} marked ${statusLabel(status).toLowerCase()}.`)
      await refresh()
    } catch (error) {
      setError(messageFrom(error))
    } finally {
      setBusy('')
    }
  }

  return (
    <>
      <PageHead title="Site Surveys" subtitle="Live project-linked measurement scheduling and field accountability.">
        <span className="survey-live"><i/> Live sync · {payload.generated_at ? new Date(payload.generated_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', second:'2-digit'}) : 'connecting'}</span>
        <button className="btn btn-primary" onClick={openCreate}><IconPlus/> Schedule Survey</button>
      </PageHead>

      {message && <div className="survey-notice success">✓ {message}</div>}
      {error && <div className="survey-notice error">⚠ {error}</div>}

      {showForm && <Card title={editing ? `Reschedule ${editing.survey_number}` : 'Schedule a site survey'}
        sub="The survey is linked to the project, calendar, activity history and workflow next action.">
        <form className="survey-form" onSubmit={submit}>
          <label>Project<select required disabled={Boolean(editing)} value={form.project_id}
            onChange={event => setForm({...form, project_id:event.target.value})}>
            <option value="">Choose a project</option>
            {projects.map(project => <option value={project.id} key={project.id}>{project.project_number} · {project.name}</option>)}
          </select></label>
          <label>Field representative<input required list="survey-team" value={form.assigned_to}
            onChange={event => setForm({...form, assigned_to:event.target.value})}/></label>
          <datalist id="survey-team">{fieldTeam.map(user => <option value={user.name} key={user.id}/>)}</datalist>
          <label>Date and time<input required type="datetime-local" value={form.scheduled_for}
            onChange={event => setForm({...form, scheduled_for:event.target.value})}/></label>
          <label>Expected openings<input type="number" min="0" value={form.units}
            onChange={event => setForm({...form, units:event.target.value})}/></label>
          <label className="survey-notes">Site instructions<textarea rows="2" value={form.notes}
            onChange={event => setForm({...form, notes:event.target.value})}/></label>
          <div className="survey-form-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
            <button className="btn btn-primary" disabled={busy === 'save'}>{busy === 'save' ? 'Saving…' : editing ? 'Save schedule' : 'Schedule survey'}</button>
          </div>
        </form>
      </Card>}

      <div className="grid g-4 mb">
        <Stat label="Surveys This Week" value={stats.this_week || 0} trend="live schedule" dir="flat" tone="blue" icon={<IconRuler/>}/>
        <Stat label="Completed" value={stats.completed || 0} trend="all recorded" dir="flat" tone="green" icon={<IconCheck/>}/>
        <Stat label="Scheduled" value={stats.scheduled || 0} trend={stats.next ? `next ${formatWhen(stats.next)}` : 'none pending'} dir="flat" tone="orange" icon={<IconClock/>}/>
        <Stat label="Overdue" value={stats.overdue || 0} trend={stats.overdue ? 'action required' : 'clear'} dir={stats.overdue ? 'down' : 'flat'} tone="purple" icon={<IconClock/>}/>
      </div>

      <Card title="Project Site Surveys" sub={`${payload.surveys.length} persisted survey record${payload.surveys.length === 1 ? '' : 's'}`} pad={false}>
        <div className="tbl-wrap">
          <table className="tbl survey-table">
            <thead><tr><th>Survey</th><th>Project / site</th><th>Field rep</th><th>Openings</th><th>Status</th><th>Scheduled</th><th>Actions</th></tr></thead>
            <tbody>
              {payload.surveys.map((survey, index) => <tr key={survey.id} className={survey.overdue ? 'survey-overdue' : ''}>
                <td><b className="t-mono">{survey.survey_number}</b><small>{survey.client_name}</small></td>
                <td><Link to={`/projects/${survey.project_id}`}>{survey.project_number} · {survey.project_name}</Link><small><IconPin/> {survey.site || 'Site not set'}</small></td>
                <td><Person name={survey.assigned_to || 'Unassigned'} i={index + 2}/></td>
                <td>{survey.units || '—'}</td>
                <td><Badge tone={survey.overdue ? 'orange' : STATUS_TONE[survey.status]}>{survey.overdue ? 'Overdue' : statusLabel(survey.status)}</Badge></td>
                <td><b>{formatWhen(survey.scheduled_for)}</b>{survey.variance && <small>Variance {survey.variance}</small>}</td>
                <td><div className="survey-actions">
                  {!['completed','cancelled'].includes(survey.status) && <button onClick={() => openEdit(survey)}>Reschedule</button>}
                  {survey.status === 'scheduled' && <button disabled={busy === `${survey.id}-in_progress`} onClick={() => changeStatus(survey, 'in_progress')}>Start</button>}
                  {survey.status === 'in_progress' && <button className="complete" disabled={busy === `${survey.id}-completed`} onClick={() => changeStatus(survey, 'completed')}>Complete</button>}
                  {!['completed','cancelled'].includes(survey.status) && <button className="cancel" disabled={busy === `${survey.id}-cancelled`} onClick={() => changeStatus(survey, 'cancelled')}>Cancel</button>}
                </div></td>
              </tr>)}
              {!payload.surveys.length && <tr><td colSpan="7"><div className="survey-empty">No surveys scheduled. Choose <b>Schedule Survey</b> to create the first project-linked appointment.</div></td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  )
}
