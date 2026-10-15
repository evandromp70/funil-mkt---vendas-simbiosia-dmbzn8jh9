// SPEC-1-004 (task 46c0fd51): validação da entrevista no backend — CA-1-004-03.
// O backend NÃO confia no payload: confirmação com pendência é NEGADA; autor e data
// de confirmação são registrados no servidor. Confirmação NÃO ativa o produto.
// Toda via termina em e.next() ou throw (guia 3.3). Funções ficam inline no callback
// (hooks Skip executam callbacks em VM própria — sem referência a declaração top-level).
onRecordCreate((e) => {
  const rec = e.record
  // nasce sempre rascunho; pendências calculadas no servidor
  rec.set('status', 'rascunho')
  let respostas = {}
  try {
    respostas = JSON.parse(rec.getString('respostas') || '{}')
  } catch (_) {}
  const CHAVES = [
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
  const pendencias = CHAVES.filter((c) => !String(respostas[c] ?? '').trim())
  rec.set('pendencias', JSON.stringify(pendencias))
  rec.set('confirmada_por', '')
  rec.set('confirmada_em', '')
  return e.next()
}, 'entrevista_produtos')

onRecordUpdate((e) => {
  const rec = e.record
  let respostas = {}
  try {
    respostas = JSON.parse(rec.getString('respostas') || '{}')
  } catch (_) {}
  const CHAVES = [
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
  const pendencias = CHAVES.filter((c) => !String(respostas[c] ?? '').trim())
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
