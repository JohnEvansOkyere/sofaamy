import { Stage, Layer, Rect, Line, Text, Group, Arrow, Circle } from 'react-konva'
import { FL_GLASS, FL_FAB } from '../../lib/products.js'
import { MIN_SECTION_MM, designLayout } from '../../lib/designs.js'
import { framelessBreakdown } from '../../lib/frameless.js'
import { panelFeatures, PREP_TEMPLATES } from '../../lib/preps.js'

// Draw a panel's glass preps (holes / patch cutouts / notches) at
// true positions — the same parametric library that generates the
// fabrication drawings, so what you see IS what gets drilled.
function Preps({ feats, x0, top, w, h, wMm, hMm, steel }) {
  if (!feats) return null
  const px = (mm) => x0 + (mm / wMm) * w
  const py = (mm) => top + (mm / hMm) * h
  return (
    <Group listening={false}>
      {feats.features.map((f, k) => {
        if (f.kind === 'hole')
          return <Circle key={k} x={px(f.x)} y={py(f.y)} radius={Math.max(1.8, (f.dia / wMm) * w * 0.5)}
            stroke={steel} strokeWidth={1.2} fill="rgba(255,255,255,0.75)"/>
        if (f.kind === 'cutout') {
          const t = PREP_TEMPLATES[f.template]
          const cw = (t.run / wMm) * w, ch = Math.max(2.5, (t.depth / hMm) * h)
          const cx = f.corner.includes('L') ? x0 : x0 + w - cw
          const cy = f.corner.startsWith('T') ? top : top + h - ch
          return <Rect key={k} x={cx} y={cy} width={cw} height={ch}
            fill="#f4f8fb" stroke={steel} strokeWidth={0.9}
            cornerRadius={f.corner.startsWith('T')
              ? (f.corner.includes('L') ? [0,0,ch,0] : [0,0,0,ch])
              : (f.corner.includes('L') ? [0,ch,0,0] : [ch,0,0,0])}/>
        }
        // notch
        const nw = Math.max(3, (f.w / wMm) * w), nh = Math.max(3, (f.h / hMm) * h)
        const nx = f.yEnd != null
          ? (f.corner.includes('L') ? x0 : x0 + w - nw)
          : (f.corner === 'BL' ? px(f.off) : x0 + w - (f.off / wMm) * w - nw)
        const ny = f.yEnd != null
          ? (f.corner.startsWith('T') ? py(f.yEnd) : top + h - (f.yEnd / hMm) * h - nh)
          : top + h - nh
        return <Rect key={k} x={nx} y={ny} width={nw} height={nh}
          fill="#f4f8fb" stroke={steel} strokeWidth={0.9}/>
      })}
    </Group>
  )
}

