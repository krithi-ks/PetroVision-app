"""Synthesise PetroVision's Live Scan sound assets (original, royalty-free).

    python app/frontend/scripts/generate_sounds.py

Writes 16-bit mono 44.1 kHz WAV files to app/frontend/public/audio/. Everything is generated from
oscillators, FM, filtered noise and reverb - no samples from any film, game or library.
The scan loop is built from components that are periodic in its length and is reverberated with a
circular convolution, so it loops without a click.
"""
from pathlib import Path

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt

SR = 44100
OUT = Path(__file__).resolve().parents[1] / "public" / "audio"
rng = np.random.default_rng(7)


def t_(d):
    return np.arange(int(SR * d)) / SR


def env(n, a=0.01, d=0.2, s=0.0, r=0.1):
    """Exponential-ish ADSR; s is sustain level; segments are given in seconds."""
    a, d, r = int(a * SR), int(d * SR), int(r * SR)
    e = np.zeros(n)
    a = min(a, n)
    e[:a] = np.linspace(0, 1, a, endpoint=False) ** 1.5 if a else 1
    rest = n - a
    dd = min(d, rest)
    if dd > 0:
        e[a:a + dd] = s + (1 - s) * np.exp(-np.linspace(0, 6, dd))
    if rest - dd > 0:
        e[a + dd:] = s
    r = min(r, n)
    if r:
        e[-r:] *= np.linspace(1, 0, r) ** 2
    return e


def sine(f, d, phase=0.0):
    return np.sin(2 * np.pi * f * t_(d) + phase)


def chirp(f0, f1, d, curve=1.0):
    t = t_(d)
    k = (t / d) ** curve
    f = f0 + (f1 - f0) * k
    return np.sin(2 * np.pi * np.cumsum(f) / SR)


def fm(fc, fm_, idx, d, idx_env=None):
    t = t_(d)
    i = idx * (idx_env if idx_env is not None else 1)
    return np.sin(2 * np.pi * fc * t + i * np.sin(2 * np.pi * fm_ * t))


def lowpass(x, fc, order=2):
    return sosfilt(butter(order, fc, "low", fs=SR, output="sos"), x)


def bandpass(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo, hi], "band", fs=SR, output="sos"), x)


def place(canvas, x, at):
    i = int(at * SR)
    n = min(len(x), len(canvas) - i)
    if n > 0:
        canvas[i:i + n] += x[:n]


def reverb_ir(rt=1.2, bright=3500, seed=1):
    r = np.random.default_rng(seed)
    n = int(SR * rt)
    ir = r.standard_normal(n) * np.exp(-np.linspace(0, 7, n))
    ir = lowpass(ir, bright)
    ir[: int(0.004 * SR)] *= np.linspace(0, 1, int(0.004 * SR))
    return ir / np.sqrt(np.sum(ir ** 2))


def reverb(x, wet=0.25, rt=1.2, bright=3500, tail=True):
    ir = reverb_ir(rt, bright)
    n = len(x) + (len(ir) if tail else 0)
    X = np.fft.rfft(x, n)
    Y = np.fft.rfft(ir, n)
    wetsig = np.fft.irfft(X * Y, n)
    out = np.zeros(n)
    out[: len(x)] += x * (1 - wet * 0.5)
    out += wetsig * wet
    return out


def circular_reverb(x, wet=0.25, rt=0.9, bright=3000):
    ir = reverb_ir(rt, bright)[: len(x)]
    y = np.fft.irfft(np.fft.rfft(x) * np.fft.rfft(ir, len(x)), len(x))
    return x * (1 - wet * 0.5) + y * wet


def trim_tail(x, floor_db=-60.0):
    """Drop the inaudible end of a reverb tail."""
    thr = np.max(np.abs(x)) * 10 ** (floor_db / 20)
    idx = np.nonzero(np.abs(x) > thr)[0]
    return x[: idx[-1] + 1] if len(idx) else x


