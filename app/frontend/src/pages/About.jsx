import { Link } from 'react-router-dom'
import { Badge, PageHeader, Panel } from '../components/ui'

const REFS = [
  ['LADOS', 'Aerial oil-spill detection dataset with pixel-level labels (CC BY 4.0).'],
  ['De Kerf et al., 2024', 'Drone-captured, segmented images for oil-spill detection in port environments. Scientific Data.'],
  ['Model families', 'U-Net · DeepLabV3+ · SegFormer · Mask2Former · YOLO11 / YOLO26 (Ultralytics).'],
]

export default function About() {
  return (
    <>
      <PageHeader eyebrow="About" title="PetroVision">Segmentation and visualisation of visible petroleum-like contamination in aquatic imagery.</PageHeader>
      <div className="grid gap-6 lg:grid-cols-3">
        <Panel className="space-y-2 p-5 lg:col-span-2">
          <div className="label">Purpose</div>
          <p className="text-sm leading-relaxed text-ink-2">PetroVision compares semantic and instance segmentation models for localising visible petroleum-like regions, and lets you apply them to your own images and live camera video.</p>
          <div className="label pt-3">Technology</div>
          <div className="flex flex-wrap gap-2">{['React', 'Three.js', 'Tailwind CSS', 'FastAPI', 'PyTorch', 'Ultralytics', 'Hugging Face Transformers'].map((t) => <Badge key={t}>{t}</Badge>)}</div>
        </Panel>
        <Panel className="space-y-2 p-5">
          <div className="label">Scope</div>
          <p className="text-sm leading-relaxed text-ink-2">Results describe visible regions in RGB images. They do not identify the type of petroleum, or its concentration, thickness or volume. See <Link to="/research" className="text-accent underline">Research</Link>.</p>
        </Panel>
        <Panel className="p-5 lg:col-span-3">
          <div className="label mb-3">Credits and references</div>
          <dl className="divide-y divide-line">{REFS.map(([k, v]) => <div key={k} className="grid gap-1 py-2.5 sm:grid-cols-[200px_1fr]"><dt className="text-[13px] font-medium text-ink">{k}</dt><dd className="text-sm text-ink-2">{v}</dd></div>)}</dl>
        </Panel>
      </div>
    </>
  )
}
