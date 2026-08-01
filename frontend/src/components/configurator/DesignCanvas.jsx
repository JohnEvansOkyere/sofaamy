import { Stage, Layer, Rect, Line, Text, Group, Arrow } from 'react-konva'
import { GLASS, FRAMES } from '../../lib/products.js'
import { MIN_SECTION_MM, designLayout } from '../../lib/designs.js'

// Renders a framed design: outer frame + dividers + sections.
// Sections can have unequal widths/heights (colWidths / rowHeights, mm)
// and multiple sash panels (S1/S2… like EvA's double door in a section).
// Dividers are draggable (EvA-style): dragging moves the boundary between
// the two neighbouring sections; the overall size never changes.
export default function DesignCanvas({ design, stageW, stageH, pan = { x:0, y:0 }, onPanChange, selected, onSelect, onDividerMove }) {
  const { width, height, cols, rows, frame, cells, group } = design
  const { colW, rowH, scale, fw, fh, ox, oy, ft, cumX, cumY } = designLayout(design, stageW, stageH)
  const frameColor = (FRAMES[frame] || FRAMES.mill).color
  const dim = '#CA6F1E'
  const isDoor = group === 'Doors'

  const cellLeft  = (c) => ox + cumX[c]*scale + (c === 0 ? ft : ft/2)
  const cellRight = (c) => ox + cumX[c+1]*scale - (c === cols-1 ? ft : ft/2)
  const cellTop   = (r) => oy + cumY[r]*scale + (r === 0 ? ft : ft/2)
  const cellBot   = (r) => oy + cumY[r+1]*scale - (r === rows-1 ? ft : ft/2)

  const marks = (px, py, pw, ph, opening, idx) => {
    const cx = px + pw/2, cy = py + ph/2
    const st = 'rgba(30,60,90,0.5)'
    switch (opening) {
      case 'casement': return <Line points={[px+pw, py, px, cy, px+pw, py+ph]} stroke={st} strokeWidth={1.2} dash={[5,4]} listening={false}/>
      case 'awning':   return <Line points={[px, py+ph, cx, py, px+pw, py+ph]} stroke={st} strokeWidth={1.2} dash={[5,4]} listening={false}/>
      case 'sliding':  return <Arrow points={idx%2===0?[cx-pw*0.2,cy,cx+pw*0.2,cy]:[cx+pw*0.2,cy,cx-pw*0.2,cy]} stroke={st} fill={st} strokeWidth={1.6} pointerLength={7} pointerWidth={7} listening={false}/>
      case 'louvre':   return <Group listening={false}>{Array.from({length:Math.max(3,Math.floor(ph/22))}).map((_,i)=>{const yy=py+10+i*20; return yy>py+ph-8?null:<Line key={i} points={[px+6,yy,px+pw-6,yy+4]} stroke={st} strokeWidth={2}/>})}</Group>
      case 'pivot':    return <Line points={[cx,py,cx,py+ph]} stroke={st} strokeWidth={1.2} dash={[6,4]} listening={false}/>
      case 'single': case 'double':
        return <Rect x={idx%2===0?px+pw-13:px+8} y={cy-13} width={5} height={26} cornerRadius={3} fill="rgba(30,60,90,0.55)" listening={false}/>
      default: return null
    }
  }

  const setCursor = (e, cur) => { const st = e.target.getStage(); if (st) st.container().style.cursor = cur }

  return (
    <Stage width={stageW} height={stageH} x={pan.x} y={pan.y} draggable dragDistance={4}
      onDragEnd={e => onPanChange?.({ x:e.target.x(), y:e.target.y() })}>
      <Layer>
        <Rect x={ox+6} y={oy+8} width={fw} height={fh} cornerRadius={3} fill="rgba(16,42,67,0.10)" listening={false}/>
        {/* frame + dividers show through the gaps between glass sections */}
        <Rect x={ox} y={oy} width={fw} height={fh} fill={frameColor} cornerRadius={2}
          shadowColor="rgba(0,0,0,0.2)" shadowBlur={10} shadowOffsetY={3} listening={false}/>

        {cells.map((cell, idx) => {
          const r = Math.floor(idx / cols), c = idx % cols
          const px = cellLeft(c), py = cellTop(r)
          const pw = cellRight(c) - px, ph = cellBot(r) - py
          const g = GLASS[cell.glass] || GLASS.clear
          const isSel = selected === idx
          const sashT = Math.max(3, ft * 0.55)   // sash frame thickness
          const local = cell.localDivider && (cell.localDivider.cols > 1 || cell.localDivider.rows > 1)
          const localCols = local ? cell.localDivider.cols : 1
          const localRows = local ? cell.localDivider.rows : 1
          const localW = local
            ? (cell.localDivider.colWidths?.length === localCols ? cell.localDivider.colWidths : Array.from({ length:localCols }, () => (pw / scale) / localCols))
            : [pw / scale]
          const localH = local
            ? (cell.localDivider.rowHeights?.length === localRows ? cell.localDivider.rowHeights : Array.from({ length:localRows }, () => (ph / scale) / localRows))
            : [ph / scale]
          const localX = localW.reduce((a, w) => [...a, a[a.length - 1] + w], [0])
          const localY = localH.reduce((a, h) => [...a, a[a.length - 1] + h], [0])
          const renderPane = (sx, sy, sw, sh, paneIndex) => {
            const n = cell.opening === 'fixed' ? 1 : (cell.panels || 1)
            return <Group key={`pane-${paneIndex}`}>
              <Rect x={sx} y={sy} width={sw} height={sh} fill={g.fill} opacity={g.opacity}
                onClick={() => onSelect(idx)} onTap={() => onSelect(idx)} />
              <Line points={[sx+sw*0.12, sy+sh, sx+sw*0.44, sy]} stroke="#fff" strokeWidth={sw*0.05} opacity={0.16} listening={false}/>
              {n === 1 && marks(sx, sy, sw, sh, cell.opening, idx + paneIndex)}
              {n > 1 && Array.from({ length:n }).map((_, k) => {
                const sashX = sx + k * (sw / n), sashW = sw / n
                return <Group key={`sash-${k}`} listening={false}>
                  <Rect x={sashX+1} y={sy+1} width={sashW-2} height={sh-2} stroke={frameColor} strokeWidth={sashT} fill="rgba(255,255,255,0.06)"/>
                  {marks(sashX + sashT, sy + sashT, sashW - sashT*2, sh - sashT*2, cell.opening, k)}
                  <Rect x={sashX+4} y={sy+4} width={20} height={13} fill="#fff" opacity={0.85} cornerRadius={2}/>
                  <Text x={sashX+4} y={sy+6} width={20} align="center" text={`S${k+1}`} fontSize={8.5} fontStyle="bold" fill="#33495e"/>
                </Group>
              })}
              {local && (
                <Text x={sx+4} y={sy+4} width={34} text={`F${idx+1}.${paneIndex+1}`} fontSize={8} fontStyle="bold" fill="#33495e" listening={false}/>
              )}
            </Group>
          }
          return (
            <Group key={idx}>
              {local
                ? Array.from({ length:localCols * localRows }).map((_, paneIndex) => {
                    const pc = paneIndex % localCols, pr = Math.floor(paneIndex / localCols)
                    return renderPane(px + localX[pc] * scale, py + localY[pr] * scale,
                      localW[pc] * scale, localH[pr] * scale, paneIndex)
                  })
                : renderPane(px, py, pw, ph, 0)}
              {local && <Group listening={false}>
                {Array.from({ length:localCols - 1 }).map((_, j) => <Line key={`local-v-${j}`} points={[px + localX[j + 1] * scale, py, px + localX[j + 1] * scale, py + ph]} stroke={frameColor} strokeWidth={sashT}/>) }
                {Array.from({ length:localRows - 1 }).map((_, j) => <Line key={`local-h-${j}`} points={[px, py + localY[j + 1] * scale, px + pw, py + localY[j + 1] * scale]} stroke={frameColor} strokeWidth={sashT}/>) }
              </Group>}
              <Rect x={px} y={py} width={pw} height={ph}
                stroke={isSel ? '#D4AC0D' : 'rgba(0,0,0,0.12)'} strokeWidth={isSel ? 3 : 1} listening={false}/>
              {/* EvA-style section tag */}
              <Rect x={px+pw-26} y={py+ph-18} width={22} height={14} fill="#fff" opacity={0.85} cornerRadius={2} listening={false}/>
              <Text x={px+pw-26} y={py+ph-16} width={22} align="center" text={`F${idx+1}`} fontSize={9} fontStyle="bold" fill="#33495e" listening={false}/>
            </Group>
          )
        })}
        {isDoor && <Rect x={ox+ft} y={oy+fh-ft-16} width={fw-ft*2} height={16} fill={frameColor} opacity={0.85} listening={false}/>}

        {/* draggable vertical dividers (between columns) */}
        {Array.from({ length: cols-1 }).map((_, j) => {
          const bx = ox + cumX[j+1]*scale - ft/2
          const minX = ox + (cumX[j] + MIN_SECTION_MM)*scale - ft/2
          const maxX = ox + (cumX[j+2] - MIN_SECTION_MM)*scale - ft/2
          return (
            <Rect key={`v${j}-${cumX[j+1]}`} x={bx} y={oy} width={ft} height={fh}
              fill="rgba(0,0,0,0.001)" draggable
              dragBoundFunc={(pos) => ({ x: Math.max(minX, Math.min(maxX, pos.x)), y: oy })}
              onMouseEnter={(e) => setCursor(e, 'col-resize')}
              onMouseLeave={(e) => setCursor(e, 'default')}
              onDragEnd={(e) => onDividerMove?.('col', j, (e.target.x() - bx) / scale)}
            />
          )
        })}
        {/* draggable horizontal dividers (between rows) */}
        {Array.from({ length: rows-1 }).map((_, j) => {
          const by = oy + cumY[j+1]*scale - ft/2
          const minY = oy + (cumY[j] + MIN_SECTION_MM)*scale - ft/2
          const maxY = oy + (cumY[j+2] - MIN_SECTION_MM)*scale - ft/2
          return (
            <Rect key={`h${j}-${cumY[j+1]}`} x={ox} y={by} width={fw} height={ft}
              fill="rgba(0,0,0,0.001)" draggable
              dragBoundFunc={(pos) => ({ x: ox, y: Math.max(minY, Math.min(maxY, pos.y)) })}
              onMouseEnter={(e) => setCursor(e, 'row-resize')}
              onMouseLeave={(e) => setCursor(e, 'default')}
              onDragEnd={(e) => onDividerMove?.('row', j, (e.target.y() - by) / scale)}
            />
          )
        })}

        {/* per-column widths (EvA-style: 500 · 1500, then the 2000 total) */}
        {cols > 1 && colW.map((wmm, c) => (
          <Group key={`cw${c}`} listening={false}>
            <Arrow points={[ox+cumX[c]*scale+2, oy+fh+16, ox+cumX[c+1]*scale-2, oy+fh+16]}
              stroke={dim} fill={dim} strokeWidth={0.8} pointerLength={4} pointerWidth={4} pointerAtBeginning/>
            <Text x={ox+cumX[c]*scale} y={oy+fh+20} width={wmm*scale} align="center"
              text={`${Math.round(wmm)}`} fontSize={10.5} fill={dim}/>
          </Group>
        ))}
        {/* per-row heights */}
        {rows > 1 && rowH.map((hmm, r) => (
          <Group key={`rh${r}`} listening={false}>
            <Arrow points={[ox+fw+16, oy+cumY[r]*scale+2, ox+fw+16, oy+cumY[r+1]*scale-2]}
              stroke={dim} fill={dim} strokeWidth={0.8} pointerLength={4} pointerWidth={4} pointerAtBeginning/>
            <Text x={ox+fw+20} y={oy+(cumY[r]+hmm/2)*scale-5} text={`${Math.round(hmm)}`} fontSize={10.5} fill={dim}/>
          </Group>
        ))}

        {/* overall dimension lines */}
        <Arrow points={[ox, oy+fh+36, ox+fw, oy+fh+36]} stroke={dim} fill={dim} strokeWidth={1} pointerLength={6} pointerWidth={6} pointerAtBeginning listening={false}/>
        <Text x={ox} y={oy+fh+42} width={fw} align="center" text={`${width} mm`} fontSize={12} fontStyle="bold" fill={dim} listening={false}/>
        <Arrow points={[ox-36, oy, ox-36, oy+fh]} stroke={dim} fill={dim} strokeWidth={1} pointerLength={6} pointerWidth={6} pointerAtBeginning listening={false}/>
        <Text x={ox-40} y={oy+fh/2+28} text={`${height} mm`} fontSize={12} fontStyle="bold" fill={dim} rotation={-90} listening={false}/>
      </Layer>
    </Stage>
  )
}
