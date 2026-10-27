export interface ActividadCiiu {
  codigo: string
  descripcion: string
  tipo: string
  origen: 'oficial' | 'inferido'
  /** CIIU residual o muy amplio ('venta al por mayor no especializada'…): pesa menos al recomendar. */
  generico?: boolean
}

/** Respuesta de GET /api/empresas/:ruc (API MIGO + RNP). */
export interface Company {
  ruc: string
  razonSocial: string
  nombreComercial: string | null
  estadoSunat: string | null
  condicionSunat: string
  sunatOk: boolean
  rnpVigente: boolean
  aptoContratar: boolean
  tiposRnp: string[]
  especialidadesRnp: string[]
  capacidadMaxima: string
  rubro: string
  ciius: ActividadCiiu[]
  ubicacion: string
  direccion: string | null
  telefono?: string | null
  email?: string | null
  fichaRnpUrl?: string | null
  /** Última vez que se consultó SUNAT/RNP. */
  actualizadoEl?: string | null
  avisos: string[]
}

export interface TerminoLicitado {
  termino: string
  licitaciones: number
  /** Convocatorias abiertas hoy con ese término. */
  vigentes: number
  /** La empresa ya postuló a procesos con ese ítem. */
  historial: boolean
  /** El ítem es del mismo rubro (segmento CUBSO) de los procesos a los que la empresa postuló. */
  rubroHistorial: boolean
}

export interface KeywordSuggestion {
  label: string
  selected: boolean
  licitaciones?: number
  abiertas?: number
  historial?: boolean
  manual?: boolean
}

export interface TelegramLink {
  botUsername: string
  token: string
  /** Abre la app de Telegram (t.me). */
  url: string
  /** Abre Telegram Web con el chat del bot. */
  urlWeb: string
  /** Para pegar en el chat del bot si ningún enlace abre: "/start <token>". */
  comando: string
}

export interface TelegramEstado {
  vinculado: boolean
  username: string | null
  activo: boolean
  vinculadoEl: string | null
  botDisponible: boolean
}

export interface Estadisticas {
  totalConvocatorias: number
  vigentes: number
  nuevas24h: number
  montoVigente: number
  ultimaActualizacion: string | null
}

export type AlertChannel = 'email' | 'whatsapp' | 'telegram'

export type OnboardingStep = 'ruc' | 'keywords' | 'alerts' | 'done'

// ----------------------------------------------------------------------------- cuenta

export interface Usuario {
  id: string
  email: string
  nombre: string
}

export interface Sesion {
  accessToken: string
  refreshToken: string
  /** Epoch en segundos. */
  expiresAt: number
  usuario: Usuario
}

export interface Cupo {
  usados: number
  limite: number
  disponibles: number
}

export interface Perfil {
  usuario: Usuario
  ruc: string | null
  keywords: string[]
  empresa: Company | null
  desbloqueos: Cupo
  /** Solo al actualizar los datos de SUNAT/RNP. */
  avisos?: string[]
}

/** Historial de la empresa en el SEACE (procesos a los que postuló). */
export interface HistorialEmpresa {
  procesos: number
  ganados: number
  montoAdjudicado: number
  porObjeto: Record<string, number>
  ultimos: { codigo: string; entidad: string; titulo: string; condicion: string; monto: number; fecha: string | null }[]
}

// ----------------------------------------------------------------------------- licitaciones

export interface Licitacion {
  id: number
  codigo: string
  nomenclatura: string | null
  esNueva: boolean
  ubicacion: string
  departamento: string
  publicacion: string
  fechaPublicacion: string | null
  fechaLimite: string | null
  objeto: string
  etapa: string
  vigente: boolean
  titulo: string
  entidad: string
  valorReferencial: number
  moneda: string
  matchPorcentaje: number
  motivos: string[]
  keywords: string[]
  ciiu: string | null
  ciiuTitulo: string | null
  fuente: string | null
  tipoProcedimiento: string | null
  desbloqueada: boolean
  /** Solo viene si la licitación está desbloqueada. */
  fichaUrl: string | null
  basesUrl: string | null
}

export type OrdenLicitaciones = 'afinidad' | 'cierre' | 'recientes' | 'monto'

export interface FiltrosLicitaciones {
  keywords: string[]
  q: string
  departamento: string
  objeto: string
  /** '' = todas; OECE | PROD2 | PROD6 */
  fuente: string
  keyword: string | null
  soloPerfil: boolean
  orden: OrdenLicitaciones
  pagina: number
}

export interface PaginaLicitaciones {
  items: Licitacion[]
  total: number
  montoTotal: number
  altaAfinidad: number
  pagina: number
  porPagina: number
  totalPaginas: number
  keywords: string[]
  desbloqueos: Cupo
}

export type EstadoAnalisis = 'pendiente' | 'procesando' | 'listo' | 'error' | 'sin_analisis'

export interface IsoRecomendada {
  norma: string
  alcance?: string
  motivo?: string
}

export interface AnalisisIa {
  veredicto: string | null
  encaje: string | null
  brechas: string[]
  resumen: string | null
  isoRecomendadas: IsoRecomendada[]
  pack: string | null
  mensajeComercial: string | null
  requisitosIso: { estado: string | null; normas: string[]; modalidad: string | null; resumen: string | null } | null
}

/** Una fila de "Mis desbloqueos". */
export interface DesbloqueoItem {
  convocatoriaId: number
  fuente: string | null
  estadoAnalisis: EstadoAnalisis
  veredicto: string | null
  desbloqueadaEl: string
  codigo: string | null
  titulo: string
  entidad: string
  objeto: string
  departamento: string
  fechaPublicacion: string | null
  fechaLimite: string | null
  valorReferencial: number
  moneda: string
  abierta: boolean
  basesUrl: string | null
  fichaUrl: string | null
}

export interface DocumentoBases {
  nombre: string
  archivo: string | null
  url: string
  categoria: string
}

export interface Desbloqueo extends Cupo {
  desbloqueada: boolean
  convocatoriaId: number
  codigo?: string
  basesUrl?: string | null
  fichaUrl?: string | null
  documentos?: DocumentoBases[]
  estadoAnalisis?: EstadoAnalisis
  /** false si el backend no tiene configurado el webhook de n8n. */
  analisisDisponible?: boolean
  error?: string | null
  analisis?: AnalisisIa | null
  desbloqueadaEl?: string
}

// ----------------------------------------------------------------------------- equipo (datos de ejemplo)

export type PipelineEstado = 'sin-estado' | 'revisada' | 'negociando' | 'vendida' | 'perdida'

export interface PipelineCard {
  id: string
  codigo: string
  objeto: 'Servicio' | 'Obra' | 'Bien'
  etapa: string
  entidad: string
  titulo: string
  monto: number
  responsable: string
  estado: PipelineEstado
}

export interface ChatMessage {
  from: 'lici' | 'user'
  text?: string
  richTemplate?: 'company-card' | 'keyword-list' | 'alert-options'
  quickReplies?: string[]
  timestamp?: string
}
