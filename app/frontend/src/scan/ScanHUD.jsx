import { useEffect, useState } from 'react'
import { useTween } from '../lib/useTween'
import { colorOf, regionLabel, STATUS_COLOR, STATUS_TEXT } from './palette'
import { fmt, fmtInt } from '../lib/format'

function Sparkline({ values }) {
  const w = 96
  const h = 22
  if (!values || values.length < 2) {
    return <svg width={w} height={h} aria-hidden><line x1="0" x2={w} y1={h - 2} y2={h - 2} stroke="rgba(111,227,255,.35)" strokeDasharray="2 3" /></svg>
  }
  const max = Math.max(...values)
  const min = Math.min(...values)
  const span = Math.max(1e-6, max - min)
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - 2 - ((v - min) / span) * (h - 5)}`).join(' ')
  return (
    <svg width={w} height={h} aria-hidden>
      <polyline points={pts} fill="none" stroke="#6fe3ff" strokeWidth="1.2" strokeLinejoin="round" opacity="0.9" />
    </svg>
  )
}

function CoverageRing({ percent }) {
  const r = 20
  const c = 2 * Math.PI * r
  const p = Math.max(0, Math.min(100, percent ?? 0))
  return (
    <svg width="52" height="52" viewBox="0 0 52 52" aria-hidden>
      <circle cx="26" cy="26" r={r} fill="none" stroke="rgba(111,227,255,.18)" strokeWidth="2" />
      <circle cx="26" cy="26" r={r} fill="none" stroke="#6fe3ff" strokeWidth="2.2" strokeLinecap="round"
        strokeDasharray={`${(p / 100) * c} ${c}`} transform="rotate(-90 26 26)" style={{ transition: 'stroke-dasharray .45s ease' }} />
      {[0, 90, 180, 270].map((a) => <line key={a} x1="26" y1="2" x2="26" y2="5" stroke="rgba(111,227,255,.5)" transform={`rotate(${a} 26 26)`} />)}
    </svg>
  )
}

function Reticle({ dim, fast, active }) {
  return (
    <div className="reticle" data-dim={dim} aria-hidden>
      <svg viewBox="0 0 84 84" width="84" height="84" fill="none" stroke="#6fe3ff">
        <g className="ring-slow" opacity="0.7"><circle cx="42" cy="42" r="30" strokeWidth="1" strokeDasharray="3 7" /></g>
        {active && (
          <g className={fast ? 'ring-fast' : 'ring-slow'}><path d="M42 8a34 34 0 0 1 29.4 17" strokeWidth="1.6" strokeLinecap="round" /><path d="M42 76a34 34 0 0 1-29.4-17" strokeWidth="1.6" strokeLinecap="round" /></g>
        )}
        <circle cx="42" cy="42" r="2" fill="#6fe3ff" stroke="none" opacity="0.9" />
        <path d="M42 16v8M42 60v8M16 42h8M60 42h8" strokeWidth="1.2" strokeLinecap="round" opacity="0.85" />
      </svg>
    </div>
  )
}

function Chip({ on, pulse, children }) {
  return (
    <span className={`flex items-center gap-1.5 hud-tag ${on ? '' : 'opacity-40'}`}>
      <span className={`h-1 w-1 rounded-full ${on ? 'bg-[color:var(--hud-cyan)]' : 'bg-white/40'} ${on && pulse ? 'pulse-dot' : ''}`} />
      {children}
    </span>
  )
}

function InstanceBracket({ inst, selected, onSelect }) {
  const bb = inst.normalized?.bounding_box
  if (!bb) return null
  const color = colorOf(inst.index)
  const kind = inst.kind === 'instance' ? 'INSTANCE' : 'REGION'
  const inside = bb.y < 0.2 || bb.height > 0.6        // keep the label on screen for large or top-edge regions
  return (
    <div className="inst" style={{ '--ic': color, left: `${bb.x * 100}%`, top: `${bb.y * 100}%`, width: `${bb.width * 100}%`, height: `${bb.height * 100}%`, opacity: selected ? 1 : 0.92 }}>
      {['tl', 'tr', 'bl', 'br'].map((c) => <span key={c} className={`inst-corner ${c}`} />)}
      <button type="button" className="inst-label text-left" data-inside={inside} onClick={() => onSelect(inst.index)}
        aria-label={`${kind} ${inst.id}`} style={{ outlineColor: color }}>
        <span className="hud-tag block" style={{ color }}>{kind} {inst.id}</span>
        <span className="hud-tag block !text-[9px] opacity-80">{regionLabel(inst)}</span>
        {inst.confidence !== null && inst.confidence !== undefined && <span className="hud-tag block !text-[9.5px]">CONF {fmt(inst.confidence, 2)}</span>}
        <span className="hud-tag block !text-[9.5px]">AREA {fmtInt(inst.area_px)} PX</span>
      </button>
    </div>
  )
}

function InstancePanel({ instances, selected, onSelect, frameSize }) {
  const current = instances.find((i) => i.index === selected) || instances[0]
  return (
    <div className="hud-glass fade-in w-[238px] p-2.5" aria-label="Detected instances">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="hud-label">{instances[0]?.kind === 'instance' ? 'Instances' : 'Regions'}</span>
        <span className="hud-label">{String(instances.length).padStart(2, '0')}</span>
      </div>
      <div className="max-h-[92px] space-y-0.5 overflow-y-auto pr-1">
        {instances.slice(0, 24).map((inst) => (
          <button key={inst.index} type="button" onClick={() => onSelect(inst.index)} aria-pressed={current?.index === inst.index}
            className={`flex w-full items-center gap-2 px-1.5 py-1 text-left transition-colors ${current?.index === inst.index ? 'bg-white/10' : 'hover:bg-white/5'}`}>
            <span className="h-2 w-2 shrink-0 rounded-[1px]" style={{ background: colorOf(inst.index) }} />
            <span className="hud-tag flex-1 truncate">{inst.kind === 'instance' ? 'INST' : 'REG'} {inst.id}</span>
            <span className="hud-tag opacity-80">{inst.confidence != null ? fmt(inst.confidence, 2) : '—'}</span>
          </button>
        ))}
      </div>
      {current && (
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 border-t border-white/15 pt-2 text-[10px]" style={{ color: 'var(--hud-white)' }}>
          <dt className="hud-label">Area</dt><dd className="text-right tabular-nums">{fmtInt(current.area_px)} px</dd>
          <dt className="hud-label">Coverage</dt><dd className="text-right tabular-nums">{fmt(current.coverage_percent, 2)} %</dd>
          <dt className="hud-label">Perimeter</dt><dd className="text-right tabular-nums">{fmt(current.perimeter_px, 0)} px</dd>
          <dt className="hud-label">Centroid</dt><dd className="text-right tabular-nums">{current.centroid ? `${fmt(current.centroid.x, 0)}, ${fmt(current.centroid.y, 0)}` : '—'}</dd>
        </dl>
      )}
      {frameSize && <div className="mt-1.5 text-right text-[9px] tracking-[0.1em] text-white/45">PX IN {frameSize.w}×{frameSize.h} FRAME</div>}
    </div>
  )
}

export default function ScanHUD({
  status, scanning, inFlight, camera, result, stats, model, noModel, systemReady,
  selected, onSelect, mode, show3D, revealKey, reduceMotion, errorText,
}) {
  const instances = result?.instances || []
  const detected = status === 'DETECTED'
  const showMaskTag = detected && (mode === 'mask' || mode === 'both')
  const coverage = useTween(result?.measurements?.coverage_percent ?? null, 420, reduceMotion)
  const stateColor = STATUS_COLOR[status]
  const frameSize = result ? { w: result.mask.width, h: result.mask.height } : null
  const [sweepY, setSweepY] = useState(40)

  // the one-shot sweep stops at the vertical position of the real detected region
  useEffect(() => {
    const c = result?.measurements?.normalized?.centroid
    if (c) setSweepY(Math.round(c.y * 100))
  }, [revealKey]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <div className="scan-vignette" />
      <div className="scan-grid" data-active={scanning} />
      <div className="scan-floor" />

      {scanning && !reduceMotion && <div className="scan-beam-track" aria-hidden><div className="scan-beam" data-fast={inFlight} /></div>}
      <div key={revealKey} className="scan-reveal" data-play={revealKey > 0 && !reduceMotion} style={{ '--reveal-y': `${sweepY * 3.2}%` }} aria-hidden />

      {['tl', 'tr', 'bl', 'br'].map((c) => <span key={c} className={`hud-corner ${c}`} />)}
      <Reticle dim={detected} fast={inFlight} active={scanning} />

      {/* real instance brackets + labels (remount per detection so they "form") */}
      {detected && instances.slice(0, 8).map((inst) => (
        <InstanceBracket key={`${revealKey}-${inst.index}`} inst={inst} selected={selected === inst.index} onSelect={onSelect} />
      ))}

      {/* top-left: system / optical labels */}
      <div className="hud-chip absolute left-[56px] top-[18px] space-y-1" aria-hidden>
        <div className="flex items-center gap-2 hud-tag"><span className={`h-1.5 w-1.5 rounded-full ${systemReady ? 'bg-[#7dffc4]' : 'bg-[#ffb36b]'} pulse-dot`} />{systemReady ? 'SYSTEM READY' : 'NO MODEL AVAILABLE'}</div>
        <div className="hud-tag opacity-65">{model ? `${model.label} · ${model.task === 'instance' ? 'INSTANCE SEGMENTATION' : 'SEMANTIC SEGMENTATION'}` : 'OPTICAL ANALYSIS'}</div>
      </div>

      {/* top-right: state + real readouts */}
      <div className="absolute right-[56px] top-[18px] flex flex-col items-end gap-2">
        <div className="hud-glass flex items-center gap-2.5 px-3 py-1.5" role="status" aria-label={`Scan status ${STATUS_TEXT[status]}`}>
          <span className="relative grid h-4 w-4 place-items-center">
            <span className="h-1.5 w-1.5 rounded-full pulse-dot" style={{ background: stateColor }} />
            <span className="absolute inset-0 rounded-full border" style={{ borderColor: stateColor, opacity: 0.55 }} />
          </span>
          <span className="hud-tag !text-[10.5px]" style={{ color: stateColor }}>{STATUS_TEXT[status]}</span>
        </div>
        <div className="hud-glass hidden items-center gap-3 px-3 py-2 lg:flex">
          <div>
            <div className="hud-label">FPS</div>
            <div className="hud-value !text-[15px]">{stats.fps ? fmt(stats.fps, 1) : '—'}</div>
          </div>
          <div>
            <div className="hud-label">Inference</div>
            <div className="hud-value !text-[15px]">{result ? `${fmt(result.timing.inference_ms, 0)}` : '—'}<span className="ml-0.5 text-[10px] opacity-60">{result ? 'ms' : ''}</span></div>
          </div>
          <Sparkline values={stats.latencies} />
        </div>
        <div className="hud-glass hidden items-center gap-3 px-3 py-2 lg:flex">
          <CoverageRing percent={result ? coverage : 0} />
          <div>
            <div className="hud-label">Coverage</div>
            <div className="hud-value !text-[15px]">{result ? `${fmt(coverage, 2)}` : '—'}<span className="ml-0.5 text-[10px] opacity-60">{result ? '%' : ''}</span></div>
            <div className="text-[9px] tracking-[0.1em] text-white/45">IMAGE-SPACE</div>
          </div>
        </div>
      </div>

      {/* bottom-left: instance readout (only when something is really detected) */}
      {detected && instances.length > 0 && (
        <div className="absolute bottom-[56px] left-[56px] hidden md:block">
          <InstancePanel instances={instances} selected={selected} onSelect={onSelect} frameSize={frameSize} />
        </div>
      )}

      {/* bottom-centre: interface labels (not measurements) */}
      <div className="absolute inset-x-0 bottom-[20px] hidden justify-center xl:flex" aria-hidden>
        <div className="hud-glass flex items-center gap-4 px-4 py-1.5">
          <Chip on={camera === 'on'}>Optical analysis</Chip>
          <Chip on={scanning} pulse={inFlight}>Frame analysis</Chip>
          <Chip on={showMaskTag}>Mask active</Chip>
          <Chip on={show3D && scanning}>3D projection</Chip>
        </div>
      </div>

      {/* standby / state messages */}
      {camera !== 'on' && (
        <div className="absolute inset-x-0 top-[60%] text-center">
          <div className="fade-in">
            <div className="hud-tag !text-[12px] tracking-[0.3em]">{camera === 'starting' ? 'STARTING CAMERA' : 'CAMERA OFFLINE'}</div>
            <div className="mt-2 text-[11px] text-white/55">{camera === 'starting' ? 'Waiting for camera permission…' : 'Start the camera to begin optical analysis.'}</div>
          </div>
        </div>
      )}
      {camera === 'on' && status === 'NO_DETECTION' && (
        <div className="absolute inset-x-0 top-[76px] flex justify-center"><div className="hud-glass fade-in px-3 py-1"><span className="hud-tag">No petroleum-like region in view</span></div></div>
      )}
      {camera === 'on' && status === 'PROCESSING' && (
        <div className="absolute inset-x-0 top-[76px] flex justify-center"><div className="hud-glass fade-in px-3 py-1"><span className="hud-tag">{noModel ? 'No model available' : 'Preparing analysis…'}</span></div></div>
      )}
    </>
  )
}