def finish(x, peak_db=-3.0, fade_ms=8):
    x = trim_tail(x)
    f_out = int(0.06 * SR)
    x[-f_out:] *= np.linspace(1, 0, f_out)
    x = x - np.mean(x)
    x = x / (np.max(np.abs(x)) + 1e-9) * 10 ** (peak_db / 20)
    f = int(fade_ms / 1000 * SR)
    x[:f] *= np.linspace(0, 1, f)
    x[-f:] *= np.linspace(1, 0, f)
    return x


def save(name, x, fade=True):
    if fade:
        x = finish(x)
    else:
        x = x - np.mean(x)
        x = x / (np.max(np.abs(x)) + 1e-9) * 10 ** (-3.0 / 20)
    wavfile.write(OUT / f"{name}.wav", SR, (np.clip(x, -1, 1) * 32767).astype(np.int16))
    print(f"{name:14s} {len(x) / SR:5.2f}s")


# ------------------------------------------------------------------ camera_start: system activation
def camera_start():
    d = 1.5
    n = int(d * SR)
    x = np.zeros(n)
    sub = sine(55, d) * env(n, a=0.5, d=0.6, s=0.35, r=0.5)
    pad = (chirp(196, 392, d, 1.6) + 0.5 * chirp(293, 587, d, 1.6)) * env(n, a=0.55, d=0.5, s=0.4, r=0.45)
    shimmer = bandpass(rng.standard_normal(n), 2500, 7000) * env(n, a=0.9, d=0.3, s=0.2, r=0.3) * 0.12
    x += 0.5 * sub + 0.35 * lowpass(pad, 2600) + shimmer
    for f, at in ((880, 0.78), (1320, 0.9)):
        m = int(0.38 * SR)
        place(x, 0.22 * sine(f, 0.38) * env(m, a=0.003, d=0.3, r=0.05), at)
    return reverb(x, wet=0.32, rt=1.4)


# ------------------------------------------------------------------ scan_start: short robotic activation
def scan_start():
    d = 0.7
    n = int(d * SR)
    x = np.zeros(n)
    ring = chirp(300, 1500, 0.34, 1.8) * sine(87, 0.34)            # ring-modulated rising sweep
    place(x, 0.55 * ring * env(len(ring), a=0.01, d=0.28, r=0.05), 0.0)
    for f, at, g in ((1046, 0.30, 0.5), (1568, 0.38, 0.55)):
        m = int(0.22 * SR)
        place(x, g * fm(f, f * 2, 1.4, 0.22, np.linspace(1, 0, m)) * env(m, a=0.002, d=0.18, r=0.03), at)
    place(x, 0.4 * sine(70, 0.16) * env(int(0.16 * SR), a=0.004, d=0.12, r=0.03), 0.02)
    return reverb(lowpass(x, 7000), wet=0.22, rt=0.7)


# ------------------------------------------------------------------ scan_loop: quiet scanning bed (seamless)
def scan_loop():
    d = 4.0
    n = int(d * SR)
    t = t_(d)
    bed = (sine(110, d) * 0.5 + sine(165, d, 0.8) * 0.25 + sine(220, d, 1.7) * 0.12)
    bed *= 0.75 + 0.25 * np.sin(2 * np.pi * 0.5 * t)                  # 2 slow swells per loop
    x = 0.55 * bed
    for k in range(2):                                                  # two scan sweeps, silent at both ends
        m = int(1.7 * SR)
        sw = chirp(500, 1700, 1.7, 1.2) * np.sin(np.linspace(0, np.pi, m)) ** 2
        place(x, 0.2 * lowpass(sw, 3500), 0.15 + k * 2.0)
    tick = sine(2400, 0.014) * env(int(0.014 * SR), a=0.001, d=0.012, r=0.002)
    for k in range(32):                                                 # soft 8 Hz instrument ticks
        place(x, (0.07 if k % 4 else 0.12) * tick, k * 0.125 + 0.01)
    air = bandpass(rng.standard_normal(n), 3000, 8000) * 0.015
    air *= 0.6 + 0.4 * np.sin(2 * np.pi * 0.25 * t)
    x = x + air
    return circular_reverb(x, wet=0.2, rt=0.8)


