import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { useApp } from '../context/AppContext'
import { Badge, Notice, PageHeader, Panel } from '../components/ui'

function Section({ n, title, children }) {
  return (
    <Panel className="p-6">
      <div className="mb-3 flex items-baseline gap-3"><span className="font-mono text-sm text-accent">{String(n).padStart(2, '0')}</span><h2 className="text-xl font-semibold text-ink">{title}</h2></div>
      <div className="space-y-3 text-[15px] leading-relaxed text-ink-2">{children}</div>
    </Panel>
  )
}

export default function Research() {
  const { models } = useApp()
  const [summary, setSummary] = useState(null)
  useEffect(() => { api.summary().then(setSummary).catch(() => setSummary(false)) }, [])
  const meth = summary?.methodology

  return (
    <>
      <PageHeader eyebrow="Research / Scientific View" title="What PetroVision does — and what it does not">
        Datasets, tasks, models and how they were evaluated.
      </PageHeader>

      <div className="grid gap-6">
        <Section n={1} title="Objective">
          <p>Localise <strong>visible petroleum-like contamination</strong> in aquatic imagery and compare segmentation architectures experimentally.</p>
        </Section>

        <Section n={2} title="Datasets">
          <p>LADOS: aerial RGB imagery with pixel-level masks (3,388 images; 2,370 training, 675 validation, 343 test in the export used here). De Kerf et al. (2024): drone-captured oil-spill imagery from port environments. Its annotations are semantic oil masks; for the YOLO26 experiment, oil instances were derived from connected oil regions of those masks (not human-annotated instances).</p>
          <div className="flex flex-wrap gap-2 pt-1">{['Background', 'Emulsion', 'Oil', 'Oil-platform', 'Sheen', 'Ship'].map((c) => <Badge key={c} kind={['Emulsion', 'Oil', 'Sheen'].includes(c) ? 'live' : 'muted'}>{c}</Badge>)}</div>
        </Section>

        <Section n={3} title="Semantic segmentation → a petroleum / non-petroleum mask">
          <p>Semantic segmentation assigns a class to every pixel. PetroVision merges three LADOS classes into one target:</p>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-oil-500/40 bg-oil-500/10 p-4"><div className="label text-signal">PETROLEUM</div><div className="mt-1 text-ink">Oil + Emulsion + Sheen</div></div>
            <div className="rounded-xl border border-line bg-surface-2 p-4"><div className="label">NON-PETROLEUM</div><div className="mt-1 text-ink">Background + Oil-platform + Ship</div></div>
          </div>
          <p>Semantic models output one binary mask at {meth?.image_size || '256x256'}; instance models output one mask per detected region. The app rescales masks to your image.</p>
        </Section>

        <Section n={4} title="Models">
          <div className="grid gap-3 md:grid-cols-2">
            {(models.length ? models : []).map((m) => (
              <div key={m.id} className="rounded-xl border border-line bg-surface p-4">
                <div className="font-semibold text-ink">{m.label} <span className="ml-1 font-mono text-xs text-ink-3">{m.experiment_id}</span></div>
                <div className="mt-1 text-sm text-ink-2">{m.architecture}</div>
                <div className="mt-1 text-sm text-ink-2">{m.initialization}</div>
              </div>
            ))}
          </div>
          {!models.length && <p className="text-sm text-ink-3">Model list unavailable — the backend is not reachable.</p>}
          <p className="text-sm text-ink-2">Instance models (YOLO) are a different task from semantic models; their metrics are not directly comparable.</p>
        </Section>

        <Section n={5} title="Evaluation">
          <p>Models were scored pixel-wise on the held-out test split with IoU, Dice, precision, recall and accuracy{meth?.test_images ? ` (${meth.test_images} test images)` : ''}; efficiency was measured separately{meth?.efficiency_hardware ? ` on ${meth.efficiency_hardware}` : ''}. The numbers are on the <Link to="/results" className="text-accent underline">Model Results</Link> page, loaded from the saved result files.</p>
          <Notice tone="info" title="Research results vs. live demo outputs">
            <span className="mr-2 inline-flex"><Badge kind="research">Saved experiment</Badge></span> measured on test images with ground truth.
            <br /><span className="mr-2 mt-1 inline-flex"><Badge kind="live">Live output</Badge></span> produced now on your image; with no ground truth, no IoU, Dice, precision or recall is shown.
          </Notice>
        </Section>

        <Section n={7} title="Limitations">
          <ul className="list-disc space-y-2 pl-5">
            {(summary?.limitations?.length ? summary.limitations : ['Limitations could not be loaded from the results files.']).map((l) => <li key={l}>{l}</li>)}
            <li>The app does not identify whether a region is petrol, diesel or another product, and reports no concentration, thickness or volume.</li>
            <li>Scenes unlike the training imagery (for example indoor camera views) can produce meaningless predictions.</li>
          </ul>
        </Section>

        <Section n={8} title="Future direction">
          <p>Computer vision answers where visible contamination is; it cannot say what it is. Planned future work adds sensor-based classification as a separate, complementary signal. This is not part of the current application.</p>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="border border-accent/40 bg-accent-soft p-4"><div className="label text-accent">Camera</div><div className="mt-1 text-[15px] font-semibold text-ink">Where is visible contamination?</div><p className="mt-1 text-sm text-ink-2">Implemented: segmentation of visible petroleum-like regions.</p></div>
            <div className="border border-dashed border-line-strong p-4"><div className="label">Sensors</div><div className="mt-1 text-[15px] font-semibold text-ink">What class or type do sensor measurements indicate?</div><p className="mt-1 text-sm text-ink-2">Future work. No sensor data or sensor predictions exist in this application.</p></div>
          </div>
        </Section>
      </div>
    </>
  )
}
