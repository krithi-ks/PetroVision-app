import { useEffect, useState } from 'react'
import { binaryMaskPixels, buildFillCanvas } from '../lib/labelGrid'
import { instanceColor } from '../lib/render'

function EvidencePanel({ title, children }) {
  return (
    <figure className="analysis-evidence-panel min-w-0 overflow-hidden rounded-xl border border-line bg-surface-2">
      <figcaption className="border-b border-line px-3 py-2 font-mono text-[9px] uppercase tracking-[0.12em] text-ink-3">{title}</figcaption>
      {children}
    </figure>
  )
}

export default function AnalysisEvidence({ analysis, assets, imageClassName = 'h-[320px] lg:h-[380px]', stacked = false, showInstances = false }) {
  const [images, setImages] = useState({ mask: '', overlay: '' })

  useEffect(() => {
    if (!analysis || assets.status !== 'ready' || !assets.img || !assets.lab) {
      setImages({ mask: '', overlay: '' })
      return undefined
    }

    const maskCanvas = document.createElement('canvas')
    maskCanvas.width = assets.lab.w
    maskCanvas.height = assets.lab.h
    const maskContext = maskCanvas.getContext('2d')
    if (!maskContext) {
      setImages({ mask: '', overlay: '' })
      return undefined
    }

    const maskData = maskContext.createImageData(assets.lab.w, assets.lab.h)
    maskData.data.set(binaryMaskPixels(assets.lab.labels))
    maskContext.putImageData(maskData, 0, 0)

    const overlayCanvas = document.createElement('canvas')
    overlayCanvas.width = assets.img.naturalWidth
    overlayCanvas.height = assets.img.naturalHeight
    const overlayContext = overlayCanvas.getContext('2d')
    if (!overlayContext) {
      setImages({ mask: maskCanvas.toDataURL('image/png'), overlay: '' })
      return undefined
    }
    overlayContext.drawImage(assets.img, 0, 0, overlayCanvas.width, overlayCanvas.height)
    overlayContext.drawImage(buildFillCanvas(assets.lab, ['#ef4444'], 0.45), 0, 0, overlayCanvas.width, overlayCanvas.height)

    setImages({ mask: maskCanvas.toDataURL('image/png'), overlay: overlayCanvas.toDataURL('image/png') })
    return undefined
  }, [analysis?.id, assets])

  const loadingText = assets.status === 'error' ? 'Prediction evidence unavailable.' : 'Preparing prediction evidence…'
  const imageWidth = analysis?.image?.width || 1
  const imageHeight = analysis?.image?.height || 1

  return (
    <div className={`grid gap-4 ${stacked ? 'grid-cols-1' : 'md:grid-cols-3'}`}>
      <EvidencePanel title="Source image">
        {analysis?.urls?.source
          ? <img src={analysis.urls.source} alt={`Analysed source image: ${analysis.image?.filename || 'saved scan'}`} className={`${imageClassName} w-full object-contain p-2`} />
          : <div className={`${imageClassName} grid place-items-center text-xs text-slate-400`}>Original image unavailable.</div>}
      </EvidencePanel>
      <EvidencePanel title="Predicted mask · black and white">
        {images.mask
          ? <img src={images.mask} alt="Binary predicted mask: black background and white predicted regions" className={`${imageClassName} w-full object-contain p-2 [image-rendering:pixelated]`} />
          : <div className={`${imageClassName} grid place-items-center text-xs text-slate-400`}>{loadingText}</div>}
      </EvidencePanel>
      <EvidencePanel title="Prediction overlay">
        {images.overlay
          ? <img src={images.overlay} alt="Original image with predicted petroleum regions overlaid" className={`${imageClassName} w-full object-contain p-2`} />
          : <div className={`${imageClassName} grid place-items-center text-xs text-slate-400`}>{loadingText}</div>}
      </EvidencePanel>
      {showInstances && <EvidencePanel title="Instances · bounding boxes">
        {analysis?.urls?.source && assets.status === 'ready' ? (
          <div className={`relative mx-auto max-h-full w-full overflow-hidden bg-black`} style={{ aspectRatio: `${imageWidth} / ${imageHeight}` }}>
            <img src={analysis.urls.source} alt={`Instance detections with bounding boxes: ${analysis.image?.filename || 'saved scan'}`} className="absolute inset-0 h-full w-full object-fill" />
            {(analysis.instances || []).map((item) => {
              const box = item.normalized?.bounding_box
              const pixelBox = item.bounding_box
              if (!box && !pixelBox) return null
              const x = box?.x ?? pixelBox.x / imageWidth
              const y = box?.y ?? pixelBox.y / imageHeight
              const width = box?.width ?? pixelBox.width / imageWidth
              const height = box?.height ?? pixelBox.height / imageHeight
              const color = instanceColor(item.index)
              return (
                <div key={item.index} className="absolute border-2" style={{
                  left: `${Math.max(0, Math.min(1, x)) * 100}%`,
                  top: `${Math.max(0, Math.min(1, y)) * 100}%`,
                  width: `${Math.max(0, Math.min(1 - x, width)) * 100}%`,
                  height: `${Math.max(0, Math.min(1 - y, height)) * 100}%`,
                  borderColor: color,
                  boxShadow: `0 0 8px ${color}`,
                }}>
                  <span className="absolute -top-5 left-[-2px] whitespace-nowrap px-1 py-0.5 font-mono text-[9px] text-white" style={{ backgroundColor: color }}>
                    {item.kind === 'instance' ? 'Instance' : 'Region'} {item.id}
                  </span>
                </div>
              )
            })}
            <span className="sr-only">{analysis.instance_count} detections with bounding boxes</span>
          </div>
        ) : (
          <div className={`${imageClassName} grid place-items-center text-xs text-slate-400`}>{assets.status === 'error' ? loadingText : 'Preparing instance boxes…'}</div>
        )}
      </EvidencePanel>}
    </div>
  )
}