# ------------------------------------------------------------------ detection: target detected
def detection():
    d = 1.1
    n = int(d * SR)
    x = np.zeros(n)
    place(x, 0.5 * sine(82, 0.2) * env(int(0.2 * SR), a=0.003, d=0.16, r=0.04), 0.0)         # low lock thump
    for f, at, g in ((1318.5, 0.0, 0.6), (1975.5, 0.11, 0.7), (2637, 0.23, 0.45)):
        m = int(0.5 * SR)
        glass = fm(f, f * 1.5, 1.8, 0.5, np.exp(-np.linspace(0, 6, m)))
        place(x, g * glass * env(m, a=0.002, d=0.42, r=0.06), at)
    place(x, 0.1 * bandpass(rng.standard_normal(int(0.12 * SR)), 4000, 9000) * np.linspace(1, 0, int(0.12 * SR)) ** 2, 0.0)
    return reverb(x, wet=0.35, rt=1.1, bright=5000)


# ------------------------------------------------------------------ spatial_3d: 3D projection activation
def spatial_3d():
    d = 1.2
    n = int(d * SR)
    t = t_(d)
    vib = 1 + 0.004 * np.sin(2 * np.pi * 5 * t)
    a = chirp(220, 660, d, 1.4) * vib
    b = chirp(222.5, 668, d, 1.4)
    sweep = (a + b) * 0.5 * env(n, a=0.5, d=0.3, s=0.5, r=0.4)
    air = bandpass(rng.standard_normal(n), 900, 4000) * np.sin(np.linspace(0, np.pi, n)) ** 2 * 0.1
    x = lowpass(sweep, 3000) * 0.6 + air
    for f, at in ((1760, 0.62), (2349, 0.74), (2960, 0.86)):
        m = int(0.3 * SR)
        place(x, 0.12 * sine(f, 0.3) * env(m, a=0.004, d=0.26, r=0.03), at)
    return reverb(x, wet=0.38, rt=1.5, bright=4500)


# ------------------------------------------------------------------ complete: clean confirmation
def complete():
    d = 1.4
    n = int(d * SR)
    x = np.zeros(n)
    for f, at, g in ((523.25, 0.0, 0.5), (783.99, 0.07, 0.45), (1046.5, 0.14, 0.4)):
        m = int(1.1 * SR)
        tone = sine(f, 1.1) + 0.25 * sine(2 * f, 1.1) + 0.08 * sine(3 * f, 1.1)
        place(x, g * tone * env(m, a=0.006, d=0.9, s=0.0, r=0.2), at)
    place(x, 0.15 * sine(130.8, 0.5) * env(int(0.5 * SR), a=0.01, d=0.4, r=0.1), 0.0)
    return reverb(lowpass(x, 6500), wet=0.3, rt=1.3)


# ------------------------------------------------------------------ error: restrained warning
def error():
    d = 0.8
    n = int(d * SR)
    x = np.zeros(n)
    for f, at in ((392.0, 0.0), (311.1, 0.2)):
        m = int(0.4 * SR)
        tone = sine(f, 0.4) + 0.3 * sine(f * 2.003, 0.4) + 0.12 * sine(f * 3, 0.4)
        place(x, 0.6 * lowpass(tone, 1800) * env(m, a=0.01, d=0.3, s=0.1, r=0.1), at)
    place(x, 0.3 * sine(98, 0.45) * env(int(0.45 * SR), a=0.01, d=0.3, r=0.1), 0.0)
    return reverb(x, wet=0.18, rt=0.6, bright=2200)


# ============================================================================================
# Assistant-style interface palette (original): glass plucks, airy holographic sweeps, soft data chatter.
# ============================================================================================
def pluck(f, d=0.35, idx=2.2, ratio=3.5, g=1.0):
    """Glassy FM pluck: bright attack that relaxes into a clean sine - the 'touch the hologram' timbre."""
    n = int(d * SR)
    e = np.exp(-np.linspace(0, 7, n))
    t = t_(d)
    tone = np.sin(2 * np.pi * f * t + idx * e * np.sin(2 * np.pi * f * ratio * t))
    tone += 0.3 * np.sin(2 * np.pi * f * 2 * t) * np.exp(-np.linspace(0, 10, n))
    return g * tone * env(n, a=0.002, d=d * 0.8, r=0.02)


