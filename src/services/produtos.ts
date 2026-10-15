// SPEC-1-004 (task 7183cf59): catálogo de produtos FAROL — CA-1-004-01.
// Função pura de validação (mesmo contrato do hook) + rótulos em português + acesso ao backend.
import pb from '@/lib/pocketbase/client'

export const DEGRAUS = ['free', 'essencial', 'mapa', 'executivo', 'empresa'] as const
export const TIPOS_ATENDIMENTO = ['baixo_valor', 'consultivo'] as const

export type Degrau = (typeof DEGRAUS)[number]
export type TipoAtendimento = (typeof TIPOS_ATENDIMENTO)[number]

export type Produto = {
  id: string
  nome: string
  degrau: Degrau
  area?: string
  dor?: string
  descricao?: string
  tipo_atendimento?: TipoAtendimento
  preco?: number
  faixa_preco?: string
  icp?: Record<string, unknown>
  playbook?: string
  tom?: string
  ativo: boolean
  ambiente: 'teste' | 'producao'
  created?: string
  updated?: string
}

// rótulos em português (sem inglês na interface)
export const ROTULO_DEGRAU: Record<Degrau, string> = {
  free: 'Free',
  essencial: 'Essencial',
  mapa: 'Mapa',
  executivo: 'Executivo',
  empresa: 'Empresa',
}
export const ROTULO_ATENDIMENTO: Record<TipoAtendimento, string> = {
  baixo_valor: 'Baixo valor',
  consultivo: 'Consultivo',
}

// validação pura: motivo legível por campo problemático; objeto vazio = válida
export const validarProduto = (dados: Partial<Produto>): Record<string, string> => {
  const erros: Record<string, string> = {}
  const nome = (dados.nome ?? '').trim()
  if (!nome) erros.nome = 'Nome do produto é obrigatório.'
  else if (nome.length > 120) erros.nome = 'Nome do produto excede 120 caracteres.'

  if (!dados.degrau || !DEGRAUS.includes(dados.degrau))
    erros.degrau = 'Degrau inválido: use Free, Essencial, Mapa, Executivo ou Empresa.'

  if (dados.tipo_atendimento && !TIPOS_ATENDIMENTO.includes(dados.tipo_atendimento))
    erros.tipo_atendimento = 'Tipo de atendimento inválido: use Baixo valor ou Consultivo.'

  if (dados.preco !== undefined && dados.preco !== null && dados.preco < 0)
    erros.preco = 'Preço não pode ser negativo.'

  return erros
}

export const getProdutos = async (): Promise<Produto[]> =>
  pb.collection('produtos').getFullList<Produto>({ sort: '-created' })

export const criarProduto = (dados: Partial<Produto>): Promise<Produto> =>
  pb.collection('produtos').create<Produto>({ ...dados, ativo: false, ambiente: 'teste' })

export const atualizarProduto = (id: string, dados: Partial<Produto>): Promise<Produto> =>
  pb.collection('produtos').update<Produto>(id, dados)

export const alternarAtivo = (id: string, ativo: boolean): Promise<Produto> =>
  pb.collection('produtos').update<Produto>(id, { ativo })
