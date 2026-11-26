const REGLAS = [
  { id: 'largo', texto: 'Mínimo 8 caracteres', ok: (v: string) => v.length >= 8 },
  { id: 'mayus', texto: 'Una mayúscula (A-Z)', ok: (v: string) => /[A-Z]/.test(v) },
  { id: 'minus', texto: 'Una minúscula (a-z)', ok: (v: string) => /[a-z]/.test(v) },
  { id: 'num', texto: 'Un número (0-9)', ok: (v: string) => /\d/.test(v) },
  { id: 'sim', texto: 'Un símbolo !@#$%^&*', ok: (v: string) => /[!@#$%^&*]/.test(v) },
]

export function claveValida(valor: string): boolean {
  return REGLAS.every((regla) => regla.ok(valor))
}

/** Checklist en vivo del registro y del restablecimiento. */
export function ClaveChecklist({ valor }: { valor: string }) {
  return (
    <ul
      className="mt-2 grid grid-cols-2 gap-1.5 border bg-white p-2.5"
      style={{ borderColor: 'var(--color-line-strong)', borderRadius: 8 }}
      aria-label="Requisitos de la contraseña"
    >
      {REGLAS.map((regla) => {
        const cumple = regla.ok(valor)
        return (
          <li key={regla.id} className="flex items-center gap-1" style={{ fontSize: 11, color: cumple ? 'var(--color-success)' : 'var(--color-muted)' }}>
            <span aria-hidden="true">{cumple ? '✓' : '○'}</span>
            {regla.texto}
          </li>
        )
      })}
    </ul>
  )
}
