// SPEC-2-002 (F2-T06): mensagens e aprovação vinculada — CA-2-002-03.
//
// POST /backend/v1/mensagens/criar      { pessoaId, produtoId, canal, remetenteId?, conteudo, coorte? }
// POST /backend/v1/mensagens/editar     { mensagemId, conteudo?, canal?, remetenteId? }
// POST /backend/v1/aprovacoes/aprovar   { mensagemId }
// POST /backend/v1/aprovacoes/revogar   { mensagemId, motivo }
// GET  /backend/v1/mensagens/pode-executar?mensagemId=X   (a F2-T05 vai consumir esta)
//
// PRINCÍPIO: a aprovação é um selo sobre um HASH de conteúdo, não um booleano no registro.
//   - o hash é SEMPRE calculado no servidor; hash vindo do cliente é ignorado
//   - pode-executar RECALCULA o hash do conteúdo atual e compara com o aprovado.
//     Não confio em flag "invalidada" gravada na edição: edição pode vir por outro caminho.
//   - aprovar NÃO envia nada e NÃO muda o estado de toque nenhum.
//
// Lógica inline no callback (VM própria do PocketBase).
routerAdd(
  'POST',
  '/backend/v1/mensagens/criar',
  (e) => {
    if (!e.auth) return e.unauthorizedError('Autenticação obrigatória')
    const body = e.requestInfo().body || {}

    const pessoaId = String(body.pessoaId || '').trim()
    const canal = String(body.canal || '').trim()
    const conteudo = String(body.conteudo || '').trim()
    if (!pessoaId) return e.badRequestError('pessoaId é obrigatório')
    if (!canal) return e.badRequestError('canal é obrigatório')
    if (!conteudo) return e.badRequestError('conteudo é obrigatório')

    const CANAIS = ['email', 'whatsapp', 'linkedin', 'telefone']
    if (CANAIS.indexOf(canal) === -1) return e.badRequestError('canal inválido')

    let pessoa
    try {
      pessoa = $app.findRecordById('pessoas', pessoaId)
    } catch (_) {
      return e.notFoundError('Pessoa não encontrada')
    }

    const hashDe = (texto) => {
      let h = 5381
      const t = String(texto)
      for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) | 0
      return 'm' + (h >>> 0).toString(16) + '-' + t.length
    }

    // coorte da pessoa: relacionamento se conhecida, senão fria
    let coorte = String(body.coorte || '').trim()
    if (!coorte) coorte = pessoa.getBool('relacionamento_conhecido') ? 'relacionamento' : 'fria'

    // a coorte exige aprovação individual?
    let exigeAprovacao = false
    let versaoConfig = 0
    try {
      const pols = $app.findRecordsByFilter(
        'politicas_coorte',
        'coorte = {:c} && status = :st',
        '-versao',
        1,
        0,
        { c: coorte, st: 'aprovada' },
      )
      if (pols.length > 0) {
        exigeAprovacao = pols[0].getBool('exige_aprovacao_mensagem')
        versaoConfig = Number(pols[0].get('versao') || 0)
      } else {
        exigeAprovacao = true // sem política aprovada → pendente, nunca liberado
      }
    } catch (_) {
      exigeAprovacao = true
    }

    const remetenteId = String(body.remetenteId || e.auth.id)

    try {
      const col = $app.findCollectionByNameOrId('mensagens')
      const reg = new Record(col)
      reg.set('pessoa', pessoaId)
      if (body.produtoId) reg.set('produto', String(body.produtoId))
      if (body.contextoId) reg.set('contexto', String(body.contextoId))
      if (body.cadenciaId) reg.set('cadencia', String(body.cadenciaId))
      reg.set('canal', canal)
      reg.set('remetente', remetenteId)
      reg.set('conteudo', conteudo)
      reg.set('conteudo_hash', hashDe(conteudo))
      reg.set('versao_config', versaoConfig)
      reg.set('coorte', coorte)
      reg.set('estado', exigeAprovacao ? 'pendente_aprovacao' : 'aprovada')
      reg.set('motivo_codigo', exigeAprovacao ? 'aguarda_aprovacao_socio' : 'coorte_nao_exige')
      reg.set('owner', e.auth.id)
      reg.set('ambiente', 'teste')
      $app.save(reg)

      return e.json(200, {
        mensagemId: reg.id,
        estado: exigeAprovacao ? 'pendente_aprovacao' : 'aprovada',
        conteudoHash: hashDe(conteudo),
        coorte: coorte,
        exigeAprovacao: exigeAprovacao,
        detalhe: exigeAprovacao
          ? 'Mensagem criada aguardando aprovação do sócio responsável.'
          : 'Coorte não exige aprovação individual — ainda assim depende de régua e limites.',
      })
    } catch (err) {
      $app.logger().error('falha ao criar mensagem', 'err', String(err))
      return e.internalServerError('Não foi possível criar a mensagem')
    }
  },
  $apis.requireAuth(),
)

