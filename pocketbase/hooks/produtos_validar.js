// SPEC-1-004 (task 7183cf59): validação de produtos no backend — CA-1-004-01.
// O backend NÃO confia no payload: degrau/tipo dentro da lista, preço não negativo,
// nome obrigatório. A RLS já nega escrita de não-admin; aqui o foco é a integridade.
// F2-T01: recuperado do Skip 50182 (fonte executável) para o repositório.
const DEGRAUS = ['free', 'essencial', 'mapa', 'executivo', 'empresa']
const TIPOS = ['baixo_valor', 'consultivo']

const validarProduto = (rec) => {
  const nome = (rec.getString('nome') || '').trim()
  if (!nome) throw new BadRequestError('Nome do produto é obrigatório.')
  if (nome.length > 120) throw new BadRequestError('Nome do produto excede 120 caracteres.')

  const degrau = rec.getString('degrau') || ''
  if (!DEGRAUS.includes(degrau))
    throw new BadRequestError('Degrau inválido: use free, essencial, mapa, executivo ou empresa.')

  const tipo = rec.getString('tipo_atendimento') || ''
  if (tipo && !TIPOS.includes(tipo))
    throw new BadRequestError('Tipo de atendimento inválido: use baixo_valor ou consultivo.')

  const preco = rec.getInt('preco') || 0
  if (preco < 0) throw new BadRequestError('Preço não pode ser negativo.')

  if (rec.getBool('ativo') && rec.original().getString('id') === '') rec.set('ativo', false)
}

onRecordCreate((e) => {
  validarProduto(e.record)
  return e.next()
}, 'produtos')

onRecordUpdate((e) => {
  validarProduto(e.record)
  return e.next()
}, 'produtos')
