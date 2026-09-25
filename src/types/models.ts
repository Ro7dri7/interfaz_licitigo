export interface ActividadCiiu {
  codigo: string
  descripcion: string
  tipo: string
  origen: 'oficial' | 'inferido'
}

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
  avisos: string[]
}

export interface TerminoLicitado {
  termino: string
  licitaciones: number
  vigentes: number
}

export interface KeywordSuggestion {
  label: string
  selected: boolean
  licitaciones?: number
}

export interface TelegramLink {
  botUsername: string
  token: string
  url: string
}

export interface Estadisticas {
  totalConvocatorias: number
  vigentes: number
  nuevas24h: number
  montoVigente: number
  ultimaActualizacion: string | null
}

export type AlertChannel = 'email' | 'whatsapp' | 'telegram'

export type EtapaLicitacion =
  | 'Convocado'
  | 'En evaluación'
  | 'Consentido'
  | 'Adjudicado'
  | 'Contratado'
  | 'Desierto'
  | 'Cancelado'

export interface PaginaLicitaciones {
  items: ConvocatoriaApi[]
  total: number
  page: number
  pages: number
}

export interface ConvocatoriaApi {
  nomenclatura_norm: string
  nomenclatura: string | null
  entidad: string | null
  objeto: string | null
  descripcion: string | null
  ficha_url: string | null
  estado: string | null
  fecha_publicacion: string | null
  monto: string | null
  etapa_seace: string | null
  fecha_integracion: string | null
  fecha_presentacion: string | null
  departamento: string
}

export interface AnalisisIa {
  recomendacion: string
  postular: boolean | null
  isosRequeridas: string[]
  isosRecomendadas: string[]
  encaje: string
  brechas: string[]
}

export interface Licitacion {
  id: string
  codigo: string
  esNueva: boolean
  ubicacion: string
  departamento: string
  publicacion: string
  fechaLimite: string | null
  objeto: string
  etapa: EtapaLicitacion
  vigente: boolean
  titulo: string
  entidad: string
  valorReferencial: number
  matchPorcentaje: number
  motivos: string[]
  fuente: string | null
  fichaUrl: string | null
}

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

export type OnboardingStep = 'ruc' | 'keywords' | 'alerts' | 'done'
