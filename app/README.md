# PetroVision web app

A real research + demonstration application for the PetroVision computer-vision work.
It runs the project's **trained models** (no mock predictions) and shows the project's **saved experiment results**.

```
app/
├── backend/    FastAPI + PyTorch  (inference, post-processing, results API)
└── frontend/   React + Vite + Tailwind + React Three Fiber
```

## Training assets and inference sources

| Need | Source |
|---|---|
| U-Net architecture | `app/backend/petrovision_api/inference/unet.py` (matches the saved CV-UNET-001 checkpoint) |
| Preprocessing | mirrors `src/vision/lados_dataset.py`: RGB → bilinear 256×256 → `/255`, no ImageNet normalisation |
| Checkpoints | `models/cv_unet_001_best.pt`, `cv_segformer_001_best.pt`, `cv_yolo_001_best.pt` (+ DeepLab / Mask2Former / YOLO26, see below) |
| DeepLabV3+ / SegFormer / Mask2Former / YOLO definitions | rebuilt exactly as in the fine-tuning notebooks (`smp.DeepLabV3Plus('resnet50')`, `SegformerForSemanticSegmentation` B0 config with `num_labels=1`, `Mask2FormerForUniversalSegmentation` with `num_labels=2`, Ultralytics `YOLO`) |
| Decision rules | sigmoid ≥ 0.5; Mask2Former class id 1; YOLO `imgsz=640, conf=0.25, retina_masks=True`, instances merged |
| Research numbers | `results/cv_final_model_comparison.csv`, `cv_inference_benchmark.json`, `cv_master_summary.json`, `*/training_history.json`, `cv_yolo_001/results.csv` |

Existing files in `src/`, `models/`, `results/`, and `notebooks/` are **not modified**.

## Quick start

```bash
# 1. Python deps (the repo-root requirements.txt is UTF-16 and unreadable by pip, so use this one)
pip install -r app/backend/requirements.txt

# 2. Frontend build (needs Node 18+). A pre-built copy may already be in app/frontend/dist
cd app/frontend && npm install && npm run build && cd ../..

# 3. Run (serves API + website on http://127.0.0.1:8000)
python app/backend/run.py
```

Windows: `app\start.ps1`. Linux/macOS: `app/start.sh`.

**Development with hot reload:** terminal 1 `python app/backend/run.py`, terminal 2 `cd app/frontend && npm run dev` → http://localhost:5173 (the Vite dev server proxies `/api`).

> Webcam access requires `http://localhost` / `127.0.0.1` or HTTPS.

## Authentication and access management

The app requires a signed-in account. Before the first sign-in, copy `app/backend/.env.example` to `app/backend/.env` and set `PETROVISION_ADMIN_EMAIL` and `PETROVISION_ADMIN_PASSWORD` to the first administrator's email and a unique password of at least 12 characters. The first account is created once; changing those variables later does not reset an existing account. New users can request an account from the registration page; an administrator must approve each request before the account can sign in.

The administrator can open **Access** in the app header to review registration requests, create user or admin accounts, revoke access, and restore accounts. New accounts created by an administrator use an administrator-chosen initial password, which should be shared privately. Revoking an account also ends its active sessions. Accounts, registration requests and sessions are stored in `app/backend/data/users.sqlite3` by default; set `PETROVISION_AUTH_DB` to move the database.

The **Dashboard** page summarizes saved analyses and shows each selected source image, predicted regions, a source-image overlay, coverage trends, model usage, inference speed, timing, perimeter charts and per-region measurements. Upload analyses and saved live-scan snapshots can be opened there from their respective pages. It uses saved model outputs; visualizations are not independent environmental measurements or ground-truth scores.

For production, serve the site and API over HTTPS and set `PETROVISION_AUTH_COOKIE_SECURE=true`. Back up and restrict filesystem access to the account database, and never commit the backend `.env` file.

## YOLO26n-Seg (De Kerf) slot

When no YOLO26 checkpoint is installed, the app shows **YOLO26n-Seg as unavailable**. Put the trained checkpoint at `models/cv_yolo26_001_best.pt` (any file matching `cv_yolo26*_best.pt` / `*yolo26*best.pt` anywhere under `models/` is found automatically) or set `PETROVISION_CKPT_YOLO26`. The inference image size is read from the checkpoint. YOLO26 requires Ultralytics 8.4 or newer. If the model has several classes, choose which count as petroleum-like with `PETROVISION_YOLO26_CLASSES=oil` (default: all instances). The checkpoint was trained on De Kerf drone imagery, so results may vary on other scene types.
Live Scan selects YOLO26 by default as soon as it is available.

## Where did the app look for my models?

The backend prints a table to its **terminal** at start-up (each model, its status and the exact path searched). The web interface deliberately shows only "Available / Unavailable".

## YOLO26n-Seg (De Kerf experiment)

`models/cv_yolo26_dekerf_best.pt` is loaded like the other models (class `oil`; image size is read from the checkpoint). Its results are read from your saved files, never typed in: the test-split metrics, instance counts and speed come from the saved output of `notebooks/computer-vision/PetroVision_YOLO26_DeKerf.ipynb` (or from `results/cv_yolo26*/test_metrics_native.json` if you add one), and the training curves/settings from `results/cv_yolo26_dekerf/**/results.csv` and `args.yaml`.

The De Kerf annotations are semantic oil masks; oil **instances were derived from connected oil regions**. The app says so, and shows this experiment separately from the LADOS comparison (different dataset, task, annotation and metrics). If the model also predicted non-oil classes you could restrict them with `PETROVISION_YOLO26_CLASSES=oil`.

## Where the app looks for models

