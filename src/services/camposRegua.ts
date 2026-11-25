// Catálogo dos campos que a régua do produto consegue ler, textos em português dos operadores,
// conversões simples de valor e faixa, e o modelo do FAROL 2027.
// Fonte dos campos: scoring_calcular.js (empresa, pessoa e lead) e o formulário do FAROL 2027
// (Skip 68997), cujos campos estruturados chegam ao Funil pela entrada de respostas (SPEC-3-004)
// e são gravados em `atributos`. As chaves abaixo precisam ser as mesmas dessa entrada.
import type { Faixa, Termo } from '@/services/regua'

export type CampoRegua = {
  chave: string
  rotulo: string
  origem: 'Empresa' | 'Lead' | 'Contato' | 'Formulário FAROL 2027'
  opcoes?: string[]
}

export const OPCOES_FAROL = {
  porte_funcionarios: ['50-100', '101-300', '301-500', '501-1000', '+1000'],
  porte_faturamento: ['ate 10 mi', '10-50 mi', '50-300 mi', '+300 mi'],
  decisao_orcamento: ['Decido', 'Aprovo', 'Influencio', 'Nao participo'],
  d4_verba_prevista: ['Sim, definida', 'Sim, a definir', 'Nao existe', 'Nao sei'],
  d5_faixa_verba: ['ate 50 mil', '50-200 mil', '200-500 mil', '+500 mil', 'prefiro conversar'],
}

export const CAMPOS_REGUA: CampoRegua[] = [
  { chave: 'setor', rotulo: 'Setor', origem: 'Empresa' },
  { chave: 'porte', rotulo: 'Porte', origem: 'Empresa' },
  { chave: 'uf', rotulo: 'UF', origem: 'Empresa' },
  { chave: 'cidade', rotulo: 'Cidade', origem: 'Empresa' },
  { chave: 'segmento', rotulo: 'Segmento do lead', origem: 'Lead' },
  // vem da importação (atributos da empresa e da pessoa): é o único dado de lista que já chega hoje
  { chave: 'cargo', rotulo: 'Cargo', origem: 'Contato' },
  { chave: 'porte_funcionarios', rotulo: 'Funcionários', origem: 'Formulário FAROL 2027', opcoes: OPCOES_FAROL.porte_funcionarios },
  { chave: 'porte_faturamento', rotulo: 'Faturamento anual', origem: 'Formulário FAROL 2027', opcoes: OPCOES_FAROL.porte_faturamento },
  { chave: 'decisao_orcamento', rotulo: 'Papel na decisão de orçamento', origem: 'Formulário FAROL 2027', opcoes: OPCOES_FAROL.decisao_orcamento },
  { chave: 'd4_verba_prevista', rotulo: 'Verba prevista', origem: 'Formulário FAROL 2027', opcoes: OPCOES_FAROL.d4_verba_prevista },
  { chave: 'd5_faixa_verba', rotulo: 'Faixa da verba', origem: 'Formulário FAROL 2027', opcoes: OPCOES_FAROL.d5_faixa_verba },
]

export const campoPorChave = (chave: string): CampoRegua | undefined =>
  CAMPOS_REGUA.find((c) => c.chave === chave)

// Operadores em português. As chaves são as mesmas do backend (não mudam).
export const OPERADORES_PT: Record<string, string> = {
  eq: 'é igual a',
  in: 'é um destes',
  neq: 'é diferente de',
  contains: 'contém',
  gte: 'é maior ou igual a',
  gt: 'é maior que',
  lte: 'é menor ou igual a',
  lt: 'é menor que',
  exists: 'foi informado',
}
export const ORDEM_OPERADORES = ['eq', 'in', 'neq', 'contains', 'gte', 'gt', 'lte', 'lt', 'exists']

// Valor <-> texto digitado. Quem usa a tela nunca digita JSON:
// "é um destes" aceita valores separados por vírgula; comparações aceitam número.
export const textoDoValor = (valor: unknown): string => {
  if (valor === undefined || valor === null) return ''
  if (Array.isArray(valor)) return valor.map(String).join(', ')
  return String(valor)
}

export const valorDoTexto = (texto: string, operador: string): unknown => {
  const t = texto.trim()
  if (operador === 'in') {
    return t ? t.split(',').map((s) => s.trim()).filter(Boolean) : []
  }
  if ((operador === 'gt' || operador === 'gte' || operador === 'lt' || operador === 'lte') && t !== '') {
    const n = Number(t.replace(',', '.'))
    return isNaN(n) ? t : n
  }
  return t
}

// Faixas: a tela pede só três limites (a partir de quanto é A, B e C; D é o resto).
export type LimitesFaixa = { A: number; B: number; C: number }

