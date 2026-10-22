// Pendência pós-fase (22/10/2026): cadastro→lead — criar lead a partir da pessoa no cadastro.
// POST /backend/v1/cadastro/gerar-lead — autenticado; owner do lead = quem chamou.
// Idempotente: pessoa com lead ativo (etapa != perdido) NÃO gera segundo lead.
// Proteção: pessoa com pedido de saída (bloqueio global) não vira lead.
// Rastro: migracao_origem_id = 'cadastro:<pessoaId>'.
// Espelho de consulta — FONTE EXECUTÁVEL É O SKIP (projeto 50182, v0.0.125/17075f0).
routerAdd(
  'POST',
  '/backend/v1/cadastro/gerar-lead',
  (e) => {
    const auth = e.auth
    if (!auth) return e.unauthorizedError('Autenticação necessária')

    const body = e.requestInfo().body || {}
    const pessoaId = String(body.pessoaId || '')
    if (!pessoaId) return e.badRequestError('pessoaId é obrigatório')

    let pessoa = null
    try {
      pessoa = $app.findRecordById('pessoas', pessoaId)
    } catch (_) {}
    if (!pessoa) return e.notFoundError('Pessoa não encontrada')

    // proteção: pedido de saída vence tudo (mesmo com lead existente)
    const bloqueios = $app.findRecordsByFilter(
      'bloqueios_contato',
      'pessoa = {:p} && motivo = {:m}',
      '',
      1,
      0,
      { p: pessoaId, m: 'pedido_saida' },
    )
    if (bloqueios.length > 0)
      return e.forbiddenError('Pessoa com pedido de saída — não pode virar lead.')

    // idempotência: lead ativo existente para a pessoa
    const existentes = $app.findRecordsByFilter(
      'leads',
      'pessoa = {:p} && etapa != {:et}',
      '-created',
      1,
      0,
      { p: pessoaId, et: 'perdido' },
    )
    if (existentes.length > 0) {
      const l = existentes[0]
      return e.json(200, { acao: 'existente', leadId: l.id, etapa: l.getString('etapa') })
    }

    // empresa opcional (nome do lead vem da razão social)
    const empresaId = String(body.empresaId || '')
    let nomeEmpresa = '(sem empresa)'
    if (empresaId) {
      let emp = null
      try {
        emp = $app.findRecordById('empresas', empresaId)
      } catch (_) {}
      if (!emp) return e.badRequestError('Empresa não encontrada')
      nomeEmpresa = emp.getString('razao_social')
    }

    const lead = new Record($app.findCollectionByNameOrId('leads'))
    lead.set('owner', auth.id)
    lead.set('nome_empresa', nomeEmpresa)
    lead.set('contato_nome', pessoa.getString('nome'))
    const email = pessoa.getString('email_norm')
    if (email) lead.set('contato_email', email)
    const tel = pessoa.getString('telefone_norm')
    if (tel) lead.set('contato_telefone', tel)
    lead.set('origem', String(body.origem || 'inbound'))
    lead.set('etapa', 'lista')
    if (empresaId) lead.set('empresa', empresaId)
    lead.set('pessoa', pessoaId)
    lead.set('migracao_origem_id', 'cadastro:' + pessoaId)
    $app.save(lead)

    return e.json(200, { acao: 'criado', leadId: lead.id, etapa: 'lista' })
  },
  $apis.requireAuth(),
)
