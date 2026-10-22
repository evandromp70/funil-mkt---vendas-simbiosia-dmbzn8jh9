// SPEC-1-004 (task b0c25923): validação e versionamento da régua no backend — CA-02/04.
// O backend NÃO confia no payload: valida critérios/faixas (sem eval), calcula hash,
// impõe versão = próxima livre, torna a versão APROVADA imutável e registra aprovação.
// Toda via termina em e.next() ou throw (guia 3.3). Lógica INLINE em cada callback
// (hooks Skip executam callbacks em VM própria — sem referência a declaração top-level).
onRecordCreate((e) => {
  const rec = e.record
  const OPERADORES = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'contains', 'exists']
  const LETRAS = ['A', 'B', 'C', 'D']

  // ---- validação de conteúdo (inline) ----
  const metodo = rec.getString('metodo') || ''
  if (metodo !== 'ponderado' && metodo !== 'pontos')
    throw new BadRequestError('Método inválido: use ponderado ou pontos.')
  const parse = (campo) => {
    try {
      return JSON.parse(rec.getString(campo) || '[]')
    } catch (_) {
      throw new BadRequestError('Conteúdo de ' + campo + ' não é JSON válido.')
    }
  }
  const criterios = parse('criterios')
  const faixas = parse('faixas')
  if (!Array.isArray(criterios) || criterios.length === 0)
    throw new BadRequestError('A régua precisa de pelo menos um critério.')
  let soma = 0
  criterios.forEach((c, i) => {
    const id = c.id || 'criterio-' + (i + 1)
    if (c.tipo === 'grupo') {
      if (!Array.isArray(c.filhos) || c.filhos.length === 0)
        throw new BadRequestError(id + ': grupo vazio é inválido — um grupo precisa de filhos.')
      for (const f of c.filhos) {
        if (f.peso !== undefined)
          throw new BadRequestError(
            id + ': filho de grupo não tem peso próprio — o peso é do grupo inteiro.',
          )
        if (!f.campo) throw new BadRequestError(id + ': filho de grupo sem campo.')
        if (!OPERADORES.includes(f.operador))
          throw new BadRequestError(id + ': operador inválido no filho: ' + f.operador + '.')
      }
      if (c.peso === undefined || c.peso < 0)
        throw new BadRequestError(id + ': peso do grupo não pode ser negativo.')
      soma += c.peso
    } else {
      if (!c.campo) throw new BadRequestError(id + ': critério sem campo.')
      if (!OPERADORES.includes(c.operador))
        throw new BadRequestError(id + ': operador inválido: ' + c.operador + '.')
      if (c.peso === undefined || c.peso < 0)
        throw new BadRequestError(id + ': peso não pode ser negativo.')
      soma += c.peso
    }
  })
  if (metodo === 'ponderado' && soma <= 0)
    throw new BadRequestError(
      'Soma dos pesos deve ser positiva no método ponderado (peso individual zero é permitido).',
    )
  if (!Array.isArray(faixas) || faixas.length !== 4)
    throw new BadRequestError('São necessárias exatamente 4 faixas (A, B, C, D).')
  for (const l of LETRAS) {
    if (!faixas.some((f) => f.letra === l)) throw new BadRequestError('Falta a faixa ' + l + '.')
  }
  const ordenadas = [...faixas].sort((a, b) => a.de - b.de)
  for (let i = 0; i < ordenadas.length; i++) {
    const f = ordenadas[i]
    if (f.ate < f.de)
      throw new BadRequestError('Faixa ' + f.letra + ': limite superior menor que o inferior.')
    if (i > 0) {
      const anterior = ordenadas[i - 1]
      if (f.de < anterior.ate)
        throw new BadRequestError(
          'Faixas ' +
            anterior.letra +
            ' e ' +
            f.letra +
            ' sobrepostas (' +
            f.de +
            ' < ' +
            anterior.ate +
            ').',
        )
      if (f.de > anterior.ate)
        throw new BadRequestError(
          'Lacuna entre as faixas ' +
            anterior.letra +
            ' e ' +
            f.letra +
            ' (' +
            anterior.ate +
            ' → ' +
            f.de +
            ').',
        )
    }
  }

  // ---- status nasce rascunho ----
  if (!rec.getString('status')) rec.set('status', 'rascunho')
  if (rec.getString('status') !== 'rascunho')
    throw new BadRequestError('Régua nova nasce como rascunho — a aprovação é uma ação explícita.')

  // ---- versão = próxima livre do produto+ambiente (servidor decide) ----
  try {
    const existentes = $app.findRecordsByFilter(
      'regras_produto',
      'produto = {:p} && ambiente = {:a}',
      '-versao',
      1,
      0,
      { p: rec.getString('produto'), a: rec.getString('ambiente') || 'teste' },
    )
    rec.set('versao', existentes.length > 0 ? existentes[0].getInt('versao') + 1 : 1)
  } catch (_) {
    rec.set('versao', 1)
  }

  // ---- hash calculado no servidor sobre o conteúdo canonizado ----
  const conteudo = {
    metodo: rec.getString('metodo'),
    criterios: rec.getString('criterios'),
    regras_eliminatorias: rec.getString('regras_eliminatorias'),
    faixas: rec.getString('faixas'),
  }
  const canonizar = (valor) => {
    if (Array.isArray(valor)) return valor.map(canonizar)
    if (valor && typeof valor === 'object') {
      const o = {}
      for (const k of Object.keys(valor).sort()) o[k] = canonizar(valor[k])
      return o
    }
    return valor
  }
  const canonico = JSON.stringify(canonizar(conteudo))
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
  rec.set('hash', saida.substring(0, 64))
  return e.next()
}, 'regras_produto')

