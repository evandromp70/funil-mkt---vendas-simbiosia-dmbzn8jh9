// SPEC-3-002 / F3-T04 — canal autenticado entre Fábrica e Funil (SYNC-AUTH).
//
// Por que existe: até aqui os dois apps trocavam eventos por FIXTURE aplicada à mão por admin.
// Esta rota é a porta de entrada real: o outro lado chama com o token de serviço, este backend
// valida, grava recibo no sync_inbox e responde. Sem token, com token errado ou de outro
// ambiente, a chamada é RECUSADA e nada é gravado.
//
// Autenticação: header `Authorization: Bearer <token>` (ou `X-Sync-Token`, quando o proxy deixa
// passar). O valor vive só no segredo SYNC_TOKEN_INTERAPP do Skip, nunca no Git, na tela ou em
// log. Os dois projetos têm a MESMA chave: é ela que identifica o par.
//
// Autoridade: este receptor aceita SÓ `origem=fabrica`. Cada lado tem o seu receptor, e cada um
// recusa a origem que não é do outro.
//
// Idempotência: índice único em sync_inbox (evento_id, ambiente). Repetir devolve "duplicado"
// com o mesmo recibo; mesmo evento_id com hash diferente devolve "conflito" (409) sem sobrescrever.
//
// Toda a lógica é INLINE no callback (VM própria do Skip: declaração de topo não é visível).

routerAdd(
  'POST',
  '/backend/v1/sync/receber',
  (e) => {
    const esperado = String($secrets.get('SYNC_TOKEN_INTERAPP') || '')
    if (!esperado) {
      // Sem segredo configurado o canal não abre: falha fechada, nunca aberta.
      return e.json(503, { erro: 'canal não configurado', detalhe: 'SYNC_TOKEN_INTERAPP ausente' })
    }

    const info = e.requestInfo()
    const headers = info.headers || {}
    const recebido = String(headers['x-sync-token'] || '').trim()
    const autorizacao = String(headers.authorization || '')
    const tokenHeader =
      recebido ||
      (autorizacao.toLowerCase().indexOf('bearer ') === 0 ? autorizacao.substring(7).trim() : '')

    if (!tokenHeader) {
      return e.json(401, { erro: 'token de serviço ausente', motivo: 'sem_token' })
    }
    // Comparação em tempo constante: não vaza o prefixo correto pelo tempo de resposta.
    if (tokenHeader.length !== esperado.length) {
      return e.json(401, { erro: 'token de serviço inválido', motivo: 'token_invalido' })
    }
    let diferenca = 0
    for (let i = 0; i < esperado.length; i++) {
      diferenca = diferenca | (esperado.charCodeAt(i) ^ tokenHeader.charCodeAt(i))
    }
    if (diferenca !== 0) {
      return e.json(401, { erro: 'token de serviço inválido', motivo: 'token_invalido' })
    }

    // ---- token válido: agora o conteúdo ----
    const body = info.body && typeof info.body === 'object' ? info.body : {}
    const evento = body.evento
    if (!evento || typeof evento !== 'object' || Array.isArray(evento)) {
      return e.badRequestError('evento é obrigatório')
    }

    const ambiente = String(evento.ambiente || '')
    if (['teste', 'real'].indexOf(ambiente) === -1) {
      return e.json(400, { erro: 'ambiente inválido', motivo: 'ambiente' })
    }
    if (ambiente === 'real') {
      // Fase 3 é só TESTE. O canal existe, mas não transporta ambiente real.
      return e.json(400, { erro: 'ambiente real recusado nesta fase', motivo: 'ambiente_real' })
    }

    const eventoId = String(evento.evento_id || '')
    if (!eventoId) return e.json(400, { erro: 'evento_id obrigatório', motivo: 'evento_id' })
    const origem = String(evento.origem || '')
    if (origem !== 'fabrica') {
      // Este é o receptor do FUNIL: só a Fábrica escreve aqui.
      return e.json(403, {
        erro: 'origem não autorizada neste receptor',
        motivo: 'autoridade',
        detalhe: 'o receptor do Funil aceita origem=fabrica',
      })
    }
    const hash = String(evento.payload_hash || '')
    if (!hash) return e.json(400, { erro: 'payload_hash obrigatório', motivo: 'hash' })

    // ---- idempotência: o índice único (evento_id, ambiente) é a garantia ----
    let existente = null
    try {
      const achados = $app.findRecordsByFilter(
        'sync_inbox',
        'evento_id = {:e} && ambiente = {:a}',
        '',
        1,
        0,
        { e: eventoId, a: ambiente },
      )
      if (achados.length > 0) existente = achados[0]
    } catch (_) {
      existente = null
    }

    if (existente) {
      const hashAnterior = String(existente.getString('payload_hash') || '')
      if (hashAnterior === hash) {
        return e.json(200, {
          acao: 'duplicado',
          recibo_id: existente.id,
          detalhe: 'mesmo evento e mesmo hash — nada foi alterado',
        })
      }
      return e.json(409, {
        acao: 'conflito',
        motivo: 'mesmo evento_id com payload diferente',
        hash_anterior: hashAnterior,
        detalhe: 'o fato válido não foi sobrescrito; o admin resolve',
      })
    }

    const agora = new Date().toISOString()
    let recibo = null
    try {
      const col = $app.findCollectionByNameOrId('sync_inbox')
      const reg = new Record(col)
      reg.set('evento_id', eventoId)
      reg.set('ambiente', ambiente)
      reg.set('origem', origem)
      reg.set('dominio', String(evento.dominio || 'cadastro'))
      reg.set('tipo_evento', String(evento.tipo_evento || ''))
      reg.set('entidade_global_id', String(evento.entidade_global_id || ''))
      reg.set('revisao', Number(evento.revisao) || 1)
      reg.set('payload_hash', hash)
      // 'pendente' = recibo gravado, projeção ainda não aplicada (é o que a F3-T05 consome).
      // O select de sync_inbox aceita: aplicado, duplicado, atrasado, pendente, conflito, rejeitado.
      reg.set('estado', 'pendente')
      reg.set('recebido_em', agora)
      $app.save(reg)
      recibo = reg
    } catch (err) {
      const msg = String(err)
      // Corrida: duas chamadas simultâneas, o índice único barra a segunda e ela vira duplicada.
      if (msg.indexOf('UNIQUE') !== -1 || msg.indexOf('unique') !== -1) {
        try {
          const achados = $app.findRecordsByFilter(
            'sync_inbox',
            'evento_id = {:e} && ambiente = {:a}',
            '',
            1,
            0,
            { e: eventoId, a: ambiente },
          )
          if (achados.length > 0) {
            return e.json(200, {
              acao: 'duplicado',
              recibo_id: achados[0].id,
              detalhe: 'corrida resolvida pelo índice único',
            })
          }
        } catch (_) {}
      }
      return e.json(500, { erro: 'falha ao gravar recibo', detalhe: msg.substring(0, 200) })
    }

    $app
      .logger()
      .info('sync: evento recebido', 'evento', eventoId, 'tipo', String(evento.tipo_evento || ''))
    return e.json(200, {
      acao: 'recebido',
      recibo_id: recibo.id,
      recebido_em: agora,
      detalhe: 'recibo gravado; a aplicação da projeção é da próxima task (F3-T05)',
    })
  },
  // SEM $apis.requireAuth(): a autenticação aqui é o token de serviço, validado acima.
)

