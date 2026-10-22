// SPEC-1-007 (task acc7d79f): fonte pura da reconciliação — CA-1-007-03.
// Funções puras, sem rede/estado. O hook sync_aplicar embute estas funções inline
// (VM própria do Skip); o gerador remove a LINHA "export " ao embutir.
// O runner de testes compara a fonte com o hook (alinhado ao gerador: remove a linha).

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
// (evento antigo não reativa alias revogado)
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

// ---------- pausa de cadência por conflito de identidade ----------
// Na fusão, o Funil pausa (cancela) as cadências dos DOIS contextos até revisão humana.
// Uma cadência ativa por pessoa usa a identidade efetiva — nunca dois IDs antigos.
export function cadenciasParaPausar(cadencias, gidOrigem, gidDestino) {
  return cadencias.filter((c) => c.lead === gidOrigem || c.lead === gidDestino)
}

// ---------- decisão de reconciliação (estende a máquina do inbox) ----------
// estadoAtual: { estado, hash, revisao } do recibo existente (aplicado/duplicado/conflito)
// Retorna { acao, motivo? } — pura.
export function decidirReconciliacao(evento, estadoAtual, temMapeamento, temReferencias) {
  // sem recibo: mesma regra da máquina base
  if (!estadoAtual) {
    if (temMapeamento === false)
      return { acao: 'pendente', motivo: 'sem mapeamento de ator aprovado' }
    if (temReferencias === false)
      return { acao: 'pendente', motivo: 'referências ainda não projetadas' }
    return { acao: 'aplicar' }
  }
  // mesmo evento_id + mesmo hash + mesma revisão: duplicado terminal
  if (estadoAtual.hash === evento.payload_hash && estadoAtual.revisao === evento.revisao) {
    return { acao: 'duplicado' }
  }
  // mesmo evento_id + hash diferente na MESMA revisão: conflito (não sobrescreve em silêncio)
  if (estadoAtual.hash !== evento.payload_hash && estadoAtual.revisao === evento.revisao) {
    return { acao: 'conflito', motivo: 'mesmo evento_id/revisão com payload diferente' }
  }
  // revisão menor na mesma chave: atrasada, não substitui ponteiro
  if (evento.revisao < estadoAtual.revisao) return { acao: 'atrasado' }
  if (!temMapeamento) return { acao: 'pendente', motivo: 'sem mapeamento de ator aprovado' }
  if (temReferencias === false)
    return { acao: 'pendente', motivo: 'referências ainda não projetadas' }
  return { acao: 'aplicar' }
}
