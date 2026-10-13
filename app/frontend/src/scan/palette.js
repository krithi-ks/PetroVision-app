// Instance colours for the scanning viewport (distinct, restrained, readable on video).
export const HUD_PALETTE = ['#6fe3ff', '#7dffc4', '#ffc857', '#ff8fd0', '#b4a4ff', '#ff9a5c', '#9dd6ff', '#d6ff7a']
export const colorOf = (index) => HUD_PALETTE[(Math.max(1, index) - 1) % HUD_PALETTE.length]

export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export const STATUS_TEXT = {
  IDLE: 'IDLE', CAMERA_READY: 'CAMERA READY', SCANNING: 'SCANNING', PROCESSING: 'PROCESSING', DETECTED: 'DETECTED',
  NO_DETECTION: 'NO DETECTION', COMPLETE: 'COMPLETE', ERROR: 'ERROR',
}

export const STATUS_COLOR = {
  IDLE: '#9fb4c7', CAMERA_READY: '#9bd8ff', SCANNING: '#6fe3ff', PROCESSING: '#6fe3ff', DETECTED: '#7dffc4',
  NO_DETECTION: '#b9c8d6', COMPLETE: '#7dffc4', ERROR: '#ff8f7a',
}

/** "OIL REGION", "PETROLEUM REGION", "PETROLEUM-LIKE REGION" ... from the model's real class name. */
export function regionLabel(inst) {
  const name = (inst.class_name || 'petroleum-like').toUpperCase()
  return /REGION$/.test(name) ? name : `${name} REGION`
}