// Saúde do canal: só admin lê. Mostra se o token está configurado e o que chegou.
routerAdd(
  'GET',
  '/backend/v1/sync/saude',
  (e) => {
    if (!e.auth) return e.unauthorizedError('Autenticação obrigatória')
    if (e.auth.getString('role') !== 'admin') return e.forbiddenError('Só admin vê a saúde')

    const configurado = String($secrets.get('SYNC_TOKEN_INTERAPP') || '').length > 0
    let total = 0
    let ultimo = ''
    let pendentes = 0
    try {
      // countRecords não conta nesta VM (devolve 0 mesmo com filtro válido). Contar pelo
      // tamanho da lista é o que funciona aqui — custou uma prova falsa de "nada recebido".
      const todos = $app.findRecordsByFilter('sync_inbox', "id != ''", '-created', 2000, 0, {})
      total = todos.length
      if (todos.length > 0)
        ultimo = String(todos[0].getString('recebido_em') || todos[0].getString('created') || '')
      const pend = $app.findRecordsByFilter('sync_inbox', "estado = 'pendente'", '', 2000, 0, {})
      pendentes = pend.length
    } catch (_) {}

    return e.json(200, {
      canal: 'funil_receptor',
      token_configurado: configurado,
      eventos_recebidos: total,
      aguardando_aplicacao: pendentes,
      ultimo_recebimento: ultimo,
    })
  },
  $apis.requireAuth(),
)
