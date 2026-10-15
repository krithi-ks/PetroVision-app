import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'

import { api } from '../lib/api'
import { fetchEnvironmentalData } from '../lib/environmentalApi'

const LOCATIONS = {
  chennai: {
    label: 'Chennai, India',
    latitude: 13.0827,
    longitude: 80.2707,
  },

  mumbai: {
    label: 'Mumbai, India',
    latitude: 19.076,
    longitude: 72.8777,
  },

  goa: {
    label: 'Goa, India',
    latitude: 15.2993,
    longitude: 74.124,
  },

  singapore: {
    label: 'Singapore',
    latitude: 1.3521,
    longitude: 103.8198,
  },

  custom: {
    label: 'Custom location',
    latitude: 13.0827,
    longitude: 80.2707,
  },
}

function formatNumber(value, digits = 1) {
  if (!Number.isFinite(Number(value))) return '—'
  return Number(value).toFixed(digits)
}

function directionToCompass(degrees) {
  if (!Number.isFinite(Number(degrees))) return '—'

  const directions = [
    'N',
    'NE',
    'E',
    'SE',
    'S',
    'SW',
    'W',
    'NW',
  ]

  const index =
    Math.round(Number(degrees) / 45) %
    directions.length

  return directions[index]
}

function EnvironmentalIntelligence({ latest }) {
  const [locationKey, setLocationKey] = useState('chennai')
  const [customLocation, setCustomLocation] = useState(null)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [locationQuery, setLocationQuery] = useState('')
  const [locationResults, setLocationResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState(null)
  const requestId = useRef(0)
  const searchRequestId = useRef(0)

  const location = locationKey === 'custom'
    ? customLocation
    : LOCATIONS[locationKey]

  const loadEnvironment = async (target = location) => {
    if (!target) return
    const currentRequest = ++requestId.current
    setLoading(true)
    setError(null)
    setData(null)

    try {
      const result = await fetchEnvironmentalData({
        latitude: target.latitude,
        longitude: target.longitude,
      })

      if (currentRequest !== requestId.current) return
      setData(result)
      setLastUpdated(new Date())
    } catch (err) {
      if (currentRequest !== requestId.current) return
      setError(
        err?.message ||
          'Unable to load environmental conditions.',
      )
    } finally {
      if (currentRequest === requestId.current) setLoading(false)
    }
  }

  useEffect(() => {
    if (!location) return undefined
    loadEnvironment(location)
    return () => { requestId.current += 1 }
  }, [location])

  useEffect(() => {
    if (!autoRefresh || !location) return undefined

    const timer = setInterval(
      () => loadEnvironment(location),
      10 * 60 * 1000,
    )

    return () => clearInterval(timer)
  }, [autoRefresh, location])

  async function searchLocations() {
    const query = locationQuery.trim()
    if (query.length < 2) {
      setLocationResults([])
      setSearchError('Enter at least 2 characters to search.')
      return
    }
    const currentSearch = ++searchRequestId.current
    setSearching(true)
    setSearchError(null)
    setLocationResults([])
    try {
      const result = await api.geocode(query)
      if (currentSearch !== searchRequestId.current) return
      setLocationResults(result.results || [])
      if (!result.results?.length) setSearchError('No matching locations found.')
    } catch (err) {
      if (currentSearch !== searchRequestId.current) return
      setLocationResults([])
      setSearchError(err.message || 'Location search is unavailable.')
    } finally {
      if (currentSearch === searchRequestId.current) setSearching(false)
    }
  }

  function chooseLocation(result) {
    searchRequestId.current += 1
    setSearching(false)
    setCustomLocation({
      label: [result.name, result.admin1, result.country].filter(Boolean).join(', '),
      latitude: Number(result.latitude),
      longitude: Number(result.longitude),
    })
    setLocationKey('custom')
    setLocationResults([])
    setLocationQuery('')
    setSearchError(null)
  }

  const cvDetected = Boolean(
    latest &&
      Number(latest.instance_count || 0) > 0,
  )

  const cvCoverage = Number(
    latest?.measurements?.coverage_percent || 0,
  )

  const cvInstances = Number(
    latest?.instance_count || 0,
  )

  const status = useMemo(() => {
    if (!latest) {
      return {
        label: 'WAITING FOR VISUAL ANALYSIS',
        tone: 'neutral',
      }
    }

    if (cvDetected) {
      return {
        label: 'VISUAL INCIDENT ACTIVE',
        tone: 'incident',
      }
    }

    return {
      label: 'NO VISUAL INCIDENT DETECTED',
      tone: 'clear',
    }
  }, [latest, cvDetected])

  return (
    <section className="mt-6 overflow-hidden rounded-2xl border border-line bg-white shadow-sm">

      {/* HEADER */}

      <div className="flex flex-col gap-4 border-b border-line bg-panel px-5 py-5 lg:flex-row lg:items-center lg:justify-between">

        <div>

          <div className="flex items-center gap-2">

            <span className="relative flex h-2.5 w-2.5">

              {data && !error && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              )}

              <span
                className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
                  data && !error
                    ? 'bg-emerald-500'
                    : loading
                      ? 'bg-amber-400'
                      : 'bg-red-500'
                }`}
              />

            </span>

            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-3">
              Environmental Intelligence
            </span>

            <span className="rounded-full border border-line-strong bg-white px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-ink-3">
              LIVE API
            </span>

          </div>

          <h2 className="mt-1 text-xl font-semibold text-ink">
            Marine environmental context
          </h2>

          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-3">
            Live wind, wave, current and sea-surface conditions
            surrounding the selected monitoring location.
          </p>

        </div>

        <div className="flex flex-wrap items-center gap-2">

          <select
            value={locationKey}
            onChange={(event) =>
              setLocationKey(event.target.value)
            }
            className="rounded-lg border border-line-strong bg-white px-3 py-2 text-xs font-medium text-ink outline-none focus:border-ink"
          >

            <option value="chennai">
              Chennai, India
            </option>

            <option value="mumbai">
              Mumbai, India
            </option>

            <option value="goa">
              Goa, India
            </option>

            <option value="singapore">
              Singapore
            </option>
            {customLocation && (
              <option value="custom">
                {customLocation.label}
              </option>
            )}

          </select>

          <button
            type="button"
            onClick={() => loadEnvironment(location)}
            disabled={loading}
            className="btn-ghost"
          >
            {loading ? 'Updating…' : 'Refresh'}
          </button>

        </div>

      </div>

      <div className="border-b border-line px-5 py-4">
        <label htmlFor="environment-location-search" className="label">
          Search a coastal or marine location
        </label>
        <div className="mt-2 flex gap-2">
          <input
            id="environment-location-search"
            value={locationQuery}
            onChange={(event) => setLocationQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                searchLocations()
              }
            }}
            placeholder="City, coastline, or island"
            className="min-w-0 flex-1 rounded-lg border border-line-strong bg-white px-3 py-2 text-sm text-ink outline-none focus:border-ink"
          />
          <button
            type="button"
            onClick={searchLocations}
            disabled={searching || locationQuery.trim().length < 2}
            className="btn-ghost disabled:cursor-not-allowed disabled:opacity-50"
          >
            {searching ? 'Searching…' : 'Search'}
          </button>
        </div>
        {searchError && <p role="alert" className="mt-2 text-xs text-red-700">{searchError}</p>}
        {locationResults.length > 0 && (
          <ul className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-line">
            {locationResults.map((result, index) => (
              <li key={`${result.latitude}-${result.longitude}-${index}`}>
                <button
                  type="button"
                  onClick={() => chooseLocation(result)}
                  className="w-full border-b border-line px-3 py-2 text-left last:border-b-0 hover:bg-panel"
                >
                  <span className="block text-sm font-medium text-ink">{result.name}</span>
                  <span className="block text-xs text-ink-3">{[result.admin1, result.country].filter(Boolean).join(', ')}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 3D SCENE */}

      <div className="grid lg:grid-cols-[1.45fr_0.85fr]">

        <div className="relative min-h-[470px] overflow-hidden bg-slate-950">

          <Canvas
            camera={{
              position: [5.4, 3.7, 6],
              fov: 43,
            }}
            dpr={[1, 1.5]}
          >

            <color
              attach="background"
              args={['#04121d']}
            />

            <ambientLight intensity={1.4} />

            <directionalLight
              position={[4, 7, 4]}
              intensity={3}
            />

            <directionalLight
              position={[-4, 2, -3]}
              intensity={1}
            />

            <MarineScene
              windDirection={
                data?.wind?.direction ?? 45
              }
              currentDirection={
                data?.current?.direction ?? 90
              }
              waveHeight={
                data?.wave?.height ?? 0.5
              }
              incident={cvDetected}
              coverage={cvCoverage}
            />

            <OrbitControls
              enablePan={false}
              minDistance={4}
              maxDistance={9}
              minPolarAngle={0.65}
              maxPolarAngle={1.5}
            />

          </Canvas>

          {/* SCENE LABEL */}

          <div className="pointer-events-none absolute left-4 top-4">

            <div className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 backdrop-blur">

              <div className="text-[9px] font-semibold uppercase tracking-[0.18em] text-white/45">
                Virtual marine environment
              </div>

              <div className="mt-1 text-sm font-semibold text-white">
                {location.label}
              </div>

            </div>

          </div>

          {/* INCIDENT INDICATOR */}

          {cvDetected && (
            <div className="pointer-events-none absolute left-1/2 top-16 -translate-x-1/2">

              <div className="flex items-center gap-2 rounded-full border border-red-400/40 bg-red-950/70 px-3 py-1.5 backdrop-blur">

                <span className="h-2 w-2 animate-pulse rounded-full bg-red-400" />

                <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-red-200">
                  Actual CV incident
                </span>

              </div>

            </div>
          )}

          {/* CONTROLS */}

          <div className="pointer-events-none absolute bottom-4 left-4 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-[9px] uppercase tracking-wider text-white/45 backdrop-blur">
            Drag · Rotate · Zoom
          </div>

          {/* LEGEND */}

          <div className="pointer-events-none absolute bottom-4 right-4 rounded-lg border border-white/10 bg-black/40 px-3 py-2 backdrop-blur">

            <div className="space-y-1.5">

              <SceneLegend
                color="bg-sky-400"
                label="Marine water"
              />

              <SceneLegend
                color="bg-cyan-300"
                label="Ocean current"
              />

              <SceneLegend
                color="bg-white"
                label="Wind"
              />

              {cvDetected && (
                <SceneLegend
                  color="bg-red-500"
                  label="Actual CV incident"
                />
              )}

            </div>

          </div>

        </div>

        {/* DATA PANEL */}

        <div className="bg-white">

          <div className="border-b border-line px-5 py-4">

            <div className="label">
              Monitoring location
            </div>

            <div className="mt-2 text-lg font-semibold text-ink">
              {location.label}
            </div>

            <div className="mt-1 font-mono text-[10px] text-ink-3">
              {Math.abs(location.latitude).toFixed(4)}° {location.latitude < 0 ? 'S' : 'N'}
              {' '}
              {Math.abs(location.longitude).toFixed(4)}° {location.longitude < 0 ? 'W' : 'E'}
            </div>

          </div>

          {/* LIVE STATUS */}

          <div className="border-b border-line px-5 py-4">

            <div className="flex items-center justify-between">

              <span className="label">
                Current assessment
              </span>

              <span
                className={`rounded-full border px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider ${
                  status.tone === 'incident'
                    ? 'border-red-300 bg-red-50 text-red-700'
                    : status.tone === 'clear'
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                      : 'border-line-strong bg-panel text-ink-3'
                }`}
              >
                {status.label}
              </span>

            </div>

            {latest && (
              <div className="mt-3 grid grid-cols-2 gap-2">

                <MiniMetric
                  label="CV instances"
                  value={cvInstances}
                />

                <MiniMetric
                  label="CV coverage"
                  value={`${formatNumber(cvCoverage, 2)}%`}
                />

              </div>
            )}

          </div>

          {/* ENVIRONMENT METRICS */}

          <div className="grid grid-cols-2 gap-px bg-line">

            <EnvironmentMetric
              label="Wind"
              value={
                data
                  ? `${formatNumber(data.wind.speed, 1)} ${data.wind.unit}`
                  : '—'
              }
              direction={
                data
                  ? `${directionToCompass(data.wind.direction)} ${formatNumber(data.wind.direction, 0)}°`
                  : '—'
              }
              icon="↗"
            />

            <EnvironmentMetric
              label="Ocean current"
              value={
                data
                  ? `${formatNumber(data.current.speed, 2)} ${data.current.unit}`
                  : '—'
              }
              direction={
                data
                  ? `${directionToCompass(data.current.direction)} ${formatNumber(data.current.direction, 0)}°`
                  : '—'
              }
              icon="→"
            />

            <EnvironmentMetric
              label="Wave height"
              value={
                data
                  ? `${formatNumber(data.wave.height, 2)} ${data.wave.unit}`
                  : '—'
              }
              direction={
                data
                  ? `${directionToCompass(data.wave.direction)} ${formatNumber(data.wave.direction, 0)}°`
                  : '—'
              }
              icon="≈"
            />

            <EnvironmentMetric
              label="Sea-surface temperature"
              value={
                data
                  ? `${formatNumber(data.seaSurfaceTemperature, 1)} ${data.seaSurfaceTemperatureUnit}`
                  : '—'
              }
              direction="LIVE MARINE DATA"
              icon="°"
            />

          </div>

          {/* DATA SOURCE */}

          <div className="border-b border-line px-5 py-4">

            <div className="label">
              Environmental data source
            </div>

            <div className="mt-2 flex items-center justify-between">

              <span className="text-sm font-medium text-ink">
                Open-Meteo
              </span>

              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[9px] font-semibold uppercase tracking-wider text-emerald-700">
                Live
              </span>

            </div>

            {data?.observedAt && (
              <div className="mt-2 font-mono text-[9px] text-ink-3">
                Marine observation:
                {' '}
                {new Date(data.observedAt).toLocaleString()}
              </div>
            )}

          </div>

          {/* AUTO REFRESH */}

          <div className="flex items-center justify-between px-5 py-4">

            <div>

              <div className="text-xs font-medium text-ink">
                Automatic refresh
              </div>

              <div className="mt-0.5 text-[10px] text-ink-3">
                Updates every 10 minutes
              </div>

            </div>

            <button
              type="button"
              onClick={() =>
                setAutoRefresh((value) => !value)
              }
              className={`relative h-6 w-11 rounded-full transition ${
                autoRefresh
                  ? 'bg-ink'
                  : 'bg-line-strong'
              }`}
            >

              <span
                className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition ${
                  autoRefresh
                    ? 'left-6'
                    : 'left-1'
                }`}
              />

            </button>

          </div>

        </div>

      </div>

      {/* ERROR */}

      {error && (
        <div className="border-t border-red-200 bg-red-50 px-5 py-3 text-xs text-red-700">
          <strong>Environmental data unavailable:</strong>{' '}
          {error}
        </div>
      )}

      {/* FOOTER */}

      <div className="border-t border-line bg-panel px-5 py-3 text-[10px] leading-relaxed text-ink-3">

        <span className="font-semibold text-ink-2">
          Environmental context:
        </span>{' '}
        These live marine and weather measurements provide
        contextual information for the selected monitoring
        location. They do not chemically identify petroleum,
        determine spill volume, or predict spill trajectory.

      </div>

    </section>
  )
}