export const limitesDeFaixas = (faixas: Faixa[]): LimitesFaixa => {
  const de = (letra: string, padrao: number) => {
    const f = (faixas ?? []).find((x) => x.letra === letra)
    return f && typeof f.de === 'number' ? f.de : padrao
  }
  return { A: de('A', 65), B: de('B', 40), C: de('C', 15) }
}

// A é sempre a faixa mais alta (o backend recusa régua com A embaixo).
export const faixasDeLimites = (l: LimitesFaixa): Faixa[] => [
  { letra: 'A', de: l.A, ate: 100, borda_inclusiva: true },
  { letra: 'B', de: l.B, ate: l.A, borda_inclusiva: false },
  { letra: 'C', de: l.C, ate: l.B, borda_inclusiva: false },
  { letra: 'D', de: 0, ate: l.C, borda_inclusiva: false },
]

// Faixas generosas, decisão do José em 28/10/2026: "na dúvida entre B e C, prefiro B".
export const LIMITES_PADRAO: LimitesFaixa = { A: 65, B: 40, C: 15 }
export const FAIXAS_PADRAO: Faixa[] = faixasDeLimites(LIMITES_PADRAO)

export const erroLimites = (l: LimitesFaixa): string => {
  if (![l.A, l.B, l.C].every((n) => typeof n === 'number' && !isNaN(n)))
    return 'Preencha os três limites das faixas com números.'
  if (l.A > 100) return 'O limite da faixa A não pode passar de 100.'
  if (!(l.A > l.B && l.B > l.C && l.C > 0))
    return 'Os limites precisam ir diminuindo: A maior que B, B maior que C, e C maior que zero.'
  return ''
}

const termo = (id: string, campo: string, operador: Termo['operador'], valor: unknown, peso: number): Termo => ({ id, tipo: 'termo', campo, operador, valor, peso })

// MODELO PARA O JOSÉ AJUSTAR: carrega no editor como rascunho, nunca aprova sozinho.
export const MODELO_FAROL_2027: { criterios: Termo[]; regras_eliminatorias: Termo[]; limites: LimitesFaixa } = {
  criterios: [
    termo('m1', 'porte_faturamento', 'in', ['10-50 mi', '50-300 mi', '+300 mi'], 30),
    termo('m2', 'decisao_orcamento', 'in', ['Decido', 'Aprovo'], 30),
    termo('m3', 'd4_verba_prevista', 'in', ['Sim, definida', 'Sim, a definir'], 20),
    termo('m4', 'porte_funcionarios', 'in', ['101-300', '301-500', '501-1000', '+1000'], 20),
  ],
  regras_eliminatorias: [termo('me1', 'decisao_orcamento', 'eq', 'Nao participo', 0)],
  limites: LIMITES_PADRAO,
}

export const PRODUTO_FAROL_2027 = {
  nome: 'FAROL 2027',
  area: 'Planejamento de IA',
  dor: 'A empresa não sabe onde, como e quanto investir em IA em 2027',
  descricao: 'Consultoria sazonal: conversa de 60 minutos e relatório em PDF de 8 a 12 páginas com 3 a 5 iniciativas, faixas de investimento e cronograma por trimestre.',
  tipo_atendimento: 'consultivo' as const,
}

// Respostas sugeridas da entrevista, tiradas do formulário e do guia do FAROL 2027.
// O José revisa; só preenche o que ainda está em branco.
export const ENTREVISTA_FAROL_2027: Record<string, string> = {
  dor_area: 'Planejamento de IA para 2027: a empresa não sabe onde, como e quanto investir em IA. Área: estratégia e operações.',
  decisor: 'Quem decide ou aprova o orçamento (dono, CEO ou diretor). O formulário pergunta se a pessoa decide, aprova, influencia ou não participa.',
  segmento_porte: 'Empresas com 50 funcionários ou mais e faturamento anual a partir de R$ 3 milhões (piso do guia). O formulário separa em até 10 mi, 10-50 mi, 50-300 mi e +300 mi.',
  campos_fontes: 'Vêm do formulário do FAROL 2027: setor, funcionários, faturamento, papel na decisão de orçamento, verba prevista e faixa da verba. Chegam ao Funil pela entrada de respostas.',
  criterios: 'Faturamento a partir de 10 mi; decide ou aprova o orçamento; verba prevista (definida ou a definir); 101 funcionários ou mais.',
  pesos: 'Faturamento 30, decisão de orçamento 30, verba prevista 20, funcionários 20 (proposta, o José ajusta).',
  eliminatorias: 'Não participa da decisão de orçamento (proposta, o José confirma).',
  faixas: 'A de 65 a 100, B de 40 a 65, C de 15 a 40, D de 0 a 15 (faixas generosas, decisão do José em 28/10: na dúvida, o lead sobe). A é a faixa mais alta.',
  abordagem: 'Consultoria sazonal: conversa de 60 minutos e relatório em PDF de 8 a 12 páginas. Antes da conversa, a equipe lê o guia da entrevista gerado a partir do formulário.',
}
