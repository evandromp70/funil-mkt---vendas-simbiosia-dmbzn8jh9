// Simulador da régua: calcula no navegador, sem gravar nada, a nota que um lead teria.
// Espelha a lógica de pocketbase/hooks/scoring_calcular.js (eliminatórias antes da soma,
// campo sem dado conta como critério não cumprido, nota = pesos cumpridos / pesos totais x 100).
import type { Criterio, Grupo, Termo } from '@/services/regua'
import { OPERADORES_PT, campoPorChave, textoDoValor, type LimitesFaixa } from '@/services/camposRegua'

export type Amostra = Record<string, string>
type Cond = { campo: string; operador: string; valor: unknown }
export type Letra = 'A' | 'B' | 'C' | 'D'

export const rotuloCampo = (campo: string): string => campoPorChave(campo)?.rotulo ?? campo

export const descreverCond = (c: Cond): string => {
  const op = OPERADORES_PT[c.operador] ?? c.operador
  const valor = c.operador === 'exists' ? '' : ' ' + (textoDoValor(c.valor) || '…')
  return `${rotuloCampo(c.campo) || 'campo'} ${op}${valor}`
}

const tem = (a: Amostra, campo: string) => (a[campo] ?? '').trim() !== ''

const numero = (x: unknown): number | null => {
  const t = String(x ?? '').trim()
  if (t === '') return null
  const n = Number(t.replace(',', '.'))
  return isNaN(n) ? null : n
}

const avaliar = (c: Cond, a: Amostra): 'ausente' | boolean => {
  if (!c.campo || !tem(a, c.campo)) return 'ausente'
  const v = a[c.campo].trim()
  switch (c.operador) {
    case 'eq': return v === String(c.valor ?? '')
    case 'neq': return v !== String(c.valor ?? '')
    case 'in': return Array.isArray(c.valor) && c.valor.map(String).indexOf(v) !== -1
    case 'contains': return v.indexOf(String(c.valor ?? '')) !== -1
    case 'exists': return true
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte': {
      const x = numero(v)
      const y = numero(c.valor)
      if (x === null || y === null) return false
      if (c.operador === 'gt') return x > y
      if (c.operador === 'gte') return x >= y
      if (c.operador === 'lt') return x < y
      return x <= y
    }
    default: return false
  }
}

const avaliarCriterio = (c: Criterio, a: Amostra): 'ausente' | boolean => {
  if (c.tipo === 'grupo') {
    const g = c as Grupo
    const rs = (g.filhos ?? []).map((f) => avaliar(f, a))
    if (rs.length === 0 || rs.every((r) => r === 'ausente')) return 'ausente'
    const verdades = rs.filter((r) => r === true).length
    return g.combinacao === 'AND' ? verdades === rs.length : verdades > 0
  }
  return avaliar(c as Termo, a)
}

export const descreverCriterio = (c: Criterio): string => {
  if (c.tipo === 'grupo') {
    const g = c as Grupo
    return (g.filhos ?? []).map(descreverCond).join(g.combinacao === 'AND' ? ' E ' : ' OU ') || 'Grupo sem condições'
  }
  return descreverCond(c as Termo)
}

export type ItemSim = {
  id: string
  texto: string
  peso: number
  resultado: 'cumprido' | 'nao_cumprido' | 'sem_dado'
}

export type ResultadoSim = {
  status: 'calculada' | 'eliminada' | 'vazia'
  nota: number | null
  faixa: Letra | null
  itens: ItemSim[]
  eliminadaPor: string
}

export const faixaDaNota = (nota: number, l: LimitesFaixa): Letra =>
  nota >= l.A ? 'A' : nota >= l.B ? 'B' : nota >= l.C ? 'C' : 'D'

export const simular = (
  criterios: Criterio[],
  eliminatorias: Criterio[],
  limites: LimitesFaixa,
  amostra: Amostra,
): ResultadoSim => {
  for (const e of eliminatorias) {
    if (avaliarCriterio(e, amostra) === true) {
      return { status: 'eliminada', nota: null, faixa: null, itens: [], eliminadaPor: descreverCriterio(e) }
    }
  }
  const itens: ItemSim[] = criterios.map((c) => {
    const r = avaliarCriterio(c, amostra)
    return {
      id: c.id,
      texto: descreverCriterio(c),
      peso: Number(c.peso) || 0,
      resultado: r === 'ausente' ? 'sem_dado' : r ? 'cumprido' : 'nao_cumprido',
    }
  })
  const soma = itens.reduce((acc, i) => acc + i.peso, 0)
  if (soma <= 0) return { status: 'vazia', nota: null, faixa: null, itens, eliminadaPor: '' }
  const ganho = itens.filter((i) => i.resultado === 'cumprido').reduce((acc, i) => acc + i.peso, 0)
  const nota = Math.round(((100 * ganho) / soma) * 100) / 100
  return { status: 'calculada', nota, faixa: faixaDaNota(nota, limites), itens, eliminadaPor: '' }
}

// Campos que a régua usa (critérios e eliminatórias), sem repetir.
export const camposUsados = (criterios: Criterio[], eliminatorias: Criterio[]): string[] => {
  const lista: string[] = []
  const add = (campo?: string) => {
    if (campo && lista.indexOf(campo) === -1) lista.push(campo)
  }
  const olhar = (c: Criterio) => {
    if (c.tipo === 'grupo') (c as Grupo).filhos?.forEach((f) => add(f.campo))
    else add((c as Termo).campo)
  }
  criterios.forEach(olhar)
  eliminatorias.forEach(olhar)
  return lista
}

// Monta um lead de exemplo que cumpre os critérios (ignora as regras que eliminam).
export const amostraIdeal = (criterios: Criterio[]): Amostra => {
  const a: Amostra = {}
  const colocar = (c: Cond) => {
    if (!c.campo) return
    const n = numero(c.valor)
    if (c.operador === 'in' && Array.isArray(c.valor) && c.valor.length > 0) {
      a[c.campo] = String(c.valor[0])
    } else if (c.operador === 'eq' || c.operador === 'contains') {
      a[c.campo] = String(c.valor ?? '')
    } else if (c.operador === 'neq') {
      a[c.campo] = 'outro valor'
    } else if (c.operador === 'exists') {
      a[c.campo] = 'informado'
    } else if (n !== null && (c.operador === 'gte' || c.operador === 'lte')) {
      a[c.campo] = String(n)
    } else if (n !== null && c.operador === 'gt') {
      a[c.campo] = String(n + 1)
    } else if (n !== null && c.operador === 'lt') {
      a[c.campo] = String(n - 1)
    }
  }
  criterios.forEach((c) => {
    if (c.tipo === 'grupo') {
      const g = c as Grupo
      if (g.filhos && g.filhos.length > 0) colocar(g.filhos[0])
    } else colocar(c as Termo)
  })
  return a
}
