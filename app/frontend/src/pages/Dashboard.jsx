import { useEffect, useMemo, useRef, useState } from 'react'


import { Link, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { uiSoundHandlers } from '../audio/uiSounds'
import { useApp } from '../context/AppContext'
import { colorFor } from '../lib/models'
import { fmtInt, fmtMs, fmtPct } from '../lib/format'
import { useTween } from '../lib/useTween'
import { useAnalysisAssets } from '../lib/useAnalysisAssets'
import AnalysisViewer from '../components/AnalysisViewer'
import ScanHero from '../components/ScanHero'
import { IconCamera, IconCube, IconLayers, IconScan } from '../components/icons'
import { Badge, Skeleton } from '../components/ui'


import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Float } from '@react-three/drei'
import EnvironmentalIntelligence from '../components/EnvironmentalIntelligence'


const CAPABILITIES = [
  ['Instance segmentation', 'Each detected region is kept as its own instance.'],
  ['Spill region detection', 'Finds visible petroleum-like regions in aquatic imagery.'],
  ['Area & coverage', 'Pixel area and image coverage from the predicted mask.'],
  ['Boundary & perimeter', 'Contours, perimeter and centroid for every region.'],
  ['Live camera analysis', 'Scan with your camera and watch regions appear in real time.'],
  ['3D visualization', 'Explore a prediction as an interactive image-space surface.'],
]
const OPTS = { mode: 'instances', color: '#e5322d', opacity: 0.4, showBoxes: false, showLabels: true, hidden: new Set(), selected: null, hover: null }

function Kpi({ label, value, digits = 0, unit, pad = 0, accent }) {
  const v = useTween(value ?? null, 650)
  const text = value == null ? '—' : digits ? v.toFixed(digits) : pad ? String(Math.round(v)).padStart(pad, '0') : fmtInt(v)
  return <div className="border-l border-line-strong pl-3"><div className="label">{label}</div><div className={`mt-1 font-mono text-[24px] leading-none tabular-nums ${accent || 'text-ink'}`}>{text}{value != null && unit && <span className="ml-1 text-[12px] text-ink-3">{unit}</span>}</div></div>
}


