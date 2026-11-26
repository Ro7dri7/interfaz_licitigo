export const FOCUSABLE: string
export function ownsKeys(el: Element | null): boolean
export function navItems(container: Element, current: Element): { items: (HTMLElement | null)[]; index: number }
export function handleKeydown(event: KeyboardEvent): void
export function installKeyboardNav(doc?: Document): () => void
export function trapFocus(event: KeyboardEvent | { key: string; shiftKey: boolean; preventDefault(): void }, box: HTMLElement): void
