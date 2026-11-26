export const DARK_SURFACE: string
export const DARK_RAISED: string
export function parseHex(value: string): { r: number; g: number; b: number; a: string } | null
export function luminance(value: string): number
export function contrast(a: string, b: string): number
export function darkColor(value: string, role: 'fg' | 'bg' | 'bd'): string
export function darkTwins(css: string, options?: { prefix?: string; skip?: RegExp | null }): string
