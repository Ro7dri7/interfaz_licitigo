export interface ReaderState { speaking: boolean; paused: boolean }
export interface VoiceLike { lang: string; name?: string; localService?: boolean }
export interface Reader {
  readonly supported: boolean
  readonly state: ReaderState
  readonly voiceName: string
  speak(text: string, rate?: number): boolean
  pause(): void
  resume(): void
  stop(): void
  dispose(): void
}
export function isSpeechSupported(win?: unknown): boolean
export function pickSpanishVoice<T extends VoiceLike>(voices: readonly T[] | null | undefined): T | null
export function chunkText(text: string, max?: number): string[]
export function extractReadableText(root: Element | null): string
export function describeElement(el: Element | null): string
export function createReader(options?: { win?: Window; onChange?: (state: ReaderState) => void }): Reader
