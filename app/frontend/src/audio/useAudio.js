import { useSyncExternalStore } from 'react'
import { audio } from './AudioManager'

/** Reactive view of the audio preferences: { enabled, volume, unlocked }. */
export function useAudio() {
  return useSyncExternalStore(audio.subscribe, audio.getSnapshot, audio.getSnapshot)
}