function MarineEnvironmentalContext() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [selected, setSelected] = useState(null)
  const [loadingSearch, setLoadingSearch] = useState(false)
  const [loadingMarine, setLoadingMarine] = useState(false)
  const [marine, setMarine] = useState(null)
  const [error, setError] = useState(null)

  async function searchLocation() {
    const value = query.trim()
    if (!value) return

    setLoadingSearch(true)
    setError(null)

    try {
      const data = await api.geocode(value)
      setResults(data.results || [])
    } catch (err) {
      setError(err.message)
      setResults([])
    } finally {
      setLoadingSearch(false)
    }
  }

  async function loadMarineData(location) {
    setSelected(location)
    setResults([])
    setMarine(null)
    setLoadingMarine(true)
    setError(null)

    try {
      const data = await api.marine(
        location.latitude,
        location.longitude
      )

      setMarine(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoadingMarine(false)
    }
  }

  const hourly = marine?.hourly || {}

  const latest = (key) => {
  const values = hourly?.[key]

  if (!Array.isArray(values)) {
    return null
  }

  const value = values.find(
    (item) => typeof item === 'number' && Number.isFinite(item)
  )

  return value ?? null
}

  return (
    <section className="mt-8 rounded-2xl border border-sky-100 bg-white p-5 shadow-sm">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl">🌊</span>
            <h2 className="text-lg font-semibold text-slate-900">
              Marine Environmental Context
            </h2>
          </div>

          <p className="mt-1 text-sm text-slate-500">
            Real marine conditions for a location selected by you.
          </p>
        </div>

        <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
          REAL DATA
        </span>
      </div>

      {/* Location search */}
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <label className="mb-2 block text-sm font-medium text-slate-700">
          Search any location worldwide
        </label>

        <div className="flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') searchLocation()
            }}
            placeholder="Search city, coastline, island, region..."
            className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-sky-500"
          />

          <button
            type="button"
            onClick={searchLocation}
            disabled={loadingSearch}
            className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {loadingSearch ? 'Searching...' : 'Search'}
          </button>
        </div>

        {/* Search results */}
        {results.length > 0 && (
          <div className="mt-3 max-h-56 overflow-y-auto rounded-lg border border-slate-200 bg-white">
            {results.map((location, index) => (
              <button
                key={`${location.latitude}-${location.longitude}-${index}`}
                type="button"
                onClick={() => loadMarineData(location)}
                className="block w-full border-b border-slate-100 px-4 py-3 text-left last:border-b-0 hover:bg-sky-50"
              >
                <div className="font-medium text-slate-900">
                  {location.name}
                </div>

                <div className="mt-0.5 text-xs text-slate-500">
                  {[location.admin1, location.country]
                    .filter(Boolean)
                    .join(', ')}
                </div>

                <div className="mt-1 text-xs text-slate-400">
                  {Number(location.latitude).toFixed(4)}°,
                  {' '}
                  {Number(location.longitude).toFixed(4)}°
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Selected location */}
      {selected && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-100 bg-sky-50 px-4 py-3">
          <div>
            <div className="font-medium text-slate-900">
              {selected.name}
            </div>

            <div className="text-xs text-slate-500">
              {[selected.admin1, selected.country]
                .filter(Boolean)
                .join(', ')}
            </div>
          </div>

          <div className="font-mono text-xs text-slate-600">
            {Number(selected.latitude).toFixed(4)}° N&nbsp;&nbsp;
            {Number(selected.longitude).toFixed(4)}° E
          </div>

          <button
            type="button"
            onClick={() => loadMarineData(selected)}
            disabled={loadingMarine}
            className="rounded-lg border border-sky-200 bg-white px-3 py-2 text-sm font-medium text-sky-700 disabled:opacity-50"
          >
            {loadingMarine ? 'Updating...' : '↻ Refresh'}
          </button>
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Marine measurements */}
      {marine && (
        <>
          <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3">
            <MarineMetric
              label="Wave Height"
              value={latest('wave_height')}
              unit="m"
            />

            <MarineMetric
              label="Wave Direction"
              value={latest('wave_direction')}
              unit="°"
            />

            <MarineMetric
              label="Wave Period"
              value={latest('wave_period')}
              unit="s"
            />

            <MarineMetric
              label="Sea Temperature"
              value={latest('sea_surface_temperature')}
              unit="°C"
            />

            <MarineMetric
              label="Current Speed"
              value={latest('ocean_current_velocity')}
              unit="m/s"
            />

            <MarineMetric
              label="Current Direction"
              value={latest('ocean_current_direction')}
              unit="°"
            />
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4 text-xs text-slate-400">
            <span>Source: Open-Meteo Marine API</span>
            <span>
              Coordinates: {Number(marine.latitude).toFixed(4)},
              {' '}
              {Number(marine.longitude).toFixed(4)}
            </span>
          </div>
        </>
      )}

      {!selected && !loadingSearch && (
        <div className="mt-5 rounded-xl border border-dashed border-slate-200 py-8 text-center text-sm text-slate-400">
          Search and select a location to view real marine conditions.
        </div>
      )}
    </section>
  )
}

function MarineMetric({ label, value, unit }) {
  const valid = typeof value === 'number' && Number.isFinite(value)

  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-400">
        {label}
      </div>

      <div className="mt-2 text-xl font-semibold text-slate-900">
        {valid ? value.toFixed(2) : '—'}
        {valid && (
          <span className="ml-1 text-sm font-normal text-slate-500">
            {unit}
          </span>
        )}
      </div>
    </div>
  )
}


function SimulatedSensorPanel({ latest }) {
  const [running, setRunning] = useState(true)
  const [scenario, setScenario] = useState('gasoline')
  const [level, setLevel] = useState(55)

  const [sensorValues, setSensorValues] = useState({
    ph: 7.02,
    temperature: 27.7,
    conductivity: 820,
    turbidity: 9,
  })

  const [signalHistory, setSignalHistory] = useState([])

  /*
   * DEMONSTRATION-ONLY SENSOR PROFILES.
   *
   * These values are simulated for UI demonstration.
   * They are NOT calibrated chemical sensor signatures
   * and must not be presented as experimental measurements.
   */
  const PROFILES = {
    clean: {
      label: 'Clean Water',
      short: 'CLEAN WATER',
      base: {
        ph: 7.18,
        temperature: 27.2,
        conductivity: 700,
        turbidity: 4.5,
      },
      effect: {
        ph: 0,
        temperature: 0,
        conductivity: 0,
        turbidity: 0,
      },
    },

    gasoline: {
      label: 'Gasoline',
      short: 'GASOLINE-LIKE',
      base: {
        ph: 7.02,
        temperature: 27.7,
        conductivity: 820,
        turbidity: 9,
      },
      effect: {
        ph: -0.16,
        temperature: 0.35,
        conductivity: 260,
        turbidity: 20,
      },
    },

    diesel: {
      label: 'Diesel',
      short: 'DIESEL-LIKE',
      base: {
        ph: 6.96,
        temperature: 27.9,
        conductivity: 900,
        turbidity: 12,
      },
      effect: {
        ph: -0.20,
        temperature: 0.28,
        conductivity: 330,
        turbidity: 27,
      },
    },

    kerosene: {
      label: 'Kerosene',
      short: 'KEROSENE-LIKE',
      base: {
        ph: 7.04,
        temperature: 27.6,
        conductivity: 780,
        turbidity: 10,
      },
      effect: {
        ph: -0.13,
        temperature: 0.22,
        conductivity: 210,
        turbidity: 23,
      },
    },
  }

  const profile = PROFILES[scenario]

  /* ==========================================================
     ACTUAL CV RESULT
     ========================================================== */

  const cvDetected = Boolean(
    latest &&
    Number(latest.instance_count || 0) > 0
  )

  const cvCoverage = Number(
    latest?.measurements?.coverage_percent || 0
  )

  const cvInstances = Number(
    latest?.instance_count || 0
  )

  const cvInference = Number(
    latest?.inference_time_ms || 0
  )

  /* ==========================================================
     LIVE SENSOR SIMULATION
     ========================================================== */

  useEffect(() => {
    if (!running) return

    const updateSimulation = () => {
      const p = PROFILES[scenario]
      const intensity = level / 100

      const noise = (amount) =>
        (Math.random() - 0.5) * amount

      const next = {
        ph:
          p.base.ph +
          p.effect.ph * intensity +
          noise(0.035),

        temperature:
          p.base.temperature +
          p.effect.temperature * intensity +
          noise(0.08),

        conductivity:
          p.base.conductivity +
          p.effect.conductivity * intensity +
          noise(22),

        turbidity:
          p.base.turbidity +
          p.effect.turbidity * intensity +
          noise(1.5),
      }

      setSensorValues(next)

      setSignalHistory((previous) => [
        ...previous.slice(-39),
        next.conductivity,
      ])
    }

    updateSimulation()

    const timer = setInterval(
      updateSimulation,
      850
    )

    return () => clearInterval(timer)
  }, [running, scenario, level])

  useEffect(() => {
    setSignalHistory([])
  }, [scenario])

  /* ==========================================================
     FINAL SIMULATED ASSESSMENT
     ========================================================== */

  const assessment = useMemo(() => {
    if (!latest) {
      return {
        title: 'AWAITING CV ANALYSIS',
        subtitle:
          'Run an image analysis to connect the actual visual evidence.',
        status: 'WAITING',
        tone: 'neutral',
      }
    }

    if (cvDetected && scenario !== 'clean') {
      return {
        title: profile.short,
        subtitle:
          'The simulated sensor scenario agrees with the actual CV petroleum-like detection.',
        status: 'EVIDENCE ALIGNED',
        tone: 'positive',
      }
    }

    if (!cvDetected && scenario === 'clean') {
      return {
        title: 'CLEAN WATER',
        subtitle:
          'The simulated clean-water scenario agrees with the actual CV result.',
        status: 'EVIDENCE ALIGNED',
        tone: 'positive',
      }
    }

    if (cvDetected && scenario === 'clean') {
      return {
        title: 'VISUAL CONTAMINATION DETECTED',
        subtitle:
          'Actual CV detects a petroleum-like region while the sensor simulation is set to clean water.',
        status: 'EVIDENCE CONFLICT',
        tone: 'warning',
      }
    }

    return {
      title: profile.short,
      subtitle:
        'The simulated sensor classification is active, but the current CV result has not visually confirmed a petroleum-like region.',
      status: 'VISUAL CONFIRMATION PENDING',
      tone: 'warning',
    }
  }, [
    latest,
    cvDetected,
    scenario,
    profile.short,
  ])

  /* ==========================================================
     LIVE SIGNAL
     ========================================================== */

  const signalMin = signalHistory.length
    ? Math.min(...signalHistory)
    : 0

  const signalMax = signalHistory.length
    ? Math.max(...signalHistory)
    : 1

  const signalRange =
    signalMax - signalMin || 1

  const signalPoints = signalHistory
    .map((value, index) => {
      const x =
        signalHistory.length <= 1
          ? 0
          : (index / (signalHistory.length - 1)) * 100

      const y =
        100 -
        ((value - signalMin) / signalRange) * 80 -
        10

      return `${x},${y}`
    })
    .join(' ')

  const particleCount =
    scenario === 'clean'
      ? 8
      : Math.max(
          8,
          Math.round(level / 3)
        )

  return (
    <section className="mt-6 overflow-hidden rounded-2xl border border-line bg-white shadow-sm">

      {/* ======================================================
          HEADER
      ======================================================= */}

      <div className="flex flex-col gap-4 border-b border-line bg-panel px-5 py-4 lg:flex-row lg:items-center lg:justify-between">

        <div>

          <div className="flex items-center gap-2">

            <span className="relative flex h-2.5 w-2.5">

              {running && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
              )}

              <span
                className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
                  running
                    ? 'bg-emerald-500'
                    : 'bg-ink-3'
                }`}
              />

            </span>

            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-3">
              Live Sensor Simulation
            </span>

            <span className="rounded-full border border-line-strong bg-white px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-ink-3">
              SIMULATION
            </span>

          </div>

          <h2 className="mt-1 text-xl font-semibold text-ink">
            Multimodal contamination assessment
          </h2>

          <p className="mt-1 max-w-2xl text-sm text-ink-3">
            Live simulated sensor signals are compared with the actual
            PetroVision computer-vision result.
          </p>

        </div>

        <button
          type="button"
          onClick={() => setRunning((value) => !value)}
          className={`rounded-lg border px-4 py-2 text-sm font-medium transition ${
            running
              ? 'border-line-strong bg-white text-ink hover:bg-panel'
              : 'border-ink bg-ink text-white'
          }`}
        >
          {running
            ? 'Pause Simulation'
            : 'Start Simulation'}
        </button>

      </div>

      {/* ======================================================
          3D ENVIRONMENT + FINAL RESULT
      ======================================================= */}

      <div className="grid lg:grid-cols-[1.35fr_0.9fr]">

        {/* ====================================================
            3D WATER / SENSOR VIEW
            ==================================================== */}

        <div className="relative min-h-[470px] overflow-hidden border-b border-line bg-slate-950 lg:border-b-0 lg:border-r">

          {/* TOP LABEL */}

          <div className="absolute left-4 top-4 z-10">

            <div className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 backdrop-blur">

              <div className="text-[9px] font-semibold uppercase tracking-[0.18em] text-white/45">
                Virtual aquatic monitoring
              </div>

              <div className="mt-1 text-sm font-semibold text-white">
                {profile.label}
              </div>

            </div>

          </div>

          {/* OIL SPILL LABEL */}

          {scenario !== 'clean' && (
            <div className="absolute left-1/2 top-16 z-10 -translate-x-1/2">

              <div className="flex items-center gap-2 rounded-full border border-red-400/40 bg-red-950/60 px-3 py-1.5 backdrop-blur">

                <span className="h-2 w-2 animate-pulse rounded-full bg-red-400" />

                <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-red-200">
                  Simulated Oil Spill
                </span>

              </div>

            </div>
          )}

          {/* LEGEND */}

          <div className="absolute bottom-4 left-4 z-10 rounded-lg border border-white/10 bg-black/40 px-3 py-2 backdrop-blur">

            <div className="space-y-1.5">

              <LegendItem
                color="bg-sky-400"
                label="Water"
              />

              {scenario !== 'clean' && (
                <LegendItem
                  color="bg-red-500"
                  label="Simulated petroleum contamination"
                />
              )}

              <LegendItem
                color="bg-white"
                label="Sensor probes"
              />

            </div>

          </div>

          {/* CAMERA-LIKE STATUS */}

          <div className="absolute bottom-4 right-4 z-10 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-right backdrop-blur">

            <div className="text-[9px] uppercase tracking-wider text-white/40">
              Simulation intensity
            </div>

            <div className="mt-1 font-mono text-sm font-semibold text-white">
              {level}%
            </div>

          </div>

          <Canvas
            camera={{
              position: [4.5, 3.2, 5.5],
              fov: 42,
            }}
            dpr={[1, 1.5]}
          >

            <color
              attach="background"
              args={['#06111c']}
            />

            <ambientLight intensity={1.4} />

            <directionalLight
              position={[4, 7, 5]}
              intensity={3}
            />

            <directionalLight
              position={[-4, 3, -2]}
              intensity={1.2}
            />

            <WaterTank
              scenario={scenario}
              level={level}
              particleCount={particleCount}
              running={running}
            />

            <OrbitControls
              enablePan={false}
              minDistance={4}
              maxDistance={8}
              minPolarAngle={0.7}
              maxPolarAngle={1.45}
            />

          </Canvas>

          <div className="pointer-events-none absolute right-4 top-4 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-[9px] uppercase tracking-wider text-white/40 backdrop-blur">
            Drag · Rotate · Zoom
          </div>

        </div>

        {/* ====================================================
            RIGHT SIDE
            ==================================================== */}

        <div className="flex flex-col bg-white">

          {/* FINAL OUTPUT */}

          <div className="border-b border-line px-5 py-4">

            <div className="label">
              Final simulated assessment
            </div>

            <div
              className={`mt-3 rounded-xl border p-4 ${
                assessment.tone === 'positive'
                  ? 'border-emerald-200 bg-emerald-50'
                  : assessment.tone === 'warning'
                    ? 'border-amber-200 bg-amber-50'
                    : 'border-line bg-panel'
              }`}
            >

              <div className="flex items-start justify-between gap-3">

                <div>

                  <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-ink-3">
                    Simulated sensor classification
                  </div>

                  <div className="mt-1 text-2xl font-bold tracking-tight text-ink">
                    {assessment.title}
                  </div>

                </div>

                <div
                  className={`rounded-full border px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider ${
                    assessment.tone === 'positive'
                      ? 'border-emerald-300 text-emerald-700'
                      : assessment.tone === 'warning'
                        ? 'border-amber-300 text-amber-700'
                        : 'border-line-strong text-ink-3'
                  }`}
                >
                  {assessment.status}
                </div>

              </div>

              <p className="mt-3 text-xs leading-relaxed text-ink-2">
                {assessment.subtitle}
              </p>

            </div>

          </div>

          {/* SIMULATION CONTROLS */}

          <div className="border-b border-line px-5 py-4">

            <div className="label">
              Sensor simulation controls
            </div>

            <select
              value={scenario}
              onChange={(event) =>
                setScenario(event.target.value)
              }
              className="mt-3 w-full rounded-lg border border-line-strong bg-white px-3 py-2 text-sm text-ink outline-none focus:border-ink"
            >

              <option value="clean">
                Clean Water
              </option>

              <option value="gasoline">
                Gasoline
              </option>

              <option value="diesel">
                Diesel
              </option>

              <option value="kerosene">
                Kerosene
              </option>

            </select>

            <div className="mt-4">

              <div className="flex items-center justify-between">

                <span className="text-xs text-ink-3">
                  Simulated contamination level
                </span>

                <span className="font-mono text-xs font-semibold text-ink">
                  {level}%
                </span>

              </div>

              <input
                type="range"
                min="0"
                max="100"
                value={level}
                onChange={(event) =>
                  setLevel(Number(event.target.value))
                }
                className="mt-2 w-full accent-red-500"
              />

            </div>

          </div>

          {/* ==================================================
              SENSOR VALUES
              ================================================== */}

          <div className="border-b border-line">

            <div className="px-5 pt-4">

              <div className="label">
                Simulated sensor readings
              </div>

            </div>

            <div className="mt-3 grid grid-cols-2 gap-px bg-line">

              <SensorValue
                label="pH SENSOR"
                value={sensorValues.ph.toFixed(2)}
              />

              <SensorValue
                label="TEMPERATURE SENSOR"
                value={`${sensorValues.temperature.toFixed(1)} °C`}
              />

              <SensorValue
                label="CONDUCTIVITY SENSOR"
                value={`${Math.round(sensorValues.conductivity)} µS/cm`}
              />

              <SensorValue
                label="TURBIDITY SENSOR"
                value={`${sensorValues.turbidity.toFixed(1)} NTU`}
              />

            </div>

          </div>

          {/* LIVE SIGNAL */}

          <div className="border-b border-line px-5 py-4">

            <div className="flex items-center justify-between">

              <div>

                <div className="label">
                  Live sensor signal
                </div>

                <div className="mt-1 text-[10px] text-ink-3">
                  Simulated conductivity stream
                </div>

              </div>

              <div
                className={`h-2 w-2 rounded-full ${
                  running
                    ? 'animate-pulse bg-emerald-500'
                    : 'bg-ink-3'
                }`}
              />

            </div>

            <div className="mt-3 h-20 overflow-hidden rounded-lg border border-line bg-panel">

              {signalHistory.length > 1 ? (
                <svg
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                  className="h-full w-full"
                >

                  <polyline
                    points={signalPoints}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    vectorEffect="non-scaling-stroke"
                    className="text-red-500"
                  />

                </svg>
              ) : (
                <div className="flex h-full items-center justify-center text-[10px] text-ink-3">
                  Waiting for live signal...
                </div>
              )}

            </div>

          </div>

          {/* ==================================================
              ACTUAL CV EVIDENCE
              ================================================== */}

          <div className="px-5 py-4">

            <div className="flex items-center justify-between">

              <div className="label">
                Actual computer-vision evidence
              </div>

              {cvDetected && (
                <span className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-red-600">

                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />

                  Petroleum-like detected

                </span>
              )}

            </div>

            <div className="mt-3 grid grid-cols-3 gap-2">

              <EvidenceMetric
                label="Visual"
                value={
                  latest
                    ? cvDetected
                      ? 'DETECTED'
                      : 'NONE'
                    : '—'
                }
              />

              <EvidenceMetric
                label="Instances"
                value={
                  latest
                    ? String(cvInstances)
                    : '—'
                }
              />

              <EvidenceMetric
                label="Coverage"
                value={
                  latest
                    ? `${cvCoverage.toFixed(2)}%`
                    : '—'
                }
              />

            </div>

            {latest && (
              <div className="mt-3 flex items-center justify-between border-t border-line pt-3">

                <span className="text-[10px] uppercase tracking-wider text-ink-3">
                  CV inference
                </span>

                <span className="font-mono text-xs text-ink">
                  {cvInference
                    ? `${cvInference.toFixed(1)} ms`
                    : '—'}
                </span>

              </div>
            )}

          </div>

        </div>

      </div>

      {/* ======================================================
          DISCLAIMER
      ======================================================= */}

      <div className="border-t border-line bg-panel px-5 py-3 text-[10px] leading-relaxed text-ink-3">

        <span className="font-semibold text-ink-2">
          Simulation notice:
        </span>{' '}
        Sensor readings and sensor classifications shown here
        are simulated demonstration data. The computer-vision
        evidence is taken from the actual PetroVision analysis.
        RGB vision alone does not chemically identify gasoline,
        diesel or kerosene.

      </div>

    </section>
  )
}


/* ============================================================
   3D WATER TANK
   ============================================================ */

function WaterTank({
  scenario,
  level,
  particleCount,
  running,
}) {
  const groupRef = useRef(null)

  useFrame((state) => {
    if (!groupRef.current || !running) return

    groupRef.current.rotation.y =
      Math.sin(
        state.clock.elapsedTime * 0.12
      ) * 0.025
  })

  const contamination =
    scenario === 'clean'
      ? 0
      : level / 100

  return (
    <group ref={groupRef}>

      {/* TANK BODY */}

      <mesh position={[0, 0, 0]}>

        <boxGeometry
          args={[4.8, 2.6, 3.2]}
        />

        <meshPhysicalMaterial
          color="#17405b"
          transparent
          opacity={0.18}
          roughness={0.08}
          metalness={0.05}
        />

      </mesh>

      {/* WATER */}

      <AnimatedWater
        contamination={contamination}
        running={running}
      />

      {/* SIMULATED OIL SPILL */}

      {scenario !== 'clean' && (
        <OilSpill
          level={level}
          running={running}
        />
      )}

      {/* SENSOR PROBES */}

      <SensorProbe
        position={[-1.35, 0.85, 0]}
        color="#8bd5ff"
        label="pH"
        running={running}
      />

      <SensorProbe
        position={[-0.45, 0.75, 0]}
        color="#f7c873"
        label="TEMP"
        running={running}
      />

      <SensorProbe
        position={[0.45, 0.75, 0]}
        color="#a7f3d0"
        label="COND"
        running={running}
      />

      <SensorProbe
        position={[1.35, 0.85, 0]}
        color="#d8b4fe"
        label="TURB"
        running={running}
      />

      {/* WATER PARTICLES */}

      {Array.from({
        length: particleCount,
      }).map((_, index) => (
        <Particle
          key={index}
          index={index}
          contamination={contamination}
          running={running}
        />
      ))}

    </group>
  )
}


/* ============================================================
   BLUE WATER
   ============================================================ */

function AnimatedWater({
  contamination,
  running,
}) {
  const meshRef = useRef(null)

  useFrame((state) => {
    if (!meshRef.current || !running) return

    meshRef.current.position.y =
      -0.25 +
      Math.sin(
        state.clock.elapsedTime * 1.5
      ) * 0.025
  })

  return (
    <mesh
      ref={meshRef}
      position={[0, -0.25, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
    >

      <planeGeometry
        args={[4.55, 2.95, 24, 24]}
      />

      <meshPhysicalMaterial
        color="#1597d4"
        transparent
        opacity={0.72}
        roughness={0.12}
        metalness={0.02}
        transmission={0.08}
      />

    </mesh>
  )
}


/* ============================================================
   RED SIMULATED OIL SPILL
   ============================================================ */

function OilSpill({
  level,
  running,
}) {
  const groupRef = useRef(null)

  useFrame((state) => {
    if (!groupRef.current || !running) return

    groupRef.current.rotation.z =
      Math.sin(
        state.clock.elapsedTime * 0.35
      ) * 0.018

    groupRef.current.position.y =
      1.02 +
      Math.sin(
        state.clock.elapsedTime * 1.2
      ) * 0.025
  })

  const scale =
    0.65 +
    (level / 100) * 0.9

  return (
    <group
      ref={groupRef}
      position={[0, 1.02, 0]}
      scale={[scale, 1, scale * 0.65]}
    >

      {/* MAIN RED SPILL */}

      <mesh rotation={[-Math.PI / 2, 0, 0]}>

        <circleGeometry
          args={[1.65, 64]}
        />

        <meshPhysicalMaterial
          color="#ef3030"
          emissive="#7f1010"
          emissiveIntensity={0.3}
          transparent
          opacity={0.76}
          roughness={0.28}
          metalness={0.05}
          side={2}
        />

      </mesh>

      {/* SECONDARY FILM */}

      <mesh
        position={[-0.65, 0.015, 0.25]}
        rotation={[-Math.PI / 2, 0, 0]}
        scale={[0.55, 0.35, 1]}
      >

        <circleGeometry
          args={[0.8, 48]}
        />

        <meshPhysicalMaterial
          color="#ff5757"
          transparent
          opacity={0.48}
          roughness={0.2}
          side={2}
        />

      </mesh>

      <mesh
        position={[0.72, 0.02, -0.22]}
        rotation={[-Math.PI / 2, 0, 0]}
        scale={[0.45, 0.28, 1]}
      >

        <circleGeometry
          args={[0.8, 48]}
        />

        <meshPhysicalMaterial
          color="#ff4444"
          transparent
          opacity={0.42}
          roughness={0.2}
          side={2}
        />

      </mesh>

    </group>
  )
}


/* ============================================================
   SENSOR PROBE
   ============================================================ */

function SensorProbe({
  position,
  color,
  label,
  running,
}) {
  const groupRef = useRef(null)

  useFrame((state) => {
    if (!groupRef.current || !running) return

    groupRef.current.position.y =
      position[1] +
      Math.sin(
        state.clock.elapsedTime * 1.6 +
        position[0]
      ) * 0.04
  })

  return (
    <group
      ref={groupRef}
      position={position}
    >

      {/* PROBE ROD */}

      <mesh>

        <cylinderGeometry
          args={[
            0.055,
            0.055,
            1.8,
            12,
          ]}
        />

        <meshStandardMaterial
          color="#dce6ed"
          metalness={0.8}
          roughness={0.25}
        />

      </mesh>

      {/* SENSOR TIP */}

      <mesh
        position={[0, -0.9, 0]}
      >

        <sphereGeometry
          args={[0.13, 16, 16]}
        />

        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.8}
        />

      </mesh>

      {/* TOP SENSOR HEAD */}

      <mesh
        position={[0, 0.93, 0]}
      >

        <boxGeometry
          args={[0.28, 0.1, 0.15]}
        />

        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.45}
        />

      </mesh>

    </group>
  )
}


/* ============================================================
   WATER PARTICLES
   ============================================================ */

function Particle({
  index,
  contamination,
  running,
}) {
  const ref = useRef(null)

  const x =
    ((index * 37) % 100) / 100 * 4.2 -
    2.1

  const z =
    ((index * 61) % 100) / 100 * 2.5 -
    1.25

  const y =
    -0.9 +
    ((index * 29) % 100) / 100 * 1.7

  useFrame((state) => {
    if (!ref.current || !running) return

    ref.current.position.y =
      y +
      Math.sin(
        state.clock.elapsedTime *
          (0.7 + (index % 4) * 0.15) +
          index
      ) *
        0.06

    ref.current.position.x =
      x +
      Math.sin(
        state.clock.elapsedTime * 0.4 +
          index
      ) *
        0.025
  })

  const size =
    0.018 +
    contamination * 0.025

  return (
    <mesh
      ref={ref}
      position={[x, y, z]}
      scale={size}
    >

      <sphereGeometry
        args={[1, 8, 8]}
      />

      <meshStandardMaterial
        color="#d7eef8"
        transparent
        opacity={0.45}
      />

    </mesh>
  )
}


/* ============================================================
   LEGEND ITEM
   ============================================================ */

function LegendItem({
  color,
  label,
}) {
  return (
    <div className="flex items-center gap-2">

      <span
        className={`h-2.5 w-2.5 rounded-full ${color}`}
      />

      <span className="text-[9px] text-white/60">
        {label}
      </span>

    </div>
  )
}


/* ============================================================
   SENSOR VALUE
   ============================================================ */

function SensorValue({
  label,
  value,
}) {
  return (
    <div className="bg-white px-5 py-4">

      <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-ink-3">
        {label}
      </div>

      <div className="mt-1 font-mono text-lg font-semibold tabular-nums text-ink">
        {value}
      </div>

      <div className="mt-1 text-[8px] uppercase tracking-wider text-ink-3">
        simulated reading
      </div>

    </div>
  )
}


/* ============================================================
   CV EVIDENCE METRIC
   ============================================================ */

function EvidenceMetric({
  label,
  value,
}) {
  return (
    <div className="rounded-lg border border-line bg-panel px-3 py-2">

      <div className="text-[9px] uppercase tracking-wider text-ink-3">
        {label}
      </div>

      <div className="mt-1 font-mono text-xs font-semibold text-ink">
        {value}
      </div>

    </div>
  )
}


export default function Dashboard() {
  const { models, modelsLoading, status, history, openAnalysis } = useApp()
  const nav = useNavigate()
  const sfx = useMemo(uiSoundHandlers, [])
  const [latest, setLatest] = useState(undefined)            // undefined = loading, null = none
  useEffect(() => { api.latest().then((l) => setLatest(l.analysis)).catch(() => setLatest(null)) }, [history.total])
  const assets = useAnalysisAssets(latest || null)
  const available = models.filter((m) => m.availability.available).length
  const open = async (id, to) => { await openAnalysis(id); nav(to) }

  return (
    <div className="space-y-12" {...sfx}>
      <section className="grid items-stretch gap-8 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="flex flex-col justify-center py-4">
          <div className="label mb-3 text-accent">PetroVision</div>
          <h1 className="text-[36px] font-semibold leading-[1.1] tracking-tight text-ink">PetroVision</h1>
          <p className="mt-3 max-w-lg text-[17px] leading-relaxed text-ink-2">AI-powered visual analysis for petroleum contamination in aquatic environments.</p>
          <p className="mt-3 max-w-lg text-[14px] leading-relaxed text-ink-3">Detects visible petroleum-like regions, keeps each one as an instance, measures it in image space and lets you explore the result in 3D.</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link to="/analyze" className="btn-primary"><IconScan width={15} height={15} /> Analyze image</Link>
            <Link to="/live" className="btn-ghost"><IconCamera width={15} height={15} /> Start live scan</Link>
          </div>
        </div>
        <div className="aspect-[3/2] overflow-hidden rounded-lg border border-line-strong lg:aspect-auto lg:min-h-[340px]"><ScanHero /></div>
      </section>

      <section aria-label="Capabilities">
        <div className="grid border-y border-line sm:grid-cols-2 lg:grid-cols-3">
          {CAPABILITIES.map(([t, d], i) => (
            <div key={t} style={{ animationDelay: `${i * 60}ms` }} className="group animate-rise relative border-b border-line p-5 last:border-b-0 sm:border-r sm:[&:nth-child(2n)]:border-r-0 lg:[&:nth-child(2n)]:border-r lg:[&:nth-child(3n)]:border-r-0 lg:[&:nth-last-child(-n+3)]:border-b-0">
              <span className="absolute left-0 top-0 h-[2px] w-0 bg-accent transition-all duration-300 group-hover:w-full" />
              <h3 className="text-[14px] font-semibold text-ink">{t}</h3>
              <p className="mt-1 text-[13px] leading-relaxed text-ink-2">{d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-px overflow-hidden rounded-lg border border-line bg-line lg:grid-cols-[1.5fr_1fr]">
        <div className="bg-surface p-5">
          <div className="mb-4 flex items-center justify-between"><h2 className="label">Latest analysis</h2>{latest && <span className="font-mono text-[11px] text-ink-3">{latest.model.label} · {new Date(latest.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</span>}</div>
          {latest === undefined ? <Skeleton className="h-64" /> : latest === null ? (
            <div className="grid min-h-[260px] place-items-center border border-dashed border-line-strong text-center">
              <div><div className="text-[15px] font-semibold text-ink">No analysis yet</div><p className="mt-1 text-[13px] text-ink-2">Your results will appear here.</p><Link to="/analyze" className="btn-primary mt-4">Start analysis</Link></div>
            </div>
          ) : (
            <div className="grid gap-5 md:grid-cols-[1.25fr_1fr]">
              <div className="h-[260px] overflow-hidden border border-line bg-surface-2"><AnalysisViewer view={latest} assets={assets} opts={OPTS} interactive={false} /></div>
              <div className="flex flex-col justify-between">
                <div className="grid grid-cols-2 gap-x-4 gap-y-5">
                  <Kpi label={latest.instances[0]?.kind === 'region' ? 'Regions' : 'Instances'} value={latest.instance_count} pad={2} />
                  <Kpi label="Coverage" value={latest.measurements.coverage_percent} digits={2} unit="%" accent="text-signal" />
                  <Kpi label="Inference" value={latest.timing.inference_ms} digits={0} unit="ms" />
                  <div className="border-l border-line-strong pl-3"><div className="label">Model</div><div className="mt-1 text-[15px] font-medium text-ink">{latest.model.label}</div></div>
                </div>
                <div className="mt-5 flex flex-wrap gap-2"><button type="button" className="btn-ghost" onClick={() => open(latest.id, '/analyze')}>Open analysis</button><button type="button" className="btn-oil" onClick={() => open(latest.id, '/3d')}><IconCube width={15} height={15} /> View in 3D</button></div>
              </div>
            </div>
          )}
          {history.items.length > 1 && (
            <div className="mt-5 border-t border-line pt-4"><div className="label mb-2">Recent</div>
              <div className="flex gap-2 overflow-x-auto pb-1">{history.items.slice(0, 8).map((h) => (
                <button key={h.id} type="button" data-sfx="select" onClick={() => open(h.id, '/analyze')} className="w-[104px] shrink-0 border border-line p-1 text-left transition-colors hover:border-ink">
                  <img src={h.thumb_url} alt="" className="h-[52px] w-full object-cover" loading="lazy" /><span className="mt-1 block font-mono text-[10px] text-ink-3">{h.instance_count} · {fmtPct(h.coverage_percent, 1)}</span>
                </button>))}</div></div>
          )}
        </div>

        <div className="bg-surface p-5">
          <div className="mb-3 flex items-center justify-between"><h2 className="label">Model availability</h2><Badge kind={status?.ready ? 'ok' : 'muted'}>{modelsLoading ? '…' : `${available} of ${models.length} ready`}</Badge></div>
          <ul className="divide-y divide-line">
            {models.map((m) => (
              <li key={m.id} className="flex items-center justify-between py-2.5">
                <span className="flex items-center gap-2 text-[13px] text-ink"><span className="h-2 w-2 rounded-full" style={{ background: m.availability.available ? colorFor(m.id) : 'var(--line-strong)' }} />{m.label}<span className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-3">{m.task === 'instance' ? 'instance' : 'semantic'}</span></span>
                <span className={`font-mono text-[10.5px] uppercase tracking-[0.12em] ${m.availability.available ? 'text-ok' : 'text-ink-3'}`}>{m.availability.available ? 'Available' : 'Unavailable'}</span>
              </li>
            ))}
          </ul>
          <Link to="/results" className="mt-4 inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.1em] text-accent hover:underline"><IconLayers width={14} height={14} /> Research results →</Link>
        </div>
      </section>


      <SimulatedSensorPanel latest={latest} />
      <EnvironmentalIntelligence latest={latest} />
      <MarineEnvironmentalContext latest={latest}/>

    </div>
  )
}
