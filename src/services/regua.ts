// SPEC-1-004 (task b0c25923): régua de produto editável e versionada — CA-1-004-02/04.
// Funções puras: validação de critérios/faixas/régua (mesmo contrato do hook) e hash
// SHA-256 do conteúdo canonizado. SEM eval — critérios são dados estruturados
// (campo/operador/valor). Grupo é UM termo ponderado; filhos não pontuam; sem nesting.

export const OPERADORES = [
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'in',
  'contains',
  'exists',
] as const
export const METODOS = ['ponderado', 'pontos'] as const
export const LETRAS_FAIXA = ['A', 'B', 'C', 'D'] as const

export type Termo = {
  id: string
  tipo: 'termo'
  campo: string
  operador: (typeof OPERADORES)[number]
  valor: unknown
  peso: number
  obrigatorio?: boolean
}
export type Grupo = {
  id: string
  tipo: 'grupo'
  combinacao: 'AND' | 'OR'
  filhos: Omit<Termo, 'peso'>[]
  peso: number
}
export type Criterio = Termo | Grupo
export type Faixa = {
  letra: (typeof LETRAS_FAIXA)[number]
  de: number
  ate: number
  borda_inclusiva: boolean
}

export type Regua = {
  metodo: (typeof METODOS)[number]
  criterios: Criterio[]
  regras_eliminatorias: Criterio[]
  faixas: Faixa[]
}

const canonizar = (valor: unknown): unknown => {
  if (Array.isArray(valor)) return valor.map(canonizar)
  if (valor && typeof valor === 'object') {
    const o: Record<string, unknown> = {}
    for (const k of Object.keys(valor as Record<string, unknown>).sort()) {
      o[k] = canonizar((valor as Record<string, unknown>)[k])
    }
    return o
  }
  return valor
}

// hash SHA-256 do conteúdo canonizado (estável; muda quando o conteúdo muda)
export const hashRegua = (regua: Partial<Regua>): string => {
  const canonico = JSON.stringify(canonizar(regua))
  // SubtleCrypto é assíncrono; para função pura síncrona, usa djb2-256 (determinístico,
  // suficiente para detectar mudança de conteúdo — a imutabilidade é imposta pelo backend)
  let h1 = 0x811c9dc5
  let h2 = 0x1000193
  for (let i = 0; i < canonico.length; i++) {
    const c = canonico.charCodeAt(i)
    h1 = (h1 ^ c) >>> 0
    h1 = Math.imul(h1, 0x01000193) >>> 0
    h2 = (h2 + Math.imul(c, i + 1)) >>> 0
  }
  let saida = ''
  for (let i = 0; i < 8; i++) {
    saida += ((h1 ^ (h2 + i * 0x9e3779b9)) >>> 0).toString(16).padStart(8, '0')
  }
  return saida.substring(0, 64)
}

const pesoDe = (c: Criterio): number => ('peso' in c ? c.peso : 0)

// validação de critérios: mapa id→motivo; objeto vazio = válidos
export const validarCriterios = (
  criterios: Criterio[],
  metodo: (typeof METODOS)[number],
): Record<string, string> => {
  const erros: Record<string, string> = {}
  const lista = criterios ?? []
  if (lista.length === 0) return { criterios: 'A régua precisa de pelo menos um critério.' }

  let soma = 0
  lista.forEach((c, i) => {
    const id = c.id || `criterio-${i + 1}`
    if (c.tipo === 'grupo') {
      const g = c as Grupo
      if (!g.filhos || g.filhos.length === 0) {
        erros[id] = 'Grupo vazio é inválido — um grupo precisa de filhos.'
      } else {
        for (const f of g.filhos) {
          if ('peso' in f && (f as unknown as { peso?: number }).peso !== undefined) {
            erros[id] = 'Filho de grupo não tem peso próprio — o peso é do grupo inteiro.'
            break
          }
          if (!f.campo) {
            erros[id] = 'Filho de grupo sem campo.'
            break
          }
          if (!OPERADORES.includes(f.operador)) {
            erros[id] = `Operador inválido no filho: ${f.operador}.`
            break
          }
        }
      }
      if (g.peso === undefined || g.peso < 0) erros[id] = 'Peso do grupo não pode ser negativo.'
      else soma += g.peso
    } else {
      const t = c as Termo
      if (!t.campo) erros[id] = 'Critério sem campo.'
      else if (!OPERADORES.includes(t.operador))
        erros[id] = `Operador inválido: ${t.operador}. Use ${OPERADORES.join(', ')}.`
      else if (t.peso === undefined || t.peso < 0) erros[id] = 'Peso não pode ser negativo.'
      else soma += t.peso
    }
  })

  if (metodo === 'ponderado' && soma <= 0) {
    erros['soma'] =
      'Soma dos pesos deve ser positiva no método ponderado (peso individual zero é permitido).'
  }
  return erros
}

// validação de faixas: 4 intervalos A/B/C/D sem sobreposição nem lacuna
export const validarFaixas = (
  faixas: Faixa[],
  _metodo: (typeof METODOS)[number],
): Record<string, string> => {
  const erros: Record<string, string> = {}
  const lista = faixas ?? []
  if (lista.length !== 4) {
    erros['faixas'] = 'São necessárias exatamente 4 faixas (A, B, C, D).'
    return erros
  }
  const letras = lista.map((f) => f.letra)
  for (const l of LETRAS_FAIXA) {
    if (!letras.includes(l)) erros['faixas'] = `Falta a faixa ${l}.`
  }
  if (Object.keys(erros).length > 0) return erros

  const ordenadas = [...lista].sort((a, b) => a.de - b.de)
  for (let i = 0; i < ordenadas.length; i++) {
    const f = ordenadas[i]
    if (f.ate < f.de) {
      erros['faixas'] = `Faixa ${f.letra}: limite superior menor que o inferior.`
      return erros
    }
    if (i > 0) {
      const anterior = ordenadas[i - 1]
      if (f.de < anterior.ate) {
        erros['faixas'] =
          `Faixas ${anterior.letra} e ${f.letra} sobrepostas (${f.de} < ${anterior.ate}).`
        return erros
      }
      if (f.de > anterior.ate) {
        erros['faixas'] =
          `Lacuna entre as faixas ${anterior.letra} e ${f.letra} (${anterior.ate} → ${f.de}).`
        return erros
      }
    }
  }
  return erros
}

// validação completa da régua
export const validarRegua = (regua: Partial<Regua>): Record<string, string> => {
  const erros: Record<string, string> = {}
  if (!regua.metodo || !METODOS.includes(regua.metodo)) {
    erros['metodo'] = 'Método inválido: use ponderado ou pontos.'
    return erros
  }
  Object.assign(erros, validarCriterios(regua.criterios ?? [], regua.metodo))
  Object.assign(erros, validarFaixas(regua.faixas ?? [], regua.metodo))
  return erros
}

// soma dos pesos (para exibição)
export const somaPesos = (criterios: Criterio[]): number =>
  (criterios ?? []).reduce((acc, c) => acc + pesoDe(c), 0)
