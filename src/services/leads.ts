import pb from '@/lib/pocketbase/client'

export type Lead = {
  id: string
  owner: string
  nome_empresa: string
  contato_nome?: string
  contato_email?: string
  contato_telefone?: string
  origem: 'inbound' | 'outbound'
  etapa:
    | 'lista'
    | 'qualificacao'
    | 'contato'
    | 'cadencia'
    | 'alinhamento'
    | 'conversao'
    | 'ganho'
    | 'perdido'
  score?: number
  observacoes?: string
  created: string
  updated: string
}

export type Qualificacao = {
  id: string
  lead: string
  fit?: number
  dor?: number
  orcamento?: number
  timing?: number
  acesso?: number
  score_total?: number
  decisao?: 'qualificado' | 'nao_qualificado' | 'revisar'
  notas?: string
  created: string
  updated: string
}

export type Contato = {
  id: string
  lead: string
  canal: 'email' | 'linkedin' | 'whatsapp' | 'telefone' | 'evento'
  direcao: 'inbound' | 'outbound'
  mensagem?: string
  resposta?: string
  data_contato?: string
  created: string
  updated: string
}

export type Cadencia = {
  id: string
  lead: string
  toque: number
  canal: 'email' | 'linkedin' | 'whatsapp' | 'telefone'
  status: 'agendado' | 'enviado' | 'respondido' | 'ignorado' | 'cancelado'
  rascunho_ia?: string
  data_envio?: string
  created: string
  updated: string
}

export type Alinhamento = {
  id: string
  lead: string
  data_reuniao?: string
  pauta?: string
  decisoes?: string
  proximo_passo?: string
  created: string
  updated: string
}

export const ETAPAS = [
  'lista',
  'qualificacao',
  'contato',
  'cadencia',
  'alinhamento',
  'conversao',
  'ganho',
  'perdido',
] as const
export const ETAPA_LABEL: Record<string, string> = {
  lista: 'Lista',
  qualificacao: 'Qualificação',
  contato: 'Contato',
  cadencia: 'Cadência',
  alinhamento: 'Alinhamento',
  conversao: 'Conversão',
  ganho: 'Ganho',
  perdido: 'Perdido',
}

// Fluxo principal de avanço (fim = ganho). Perdido é terminal alternativo.
export const FLUXO: { etapa: Lead['etapa']; label: string }[] = [
  { etapa: 'lista', label: 'Lista' },
  { etapa: 'qualificacao', label: 'Qualificação' },
  { etapa: 'contato', label: 'Contato' },
  { etapa: 'cadencia', label: 'Cadência' },
  { etapa: 'alinhamento', label: 'Alinhamento' },
  { etapa: 'conversao', label: 'Conversão' },
  { etapa: 'ganho', label: 'Ganho' },
]

export const getLeads = () => pb.collection('leads').getFullList<Lead>({ sort: '-created' })

export const getLead = (id: string) => pb.collection('leads').getOne<Lead>(id)

export const createLead = (
  data: Partial<Lead> & { nome_empresa: string; origem: 'inbound' | 'outbound' },
) => pb.collection('leads').create<Lead>(data)

export const updateLead = (id: string, data: Partial<Lead>) =>
  pb.collection('leads').update<Lead>(id, data)

export const deleteLead = (id: string) => pb.collection('leads').delete(id)

export const getQualificacoes = (leadId: string) =>
  pb
    .collection('qualificacoes')
    .getFullList<Qualificacao>({
      filter: pb.filter('lead = {:leadId}', { leadId }),
      sort: '-created',
    })

export const createQualificacao = (data: Partial<Qualificacao> & { lead: string }) =>
  pb.collection('qualificacoes').create<Qualificacao>(data)

export const getContatos = (leadId: string) =>
  pb
    .collection('contatos')
    .getFullList<Contato>({ filter: pb.filter('lead = {:leadId}', { leadId }), sort: '-created' })

export const createContato = (data: Partial<Contato> & { lead: string }) =>
  pb.collection('contatos').create<Contato>(data)

export const getCadencias = (leadId: string) =>
  pb
    .collection('cadencias')
    .getFullList<Cadencia>({ filter: pb.filter('lead = {:leadId}', { leadId }), sort: 'toque' })

export const createCadencia = (data: Partial<Cadencia> & { lead: string }) =>
  pb.collection('cadencias').create<Cadencia>(data)

export const getAlinhamentos = (leadId: string) =>
  pb
    .collection('alinhamentos')
    .getFullList<Alinhamento>({
      filter: pb.filter('lead = {:leadId}', { leadId }),
      sort: '-created',
    })

export const createAlinhamento = (data: Partial<Alinhamento> & { lead: string }) =>
  pb.collection('alinhamentos').create<Alinhamento>(data)

// ---- Apoio de IA (etapas HA) — chamam as rotas custom do backend ----

export const gerarRascunhoContato = (leadId: string) =>
  pb.send<{ rascunho: string }>('/backend/v1/funil/gerar-contato', {
    method: 'POST',
    body: JSON.stringify({ leadId }),
  })

export const sugerirProximoToque = (leadId: string) =>
  pb.send<{ sugestao: string }>('/backend/v1/funil/sugerir-toque', {
    method: 'POST',
    body: JSON.stringify({ leadId }),
  })

export const analisarQualificacao = (leadId: string) =>
  pb.send<{ analise: string }>('/backend/v1/funil/analisar-qualificacao', {
    method: 'POST',
    body: JSON.stringify({ leadId }),
  })
