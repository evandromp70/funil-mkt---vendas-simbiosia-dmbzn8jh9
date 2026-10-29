// SPEC-1-004 (task 7183cf59): validação de produtos no backend — CA-1-004-01.
// O backend NÃO confia no payload: degrau/tipo dentro da lista, preço não negativo,
// nome obrigatório. Motivo legível por campo problemático.
//
// CORREÇÃO (29/10/2026): as funções estavam no TOP-LEVEL e a VM do PocketBase não as enxerga
// dentro dos callbacks — "Hook scoping error". Toda a lógica foi para DENTRO de cada callback.
// Consequência prática que isso já causou: o apply falhava e a limpeza gravava versão sem build.
onRecordCreate((e) => {
  const DEGRAUS = ['free', 'essencial', 'mapa', 'executivo', 'empresa']
  const TIPOS = ['baixo_valor', 'consultivo']

  const nome = (e.record.getString('nome') || '').trim()
  if (!nome) throw new BadRequestError('Nome do produto é obrigatório.')
  if (nome.length > 120) throw new BadRequestError('Nome do produto excede 120 caracteres.')

  const degrau = e.record.getString('degrau') || ''
  if (DEGRAUS.indexOf(degrau) === -1)
    throw new BadRequestError('Degrau inválido: use free, essencial, mapa, executivo ou empresa.')

  const tipo = e.record.getString('tipo_atendimento') || ''
  if (tipo && TIPOS.indexOf(tipo) === -1)
    throw new BadRequestError('Tipo de atendimento inválido: use baixo_valor ou consultivo.')

  const preco = e.record.getInt('preco') || 0
  if (preco < 0) throw new BadRequestError('Preço não pode ser negativo.')

  // produto novo nasce inativo (rascunho) — ativação é decisão do admin
  if (e.record.getBool('ativo') && String(e.record.original().getString('id')) === '')
    e.record.set('ativo', false)

  return e.next()
}, 'produtos')

onRecordUpdate((e) => {
  const DEGRAUS = ['free', 'essencial', 'mapa', 'executivo', 'empresa']
  const TIPOS = ['baixo_valor', 'consultivo']

  const nome = (e.record.getString('nome') || '').trim()
  if (!nome) throw new BadRequestError('Nome do produto é obrigatório.')
  if (nome.length > 120) throw new BadRequestError('Nome do produto excede 120 caracteres.')

  const degrau = e.record.getString('degrau') || ''
  if (DEGRAUS.indexOf(degrau) === -1)
    throw new BadRequestError('Degrau inválido: use free, essencial, mapa, executivo ou empresa.')

  const tipo = e.record.getString('tipo_atendimento') || ''
  if (tipo && TIPOS.indexOf(tipo) === -1)
    throw new BadRequestError('Tipo de atendimento inválido: use baixo_valor ou consultivo.')

  const preco = e.record.getInt('preco') || 0
  if (preco < 0) throw new BadRequestError('Preço não pode ser negativo.')

  return e.next()
}, 'produtos')