def air_sweep(d, f0, f1, level=0.5, bands=5):
    """Holographic whoosh: noise through several band-pass filters that are cross-faded over time."""
    n = int(d * SR)
    out = np.zeros(n)
    centers = np.geomspace(f0, f1, bands)
    x = np.linspace(0, 1, n)
    for i, fc in enumerate(centers):
        band = bandpass(rng.standard_normal(n), max(80, fc * 0.7), min(SR / 2 - 100, fc * 1.4), 2)
        pos = i / (bands - 1)
        out += band * np.exp(-((x - pos) ** 2) / (2 * 0.16 ** 2))
    return level * out * np.sin(np.pi * x) ** 1.5


def chatter(d, n_blips, lo=1500, hi=4200, seed=3, level=0.5):
    """Tiny data-stream blips at pseudo-random pitches (seeded, so the asset is reproducible)."""
    r = np.random.default_rng(seed)
    n = int(d * SR)
    out = np.zeros(n)
    scale = np.array([1, 9 / 8, 5 / 4, 3 / 2, 5 / 3, 2])                      # consonant steps keep it soft, not noisy
    for _ in range(n_blips):
        f = lo * scale[r.integers(0, len(scale))] * (2 ** r.integers(0, 2))
        f = min(f, hi)
        m = int(r.uniform(0.014, 0.03) * SR)
        place(out, r.uniform(0.25, 1.0) * sine(f, m / SR) * env(m, a=0.001, d=m / SR * 0.9, r=0.002), r.uniform(0, d - 0.05))
    return level * out


# ---- UI interaction cues (kept very short and quiet) ---------------------------------------
def ui_hover():
    return reverb(pluck(3136, 0.06, idx=1.0, ratio=2.0, g=0.5), wet=0.12, rt=0.25, bright=6000)


def ui_click():
    x = pluck(1760, 0.12, idx=1.6, ratio=3.0, g=0.8)
    x2 = np.zeros(len(x))
    place(x2, pluck(2637, 0.1, idx=1.2, ratio=2.0, g=0.5), 0.022)
    tick = bandpass(rng.standard_normal(int(0.012 * SR)), 3500, 9000) * np.linspace(1, 0, int(0.012 * SR)) ** 2 * 0.25
    place(x2, tick, 0.0)
    return reverb(x + x2, wet=0.18, rt=0.35, bright=6500)


def ui_toggle_on():
    x = np.zeros(int(0.5 * SR))
    place(x, pluck(1175, 0.18, g=0.7), 0.0)
    place(x, pluck(1760, 0.22, g=0.8), 0.07)
    place(x, 0.12 * air_sweep(0.2, 900, 4200, 1.0, 3), 0.0)
    return reverb(x, wet=0.25, rt=0.5, bright=6000)


def ui_toggle_off():
    x = np.zeros(int(0.5 * SR))
    place(x, pluck(1568, 0.16, g=0.7), 0.0)
    place(x, pluck(1047, 0.22, g=0.7), 0.07)
    place(x, 0.1 * air_sweep(0.2, 4000, 800, 1.0, 3), 0.0)
    return reverb(x, wet=0.25, rt=0.5, bright=5000)


def ui_select():
    """Instance 'lock': quick rising three-note glass arpeggio."""
    x = np.zeros(int(0.7 * SR))
    for k, f in enumerate((1568, 2093, 2794)):
        place(x, pluck(f, 0.26, idx=1.8, g=0.7 - 0.08 * k), 0.045 * k)
    place(x, 0.5 * sine(98, 0.1) * env(int(0.1 * SR), a=0.004, d=0.08, r=0.02), 0.0)
    return reverb(x, wet=0.3, rt=0.7, bright=6000)


def ui_expand():
    x = np.zeros(int(0.6 * SR))
    place(x, air_sweep(0.38, 500, 3600, 0.9, 4), 0.0)
    place(x, pluck(1319, 0.3, g=0.6), 0.2)
    return reverb(lowpass(x, 8000), wet=0.25, rt=0.6)