// Frameless elevation — a run of toughened-glass panels with visible
// joints, patch fittings, floor springs, handles and an optional
// over-panel band. Mirrors the SmartGlazier drawing style Sofaamy
// already knows (see images/sofaamy.pdf).
export default function FramelessCanvas({ design, stageW, stageH, pan = { x:0, y:0 }, onPanChange, selected, onSelect, onDividerMove }) {
  const { width, height, cells, doorH } = design
  const { colW, scale, fw, fh, ox, oy, cumX } = designLayout(design, stageW, stageH)
  const dim = '#CA6F1E'
  const glass = FL_GLASS[design.glassId] || FL_GLASS.temp10
  const steel = '#5d6d7e'

  const mmY = (mm) => oy + mm * scale                     // void top → down
  const floorY = mmY(height)
  const botY = mmY(height - FL_FAB.floorGapMm)            // panel bottoms
  const gapPx = Math.max(2, FL_FAB.jointMm * scale * 1.4) // exaggerate joints slightly so they read

  const isLeaf = (t) => t === 'door' || t === 'hinged'
  const bd = framelessBreakdown(design)
  const feats = panelFeatures(design, bd.panels)   // feats[i] ↔ cells[i]; over-panel last
  const overIdx = bd.overIdx                       // fanlight bays (leaves, or sliders)
  const hasOver = overIdx.length > 0
  const overH = height - FL_FAB.floorGapMm - doorH - FL_FAB.overGapMm
  const showOver = hasOver && overH > 60
  const doorTopY = showOver ? mmY(overH + FL_FAB.overGapMm) : oy + gapPx
  const cornerAt = design.cornerAfter >= 0 && design.cornerAfter < design.cols - 1
    ? design.cornerAfter : -1                      // L-shape corner joint index

  const setCursor = (e, cur) => { const st = e.target.getStage(); if (st) st.container().style.cursor = cur }

  return (
    <Stage width={stageW} height={stageH} x={pan.x} y={pan.y} draggable dragDistance={4}
      onDragEnd={e => onPanChange?.({ x:e.target.x(), y:e.target.y() })}>
      <Layer>
        {/* void / wall opening */}
        <Rect x={ox - 6} y={oy - 6} width={fw + 12} height={fh + 6} fill="rgba(16,42,67,0.06)" listening={false}/>
        {/* floor line */}
        <Line points={[ox - 30, floorY, ox + fw + 30, floorY]} stroke="#8a99a8" strokeWidth={2} listening={false}/>
        <Line points={[ox - 30, floorY + 5, ox + fw + 30, floorY + 5]} stroke="#c3ccd4" strokeWidth={1} listening={false}/>

        {cells.map((cell, i) => {
          const x0 = ox + cumX[i] * scale + gapPx / 2
          const x1 = ox + cumX[i + 1] * scale - gapPx / 2
          const w = x1 - x0
          const ty = cell.type || 'fixed'
          const leaf = isLeaf(ty)
          // sliders hang from a top track (below the fanlight, if any)
          const slideTop = (showOver && overIdx.includes(i) ? doorTopY : oy + gapPx / 2)
            + FL_FAB.slideTrackMm * scale
          const top = leaf ? doorTopY
            : ty === 'slider' ? slideTop
            : oy + gapPx / 2
          const bot = botY
          const h = bot - top
          const isSel = selected === i
          return (
            <Group key={i}>
              <Rect x={x0} y={top} width={w} height={h} fill={glass.fill} opacity={glass.opacity}
                stroke={isSel ? '#D4AC0D' : 'rgba(40,70,100,0.45)'} strokeWidth={isSel ? 3 : 1}
                onClick={() => onSelect(i)} onTap={() => onSelect(i)}/>
              <Line points={[x0 + w*0.12, top + h, x0 + w*0.44, top]} stroke="#fff" strokeWidth={w*0.05} opacity={0.2} listening={false}/>

              {/* glass preps at true positions (same library as the drawings) */}
              <Preps feats={feats[i]} x0={x0} top={top} w={w} h={h}
                wMm={bd.panels[i]?.wMm || 1} hMm={bd.panels[i]?.hMm || 1} steel={steel}/>

              {ty === 'door' && <>
                {/* floor spring + pull handle + swing arc */}
                <Circle x={feats[i]?.pivot === 'right' ? x1 - 12 : x0 + 12} y={floorY + 3} radius={4} fill={steel} listening={false}/>
                <Rect x={feats[i]?.pivot === 'right' ? x0 + w*0.18 - 3 : x1 - w*0.18 - 3} y={top + h*0.28} width={3.5} height={h*0.42} cornerRadius={2} fill={steel} listening={false}/>
                <Rect x={feats[i]?.pivot === 'right' ? x0 + w*0.18 + 3 : x1 - w*0.18 + 3} y={top + h*0.28} width={3.5} height={h*0.42} cornerRadius={2} fill={steel} opacity={0.55} listening={false}/>
                <Line points={feats[i]?.pivot === 'right'
                  ? [x1, bot, x0 + w*0.1, bot - h*0.12, x0, bot - h*0.4]
                  : [x0, bot, x0 + w*0.9, bot - h*0.12, x1, bot - h*0.4]}
                  stroke="rgba(30,60,90,0.35)" strokeWidth={1.2} dash={[5,4]} tension={0.5} listening={false}/>
              </>}

              {ty === 'hinged' &&
                <Line points={feats[i]?.pivot === 'right'
                  ? [x0, top, x1 - w*0.1, top + h/2, x0, top + h]
                  : [x1, top, x0 + w*0.1, top + h/2, x1, top + h]}
                  stroke="rgba(30,60,90,0.35)" strokeWidth={1.2} dash={[5,4]} listening={false}/>}

              {ty === 'slider' && <>
                <Rect x={x0} y={top - 7} width={w} height={7} fill={steel} opacity={0.8} cornerRadius={2} listening={false}/>
                <Circle x={x0 + w*0.25} y={top - 3} radius={2.5} fill="#fff" listening={false}/>
                <Circle x={x0 + w*0.75} y={top - 3} radius={2.5} fill="#fff" listening={false}/>
                <Arrow points={[x0 + w*0.3, top + h/2, x0 + w*0.7, top + h/2]} stroke="rgba(30,60,90,0.5)" fill="rgba(30,60,90,0.5)" strokeWidth={1.6} pointerLength={7} pointerWidth={7} listening={false}/>
                <Rect x={x0 + 6} y={top + h*0.32} width={3.5} height={h*0.36} cornerRadius={2} fill={steel} listening={false}/>
              </>}

              {/* panel mark */}
              <Rect x={x0 + w/2 - 13} y={bot - 20} width={26} height={14} fill="#fff" opacity={0.85} cornerRadius={2} listening={false}/>
              <Text x={x0 + w/2 - 13} y={bot - 18} width={26} align="center" text={`P${i + 1}`} fontSize={9} fontStyle="bold" fill="#33495e" listening={false}/>
            </Group>
          )
        })}

        {/* L-shape: the run turns 90° at this joint (see 3D view) */}
        {cornerAt >= 0 && (() => {
          const cx = ox + cumX[cornerAt + 1] * scale
          return (
            <Group listening={false}>
              <Line points={[cx, oy - 14, cx, floorY + 8]} stroke="#8a5a2b" strokeWidth={2} dash={[8, 5]}/>
              <Rect x={cx - 32} y={oy - 30} width={64} height={16} fill="#8a5a2b" cornerRadius={3}/>
              <Text x={cx - 32} y={oy - 27} width={64} align="center" text="CORNER 90°" fontSize={8.5} fontStyle="bold" fill="#fff"/>
            </Group>
          )
        })()}

        {/* fanlight band spanning the leaf (or slider) bays */}
        {showOver && (() => {
          const xs = ox + cumX[overIdx[0]] * scale + gapPx / 2
          const xe = ox + cumX[overIdx[overIdx.length - 1] + 1] * scale - gapPx / 2
          const yb = mmY(overH)
          const overPanel = bd.panels.find(p => p.type === 'over')
          const overFeats = feats[feats.length - 1]
          return (
            <Group listening={false}>
              <Rect x={xs} y={oy + gapPx / 2} width={xe - xs} height={yb - oy - gapPx / 2}
                fill={glass.fill} opacity={glass.opacity} stroke="rgba(40,70,100,0.45)" strokeWidth={1}/>
              {overPanel && overFeats?.mark?.startsWith('TRN') &&
                <Preps feats={overFeats} x0={xs} top={oy + gapPx / 2} w={xe - xs}
                  h={yb - oy - gapPx / 2} wMm={overPanel.wMm} hMm={overPanel.hMm} steel={steel}/>}
              <Rect x={(xs + xe)/2 - 20} y={yb - 20} width={40} height={14} fill="#fff" opacity={0.85} cornerRadius={2}/>
              <Text x={(xs + xe)/2 - 20} y={yb - 18} width={40} align="center" text="TRN1" fontSize={9} fontStyle="bold" fill="#33495e"/>
            </Group>
          )
        })()}

        {/* draggable joints between panels */}
        {Array.from({ length: design.cols - 1 }).map((_, j) => {
          const bx = ox + cumX[j + 1] * scale - 5
          const minX = ox + (cumX[j] + MIN_SECTION_MM) * scale - 5
          const maxX = ox + (cumX[j + 2] - MIN_SECTION_MM) * scale - 5
          return (
            <Rect key={`j${j}-${cumX[j + 1]}`} x={bx} y={oy} width={10} height={fh}
              fill="rgba(0,0,0,0.001)" draggable
              dragBoundFunc={(pos) => ({ x: Math.max(minX, Math.min(maxX, pos.x)), y: oy })}
              onMouseEnter={(e) => setCursor(e, 'col-resize')}
              onMouseLeave={(e) => setCursor(e, 'default')}
              onDragEnd={(e) => onDividerMove?.('col', j, (e.target.x() - bx) / scale)}
            />
          )
        })}

        {/* per-bay widths + overall dims (SmartGlazier style) */}
        {design.cols > 1 && colW.map((wmm, c) => (
          <Group key={`cw${c}`} listening={false}>
            <Arrow points={[ox + cumX[c]*scale + 2, floorY + 20, ox + cumX[c + 1]*scale - 2, floorY + 20]}
              stroke={dim} fill={dim} strokeWidth={0.8} pointerLength={4} pointerWidth={4} pointerAtBeginning/>
            <Text x={ox + cumX[c]*scale} y={floorY + 24} width={wmm*scale} align="center"
              text={`${Math.round(wmm)}`} fontSize={10.5} fill={dim}/>
          </Group>
        ))}
        <Arrow points={[ox, floorY + 40, ox + fw, floorY + 40]} stroke={dim} fill={dim} strokeWidth={1} pointerLength={6} pointerWidth={6} pointerAtBeginning listening={false}/>
        <Text x={ox} y={floorY + 46} width={fw} align="center" text={`${width} mm`} fontSize={12} fontStyle="bold" fill={dim} listening={false}/>
        <Arrow points={[ox - 36, oy, ox - 36, floorY]} stroke={dim} fill={dim} strokeWidth={1} pointerLength={6} pointerWidth={6} pointerAtBeginning listening={false}/>
        <Text x={ox - 40} y={oy + fh/2 + 28} text={`${height} mm`} fontSize={12} fontStyle="bold" fill={dim} rotation={-90} listening={false}/>
        {showOver && <>
          <Arrow points={[ox + fw + 16, oy, ox + fw + 16, mmY(overH)]} stroke={dim} fill={dim} strokeWidth={0.8} pointerLength={4} pointerWidth={4} pointerAtBeginning listening={false}/>
          <Text x={ox + fw + 20} y={mmY(overH / 2) - 5} text={`${Math.round(overH)}`} fontSize={10.5} fill={dim} listening={false}/>
          <Arrow points={[ox + fw + 16, doorTopY, ox + fw + 16, botY]} stroke={dim} fill={dim} strokeWidth={0.8} pointerLength={4} pointerWidth={4} pointerAtBeginning listening={false}/>
          <Text x={ox + fw + 20} y={doorTopY + (botY - doorTopY)/2 - 5} text={`${doorH}`} fontSize={10.5} fill={dim} listening={false}/>
        </>}
      </Layer>
    </Stage>
  )
}