onRecordUpdate((e) => {
  const rec = e.record
  const antes = rec.original()
  const OPERADORES = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'contains', 'exists']
  const LETRAS = ['A', 'B', 'C', 'D']

  const mudouConteudo =
    antes.getString('metodo') !== rec.getString('metodo') ||
    antes.getString('criterios') !== rec.getString('criterios') ||
    antes.getString('regras_eliminatorias') !== rec.getString('regras_eliminatorias') ||
    antes.getString('faixas') !== rec.getString('faixas')

  // versão APROVADA é imutável (qualquer mudança de conteúdo → negado)
  if (antes.getString('status') === 'aprovada' && mudouConteudo)
    throw new BadRequestError(
      'Versão aprovada é imutável — edite criando um rascunho novo (a versão anterior permanece íntegra).',
    )

  // mudou conteúdo? revalida e recalcula o hash
  if (mudouConteudo) {
    const metodo = rec.getString('metodo') || ''
    if (metodo !== 'ponderado' && metodo !== 'pontos')
      throw new BadRequestError('Método inválido: use ponderado ou pontos.')
    const parse = (campo) => {
      try {
        return JSON.parse(rec.getString(campo) || '[]')
      } catch (_) {
        throw new BadRequestError('Conteúdo de ' + campo + ' não é JSON válido.')
      }
    }
    const criterios = parse('criterios')
    const faixas = parse('faixas')
    if (!Array.isArray(criterios) || criterios.length === 0)
      throw new BadRequestError('A régua precisa de pelo menos um critério.')
    let soma = 0
    criterios.forEach((c, i) => {
      const id = c.id || 'criterio-' + (i + 1)
      if (c.tipo === 'grupo') {
        if (!Array.isArray(c.filhos) || c.filhos.length === 0)
          throw new BadRequestError(id + ': grupo vazio é inválido — um grupo precisa de filhos.')
        for (const f of c.filhos) {
          if (f.peso !== undefined)
            throw new BadRequestError(
              id + ': filho de grupo não tem peso próprio — o peso é do grupo inteiro.',
            )
          if (!f.campo) throw new BadRequestError(id + ': filho de grupo sem campo.')
          if (!OPERADORES.includes(f.operador))
            throw new BadRequestError(id + ': operador inválido no filho: ' + f.operador + '.')
        }
        if (c.peso === undefined || c.peso < 0)
          throw new BadRequestError(id + ': peso do grupo não pode ser negativo.')
        soma += c.peso
      } else {
        if (!c.campo) throw new BadRequestError(id + ': critério sem campo.')
        if (!OPERADORES.includes(c.operador))
          throw new BadRequestError(id + ': operador inválido: ' + c.operador + '.')
        if (c.peso === undefined || c.peso < 0)
          throw new BadRequestError(id + ': peso não pode ser negativo.')
        soma += c.peso
      }
    })
    if (metodo === 'ponderado' && soma <= 0)
      throw new BadRequestError(
        'Soma dos pesos deve ser positiva no método ponderado (peso individual zero é permitido).',
      )
    if (!Array.isArray(faixas) || faixas.length !== 4)
      throw new BadRequestError('São necessárias exatamente 4 faixas (A, B, C, D).')
    for (const l of LETRAS) {
      if (!faixas.some((f) => f.letra === l)) throw new BadRequestError('Falta a faixa ' + l + '.')
    }
    const ordenadas = [...faixas].sort((a, b) => a.de - b.de)
    for (let i = 0; i < ordenadas.length; i++) {
      const f = ordenadas[i]
      if (f.ate < f.de)
        throw new BadRequestError('Faixa ' + f.letra + ': limite superior menor que o inferior.')
      if (i > 0) {
        const anterior = ordenadas[i - 1]
        if (f.de < anterior.ate)
          throw new BadRequestError(
            'Faixas ' +
              anterior.letra +
              ' e ' +
              f.letra +
              ' sobrepostas (' +
              f.de +
              ' < ' +
              anterior.ate +
              ').',
          )
        if (f.de > anterior.ate)
          throw new BadRequestError(
            'Lacuna entre as faixas ' +
              anterior.letra +
              ' e ' +
              f.letra +
              ' (' +
              anterior.ate +
              ' → ' +
              f.de +
              ').',
          )
      }
    }

    const conteudo = {
      metodo: rec.getString('metodo'),
      criterios: rec.getString('criterios'),
      regras_eliminatorias: rec.getString('regras_eliminatorias'),
      faixas: rec.getString('faixas'),
    }
    const canonizar = (valor) => {
      if (Array.isArray(valor)) return valor.map(canonizar)
      if (valor && typeof valor === 'object') {
        const o = {}
        for (const k of Object.keys(valor).sort()) o[k] = canonizar(valor[k])
        return o
      }
      return valor
    }
    const canonico = JSON.stringify(canonizar(conteudo))
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
    rec.set('hash', saida.substring(0, 64))
  }

  // aprovação: conteúdo já validado; registra autor/data no servidor
  if (rec.getString('status') === 'aprovada' && antes.getString('status') !== 'aprovada') {
    rec.set('aprovado_por', e.auth?.id || '')
    rec.set('aprovado_em', new Date().toISOString().replace('T', ' '))

    // SPEC-1-005 (task 2faac03b): aprovar régua cria o job de repontuação pendente e
    // torna obsoletos os jobs PENDENTES de versões anteriores do mesmo produto+ambiente
    // (a versão nova vira a vigente; job velho nunca sobrescreve).
    const produtoId = rec.getString('produto')
    const ambienteJob = rec.getString('ambiente') || 'teste'
    try {
      const pendentes = $app.findRecordsByFilter(
        'jobs_pontuacao',
        "produto = {:p} && ambiente = {:a} && status = 'pendente'",
        '',
        0,
        0,
        { p: produtoId, a: ambienteJob },
      )
      for (const j of pendentes) {
        if (j.getInt('versao') !== rec.getInt('versao')) {
          j.set('status', 'obsoleto')
          $app.save(j)
        }
      }
    } catch (errJ) {
      $app.logger().warn('regua: falha ao tornar jobs obsoletos', 'err', String(errJ))
    }
    try {
      const colJobs = $app.findCollectionByNameOrId('jobs_pontuacao')
      const job = new Record(colJobs)
      job.set('produto', produtoId)
      job.set('regua', rec.id)
      job.set('versao', rec.getInt('versao'))
      job.set('status', 'pendente')
      job.set('processados', 0)
      job.set('ignorados', 0)
      job.set('erros', 0)
      job.set('ponteiros_antes', '{}')
      job.set('publicados', '{}')
      job.set('criado_por', e.auth?.id || '')
      job.set('ambiente', ambienteJob)
      $app.save(job)
    } catch (errJob) {
      // falha alta: aprovar régua sem job criado deixaria a repontuação invisível
      throw new BadRequestError('Falha ao criar o job de repontuação: ' + String(errJob))
    }
  }
  // arquivar preserva aprovado_por/em (histórico)
  return e.next()
}, 'regras_produto')

onRecordDelete((e) => {
  const rec = e.record
  // limpeza pós-SPEC-1-007: em ambiente teste, fixtures podem ser apagadas
  if (rec.getString('ambiente') === 'teste') return e.next()
  if (rec.getString('status') !== 'rascunho')
    throw new BadRequestError(
      'Só rascunho pode ser apagado — versões aprovadas/arquivadas permanecem no histórico.',
    )
  return e.next()
}, 'regras_produto')
