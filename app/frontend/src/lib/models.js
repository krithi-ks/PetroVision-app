// Visual identity per model (colour only - never implies scientific confidence).
export const MODEL_ORDER = ['unet', 'deeplab', 'segformer', 'mask2former', 'yolo', 'yolo26']

export const MODEL_COLORS = {
  unet: '#38bdf8',
  deeplab: '#a78bfa',
  segformer: '#34d399',
  mask2former: '#fbbf24',
  yolo: '#fb7185',
  yolo26: '#0d9488',
}

export const colorFor = (id) => MODEL_COLORS[id] || '#94a3b8'
