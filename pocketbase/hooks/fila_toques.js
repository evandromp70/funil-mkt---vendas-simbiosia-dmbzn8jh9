// SPEC-2-002 (F2-T05): fila de toques e execução simulada — CA-2-002-04.
//
// POST /backend/v1/fila/enfileirar  { cadenciaId, mensagemId, canal, numeroToque, agendadoPara? }
// POST /backend/v1/fila/reservar    { toqueId, leaseSegundos? }
// POST /backend/v1/fila/confirmar   { toqueId, reservaId, correlationId? }
// POST /backend/v1/fila/cancelar    { toqueId, reservaId?, motivo }
// GET  /backend/v1/fila/lista       ?estado=
//
// AS QUATRO GARANTIAS (cada uma provada em tests/fila.test.mjs):
//   1. IDEMPOTÊNCIA      — índice único (cadencia, numero_toque): enfileirar 2x não duplica.
//   2. LIMITE            — SLOTS com índice único. Não conto e comparo (isso perde a corrida):
//                          ocupo o slot "canal:email:2026-10-28:N". Se todos existem, acabou.
//   3. RESERVA ATÔMICA   — índice único parcial (toque) WHERE ativa=true. Duas reservas
//                          simultâneas: o banco recusa a segunda.
//   4. REVALIDAÇÃO       — confirmar NÃO confia no que foi lido antes: recalcula aprovação,
//                          pausa, cadência e limite de novo DENTRO da operação.
//
// NUNCA envia: modo sempre 'simulado'; primeira_abordagem só na confirmação.
// Lógica inline no callback (VM própria do PocketBase).
routerAdd(
  'POST',
  '/backend/v1/fila/enfileirar',
  (e) => {
    if (!e.auth) return e.unauthorizedError('Autenticação obrigatória')
    const body = e.requestInfo().body || {}

    const cadenciaId = String(body.cadenciaId || '').trim()
    const numero = Number(body.numeroToque)
    const canal = String(body.canal || '').trim()
    if (!cadenciaId) return e.badRequestError('cadenciaId é obrigatório')
    if (!Number.isInteger(numero) || numero < 1)
      return e.badRequestError('numeroToque deve ser inteiro >= 1')
    if (!canal) return e.badRequestError('canal é obrigatório')
    const CANAIS = ['email', 'whatsapp', 'linkedin', 'telefone']
    if (CANAIS.indexOf(canal) === -1) return e.badRequestError('canal inválido')

    let cad
    try {
      cad = $app.findRecordById('cadencias_ativas', cadenciaId)
    } catch (_) {
      return e.notFoundError('Cadência não encontrada')
    }
    if (String(cad.getString('estado')) !== 'ativa') {
      return e.json(200, {
        estado: 'recusado',
        motivo_codigo: 'cadencia_nao_ativa',
        detalhe: 'A cadência não está ativa — nada foi enfileirado.',
      })
    }

    // idempotência: já existe toque com esse número nesta cadência?
    try {
      const existentes = $app.findRecordsByFilter(
        'toques',
        'cadencia = {:c} && numero_toque = {:n}',
        '',
        1,
        0,
        { c: cadenciaId, n: numero },
      )
      if (existentes.length > 0) {
        return e.json(200, {
          estado: 'duplicado',
          motivo_codigo: 'toque_ja_enfileirado',
          toqueId: existentes[0].id,
          detalhe: 'Este toque já está na fila — nada foi criado.',
        })
      }
    } catch (_) {}

    try {
      const col = $app.findCollectionByNameOrId('toques')
      const t = new Record(col)
      t.set('cadencia', cadenciaId)
      if (body.mensagemId) t.set('mensagem', String(body.mensagemId))
      const pessoaId = String(cad.getString('pessoa') || '')
      if (pessoaId) t.set('pessoa', pessoaId)
      t.set('numero_toque', numero)
      t.set('canal', canal)
      if (body.agendadoPara) t.set('agendado_para', String(body.agendadoPara))
      t.set('estado', 'pendente')
      t.set('motivo_codigo', 'aguarda_reserva')
      t.set('primeira_abordagem', false)
      t.set('modo', 'simulado')
      t.set('tentativas', 0)
      t.set('owner', e.auth.id)
      t.set('ambiente', 'teste')
      $app.save(t)

      return e.json(200, {
        estado: 'pendente',
        toqueId: t.id,
        detalhe: 'Toque enfileirado (nenhum envio).',
      })
    } catch (err) {
      const msg = String(err)
      if (msg.indexOf('UNIQUE') !== -1 || msg.indexOf('unique') !== -1)
        return e.json(200, {
          estado: 'duplicado',
          motivo_codigo: 'toque_ja_enfileirado',
          detalhe: 'Corrida: outro pedido enfileirou o mesmo toque — nada foi criado.',
        })
      $app.logger().error('falha ao enfileirar', 'err', msg)
      return e.internalServerError('Não foi possível enfileirar o toque')
    }
  },
  $apis.requireAuth(),
)