function MarineScene({
  windDirection,
  currentDirection,
  waveHeight,
  incident,
  coverage,
}) {
  const group = useRef(null)

  useFrame((state) => {
    if (!group.current) return

    group.current.rotation.y =
      Math.sin(
        state.clock.elapsedTime * 0.12,
      ) * 0.025
  })

  const normalizedWave = Math.min(
    Math.max(Number(waveHeight) || 0.5, 0.1),
    4,
  )

  return (
    <group ref={group}>

      {/* OCEAN SURFACE */}

      <OceanSurface
        waveHeight={normalizedWave}
      />

      {/* CURRENT STREAMS */}

      <CurrentStreams
        direction={currentDirection}
      />

      {/* WIND PARTICLES */}

      <WindParticles
        direction={windDirection}
      />

      {/* INCIDENT */}

      {incident && (
        <IncidentMarker
          coverage={coverage}
        />
      )}

      {/* LOCATION MARKER */}

      <mesh position={[0, 0.18, 0]}>

        <sphereGeometry
          args={[0.06, 16, 16]}
        />

        <meshStandardMaterial
          color="#ffffff"
          emissive="#ffffff"
          emissiveIntensity={1.2}
        />

      </mesh>

    </group>
  )
}

function OceanSurface({ waveHeight }) {
  const ref = useRef(null)

  useFrame((state) => {
    if (!ref.current) return

    ref.current.rotation.z =
      Math.sin(
        state.clock.elapsedTime * 0.18,
      ) *
      Math.min(waveHeight * 0.01, 0.04)
  })

  return (
    <mesh
      ref={ref}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, 0, 0]}
    >

      <planeGeometry
        args={[5.5, 4.2, 35, 35]}
      />

      <meshPhysicalMaterial
        color="#087fae"
        transparent
        opacity={0.72}
        roughness={0.14}
        metalness={0.02}
        transmission={0.08}
      />

    </mesh>
  )
}

