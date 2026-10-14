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

// ---- IDENTIDADE (task 3b736d7d): resolução de identidade por contato individual ----
// Função pura: dado o novo contato e as pessoas existentes, decide reusar/criar/conflito.
// Nome igual, e-mail genérico ou "mesma empresa" NUNCA identificam pessoa (SPEC-1-002).
export type PessoaNucleo = {
  id: string
  email_norm?: string
  telefone_norm?: string
  linkedin_norm?: string
}

const GENERICA =
  /^(contato|comercial|financeiro|geral|vendas|suporte|marketing|rh|juridico|financeira)@/i

export const eEmailGenerico = (email: string | undefined | null): boolean => {
  const e = normalizarEmail(email)
  return GENERICA.test(e)
}

// fila de conflitos (leitura/decisão do admin — a fusão em si é a task FUSAO-REVERSIVEL)
export type ConflitoCadastro = {
  id: string
  entidade: 'pessoas' | 'empresas'
  identificador_tipo: 'email' | 'telefone' | 'linkedin'
  identificador_norm: string
  ids_envolvidos?: string
  detalhe?: string
  status: 'pendente' | 'distintos' | 'fundidos'
  created?: string
}

export const getConflitos = async (): Promise<ConflitoCadastro[]> => {
  return pb.collection('conflitos_cadastro').getFullList<ConflitoCadastro>({ sort: '-created' })
}

export const resolverConflito = (id: string, status: 'distintos' | 'fundidos'): Promise<unknown> =>
  pb.collection('conflitos_cadastro').update(id, { status })

// ---- COORTE-PESSOA (task f5668cd8): elegibilidade da lista fria ----
// Função pura: dado o núcleo da pessoa, suas origens e seus bloqueios, decide o status na fria.
// Regras da SPEC-1-002: conhecido em QUALQUER origem fica fora da fria (regra 4); pedido de
// saída bloqueia global e persiste após reimportação (regra 6); mesma empresa NÃO protege
// (regra 5 — aprovação é da pessoa, não da empresa).
export type OrigemPessoa = {
  coorte: 'rede_jose' | 'rede_evandro' | 'clientes_atendidos' | 'inbound' | 'fria'
}
export type BloqueioPessoa = {
  motivo: 'relacionamento' | 'pedido_saida'
  alcance: 'fria' | 'global'
}

export const elegibilidadeFria = (
  pessoa: { relacionamento_conhecido?: boolean; empresa?: string },
  origens: OrigemPessoa[],
  bloqueios: BloqueioPessoa[],
): { status: 'elegivel' | 'excluida' | 'bloqueada'; motivo?: string } => {
  // 1. pedido de saída (global) vence tudo — persiste independentemente de reimportação
  const saida = bloqueios.find((b) => b.motivo === 'pedido_saida')
  if (saida) return { status: 'bloqueada', motivo: 'pedido_saida' }

  // 2. bloqueio de relacionamento (alcance fria) também impede a fria
  const rel = bloqueios.find((b) => b.motivo === 'relacionamento')
  if (rel) return { status: 'bloqueada', motivo: 'relacionamento' }

  // 3. conhecido em qualquer origem → fora da fria
  if (pessoa.relacionamento_conhecido) return { status: 'excluida', motivo: 'relacionamento' }

  // 4. sem bloqueio e sem relacionamento → elegível (mesmo compartilhando empresa com conhecido)
  return { status: 'elegivel' }
}

export const resolverIdentidade = (
  novo: {
    nome?: string
    email_norm?: string
    telefone_norm?: string
    linkedin_norm?: string
    empresa?: string
  },
  existentes: PessoaNucleo[],
): { acao: 'reusar' | 'criar' | 'conflito'; pessoaId?: string; ids?: string[] } => {
  const chaves: Array<'email_norm' | 'telefone_norm' | 'linkedin_norm'> = [
    'email_norm',
    'telefone_norm',
    'linkedin_norm',
  ]
  const valor = (campo: string) =>
    ((novo as Record<string, unknown>)[campo] as string | undefined)?.trim() || ''

  // 1. identificadores individuais confirmados do novo contato
  const identificadores: Array<{ campo: string; valor: string }> = []
  for (const campo of chaves) {
    const v = valor(campo)
    if (!v) continue
    if (campo === 'email_norm' && eEmailGenerico(v)) continue // genérico não é chave
    identificadores.push({ campo, valor: v })
  }
  if (identificadores.length === 0) return { acao: 'criar' } // sem chave: cadastro incompleto, sem inferência

  // 2. pessoas existentes que batem em ALGUM identificador
  const batidas = new Set<string>()
  for (const p of existentes) {
    for (const idt of identificadores) {
      const pv = ((p as Record<string, unknown>)[idt.campo] as string | undefined)?.trim() || ''
      if (pv && pv === idt.valor) batidas.add(p.id)
    }
  }
  if (batidas.size === 1) return { acao: 'reusar', pessoaId: [...batidas][0] }
  if (batidas.size > 1) return { acao: 'conflito', ids: [...batidas] } // mesmo identificador em pessoas diferentes

  // 3. nenhuma batida → criar (nome igual e empresa igual NÃO identificam)
  return { acao: 'criar' }
}