// ------------------------------------------------------------------ reservar
routerAdd(
  'POST',
  '/backend/v1/fila/reservar',
  (e) => {
    if (!e.auth) return e.unauthorizedError('Autenticação obrigatória')
    const body = e.requestInfo().body || {}
    const toqueId = String(body.toqueId || '').trim()
    if (!toqueId) return e.badRequestError('toqueId é obrigatório')

    let toque
    try {
      toque = $app.findRecordById('toques', toqueId)
    } catch (_) {
      return e.notFoundError('Toque não encontrado')
    }

    const estado = String(toque.getString('estado'))
    if (estado !== 'pendente' && estado !== 'falhou') {
      return e.json(200, {
        estado: 'nao_elegivel',
        motivo_codigo: 'toque_em_estado_' + estado,
        detalhe: 'O toque não está pendente — nada foi reservado.',
      })
    }

    // horário futuro: item fica visível com motivo e próxima condição elegível
    const agenda = String(toque.getString('agendado_para') || '')
    if (agenda) {
      const quando = new Date(agenda.replace(' ', 'T')).getTime()
      if (!isNaN(quando) && quando > Date.now()) {
        return e.json(200, {
          estado: 'aguardando_horario',
          motivo_codigo: 'horario_futuro',
          elegivel_em: agenda,
          detalhe: 'O toque está agendado para o futuro — permanece na fila.',
        })
      }
    }

    const leaseSeg = Math.max(30, Math.min(3600, Number(body.leaseSegundos) || 300))

    // expira reservas vencidas deste toque (retomada após falha)
    try {
      const vencidas = $app.findRecordsByFilter(
        'reservas',
        'toque = {:t} && ativa = true',
        '',
        5,
        0,
        { t: toqueId },
      )
      for (let i = 0; i < vencidas.length; i++) {
        const ate = String(vencidas[i].getString('lease_ate') || '')
        const quando = ate ? new Date(ate.replace(' ', 'T')).getTime() : 0
        if (!isNaN(quando) && quando < Date.now()) {
          vencidas[i].set('ativa', false)
          vencidas[i].set('estado', 'expirada')
          vencidas[i].set('motivo_codigo', 'lease_vencido')
          $app.save(vencidas[i])
        }
      }
    } catch (_) {}

    const leaseAte = new Date(Date.now() + leaseSeg * 1000).toISOString()

    try {
      const col = $app.findCollectionByNameOrId('reservas')
      const r = new Record(col)
      r.set('toque', toqueId)
      r.set('dono_reserva', e.auth.id)
      r.set('lease_ate', leaseAte)
      r.set('ativa', true)
      r.set('estado', 'ativa')
      r.set('motivo_codigo', 'reservado')
      $app.save(r)

      toque.set('estado', 'reservado')
      toque.set('motivo_codigo', 'reservado')
      toque.set('tentativas', (Number(toque.get('tentativas') || 0) || 0) + 1)
      $app.save(toque)

      return e.json(200, {
        estado: 'reservado',
        reservaId: r.id,
        leaseAte: leaseAte,
        detalhe: 'Reserva ativa. O toque ainda NÃO foi despachado.',
      })
    } catch (err) {
      // índice único parcial: outra reserva ativa ganhou
      const msg = String(err)
      if (msg.indexOf('UNIQUE') !== -1 || msg.indexOf('unique') !== -1) {
        return e.json(200, {
          estado: 'ja_reservado',
          motivo_codigo: 'reserva_ativa_existente',
          detalhe:
            'Outro processo já reservou este toque. O banco garantiu uma única reserva ativa — ' +
            'nada foi criado aqui.',
        })
      }
      $app.logger().error('falha ao reservar', 'err', msg)
      return e.internalServerError('Não foi possível reservar o toque')
    }
  },
  $apis.requireAuth(),
)