function CurrentStreams({ direction }) {
  const count = 9

  return (
    <group
      rotation={[
        0,
        0,
        ((Number(direction) || 0) *
          Math.PI) /
          180,
      ]}
    >

      {Array.from({
        length: count,
      }).map((_, index) => (
        <FlowParticle
          key={index}
          index={index}
          color="#67e8f9"
          speed={0.45 + (index % 3) * 0.12}
          spread={1.8}
        />
      ))}

    </group>
  )
}

function WindParticles({ direction }) {
  return (
    <group
      rotation={[
        0,
        0,
        ((Number(direction) || 0) *
          Math.PI) /
          180,
      ]}
    >

      {Array.from({
        length: 12,
      }).map((_, index) => (
        <FlowParticle
          key={index}
          index={index + 30}
          color="#ffffff"
          speed={0.75 + (index % 4) * 0.12}
          spread={2.3}
          height={1.4}
        />
      ))}

    </group>
  )
}

function FlowParticle({
  index,
  color,
  speed,
  spread,
  height = 0.15,
}) {
  const ref = useRef(null)

  const startX =
    ((index * 47) % 100) / 100 *
      spread -
    spread / 2

  const startZ =
    ((index * 29) % 100) / 100 *
      spread -
    spread / 2

  useFrame((state) => {
    if (!ref.current) return

    const t =
      (state.clock.elapsedTime *
        speed +
        index * 0.23) %
      1

    ref.current.position.x =
      startX +
      (t - 0.5) * 3.5

    ref.current.position.y =
      height +
      Math.sin(
        state.clock.elapsedTime * 1.4 +
          index,
      ) *
        0.035

    ref.current.position.z =
      startZ
  })

  return (
    <mesh ref={ref}>

      <sphereGeometry
        args={[0.025, 8, 8]}
      />

      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={0.7}
        transparent
        opacity={0.75}
      />

    </mesh>
  )
}