// ------------------------------------------------------------------ editar
routerAdd(
  'POST',
  '/backend/v1/mensagens/editar',
  (e) => {
    if (!e.auth) return e.unauthorizedError('Autenticação obrigatória')
    const body = e.requestInfo().body || {}
    const mensagemId = String(body.mensagemId || '').trim()
    if (!mensagemId) return e.badRequestError('mensagemId é obrigatório')

    let msg
    try {
      msg = $app.findRecordById('mensagens', mensagemId)
    } catch (_) {
      return e.notFoundError('Mensagem não encontrada')
    }

    const hashDe = (texto) => {
      let h = 5381
      const t = String(texto)
      for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) | 0
      return 'm' + (h >>> 0).toString(16) + '-' + t.length
    }

    const anterior = {
      conteudo: String(msg.getString('conteudo') || ''),
      canal: String(msg.getString('canal') || ''),
      remetente: String(msg.getString('remetente') || ''),
    }

    try {
      if (body.conteudo !== undefined) msg.set('conteudo', String(body.conteudo))
      if (body.canal !== undefined) {
        const CANAIS = ['email', 'whatsapp', 'linkedin', 'telefone']
        if (CANAIS.indexOf(String(body.canal)) === -1) return e.badRequestError('canal inválido')
        msg.set('canal', String(body.canal))
      }
      if (body.remetenteId !== undefined) msg.set('remetente', String(body.remetenteId))

      const novoConteudo = String(msg.getString('conteudo') || '')
      const hashNovo = hashDe(novoConteudo)
      msg.set('conteudo_hash', hashNovo)

      const mudouAlgo =
        novoConteudo !== anterior.conteudo ||
        String(msg.getString('canal') || '') !== anterior.canal ||
        String(msg.getString('remetente') || '') !== anterior.remetente

      // invalida a aprovação vigente — redundante com pode-executar, mas deixa o estado coerente
      let invalidouAprovacao = false
      if (mudouAlgo) {
        try {
          const aps = $app.findRecordsByFilter(
            'aprovacoes',
            'mensagem = {:m} && estado = :st',
            '',
            5,
            0,
            { m: mensagemId, st: 'valida' },
          )
          for (let i = 0; i < aps.length; i++) {
            aps[i].set('estado', 'invalidada')
            aps[i].set('motivo_codigo', 'conteudo_alterado')
            $app.save(aps[i])
            invalidouAprovacao = true
          }
        } catch (_) {}

        const coorte = String(msg.getString('coorte') || '')
        let exige = true
        try {
          const pols = $app.findRecordsByFilter(
            'politicas_coorte',
            'coorte = {:c} && status = :st',
            '-versao',
            1,
            0,
            { c: coorte, st: 'aprovada' },
          )
          if (pols.length > 0) exige = pols[0].getBool('exige_aprovacao_mensagem')
        } catch (_) {}
        if (exige) {
          msg.set('estado', 'pendente_aprovacao')
          msg.set('motivo_codigo', 'reaprovacao_necessaria')
        } else {
          msg.set('estado', 'aprovada')
          msg.set('motivo_codigo', 'coorte_nao_exige')
        }
      }

      $app.save(msg)

      return e.json(200, {
        mensagemId: msg.id,
        conteudoHash: hashNovo,
        estado: String(msg.getString('estado')),
        invalidouAprovacao: invalidouAprovacao,
        detalhe: invalidouAprovacao
          ? 'Conteúdo alterado: a aprovação anterior deixou de valer.'
          : 'Nada relevante mudou.',
      })
    } catch (err) {
      $app.logger().error('falha ao editar mensagem', 'err', String(err))
      return e.internalServerError('Não foi possível editar a mensagem')
    }
  },
  $apis.requireAuth(),
)

