/** Original image + prediction overlay (+ optional contours / bbox / centroid), all from one real inference result. */
export default function OverlayViewer({ src, result, aspect: aspectProp, opacity = 1, showContours = false, showBox = false, className = '' }) {
  const bb = result?.measurements?.normalized?.bounding_box
  const c = result?.measurements?.normalized?.centroid
  const aspect = aspectProp ?? (result ? result.image.width / result.image.height : undefined)
  return (
    <div className={`relative overflow-hidden rounded-xl border border-line bg-surface ${className}`} style={aspect ? { aspectRatio: aspect } : undefined}>
      <img src={src} alt="Analysed image with prediction overlay" className="absolute inset-0 h-full w-full object-fill" />
      {result && (
        <>
          <img src={result.mask.overlay_png} alt="" className="absolute inset-0 h-full w-full object-fill [image-rendering:auto]" style={{ opacity }} />
          <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden>
            {showContours &&
              (result.contours || []).map((poly, i) => (
                <polygon key={i} points={poly.map((p) => p.join(',')).join(' ')} fill="none" stroke="#22d3ee" strokeWidth="2" vectorEffect="non-scaling-stroke" />
              ))}
            {showBox && bb && (
              <rect x={bb.x} y={bb.y} width={bb.width} height={bb.height} fill="none" stroke="#fde047" strokeWidth="2" strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
            )}
            {showBox && c && (
              <g stroke="#fde047" strokeWidth="2" vectorEffect="non-scaling-stroke">
                <line x1={c.x - 0.015} x2={c.x + 0.015} y1={c.y} y2={c.y} vectorEffect="non-scaling-stroke" />
                <line x1={c.x} x2={c.x} y1={c.y - 0.015} y2={c.y + 0.015} vectorEffect="non-scaling-stroke" />
              </g>
            )}
          </svg>
        </>
      )}
    </div>
  )
}
