import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Badge } from '../components/ui.jsx'
import {
  createProjectTask, getProjectBoard, getProjectWorkflow, listSurveys, listTeam,
  updateProjectBoardPosition, updateProjectManagement, updateProjectTask,
} from '../lib/api.js'
import { useLiveRefresh } from '../lib/live.js'
import { GHS0 } from '../lib/whatsapp.js'
import { IconLayers, IconPlus } from '../components/icons.jsx'
import '../styles/project-board.css'

const COLUMNS = [
  ['measurement', 'Measurement & design'],
  ['quotation', 'Quotation'],
  ['awaiting_payment', 'Awaiting payment'],
  ['paid_technical', 'QC'],
  ['production', 'Production'],
  ['qa', 'Quality'],
  ['dispatch', 'Dispatch'],
  ['delivered', 'Delivered'],
]

const DEPARTMENTS = [
  'Management', 'Sales', 'Estimation', 'Technical', 'Procurement',
  'Factory', 'QA', 'Dispatch', 'Accounts',
]

const TEAMS = ['Management', 'Sales', 'Technical', 'Procurement', 'Factory', 'QA', 'Dispatch', 'Accounts']

function messageFrom(error) {
  return String(error?.message || error || 'Unable to update project')
    .replace(/^API \d+:\s*/, '').replace(/^\{"detail":"|"\}$/g, '')
}

function isoDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function calendarCells(month) {
  const [year, monthNumber] = month.split('-').map(Number)
  const first = new Date(year, monthNumber - 1, 1)
  const start = new Date(year, monthNumber - 1, 1 - first.getDay())
  return Array.from({ length:42 }, (_, index) => {
    const date = new Date(start)
    date.setDate(start.getDate() + index)
    return { date, key:isoDate(date), current:date.getMonth() === monthNumber - 1 }
  })
}

function ProjectCard({ card, dragging, onDragStart, onDragEnd }) {
  const late = card.overdue_task_count > 0 || (
    card.due_date && card.due_date < isoDate(new Date()) && card.stage !== 'delivered')
  return <Link to={`/projects/${card.id}`} draggable
    onDragStart={() => onDragStart(card)} onDragEnd={onDragEnd}
    className={`project-board-card priority-${card.priority}${late ? ' late' : ''}${dragging ? ' dragging' : ''}`}>
    <div className="project-board-card-top">
      <span>{card.project_number}</span>
      {late && <Badge tone="orange">Overdue</Badge>}
    </div>
    <h3>{card.name}</h3>
    <p title={`${card.client_name}${card.site ? ` · ${card.site}` : ''}`}>{card.client_name}{card.site ? ` · ${card.site}` : ''}</p>
    <div className="project-board-card-meta">
      <b>{card.owner || card.team || 'Unassigned'}</b>
      <span>{card.due_date ? `Due ${card.due_date}` : 'No deadline'}</span>
    </div>
  </Link>
}

const VIEWS = ['board', 'table', 'calendar']
const SCOPES = [['active', 'Active'], ['delivered', 'Delivered'], ['all', 'All']]

