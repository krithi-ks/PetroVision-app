import { Stat } from './ui'
import { fmt, fmtInt, fmtMs, fmtPct } from '../lib/format'

/** Image-space measurements returned by the backend for ONE real prediction. */
export default function MeasurementGrid({ result }) {
  const m = result.measurements
  const bb = m.bounding_box
  const c = m.centroid
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-5 md:grid-cols-3 xl:grid-cols-4" data-testid="measurements">
      <Stat label="Visible coverage" value={fmtPct(m.coverage_percent)} accent="oil" hint="Image-space share of pixels" />
      <Stat label="Pixel area" value={fmtInt(m.petroleum_pixels)} unit="px" hint={`of ${fmtInt(m.total_pixels)}`} />
      <Stat label="Bounding box" value={bb ? `${bb.width}×${bb.height}` : '—'} unit={bb ? 'px' : ''} hint={bb ? `origin ${bb.x}, ${bb.y}` : 'No region predicted'} />
      <Stat label="Centroid" value={c ? `${fmt(c.x, 1)}, ${fmt(c.y, 1)}` : '—'} unit={c ? 'px' : ''} />
      <Stat label="Perimeter" value={m.has_petroleum_like_region ? fmt(m.perimeter_px, 1) : '—'} unit={m.has_petroleum_like_region ? 'px' : ''} />
      <Stat label="Regions" value={fmtInt(m.region_count)} hint={m.region_count ? `largest ${fmtInt(m.largest_region_pixels)} px` : undefined} />
      <Stat label="Inference time" value={fmtMs(result.timing.inference_ms)} accent="cyan" />
      <Stat label="Mask resolution" value={`${result.mask.width}×${result.mask.height}`} hint={`source ${result.image.width}×${result.image.height}`} />
    </div>
  )
}
