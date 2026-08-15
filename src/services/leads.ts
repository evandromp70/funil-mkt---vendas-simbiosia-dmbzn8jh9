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

export const getLeads = () => pb.collection('leads').getFullList<Lead>({ sort: '-created' })

export const getLead = (id: string) => pb.collection('leads').getOne<Lead>(id)

export const createLead = (
  data: Partial<Lead> & { nome_empresa: string; origem: 'inbound' | 'outbound' },
) => pb.collection('leads').create<Lead>(data)

export const updateLead = (id: string, data: Partial<Lead>) =>
  pb.collection('leads').update<Lead>(id, data)

export const deleteLead = (id: string) => pb.collection('leads').delete(id)
