// SPEC-1-004 (task 46c0fd51): validação da entrevista no backend — CA-1-004-03.
// O backend NÃO confia no payload: confirmação com pendência é NEGADA; autor e data
// de confirmação são registrados no servidor. Confirmação NÃO ativa o produto.
// Toda via termina em e.next() ou throw (guia 3.3).
const ROTEIRO_CHAVES = [
  'dor_area',
  'decisor',
  'segmento_porte',
  'localizacao',
  'campos_fontes',
  'criterios',
  'pesos',
  'eliminatorias',
  'faixas',
  'abordagem',
]

const pendenciasDe = (respostasJson) => {
  let respostas = {}
  try {
    respostas = JSON.parse(respostasJson || '{}')
  } catch (_) {}
  const pendencias = []
  for (const chave of ROTEIRO_CHAVES) {
    if (!String(respostas[chave] ?? '').trim()) pendencias.push(chave)
  }
  return pendencias
}

onRecordCreate((e) => {
  const rec = e.record
  // nasce sempre rascunho; pendências calculadas no servidor
  rec.set('status', 'rascunho')
  rec.set('pendencias', JSON.stringify(pendenciasDe(rec.getString('respostas'))))
  rec.set('confirmada_por', '')
  rec.set('confirmada_em', '')
  return e.next()
}, 'entrevista_produtos')

onRecordUpdate((e) => {
  const rec = e.record
  const pendencias = pendenciasDe(rec.getString('respostas'))
  rec.set('pendencias', JSON.stringify(pendencias))

  if (rec.getString('status') === 'confirmada') {
    if (pendencias.length > 0) {
      throw new BadRequestError(
        'Entrevista incompleta — pendências: ' +
          pendencias.join(', ') +
          '. Complete as respostas antes de confirmar.',
      )
    }
    // autor e data registrados no servidor (não confiam no payload)
    if (!rec.original().getString('confirmada_em')) {
      rec.set('confirmada_por', e.auth?.id || '')
      rec.set('confirmada_em', new Date().toISOString().replace('T', ' '))
      // confirmação NÃO ativa o produto (aprovação da régua é a task b0c25923)
    }
  } else {
    rec.set('confirmada_por', '')
    rec.set('confirmada_em', '')
  }
  return e.next()
}, 'entrevista_produtos')