// AUTORIDADE DE APROVAÇÃO:
//   - papel admin OU socio aprova;
//   - e, não sendo admin, precisa ser o DONO DA RELAÇÃO da pessoa (pessoas.owner_relacao)
//     ou o remetente da mensagem — "sócio alheio" não aprova mensagem de outro.
//
// APROVAR NÃO ENVIA. O estado do toque/fila não muda aqui.
routerAdd(
  'POST',
  '/backend/v1/aprovacoes/aprovar',
  (e) => {
    if (!e.auth) return e.unauthorizedError('Autenticação obrigatória')

    const papel = e.auth.getString('role')
    const ehAdmin = papel === 'admin'
    const ehSocio = papel === 'socio'
    if (!ehAdmin && !ehSocio)
      return e.forbiddenError('Apenas o sócio autorizado aprova mensagem de relacionamento')

    const body = e.requestInfo().body || {}
    const mensagemId = String(body.mensagemId || '').trim()
    if (!mensagemId) return e.badRequestError('mensagemId é obrigatório')

    let msg
    try {
      msg = $app.findRecordById('mensagens', mensagemId)
    } catch (_) {
      return e.notFoundError('Mensagem não encontrada')
    }

    // ---- dono da relação: sócio alheio não aprova ----
    if (!ehAdmin) {
      let pessoa = null
      try {
        pessoa = $app.findRecordById('pessoas', String(msg.getString('pessoa')))
      } catch (_) {}
      const donoRelacao = pessoa ? String(pessoa.getString('owner_relacao') || '') : ''
      const remetente = String(msg.getString('remetente') || '')
      if (donoRelacao !== e.auth.id && remetente !== e.auth.id) {
        return e.forbiddenError(
          'Esta mensagem pertence a outro responsável — aprovação negada',
        )
      }
    }

    const conteudo = String(msg.getString('conteudo') || '')
    const hashDe = (texto) => {
      let h = 5381
      for (let i = 0; i < texto.length; i++) h = ((h << 5) + h + texto.charCodeAt(i)) | 0
      return 'm' + (h >>> 0).toString(16) + '-' + texto.length
    }
    const hashAtual = hashDe(conteudo)

    try {
      // encerra qualquer aprovação válida anterior (garante o índice único)
      const antigas = $app.findRecordsByFilter(
        'aprovacoes',
        'mensagem = {:m} && estado = :st',
        '',
        10,
        0,
        { m: mensagemId, st: 'valida' },
      )
      for (let i = 0; i < antigas.length; i++) {
        antigas[i].set('estado', 'invalidada')
        antigas[i].set('motivo_codigo', 'substituida_por_nova_aprovacao')
        $app.save(antigas[i])
      }

      const col = $app.findCollectionByNameOrId('aprovacoes')
      const ap = new Record(col)
      ap.set('mensagem', mensagemId)
      ap.set('aprovador', e.auth.id)
      ap.set('conteudo_hash', hashAtual) // o hash APROVADO, no instante da aprovação
      ap.set('canal', String(msg.getString('canal') || ''))
      ap.set('remetente', String(msg.getString('remetente') || ''))
      ap.set('versao_config', Number(msg.get('versao_config') || 0))
      ap.set('estado', 'valida')
      ap.set('motivo_codigo', 'aprovada_pelo_socio')
      $app.save(ap)

      msg.set('estado', 'aprovada')
      msg.set('motivo_codigo', 'aprovada')
      $app.save(msg)

      return e.json(200, {
        estado: 'aprovada',
        aprovacaoId: ap.id,
        conteudoHash: hashAtual,
        enviado: false,
        detalhe:
          'Aprovação registrada para este conteúdo. Aprovar não envia: o toque continua pendente ' +
          'até a fila revalidar as condições no instante da simulação.',
      })
    } catch (err) {
      $app.logger().error('falha ao aprovar', 'err', String(err))
      return e.internalServerError('Não foi possível aprovar a mensagem')
    }
  },
  $apis.requireAuth(),
)

// ------------------------------------------------------------------ revogar
routerAdd(
  'POST',
  '/backend/v1/aprovacoes/revogar',
  (e) => {
    if (!e.auth) return e.unauthorizedError('Autenticação obrigatória')
    const papel = e.auth.getString('role')
    if (papel !== 'admin' && papel !== 'socio')
      return e.forbiddenError('Apenas o sócio autorizado revoga aprovação')

    const body = e.requestInfo().body || {}
    const mensagemId = String(body.mensagemId || '').trim()
    const motivo = String(body.motivo || '').trim()
    if (!mensagemId) return e.badRequestError('mensagemId é obrigatório')
    if (!motivo) return e.badRequestError('motivo é obrigatório')

    let msg
    try {
      msg = $app.findRecordById('mensagens', mensagemId)
    } catch (_) {
      return e.notFoundError('Mensagem não encontrada')
    }

    let revogadas = 0
    try {
      const aps = $app.findRecordsByFilter(
        'aprovacoes',
        'mensagem = {:m} && estado = :st',
        '',
        10,
        0,
        { m: mensagemId, st: 'valida' },
      )
      for (let i = 0; i < aps.length; i++) {
        aps[i].set('estado', 'revogada')
        aps[i].set('motivo_codigo', 'revogada_pelo_socio')
        aps[i].set('revogada_em', new Date().toISOString())
        $app.save(aps[i])
        revogadas++
      }

      msg.set('estado', 'pendente_aprovacao')
      msg.set('motivo_codigo', 'aprovacao_revogada')
      $app.save(msg)
    } catch (err) {
      return e.internalServerError('Não foi possível revogar a aprovação')
    }

    return e.json(200, {
      estado: 'pendente_aprovacao',
      revogadas: revogadas,
      motivo: motivo,
      detalhe: 'Aprovação revogada — a mensagem volta a aguardar aprovação.',
    })
  },
  $apis.requireAuth(),
)