function IncidentMarker({ coverage }) {
  const ref = useRef(null)

  useFrame((state) => {
    if (!ref.current) return

    const pulse =
      1 +
      Math.sin(
        state.clock.elapsedTime * 2,
      ) *
        0.08

    ref.current.scale.set(
      pulse,
      pulse,
      pulse,
    )
  })

  const size =
    0.18 +
    Math.min(Number(coverage) || 0, 10) *
      0.035

  return (
    <group
      ref={ref}
      position={[0.2, 0.12, 0.15]}
    >

      <mesh rotation={[-Math.PI / 2, 0, 0]}>

        <circleGeometry
          args={[size, 48]}
        />

        <meshStandardMaterial
          color="#ef3030"
          emissive="#a51010"
          emissiveIntensity={0.55}
          transparent
          opacity={0.78}
        />

      </mesh>

      <mesh position={[0, 0.22, 0]}>

        <sphereGeometry
          args={[0.045, 16, 16]}
        />

        <meshStandardMaterial
          color="#ff5757"
          emissive="#ff2222"
          emissiveIntensity={1.8}
        />

      </mesh>

    </group>
  )
}

function SceneLegend({ color, label }) {
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

function MiniMetric({ label, value }) {
  return (
    <div className="rounded-lg border border-line bg-panel px-3 py-2">

      <div className="text-[9px] uppercase tracking-wider text-ink-3">
        {label}
      </div>

      <div className="mt-1 font-mono text-sm font-semibold text-ink">
        {value}
      </div>

    </div>
  )
}

function EnvironmentMetric({
  label,
  value,
  direction,
  icon,
}) {
  return (
    <div className="bg-white px-5 py-4">

      <div className="flex items-center justify-between">

        <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-ink-3">
          {label}
        </div>

        <span className="text-lg text-accent">
          {icon}
        </span>

      </div>

      <div className="mt-2 font-mono text-lg font-semibold tabular-nums text-ink">
        {value}
      </div>

      <div className="mt-1 font-mono text-[9px] uppercase tracking-wider text-ink-3">
        {direction}
      </div>

    </div>
  )
}

export default EnvironmentalIntelligence