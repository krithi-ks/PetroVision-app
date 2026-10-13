import { Suspense, lazy } from 'react'
import { Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import { Spinner } from './components/ui'
import Dashboard from './pages/Dashboard'
import Analyze from './pages/Analyze'
import Live from './pages/Live'
import Research from './pages/Research'
import About from './pages/About'

// Heavy libraries (charts, three.js) load only when their page is opened.
const Results = lazy(() => import('./pages/Results'))
const Visualization3D = lazy(() => import('./pages/Visualization3D'))

function Loading() {
  return (
    <div className="flex items-center justify-center gap-3 py-24 text-slate-400">
      <Spinner /> Loading…
    </div>
  )
}

function NotFound() {
  return (
    <div className="py-24 text-center">
      <div className="text-5xl font-bold text-white">404</div>
      <p className="mt-3 text-slate-400">This page does not exist.</p>
    </div>
  )
}

export default function App() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="analyze" element={<Analyze />} />
          <Route path="live" element={<Live />} />
          <Route path="results" element={<Results />} />
          <Route path="3d" element={<Visualization3D />} />
          <Route path="visualize" element={<Visualization3D />} />
          <Route path="research" element={<Research />} />
          <Route path="about" element={<About />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  )
}