// ------------------------------------------------------------------ pode executar (recalcula SEMPRE)
routerAdd(
  'GET',
  '/backend/v1/mensagens/pode-executar',
  (e) => {
    if (!e.auth) return e.unauthorizedError('Autenticação obrigatória')
    const mensagemId = String(e.requestInfo().query.mensagemId || '').trim()
    if (!mensagemId) return e.badRequestError('mensagemId é obrigatório')

    let msg
    try {
      msg = $app.findRecordById('mensagens', mensagemId)
    } catch (_) {
      return e.notFoundError('Mensagem não encontrada')
    }

    const conteudo = String(msg.getString('conteudo') || '')
    const hashDe = (texto) => {
      let h = 5381
      for (let i = 0; i < texto.length; i++) h = ((h << 5) + h + texto.charCodeAt(i)) | 0
      return 'm' + (h >>> 0).toString(16) + '-' + texto.length
    }
    const hashAtual = hashDe(conteudo)

    let ap = null
    try {
      const aps = $app.findRecordsByFilter(
        'aprovacoes',
        'mensagem = {:m} && estado = :st',
        '-created',
        1,
        0,
        { m: mensagemId, st: 'valida' },
      )
      if (aps.length > 0) ap = aps[0]
    } catch (_) {}

    const coorte = String(msg.getString('coorte') || '')
    let exige = true
    try {
      const pols = $app.findRecordsByFilter(
        'politicas_coorte',
        'coorte = {:c} && status = :st',
        '-versao',
        1,
        0,
        { c: coorte, st: 'aprovada' },
      )
      if (pols.length > 0) exige = pols[0].getBool('exige_aprovacao_mensagem')
      else exige = true
    } catch (_) {
      exige = true
    }

    if (!exige) {
      return e.json(200, {
        podeExecutar: true,
        motivo_codigo: 'coorte_nao_exige_aprovacao',
        podeEnviar: false,
        detalhe:
          'A coorte não exige aprovação individual. A execução ainda depende de régua, limites e pausa.',
      })
    }

    if (!ap) {
      return e.json(200, {
        podeExecutar: false,
        motivo_codigo: 'sem_aprovacao_valida',
        podeEnviar: false,
        conteudoHashAtual: hashAtual,
        detalhe: 'Não existe aprovação válida para esta mensagem.',
      })
    }

    const hashAprovado = String(ap.getString('conteudo_hash') || '')
    if (hashAprovado !== hashAtual) {
      return e.json(200, {
        podeExecutar: false,
        motivo_codigo: 'conteudo_alterado_desde_aprovacao',
        podeEnviar: false,
        hashAprovado: hashAprovado,
        conteudoHashAtual: hashAtual,
        aprovacaoId: ap.id,
        detalhe:
          'O conteúdo mudou depois da aprovação. A aprovação anterior não serve: é preciso reaprovar.',
      })
    }

    const canalAtual = String(msg.getString('canal') || '')
    const remetenteAtual = String(msg.getString('remetente') || '')
    if (String(ap.getString('canal') || '') !== canalAtual)
      return e.json(200, {
        podeExecutar: false,
        motivo_codigo: 'canal_alterado',
        podeEnviar: false,
        detalhe: 'O canal mudou depois da aprovação — é preciso reaprovar.',
      })
    if (String(ap.getString('remetente') || '') !== remetenteAtual)
      return e.json(200, {
        podeExecutar: false,
        motivo_codigo: 'remetente_alterado',
        podeEnviar: false,
        detalhe: 'O remetente mudou depois da aprovação — é preciso reaprovar.',
      })

    return e.json(200, {
      podeExecutar: true,
      motivo_codigo: 'aprovacao_valida',
      podeEnviar: false,
      aprovacaoId: ap.id,
      conteudoHash: hashAtual,
      detalhe:
        'Aprovação válida para o conteúdo atual. Executar continua sendo simulado e sujeito a limites e pausa.',
    })
  },
  $apis.requireAuth(),
)