// ------------------------------------------------------------------ confirmar (com REVALIDAÇÃO)
routerAdd(
  'POST',
  '/backend/v1/fila/confirmar',
  (e) => {
    if (!e.auth) return e.unauthorizedError('Autenticação obrigatória')
    const body = e.requestInfo().body || {}
    const toqueId = String(body.toqueId || '').trim()
    const reservaId = String(body.reservaId || '').trim()
    if (!toqueId) return e.badRequestError('toqueId é obrigatório')
    if (!reservaId) return e.badRequestError('reservaId é obrigatório')

    let toque
    try {
      toque = $app.findRecordById('toques', toqueId)
    } catch (_) {
      return e.notFoundError('Toque não encontrado')
    }

    // Consome UMA unidade de limite ocupando um SLOT com índice único.
    // Não conto e comparo (isso perde a corrida): tento criar o slot 0, 1, 2...
    // Quem cria o slot ganha; se todos existem, o limite acabou. Atômico.
    const consumirSlot = (escopo, valor, dia, limite, toqueId) => {
      for (let i = 0; i < limite; i++) {
        const slot = escopo + ':' + valor + ':' + dia + ':' + i
        try {
          const colS = $app.findCollectionByNameOrId('limites_consumo')
          const s = new Record(colS)
          s.set('slot', slot)
          s.set('escopo', escopo)
          s.set('valor', String(valor))
          s.set('dia', dia)
          s.set('indice', i)
          if (toqueId) s.set('toque', toqueId)
          $app.save(s)
          return { ok: true, slot: slot }
        } catch (errSlot) {
          const m = String(errSlot)
          if (m.indexOf('UNIQUE') !== -1 || m.indexOf('unique') !== -1) continue
          return { ok: false, motivo: 'erro_slot' }
        }
      }
      return { ok: false, motivo: 'limite_atingido' }
    }

    // idempotência da confirmação: repetir não cria outro toque nem novo despacho
    if (String(toque.getString('estado')) === 'confirmado') {
      return e.json(200, {
        estado: 'confirmado',
        motivo_codigo: 'ja_confirmado',
        enviado: true,
        simulado: true,
        detalhe: 'Este toque já foi confirmado — a repetição não gerou novo despacho.',
      })
    }

    let reserva
    try {
      reserva = $app.findRecordById('reservas', reservaId)
    } catch (_) {
      return e.notFoundError('Reserva não encontrada')
    }
    if (String(reserva.getString('toque') || '') !== toqueId) {
      return e.badRequestError('A reserva não pertence a este toque')
    }

    // ---- REVALIDAÇÃO DENTRO DA OPERAÇÃO ----
    // 1. pausa geral
    try {
      const cfgs = $app.findRecordsByFilter('sistema_config', '', '', 1, 0, {})
      if (cfgs.length > 0 && cfgs[0].getBool('pausa_geral')) {
        toque.set('estado', 'pendente')
        toque.set('motivo_codigo', 'pausa_geral')
        toque.set('motivo', 'Pausa geral ativa no instante da confirmação')
        $app.save(toque)
        reserva.set('ativa', false)
        reserva.set('estado', 'cancelada')
        reserva.set('motivo_codigo', 'pausa_geral')
        $app.save(reserva)
        return e.json(200, {
          estado: 'cancelado_pausa',
          motivo_codigo: 'pausa_geral',
          enviado: false,
          detalhe: 'Pausa geral ativa: o toque não foi confirmado e continua na fila.',
        })
      }
    } catch (_) {}

    // 2. cadência ainda ativa?
    const cadenciaId = String(toque.getString('cadencia') || '')
    if (cadenciaId) {
      try {
        const cad = $app.findRecordById('cadencias_ativas', cadenciaId)
        if (String(cad.getString('estado')) !== 'ativa') {
          toque.set('estado', 'cancelado')
          toque.set('motivo_codigo', 'cadencia_encerrada')
          $app.save(toque)
          reserva.set('ativa', false)
          reserva.set('estado', 'cancelada')
          $app.save(reserva)
          return e.json(200, {
            estado: 'cancelado_cadencia',
            motivo_codigo: 'cadencia_encerrada',
            enviado: false,
            detalhe: 'A cadência foi encerrada antes da confirmação — toque cancelado.',
          })
        }
      } catch (_) {}
    }

    // 3. aprovação ainda válida? (recalcula hash, como pode-executar)
    const mensagemId = String(toque.getString('mensagem') || '')
    if (mensagemId) {
      let msg = null
      try {
        msg = $app.findRecordById('mensagens', mensagemId)
      } catch (_) {}
      if (!msg) {
        toque.set('estado', 'cancelado')
        toque.set('motivo_codigo', 'mensagem_inexistente')
        $app.save(toque)
        reserva.set('ativa', false)
        reserva.set('estado', 'cancelada')
        $app.save(reserva)
        return e.json(200, {
          estado: 'cancelado',
          motivo_codigo: 'mensagem_inexistente',
          enviado: false,
          detalhe: 'A mensagem não existe mais — toque cancelado.',
        })
      }

      const conteudo = String(msg.getString('conteudo') || '')
      const hashDe = (texto) => {
        let h = 5381
        for (let i = 0; i < texto.length; i++) h = ((h << 5) + h + texto.charCodeAt(i)) | 0
        return 'm' + (h >>> 0).toString(16) + '-' + texto.length
      }
      const hashAtual = hashDe(conteudo)

      const coorte = String(msg.getString('coorte') || '')
      let exige = true
      try {
        const pols = $app.findRecordsByFilter(
          'politicas_coorte',
          'coorte = {:c} && status = {:st}',
          '-versao',
          1,
          0,
          { c: coorte, st: 'aprovada' },
        )
        if (pols.length > 0) exige = pols[0].getBool('exige_aprovacao_mensagem')
      } catch (_) {}

      if (exige) {
        let ap = null
        try {
          const aps = $app.findRecordsByFilter(
            'aprovacoes',
            'mensagem = {:m} && estado = {:st}',
            '-created',
            1,
            0,
            { m: mensagemId, st: 'valida' },
          )
          if (aps.length > 0) ap = aps[0]
        } catch (_) {}

        if (!ap || String(ap.getString('conteudo_hash') || '') !== hashAtual) {
          toque.set('estado', 'bloqueado')
          toque.set('motivo_codigo', 'aprovacao_invalida_na_confirmacao')
          toque.set('motivo', 'Aprovação ausente ou conteúdo alterado desde a aprovação')
          $app.save(toque)
          reserva.set('ativa', false)
          reserva.set('estado', 'cancelada')
          reserva.set('motivo_codigo', 'aprovacao_invalida')
          $app.save(reserva)
          return e.json(200, {
            estado: 'bloqueado',
            motivo_codigo: 'aprovacao_invalida_na_confirmacao',
            enviado: false,
            detalhe:
              'A aprovação deixou de valer entre a reserva e a confirmação (conteúdo alterado ou ' +
              'revogado). O toque fica bloqueado aguardando nova aprovação.',
          })
        }
      }
    }

    // 4. limites por SLOT (atômico)
    const dia = new Date().toISOString().substring(0, 10)
    const canal = String(toque.getString('canal') || 'email')
    const LIMITE_CANAL = Number(body.limiteCanal || 50) // valor de TESTE
    const LIMITE_DONO = Number(body.limiteDono || 100) // valor de TESTE

    const slotCanal = consumirSlot('canal', canal, dia, LIMITE_CANAL, toqueId)
    if (!slotCanal.ok) {
      toque.set('estado', 'pendente')
      toque.set('motivo_codigo', 'limite_canal_atingido')
      toque.set('motivo', 'Limite diário do canal atingido')
      $app.save(toque)
      reserva.set('ativa', false)
      reserva.set('estado', 'cancelada')
      reserva.set('motivo_codigo', 'limite_canal')
      $app.save(reserva)
      return e.json(200, {
        estado: 'aguardando_limite',
        motivo_codigo: 'limite_canal_atingido',
        enviado: false,
        detalhe: 'Limite diário do canal atingido — o toque permanece na fila.',
      })
    }

    const dono = String(toque.getString('owner') || '')
    const slotDono = consumirSlot('dono', dono || 'sem-dono', dia, LIMITE_DONO, toqueId)
    if (!slotDono.ok) {
      // devolve o slot do canal para não vazar limite
      try {
        const s = $app.findRecordsByFilter(
          'limites_consumo',
          'slot = {:s}',
          '',
          1,
          0,
          { s: slotCanal.slot },
        )
        if (s.length > 0) $app.delete(s[0])
      } catch (_) {}
      toque.set('estado', 'pendente')
      toque.set('motivo_codigo', 'limite_dono_atingido')
      $app.save(toque)
      reserva.set('ativa', false)
      reserva.set('estado', 'cancelada')
      $app.save(reserva)
      return e.json(200, {
        estado: 'aguardando_limite',
        motivo_codigo: 'limite_dono_atingido',
        enviado: false,
        detalhe: 'Limite diário do responsável atingido — o toque permanece na fila.',
      })
    }

    // ---- CONFIRMAÇÃO (simulada) ----
    const correlationId =
      String(body.correlationId || '') ||
      'sim-' + Date.now() + '-' + Math.floor(Math.random() * 100000)

    try {
      toque.set('estado', 'confirmado')
      toque.set('motivo_codigo', 'confirmado_simulado')
      toque.set('motivo', 'Despacho simulado confirmado')
      toque.set('primeira_abordagem', true) // SÓ aqui
      toque.set('correlation_id', correlationId)
      toque.set('confirmado_em', new Date().toISOString())
      $app.save(toque)

      reserva.set('ativa', false)
      reserva.set('estado', 'confirmada')
      reserva.set('motivo_codigo', 'despacho_confirmado')
      $app.save(reserva)

      // registro do despacho simulado na coleção de auditoria (sempre 'teste')
      try {
        const colD = $app.findCollectionByNameOrId('teste_despachos')
        const d = new Record(colD)
        d.set('correlation_id', correlationId)
        d.set('rota', '/backend/v1/fila/confirmar')
        d.set('tipo', 'canal_simulado')
        d.set('tentativas', 1)
        $app.save(d)
      } catch (_) {}

      return e.json(200, {
        estado: 'confirmado',
        enviado: true,
        simulado: true,
        primeiraAbordagem: true,
        correlationId: correlationId,
        detalhe:
          'Despacho SIMULADO confirmado. Nenhum envio real ocorreu; a primeira abordagem foi ' +
          'registrada como fato de TESTE.',
      })
    } catch (err) {
      $app.logger().error('falha ao confirmar', 'err', String(err))
      return e.internalServerError('Não foi possível confirmar o toque')
    }
  },
  $apis.requireAuth(),
)