def ui_collapse():
    x = np.zeros(int(0.5 * SR))
    place(x, air_sweep(0.3, 3400, 500, 0.8, 4), 0.0)
    place(x, pluck(880, 0.22, g=0.5), 0.12)
    return reverb(lowpass(x, 7000), wet=0.22, rt=0.5)


def data_stream():
    """Results appearing: a short burst of soft data chatter ending on a glass tap."""
    d = 0.75
    x = np.zeros(int(d * SR) + int(0.3 * SR))
    place(x, chatter(d, 14, seed=11, level=0.45), 0.0)
    place(x, pluck(2349, 0.3, idx=1.4, g=0.55), d - 0.12)
    return reverb(x, wet=0.28, rt=0.8, bright=6500)


# ---- system cues -------------------------------------------------------------------------------
def system_ready():
    d = 2.2
    n = int(d * SR)
    x = np.zeros(n)
    place(x, 0.5 * sine(55, 1.4) * env(int(1.4 * SR), a=0.35, d=0.7, s=0.2, r=0.5), 0.0)
    place(x, 0.5 * air_sweep(1.0, 300, 5200, 1.0, 5), 0.0)
    for k, f in enumerate((523.25, 659.25, 783.99, 1046.5, 1318.5)):       # ascending glass chord (C major add9)
        place(x, pluck(f, 1.2, idx=1.0, ratio=2.0, g=0.5), 0.45 + 0.08 * k)
    return reverb(x, wet=0.4, rt=1.7, bright=5500)


def camera_stop():
    d = 1.4
    x = np.zeros(int(d * SR))
    place(x, 0.7 * chirp(880, 196, 0.9, 1.4) * env(int(0.9 * SR), a=0.02, d=0.8, r=0.2), 0.0)
    place(x, 0.6 * air_sweep(0.8, 4200, 300, 1.0, 5), 0.0)
    place(x, 0.4 * sine(61, 0.5) * env(int(0.5 * SR), a=0.02, d=0.4, r=0.1), 0.05)
    return reverb(lowpass(x, 6000), wet=0.3, rt=1.0)


def scan_loop_v2():
    """Richer, still quiet, seamless scanning bed: hum + two sweeps + rotating pings + sparse data chatter."""
    d = 4.0
    n = int(d * SR)
    t = t_(d)
    bed = sine(110, d) * 0.45 + sine(165, d, 0.8) * 0.22 + sine(220, d, 1.7) * 0.10 + sine(55, d) * 0.25
    bed *= 0.72 + 0.28 * np.sin(2 * np.pi * 0.5 * t)
    x = 0.5 * bed
    for k in range(2):
        m = int(1.8 * SR)
        sw = chirp(520, 2100, 1.8, 1.25) * np.sin(np.linspace(0, np.pi, m)) ** 2
        place(x, 0.17 * lowpass(sw, 4200), 0.1 + k * 2.0)
    for k in range(8):                                                       # slow 'radar' ping once every half second
        place(x, 0.09 * pluck(1760 if k % 2 else 2349, 0.3, idx=1.0, g=1.0), k * 0.5 + 0.05)
    blips = chatter(d, 18, lo=1800, hi=4400, seed=5, level=0.16)
    blips[-int(0.06 * SR):] = 0
    x = x + blips
    air = bandpass(rng.standard_normal(n), 2500, 8000) * 0.014 * (0.6 + 0.4 * np.sin(2 * np.pi * 0.25 * t))
    return circular_reverb(x + air, wet=0.22, rt=0.8)


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    save("camera_start", camera_start())
    save("scan_start", scan_start())
    save("scan_loop", scan_loop_v2(), fade=False)
    save("detection", detection())
    save("spatial_3d", spatial_3d())
    save("complete", complete())
    save("error", error())
    save("system_ready", system_ready())
    save("camera_stop", camera_stop())
    save("ui_hover", ui_hover())
    save("ui_click", ui_click())
    save("ui_toggle_on", ui_toggle_on())
    save("ui_toggle_off", ui_toggle_off())
    save("ui_select", ui_select())
    save("ui_expand", ui_expand())
    save("ui_collapse", ui_collapse())
    save("data_stream", data_stream())
