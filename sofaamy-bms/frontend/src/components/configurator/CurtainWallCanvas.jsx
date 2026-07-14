import { Stage, Layer, Rect, Line, Text, Group, Arrow } from 'react-konva'
import { CW_CELL_TYPES, FRAMES } from '../../lib/products.js'
import { MIN_SECTION_MM, designLayout } from '../../lib/designs.js'

// Curtain wall elevation — stick system: CONTINUOUS mullions over
// transoms (the reverse of a window frame), pressure-cap grid look,
// vision / spandrel / vent cells. Dividers drag like the frame canvas.
export default function CurtainWallCanvas({ design, stageW, stageH, selected, onSelect, onDividerMove }) {
  const { width, height, cols, rows, frame, cells } = design
  const { colW, rowH, scale, fw, fh, ox, oy, ft, cumX, cumY } = designLayout(design, stageW, stageH)
  const capColor = (FRAMES[frame] || FRAMES.mill).color
  const dim = '#CA6F1E'
  const capW = Math.max(5, ft * 0.8)

  const setCursor = (e, cur) => { const st = e.target.getStage(); if (st) st.container().style.cursor = cur }

  return (
    <Stage width={stageW} height={stageH}>
      <Layer>
        <Rect x={ox + 6} y={oy + 8} width={fw} height={fh} cornerRadius={3} fill="rgba(16,42,67,0.10)" listening={false}/>

        {/* cells (glass / spandrel / vent) */}
        {cells.map((cell, idx) => {
          const r = Math.floor(idx / cols), c = idx % cols
          const px = ox + cumX[c] * scale + capW / 2
          const py = oy + cumY[r] * scale + capW / 2
          const pw = (cumX[c + 1] - cumX[c]) * scale - capW
          const ph = (cumY[r + 1] - cumY[r]) * scale - capW
          const t = CW_CELL_TYPES[cell.type] ? cell.type : 'vision'
          const spec = CW_CELL_TYPES[t]
          const isSel = selected === idx
          return (
            <Group key={idx}>
              <Rect x={px} y={py} width={pw} height={ph} fill={spec.fill} opacity={spec.opacity}
                onClick={() => onSelect(idx)} onTap={() => onSelect(idx)}/>
              {t !== 'spandrel' &&
                <Line points={[px + pw*0.12, py + ph, px + pw*0.44, py]} stroke="#fff" strokeWidth={pw*0.05} opacity={0.18} listening={false}/>}
              {t === 'spandrel' &&
                <Line points={[px + 4, py + ph*0.35, px + pw - 4, py + ph*0.35]} stroke="rgba(255,255,255,0.15)" strokeWidth={1} listening={false}/>}
              {t === 'vent' &&
                <Line points={[px, py + ph, px + pw/2, py, px + pw, py + ph]} stroke="rgba(30,60,90,0.55)" strokeWidth={1.2} dash={[5,4]} listening={false}/>}
              <Rect x={px} y={py} width={pw} height={ph}
                stroke={isSel ? '#D4AC0D' : 'rgba(0,0,0,0.15)'} strokeWidth={isSel ? 3 : 1} listening={false}/>
              <Rect x={px + pw - 26} y={py + ph - 18} width={22} height={14} fill="#fff" opacity={0.85} cornerRadius={2} listening={false}/>
              <Text x={px + pw - 26} y={py + ph - 16} width={22} align="center" text={`B${idx + 1}`} fontSize={9} fontStyle="bold" fill="#33495e" listening={false}/>
            </Group>
          )
        })}

        {/* transoms — cut BETWEEN the mullions */}
        {Array.from({ length: rows + 1 }).map((_, r) => (
          <Rect key={`t${r}`} x={ox} y={oy + cumY[Math.min(r, rows)] * scale - capW / 2 + (r === 0 ? capW / 2 : 0) - (r === rows ? capW / 2 : 0)}
            width={fw} height={capW} fill={capColor} opacity={0.92} listening={false} cornerRadius={1}/>
        ))}
        {/* mullions — CONTINUOUS full height, drawn over the transoms */}
        {Array.from({ length: cols + 1 }).map((_, c) => (
          <Rect key={`m${c}`} x={ox + cumX[Math.min(c, cols)] * scale - capW / 2 + (c === 0 ? capW / 2 : 0) - (c === cols ? capW / 2 : 0)}
            y={oy - 10} width={capW} height={fh + 20} fill={capColor} listening={false} cornerRadius={1}
            shadowColor="rgba(0,0,0,0.25)" shadowBlur={4} shadowOffsetX={1}/>
        ))}
        {/* slab anchors at mullion heads/feet */}
        {Array.from({ length: cols + 1 }).map((_, c) => {
          const x = ox + cumX[Math.min(c, cols)] * scale - capW / 2 + (c === 0 ? capW / 2 : 0) - (c === cols ? capW / 2 : 0)
          return (
            <Group key={`a${c}`} listening={false}>
              <Rect x={x - 3} y={oy - 16} width={capW + 6} height={6} fill="#78848f" cornerRadius={1}/>
              <Rect x={x - 3} y={oy + fh + 10} width={capW + 6} height={6} fill="#78848f" cornerRadius={1}/>
            </Group>
          )
        })}

        {/* draggable dividers (interior grid lines only) */}
        {Array.from({ length: cols - 1 }).map((_, j) => {
          const bx = ox + cumX[j + 1] * scale - capW / 2
          const minX = ox + (cumX[j] + MIN_SECTION_MM) * scale - capW / 2
          const maxX = ox + (cumX[j + 2] - MIN_SECTION_MM) * scale - capW / 2
          return (
            <Rect key={`dv${j}-${cumX[j + 1]}`} x={bx} y={oy} width={capW} height={fh}
              fill="rgba(0,0,0,0.001)" draggable
              dragBoundFunc={(pos) => ({ x: Math.max(minX, Math.min(maxX, pos.x)), y: oy })}
              onMouseEnter={(e) => setCursor(e, 'col-resize')}
              onMouseLeave={(e) => setCursor(e, 'default')}
              onDragEnd={(e) => onDividerMove?.('col', j, (e.target.x() - bx) / scale)}
            />
          )
        })}
        {Array.from({ length: rows - 1 }).map((_, j) => {
          const by = oy + cumY[j + 1] * scale - capW / 2
          const minY = oy + (cumY[j] + MIN_SECTION_MM) * scale - capW / 2
          const maxY = oy + (cumY[j + 2] - MIN_SECTION_MM) * scale - capW / 2
          return (
            <Rect key={`dh${j}-${cumY[j + 1]}`} x={ox} y={by} width={fw} height={capW}
              fill="rgba(0,0,0,0.001)" draggable
              dragBoundFunc={(pos) => ({ x: ox, y: Math.max(minY, Math.min(maxY, pos.y)) })}
              onMouseEnter={(e) => setCursor(e, 'row-resize')}
              onMouseLeave={(e) => setCursor(e, 'default')}
              onDragEnd={(e) => onDividerMove?.('row', j, (e.target.y() - by) / scale)}
            />
          )
        })}

        {/* bay dims */}
        {cols > 1 && colW.map((wmm, c) => (
          <Group key={`cw${c}`} listening={false}>
            <Arrow points={[ox + cumX[c]*scale + 2, oy + fh + 26, ox + cumX[c + 1]*scale - 2, oy + fh + 26]}
              stroke={dim} fill={dim} strokeWidth={0.8} pointerLength={4} pointerWidth={4} pointerAtBeginning/>
            <Text x={ox + cumX[c]*scale} y={oy + fh + 30} width={wmm*scale} align="center"
              text={`${Math.round(wmm)}`} fontSize={10.5} fill={dim}/>
          </Group>
        ))}
        {rows > 1 && rowH.map((hmm, r) => (
          <Group key={`rh${r}`} listening={false}>
            <Arrow points={[ox + fw + 22, oy + cumY[r]*scale + 2, ox + fw + 22, oy + cumY[r + 1]*scale - 2]}
              stroke={dim} fill={dim} strokeWidth={0.8} pointerLength={4} pointerWidth={4} pointerAtBeginning/>
            <Text x={ox + fw + 26} y={oy + (cumY[r] + hmm/2)*scale - 5} text={`${Math.round(hmm)}`} fontSize={10.5} fill={dim}/>
          </Group>
        ))}
        <Arrow points={[ox, oy + fh + 46, ox + fw, oy + fh + 46]} stroke={dim} fill={dim} strokeWidth={1} pointerLength={6} pointerWidth={6} pointerAtBeginning listening={false}/>
        <Text x={ox} y={oy + fh + 52} width={fw} align="center" text={`${width} mm`} fontSize={12} fontStyle="bold" fill={dim} listening={false}/>
        <Arrow points={[ox - 36, oy, ox - 36, oy + fh]} stroke={dim} fill={dim} strokeWidth={1} pointerLength={6} pointerWidth={6} pointerAtBeginning listening={false}/>
        <Text x={ox - 40} y={oy + fh/2 + 28} text={`${height} mm`} fontSize={12} fontStyle="bold" fill={dim} rotation={-90} listening={false}/>
      </Layer>
    </Stage>
  )
}