export default function ProjectBoard() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [cards, setCards] = useState([])
  const [surveys, setSurveys] = useState([])
  const [team, setTeam] = useState([])
  const requestedView = searchParams.get('view')
  const view = VIEWS.includes(requestedView) ? requestedView : 'board'
  const scope = SCOPES.some(([key]) => key === searchParams.get('scope'))
    ? searchParams.get('scope') : 'active'
  const [search, setSearch] = useState('')
  const [month, setMonth] = useState(isoDate(new Date()).slice(0, 7))
  const [selected, setSelected] = useState(null)
  const [workspace, setWorkspace] = useState(null)
  const [assignment, setAssignment] = useState({
    owner:'', team:'', planned_start:'', due_date:'', priority:'normal',
  })
  const [task, setTask] = useState({
    department:'Procurement', title:'', assignee:'', due_date:'', notes:'', status:'todo',
  })
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [draggedCard, setDraggedCard] = useState(null)
  const [dragOverColumn, setDragOverColumn] = useState(null)

  const refreshBoard = () => Promise.all([
    getProjectBoard().then(data => setCards(data.cards || [])),
    listSurveys().then(data => setSurveys(data.surveys || [])),
  ])

  useEffect(() => {
    Promise.all([refreshBoard(), listTeam().then(setTeam)])
      .catch(error => setError(messageFrom(error)))
  }, [])
  useLiveRefresh(() => selected ? refreshSelected() : refreshBoard())

  const cells = useMemo(() => calendarCells(month), [month])
  // one filtered set feeds every view, so the three views always agree
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase()
    return cards.filter(card => {
      if (scope === 'active' && card.stage === 'delivered') return false
      if (scope === 'delivered' && card.stage !== 'delivered') return false
      if (!term) return true
      return [card.project_number, card.name, card.client_name, card.site, card.owner, card.team]
        .some(field => String(field || '').toLowerCase().includes(term))
    })
  }, [cards, scope, search])
  const scheduled = useMemo(() => {
    const byDate = {}
    visible.forEach(card => {
      if (card.planned_start) (byDate[card.planned_start] ||= []).push({ card, type:'start' })
      if (card.due_date) (byDate[card.due_date] ||= []).push({ card, type:'due' })
    })
    surveys.forEach(survey => {
      if (survey.status !== 'cancelled' && survey.scheduled_for) {
        const key = survey.scheduled_for.slice(0, 10)
        ;(byDate[key] ||= []).push({ survey, type:'survey' })
      }
    })
    return byDate
  }, [visible, surveys])

  function setView(values) {
    const next = new URLSearchParams(searchParams)
    Object.entries(values).forEach(([key, value]) => {
      if (value) next.set(key, value)
      else next.delete(key)
    })
    setSearchParams(next)
  }

  async function openManager(card) {
    setSelected(card)
    setError('')
    const data = await getProjectWorkflow(card.id)
    setWorkspace(data.workspace)
    const current = data.workspace.management || {}
    setAssignment({
      owner:current.owner || '', team:current.team || '',
      planned_start:current.planned_start || '', due_date:current.due_date || '',
      priority:current.priority || 'normal',
    })
  }

  async function refreshSelected() {
    if (!selected) return
    const data = await getProjectWorkflow(selected.id)
    setWorkspace(data.workspace)
    await refreshBoard()
  }

  async function moveCard(card, stage) {
    if (card.stage === stage) return
    const previous = cards
    setCards(current => current.map(row => row.id === card.id ? { ...row, stage } : row))
    setError('')
    try {
      await updateProjectBoardPosition(card.id, stage)
    } catch (error) {
      setCards(previous)
      setError(messageFrom(error))
    }
  }

  async function run(key, action, success) {
    setBusy(key); setError(''); setMessage('')
    try {
      await action(); await refreshSelected(); setMessage(success)
    } catch (error) {
      setError(messageFrom(error))
    } finally {
      setBusy('')
    }
  }

  function saveAssignment(event) {
    event.preventDefault()
    run('assignment', () => updateProjectManagement(selected.id, assignment),
      'Project control updated.')
  }

  function addTask(event) {
    event.preventDefault()
    run('task', () => createProjectTask(selected.id, task), 'Department task created.')
      .then(() => setTask(current => ({ ...current, title:'', notes:'' })))
  }

  return <>
    <div className="register-bar">
      <div className="register-scopes">
        {SCOPES.map(([key, label]) => <button key={key}
          className={scope === key ? 'active' : ''}
          onClick={() => setView({ scope:key })}>
          {label}
          <em>{cards.filter(card => key === 'all' ? true
            : key === 'delivered' ? card.stage === 'delivered' : card.stage !== 'delivered').length}</em>
        </button>)}
      </div>
      <input className="register-search" value={search} placeholder="Search project, client, site or owner…"
        onChange={event => setSearch(event.target.value)}/>
      <div className="project-board-view-switch">
        <button className={view === 'board' ? 'active' : ''} onClick={() => setView({ view:'' })}>Board</button>
        <button className={view === 'table' ? 'active' : ''} onClick={() => setView({ view:'table' })}>Table</button>
        <button className={view === 'calendar' ? 'active' : ''} onClick={() => setView({ view:'calendar' })}>Calendar</button>
      </div>
    </div>

    {message && <div className="project-board-notice success">✓ {message}</div>}
    {error && <div className="project-board-notice error">⚠ {error}</div>}

    <div className="project-board-summary">
      <div><b>{visible.length}</b><span>Projects</span></div>
      <div><b>{visible.filter(card => !card.owner && !card.team).length}</b><span>Unassigned</span></div>
      <div><b>{visible.reduce((sum, card) => sum + card.overdue_task_count, 0)}</b><span>Overdue tasks</span></div>
      <div><b>{visible.filter(card => card.commercial.payment_gate_cleared && card.stage !== 'delivered').length}</b><span>Paid active work</span></div>
    </div>

    {view === 'board' ? <div className="project-kanban">
      {COLUMNS.map(([key, label]) => {
        const columnCards = visible.filter(card => card.stage === key)
        return <section key={key}
          className={`project-kanban-column column-${key}${dragOverColumn === key ? ' drag-over' : ''}`}
          onDragOver={event => { if (draggedCard) { event.preventDefault(); setDragOverColumn(key) } }}
          onDragLeave={() => setDragOverColumn(current => current === key ? null : current)}
          onDrop={event => {
            event.preventDefault()
            setDragOverColumn(null)
            if (draggedCard) moveCard(draggedCard, key)
          }}>
          <header><span>{label}</span><b>{columnCards.length}</b></header>
          <div>{columnCards.map(card => <ProjectCard key={card.id} card={card}
            dragging={draggedCard?.id === card.id} onDragStart={setDraggedCard}
            onDragEnd={() => { setDraggedCard(null); setDragOverColumn(null) }}/>)}</div>
        </section>
      })}
    </div> : view === 'table' ? <div className="register-table-wrap">
      <table className="register-table">
        <thead><tr>
          <th>Project</th><th>Client</th><th>Owner</th><th>Stage</th>
          <th className="num">Contract</th><th className="num">Balance</th>
          <th>Due</th><th>Next action</th><th aria-label="Actions"/>
        </tr></thead>
        <tbody>
          {visible.map(card => {
            const late = card.due_date && card.due_date < isoDate(new Date()) && card.stage !== 'delivered'
            return <tr key={card.id}>
              <td><b>{card.name}</b><small>{card.project_number}</small></td>
              <td>{card.client_name}{card.site && <small>{card.site}</small>}</td>
              <td>{card.owner || card.team || <em>Unassigned</em>}</td>
              <td><Badge tone={card.stage === 'delivered' ? 'green' : 'blue'}>
                {(COLUMNS.find(([key]) => key === card.stage) || [, card.stage])[1]}
              </Badge></td>
              <td className="num">{GHS0(card.commercial.contract_value)}</td>
              <td className="num">{GHS0(card.commercial.outstanding_balance)}</td>
              <td className={late ? 'late' : ''}>{card.due_date || <em>Not set</em>}</td>
              <td className="next" title={card.next_action.label}>{card.next_action.label}</td>
              <td className="row-actions">
                <Link to={`/projects/${card.id}`}>View</Link>
                <button onClick={() => openManager(card)}>Assign</button>
              </td>
            </tr>
          })}
          {!visible.length && <tr className="register-empty"><td colSpan={9}>No projects match this view.</td></tr>}
        </tbody>
      </table>
    </div> : <div className="project-calendar-wrap">
      <div className="project-calendar-toolbar">
        <h2>Project schedule</h2>
        <input type="month" value={month} onChange={event => setMonth(event.target.value)}/>
      </div>
      <div className="project-calendar-weekdays">
        {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(day => <span key={day}>{day}</span>)}
      </div>
      <div className="project-calendar">
        {cells.map(cell => <div key={cell.key} className={cell.current ? '' : 'outside'}>
          <b>{cell.date.getDate()}</b>
          {(scheduled[cell.key] || []).map(({ card, survey, type }) => survey
            ? <Link key={`survey-${survey.id}`} className="survey" to="/surveys">
              <span>SURVEY</span>{survey.project_number} · {survey.scheduled_for.slice(11, 16)}
            </Link>
            : <button key={`${card.id}-${type}`} className={type} onClick={() => openManager(card)}>
              <span>{type === 'start' ? 'START' : 'DUE'}</span>{card.project_number}
            </button>)}
        </div>)}
      </div>
    </div>}

    {selected && <div className="project-manager-backdrop" onMouseDown={event => {
      if (event.target === event.currentTarget) setSelected(null)
    }}>
      <aside className="project-manager">
        <header>
          <div><span>Project control</span><h2>{selected.name}</h2><p>{selected.project_number}</p></div>
          <button onClick={() => setSelected(null)}>×</button>
        </header>

        <form onSubmit={saveAssignment} className="project-manager-form">
          <h3>Owner and project schedule</h3>
          <label>Responsible person<input list="project-team-people" value={assignment.owner}
            onChange={event => setAssignment({...assignment, owner:event.target.value})}
            placeholder="Assign a person"/></label>
          <datalist id="project-team-people">{team.map(person =>
            <option key={person.id} value={person.name}>{person.role}</option>)}</datalist>
          <label>Responsible team<select value={assignment.team}
            onChange={event => setAssignment({...assignment, team:event.target.value})}>
            <option value="">Choose team…</option>{TEAMS.map(name => <option key={name}>{name}</option>)}
          </select></label>
          <div className="project-manager-grid">
            <label>Planned start<input type="date" disabled={!workspace?.commercial?.schedule_authorized} value={assignment.planned_start}
              onChange={event => setAssignment({...assignment, planned_start:event.target.value})}/></label>
            <label>Due date<input type="date" min={assignment.planned_start} disabled={!workspace?.commercial?.schedule_authorized} value={assignment.due_date}
              onChange={event => setAssignment({...assignment, due_date:event.target.value})}/></label>
          </div>
          {!workspace?.commercial?.schedule_authorized && <p className="project-manager-help">
            {workspace?.commercial?.schedule_reason || 'Project dates unlock after client acceptance and payment clearance.'}
          </p>}
          <label>Priority<select value={assignment.priority}
            onChange={event => setAssignment({...assignment, priority:event.target.value})}>
            <option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option>
          </select></label>
          <button className="btn btn-primary" disabled={!!busy}>{busy === 'assignment' ? 'Saving…' : 'Save assignment'}</button>
        </form>

        <div className="project-manager-tasks">
          <h3>Department tasks <Badge tone="blue">{workspace?.management?.open_task_count || 0} open</Badge></h3>
          {(workspace?.management?.tasks || []).map(row => <div key={row.id} className={row.overdue ? 'overdue' : ''}>
            <span>{row.department}</span><b>{row.title}</b><small>{row.assignee || 'Unassigned'} · {row.due_date || 'No deadline'}</small>
            <select value={row.status} disabled={!!busy} onChange={event => run(
              `task-${row.id}`,
              () => updateProjectTask(selected.id, row.id, { status:event.target.value }),
              `${row.title} updated.`,
            )}>
              <option value="todo">To do</option><option value="in_progress">In progress</option>
              <option value="blocked">Blocked</option><option value="done">Done</option>
            </select>
          </div>)}
          {!workspace?.management?.tasks?.length && <p className="project-manager-empty">No departmental tasks yet.</p>}
        </div>

        <form onSubmit={addTask} className="project-manager-form task-form">
          <h3><IconPlus/> Add next task</h3>
          <label>Department<select value={task.department}
            onChange={event => setTask({...task, department:event.target.value})}>
            {DEPARTMENTS.map(name => <option key={name}>{name}</option>)}
          </select></label>
          <label>Task<input required value={task.title}
            onChange={event => setTask({...task, title:event.target.value})}
            placeholder="e.g. Reserve approved profiles"/></label>
          <label>Assignee<input list="project-team-people" value={task.assignee}
            onChange={event => setTask({...task, assignee:event.target.value})}
            placeholder="Person or team"/></label>
          <label>Due date<input type="date" value={task.due_date}
            onChange={event => setTask({...task, due_date:event.target.value})}/></label>
          <label>Notes<textarea value={task.notes}
            onChange={event => setTask({...task, notes:event.target.value})}
            placeholder="Expected result or blocker"/></label>
          <button className="btn btn-primary" disabled={!!busy || !task.title.trim()}>
            {busy === 'task' ? 'Creating…' : 'Create task'}
          </button>
        </form>
        <Link className="project-manager-open" to={`/projects/${selected.id}`}><IconLayers/> Open complete project workspace</Link>
      </aside>
    </div>}
  </>
}
