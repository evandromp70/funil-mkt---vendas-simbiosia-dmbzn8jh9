// espelho de consulta — FONTE EXECUTÁVEL É O SKIP (projeto 50182, v0.0.118/58773c6).
// SPEC-1-007 (acc7d79f): fonte pura da reconciliação — CA-1-007-03.
// Funções puras, sem rede/estado. O hook sync_aplicar embute estas funções inline
// (VM própria do Skip); o gerador remove a LINHA "export " ao embutir.

// ---------- fusão reversível (alias de identidade) ----------
// Fusão: origem_global vira alias de destino_global (sobrevivente). Sem apagar histórico.
export function aliasDaFusao(origem_global, destino_global, rev, ambiente) {
  if (typeof origem_global !== 'string' || typeof destino_global !== 'string') return null
  const o = origem_global.split(':')
  const d = destino_global.split(':')
  if (o.length !== 4 || d.length !== 4) return null
  if (o[0] !== 'FAB' || d[0] !== 'FAB') return null
  if (o[1] !== d[1] || o[1] !== ambiente) return null // mesmo ambiente
  if (o[2] !== d[2]) return null // mesmo tipo (empresa↔empresa, pessoa↔pessoa)
  if (origem_global === destino_global) return null // ciclo trivial
  if (!Number.isInteger(rev) || rev < 1) return null
  return { origem_global, destino_global, rev, status: 'ativo' }
}

// revogação: restaura IDs originais, conserva histórico, rev superior
export function aliasRevogado(alias, revNovo) {
  if (!alias || alias.status !== 'ativo') return null
  if (!Number.isInteger(revNovo) || revNovo <= alias.rev) return null
  return { ...alias, rev: revNovo, status: 'revogado' }
}

// resolução de identidade efetiva: segue alias ATIVO; alias revogado NÃO é seguido
export function identidadeEfetiva(gid, aliases) {
  let atual = gid
  const vistos = new Set()
  while (true) {
    if (vistos.has(atual)) return null // ciclo
    vistos.add(atual)
    const a = aliases.find((x) => x.origem_global === atual && x.status === 'ativo')
    if (!a) return atual
    atual = a.destino_global
  }
}

// pausa de cadência por conflito de identidade
export function cadenciasParaPausar(cadencias, gidOrigem, gidDestino) {
  return cadencias.filter((c) => c.lead === gidOrigem || c.lead === gidDestino)
}

// decisão de reconciliação (estende a máquina do inbox)
export function decidirReconciliacao(evento, estadoAtual, temMapeamento, temReferencias) {
  if (!estadoAtual) {
    if (temMapeamento === false) return { acao: 'pendente', motivo: 'sem mapeamento de ator aprovado' }
    if (temReferencias === false) return { acao: 'pendente', motivo: 'referências ainda não projetadas' }
    return { acao: 'aplicar' }
  }
  if (estadoAtual.hash === evento.payload_hash && estadoAtual.revisao === evento.revisao) {
    return { acao: 'duplicado' }
  }
  if (estadoAtual.hash !== evento.payload_hash && estadoAtual.revisao === evento.revisao) {
    return { acao: 'conflito', motivo: 'mesmo evento_id/revisão com payload diferente' }
  }
  if (evento.revisao < estadoAtual.revisao) return { acao: 'atrasado' }
  if (!temMapeamento) return { acao: 'pendente', motivo: 'sem mapeamento de ator aprovado' }
  if (temReferencias === false) return { acao: 'pendente', motivo: 'referências ainda não projetadas' }
  return { acao: 'aplicar' }
}
