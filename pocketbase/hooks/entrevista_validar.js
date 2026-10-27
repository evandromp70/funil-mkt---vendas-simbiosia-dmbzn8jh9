// SPEC-1-004 (task 46c0fd51): validação da entrevista no backend — CA-1-004-03.
// Confirmação com pendência é NEGADA; autor e data registrados no servidor. Não ativa produto.
// F2-T01: recuperado do Skip 50182 (fonte executável) para o repositório.
onRecordCreate((e) => {
  const rec = e.record
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
    if (!rec.original().getString('confirmada_em')) {
      rec.set('confirmada_por', e.auth?.id || '')
      rec.set('confirmada_em', new Date().toISOString().replace('T', ' '))
    }
  } else {
    rec.set('confirmada_por', '')
    rec.set('confirmada_em', '')
  }
  return e.next()
}, 'entrevista_produtos')