The server prints, at start-up, every model with its status and the exact path it looked for (console only; the interface never shows paths). Use this first if a model shows *Unavailable*.

## Checkpoints that are not in Git

`.gitignore` excludes `cv_deeplab_001_best.pt` (~306 MB) and `cv_mask2former_001_best.pt` (~787 MB). Without them the app **still works**; those two models are shown as *Checkpoint missing* and cannot be selected. To enable them copy the files from Google Drive into `models/`, or point to wherever they live:

```bash
cp app/backend/.env.example app/backend/.env
# then edit, e.g.
PETROVISION_CKPT_DEEPLAB=D:/Drive/PetroVision/models/cv_deeplab_001_best.pt
PETROVISION_CKPT_MASK2FORMER=D:/Drive/PetroVision/models/cv_mask2former_001_best.pt
```

Mask2Former also needs its small config + image-processor files. They are downloaded from Hugging Face (`facebook/mask2former-swin-small-ade-semantic`) on first use and cached. For offline use set `PETROVISION_MASK2FORMER_SOURCE` to a local folder with `config.json` and `preprocessor_config.json`.

GPU is used automatically when CUDA is available (`PETROVISION_DEVICE=cpu|cuda|auto`). If CUDA is requested but unavailable the app falls back to CPU and says so in `/api/health`.

## Live Scan

`/live` is a dedicated scanning workspace: camera feed → real-time segmentation → contours, instance brackets and readouts → an image-space 3D panel built from the predicted mask. Everything on it comes from real inference responses; nothing is simulated.

* **Instance models** (YOLO11n-Seg, YOLO26n-Seg) report per-instance confidence, area, perimeter, centroid and contour. **Semantic models** (U-Net, SegFormer, …) report connected *regions* of the mask, with no confidence.
* State machine: `IDLE → SCANNING → PROCESSING → DETECTED / NO DETECTION → COMPLETE`, plus `ERROR`. A detection is confirmed after 2 consecutive frames and cleared after 3, so sounds fire only on a meaningful change (3 s cooldown), never per frame.
* **Audio** is a central `AudioManager` (`src/lib/audio.js`): local WAV assets in `public/audio/`, initialised only after a user gesture, with on/off and volume. The assets are original, synthesised by `python app/frontend/scripts/generate_sounds.py` (re-run it to regenerate or tune them). Sound is interface feedback only.
* The 3D panel is an *image-space* visualisation: height is derived from the predicted mask's shape, not depth, thickness or volume.

## YOLO26n-Seg (De Kerf)

The backend registers `YOLO26n-Seg` and loads it automatically when its checkpoint exists — `models/cv_yolo26_001_best.pt` (any `*yolo26*best.pt` under `models/` is also found), or set `PETROVISION_CKPT_YOLO26`. Its image size is read from the checkpoint. If the model has classes other than the contamination class, set `PETROVISION_YOLO26_CLASSES=oil` (comma-separated class names) so only those count as petroleum-like. Until the checkpoint is present the model shows as *Unavailable*. Its live predictions appear in analysis history and the Dashboard when an analysis or live-scan snapshot is saved.

## API

`GET /api/status` · `GET /api/health` (developer detail) · `GET /api/models` · `GET /api/models/{id}` · `POST /api/models/{id}/load` · `POST /api/models/{id}/unload`
`POST /api/infer/image` (multipart `file` + `model_id`) · `POST /api/infer/frame?model_id=…` (raw JPEG body)
`GET /api/results/comparison|benchmark|summary` · `GET /api/results/history/{id}` — interactive docs at `/docs`.

The interface never shows file paths, versions or developer messages; where each checkpoint was looked for is printed in the server console at startup.

Models are loaded once, cached (LRU, `PETROVISION_MAX_LOADED_MODELS`, default 3) and never reloaded per request or webcam frame. Errors are JSON: `{"error": {"code", "message", "hint"}}`.

## Tests

```bash
cd app/backend  && python -m pytest tests -q     # 43 tests: real checkpoints (incl. YOLO26), real inference, instances, history, De Kerf results vs the notebook, API contract
cd app/frontend && npm test                      # 23 tests: UI behaviour, audio manager, scan helpers, mask→surface math
```

## Scientific guard-rails built into the app

* Output is **visible petroleum-like** segmentation (Oil + Emulsion + Sheen). No petroleum-type, concentration, thickness or volume claims anywhere.
* Coverage %, pixel area, bounding box, centroid, perimeter are **image-space** values computed from the predicted mask.
* Live/uploaded images have no ground truth → **no IoU/Dice/precision/recall/confidence** is displayed for them. API responses contain none either (asserted in tests).
* Research results (saved experiments) and live demo output are visually separated with badges.
* The 3D view is labelled an image-space visualisation; height = distance from the region edge, *not* depth/thickness/volume.
* No model is called "best"; the UI only states "highest measured value in this evaluation", computed from the CSV.
* Sensors are shown only as *future integration*; there are no sensor values.
* Sounds are interface feedback only (on/off + volume in the header and on Live Scan), never tied to results. The cues are local WAV files in `app/frontend/public/audio/`, synthesised by `app/frontend/scripts/generate_sounds.py` (original, royalty-free); re-run it to regenerate them. Audio starts only after the first user interaction (browser autoplay rules).
* Live Scan detection sound plays once per *change* of detection state (debounced over several frames), never per frame.

## Known notes

* `results/cv_efficiency_comparison.csv` differs from `cv_final_model_comparison.csv` / `cv_inference_benchmark.json` (e.g. DeepLab 26.735 M vs 26.678 M params; different latencies — an older benchmark). The app uses the final comparison + benchmark files, which match the master summary.
* Live latency on your machine will differ from the Tesla T4 benchmark in `results/`.
