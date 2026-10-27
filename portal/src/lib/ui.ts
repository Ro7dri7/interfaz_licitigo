export const heading = 'font-serif font-medium leading-[1.15] tracking-[-0.01em]'
export const container = 'w-full max-w-[1440px] mx-auto px-8 max-[720px]:px-4'
export const card = 'bg-white border border-line rounded-lg shadow-card'
export const btn =
  'inline-flex items-center justify-center gap-2 rounded-md border font-semibold text-[14px] px-[18px] py-[11px] whitespace-nowrap transition-[background,border-color,color,box-shadow] duration-150 disabled:opacity-50 disabled:cursor-not-allowed'
// El color del borde va en cada variante: dos utilidades de border-color en la misma clase se pisan entre sí
export const btnPrimary = `${btn} border-transparent bg-primary text-white hover:bg-primary-dark`
export const btnSecondary = `${btn} bg-white text-ink border-line-strong hover:border-primary hover:text-primary`
export const btnGhost = `${btn} border-transparent bg-transparent text-muted hover:bg-primary-soft hover:text-primary`
export const pill =
  'inline-flex items-center gap-1.5 rounded-full text-[12px] font-semibold px-2.5 py-1 leading-[1.4] whitespace-nowrap'
export const pillNeutral = `${pill} bg-[#f1f3f8] text-muted border border-line`
export const pillPrimary = `${pill} bg-primary-soft text-primary border border-primary-line`
export const pillSuccess = `${pill} bg-success-soft text-success border border-success-line`
export const pillWarning = `${pill} bg-warning-soft text-[#92660a] border border-warning-line`
export const pillDanger = `${pill} bg-danger-soft text-danger border border-danger-line`
export const dot = 'inline-block size-[7px] rounded-full shrink-0'
export const mono = 'font-mono tracking-[0.02em]'

// Diálogos y panel lateral
export const overlay = 'fixed inset-0 z-50 flex items-center justify-center bg-[rgba(15,23,42,0.45)] p-4'
export const dialog = `${card} w-full max-w-[480px] p-6 shadow-panel! [&_h3]:text-[22px]`
export const dialogLic = 'mt-2.5 mb-3.5 text-[13.5px] leading-[1.45] text-muted'
export const dialogLista = 'list-disc pl-5 text-[14px] leading-[1.6]'
export const dialogCupo = 'mt-3.5 text-[13.5px] text-muted'
export const dialogError = 'my-3 rounded-sm bg-danger-soft px-3 py-2.5 text-[13.5px] text-danger'
export const dialogAcciones = 'mt-5 flex justify-end gap-2.5'
export const spinner = 'size-4 shrink-0 animate-girar rounded-full border-2 border-primary-line border-t-primary'

// Formularios
export const fieldLabel = 'mb-2 block text-[13px] font-semibold'
export const fieldInput =
  'w-full rounded-md border border-line-strong px-3.5 py-3 text-[14px] focus:border-primary focus:shadow-[0_0_0_3px_var(--color-primary-soft)] focus:outline-none'

/** Clase del pill según el veredicto de la IA: Postular (verde), con reservas (ámbar), No recomendado (rojo). */
export function pillVeredicto(v: string | null | undefined): string {
  const n = (v || '').toLowerCase()
  if (n.startsWith('postular con')) return pillWarning
  if (n.startsWith('postular')) return pillSuccess
  if (n.startsWith('no')) return pillDanger
  return pillNeutral
}
