// Small on-canvas number input shown when a dimension label (overall width/height,
// or a per-section width/height) is double-clicked. Positioned in the same local
// coordinate space as the react-konva Text it edits, offset by the Stage's pan so
// it tracks the label under it.
export default function DimEditOverlay({ editing, pan, onCommit, onCancel }) {
  if (!editing) return null
  return (
    <input
      key={`${editing.kind}-${editing.index ?? ''}`}
      type="number" autoFocus defaultValue={editing.value}
      className="dim-edit-input"
      style={{ left: pan.x + editing.x, top: pan.y + editing.y, width: editing.w, textAlign: editing.align || 'center' }}
      onFocus={event => event.currentTarget.select()}
      onBlur={event => onCommit(event.target.value)}
      onKeyDown={event => {
        if (event.key === 'Enter') event.currentTarget.blur()
        if (event.key === 'Escape') onCancel()
      }}
    />
  )
}
