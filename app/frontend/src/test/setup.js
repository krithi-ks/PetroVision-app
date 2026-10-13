// vitest setup (jsdom) - stub browser APIs that jsdom does not implement
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
if (!window.matchMedia) window.matchMedia = (q) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })
