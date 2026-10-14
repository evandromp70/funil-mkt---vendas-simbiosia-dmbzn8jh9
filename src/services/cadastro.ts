// SPEC-1-002 (task ea6db5dc): cadastro único de empresas e contatos.
// Admin cadastra/consulta empresa e pessoa separadamente e vincula a leads.
import pb from '@/lib/pocketbase/client'

export type Empresa = {
  id: string
  razao_social: string
  cnpj_norm?: string
  cnae?: string
  setor?: string
  porte?: string
  uf?: string
  cidade?: string
  data_inicio?: string
  ambiente: 'teste' | 'producao'
  created?: string
  updated?: string
}

export type Pessoa = {
  id: string
  nome: string
  email_norm?: string
  telefone_norm?: string
  linkedin_norm?: string
  relacionamento_conhecido?: boolean
  owner_relacao?: string
  ambiente: 'teste' | 'producao'
  created?: string
  updated?: string
}

export const normalizarEmail = (v: string | undefined | null): string =>
  (v ?? '').trim().toLowerCase()

export const normalizarTelefone = (v: string | undefined | null): string => {
  // mantém apenas dígitos (o DDI deve vir explícito na fonte — a SPEC proíbe inventar DDI)
  return (v ?? '').replace(/\D/g, '')
}

export const normalizarLinkedin = (v: string | undefined | null): string => {
  const s = (v ?? '').trim()
  if (!s) return ''
  try {
    const url = new URL(s.startsWith('http') ? s : 'https://' + s)
    if (!url.hostname.endsWith('linkedin.com')) return ''
    return 'https://' + url.hostname + url.pathname.replace(/\/$/, '').toLowerCase()
  } catch {
    return ''
  }
}

export const getEmpresas = async (): Promise<Empresa[]> => {
  return pb.collection('empresas').getFullList<Empresa>({ sort: '-created' })
}

export const criarEmpresa = (dados: Partial<Empresa>): Promise<Empresa> =>
  pb.collection('empresas').create<Empresa>({ ...dados, ambiente: 'teste' })

export const getPessoas = async (): Promise<Pessoa[]> => {
  return pb.collection('pessoas').getFullList<Pessoa>({ sort: '-created' })
}

export const criarPessoa = (dados: Partial<Pessoa>): Promise<Pessoa> =>
  pb.collection('pessoas').create<Pessoa>({ ...dados, ambiente: 'teste' })

// vincula empresa/pessoa a um lead (migração manual rastreável — backfill do legado)
export const vincularLeadCadastro = (
  leadId: string,
  empresaId: string | null,
  pessoaId: string | null,
): Promise<unknown> =>
  pb.collection('leads').update(leadId, {
    empresa: empresaId,
    pessoa: pessoaId,
    migracao_origem_id: 'backfill-ea6db5dc',
  })