// ------------------------------------------------------------------ cancelar
routerAdd(
  'POST',
  '/backend/v1/fila/cancelar',
  (e) => {
    if (!e.auth) return e.unauthorizedError('Autenticação obrigatória')
    const body = e.requestInfo().body || {}
    const toqueId = String(body.toqueId || '').trim()
    const motivo = String(body.motivo || '').trim()
    if (!toqueId) return e.badRequestError('toqueId é obrigatório')
    if (!motivo) return e.badRequestError('motivo é obrigatório')

    let toque
    try {
      toque = $app.findRecordById('toques', toqueId)
    } catch (_) {
      return e.notFoundError('Toque não encontrado')
    }
    if (String(toque.getString('estado')) === 'confirmado') {
      return e.json(200, {
        estado: 'confirmado',
        motivo_codigo: 'nao_cancela_confirmado',
        detalhe: 'Toque já confirmado não pode ser cancelado — o histórico é preservado.',
      })
    }

    try {
      toque.set('estado', 'cancelado')
      toque.set('motivo_codigo', 'cancelado_manual')
      toque.set('motivo', motivo)
      $app.save(toque)

      if (body.reservaId) {
        try {
          const r = $app.findRecordById('reservas', String(body.reservaId))
          r.set('ativa', false)
          r.set('estado', 'cancelada')
          r.set('motivo_codigo', 'cancelada_manual')
          $app.save(r)
        } catch (_) {}
      }
    } catch (err) {
      return e.internalServerError('Não foi possível cancelar o toque')
    }

    return e.json(200, {
      estado: 'cancelado',
      toqueId: toque.id,
      detalhe: 'Toque cancelado. A reserva foi liberada.',
    })
  },
  $apis.requireAuth(),
)

// ------------------------------------------------------------------ lista
routerAdd(
  'GET',
  '/backend/v1/fila/lista',
  (e) => {
    if (!e.auth) return e.unauthorizedError('Autenticação obrigatória')
    const estado = String(e.requestInfo().query.estado || '').trim()

    let registros = []
    try {
      registros = estado
        ? $app.findRecordsByFilter('toques', 'estado = {:e}', '-created', 100, 0, { e: estado })
        : $app.findRecordsByFilter('toques', '', '-created', 100, 0, {})
    } catch (_) {}

    const itens = []
    for (let i = 0; i < registros.length; i++) {
      const t = registros[i]
      itens.push({
        id: t.id,
        numero: Number(t.get('numero_toque') || 0),
        canal: String(t.getString('canal') || ''),
        estado: String(t.getString('estado') || ''),
        motivo_codigo: String(t.getString('motivo_codigo') || ''),
        agendado_para: String(t.getString('agendado_para') || ''),
        primeira_abordagem: t.getBool('primeira_abordagem'),
        modo: String(t.getString('modo') || ''),
      })
    }

    return e.json(200, { total: itens.length, itens: itens })
  },
  $apis.requireAuth(),
)
