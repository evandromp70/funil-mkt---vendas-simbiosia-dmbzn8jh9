// SPEC-2-003 (F2-T07): receptor de evento de canal de teste — CA-2-003-01/02.
// POST /backend/v1/eventos/teste
// { evento_id, correlation_id?, tipo, ocorrido_em?, canal?, pessoaId?, identidade_ref?, payload }
// payload é objeto FECHADO (campo extra é rejeitado).
//
// Regras (cada uma provada em tests/eventos.test.mjs):
//   1. exige sessão E papel autorizado — NUNCA confia em role/owner do payload
//   2. recusa modo/ambiente real: só `teste` existe
//   3. recusa campo extra (payload fechado)
//   4. mesmo evento_id + mesmo payload_hash → recibo DUPLICADO, sem repetir efeito
//   5. mesmo evento_id + hash diferente → CONFLITO, sem sobrescrever
//   6. efeito + recibo gravados juntos
//
// Lógica INLINE no callback (VM própria do Skip).
routerAdd(
  'POST',
  '/backend/v1/eventos/teste',
  (e) => {
    if (!e.auth) return e.unauthorizedError('Autenticação obrigatória')
    const papel = e.auth.getString('role')
    if (papel !== 'admin' && papel !== 'operador' && papel !== 'vendedor')
      return e.forbiddenError('Papel não autorizado a injetar evento de teste')

    const body = e.requestInfo().body || {}

    // ---- recusa modo/ambiente real, em qualquer forma ----
    if (body.modo === 'real' || body.modo === 'producao')
      return e.badRequestError('Modo real é recusado nesta fase: apenas teste.')
    if (body.ambiente && String(body.ambiente) !== 'teste')
      return e.badRequestError('Ambiente deve ser "teste".')

    // ---- campos proibidos: o payload nunca define autoridade ----
    const PROIBIDOS = ['owner', 'role', 'ambiente_final', 'aprovado_por', 'permissao', 'superuser']
    for (const p of PROIBIDOS) {
      if (Object.prototype.hasOwnProperty.call(body, p))
        return e.badRequestError('Campo não permitido no evento: ' + p)
    }

    // ---- payload FECHADO ----
    const CAMPOS = [
      'evento_id',
      'correlation_id',
      'tipo',
      'ocorrido_em',
      'canal',
      'pessoaId',
      'identidade_ref',
      'payload',
      'ambiente',
      'modo',
      // SPEC-2-004: classificação da resposta, fornecida por FIXTURE DETERMINÍSTICA nesta fase
      'classificacao',
    ]
    for (const k of Object.keys(body)) {
      if (CAMPOS.indexOf(k) === -1) return e.badRequestError('Campo não previsto no evento: ' + k)
    }

    const eventoId = String(body.evento_id || '').trim()
    const tipo = String(body.tipo || '').trim()
    if (!eventoId) return e.badRequestError('evento_id é obrigatório')
    if (eventoId.length > 200) return e.badRequestError('evento_id excede 200 caracteres')
    if (!tipo) return e.badRequestError('tipo é obrigatório')

    const CANAIS = ['email', 'whatsapp', 'linkedin', 'telefone', 'interno']
    const canal = body.canal ? String(body.canal) : ''
    if (canal && CANAIS.indexOf(canal) === -1) return e.badRequestError('canal inválido')

    // hash canônico do payload (chaves ordenadas, determinístico)
    const jsonCanonico = (v) => {
      if (v === null || typeof v !== 'object') return JSON.stringify(v)
      if (Array.isArray(v)) return '[' + v.map(jsonCanonico).join(',') + ']'
      const chaves = Object.keys(v).sort()
      return '{' + chaves.map((k) => JSON.stringify(k) + ':' + jsonCanonico(v[k])).join(',') + '}'
    }
    const payloadTexto = jsonCanonico(body.payload === undefined ? {} : body.payload)
    let hash = ''
    {
      // djb2 estável — não precisa ser criptográfico, precisa ser determinístico
      let h = 5381
      for (let i = 0; i < payloadTexto.length; i++)
        h = ((h << 5) + h + payloadTexto.charCodeAt(i)) | 0
      hash = 'h' + (h >>> 0).toString(16) + '-' + payloadTexto.length
    }

    // pessoa opcional: referência não resolvida fica PENDENTE, sem efeito
    let pessoaId = ''
    if (body.pessoaId) {
      try {
        $app.findRecordById('pessoas', String(body.pessoaId))
        pessoaId = String(body.pessoaId)
      } catch (_) {
        return e.json(200, {
          estado: 'pendente',
          motivo: 'referencia_nao_resolvida',
          detalhe: 'Pessoa informada não existe: evento registrado como pendente, sem efeito.',
        })
      }
    }

    const col = $app.findCollectionByNameOrId('eventos_teste')

    // ---- idempotência e conflito ----
    let existente = null
    try {
      const achados = $app.findRecordsByFilter(
        'eventos_teste',
        'evento_id = {:id} && ambiente = {:a}',
        '',
        1,
        0,
        { id: eventoId, a: 'teste' },
      )
      if (achados.length > 0) existente = achados[0]
    } catch (_) {}

    if (existente) {
      const hashAnterior = existente.getString('payload_hash')
      if (hashAnterior === hash) {
        return e.json(200, {
          estado: 'duplicado',
          eventoId: eventoId,
          reciboId: existente.id,
          payloadHash: hash,
          detalhe: 'Evento já aplicado com o mesmo conteúdo — nenhum efeito repetido.',
        })
      }
      if (existente.getString('estado') !== 'conflito') {
        existente.set('estado', 'conflito')
        existente.set(
          'resultado',
          JSON.stringify({ motivo: 'mesmo evento_id com payload diferente' }),
        )
        $app.save(existente)
      }
      return e.json(409, {
        estado: 'conflito',
        eventoId: eventoId,
        reciboId: existente.id,
        hashAnterior: hashAnterior,
        hashNovo: hash,
        detalhe: 'Mesmo evento_id com conteúdo diferente — nada foi sobrescrito.',
      })
    }

    // ---- grava efeito + recibo juntos ----
    try {
      const reg = new Record(col)
      reg.set('evento_id', eventoId)
      if (body.correlation_id) reg.set('correlation_id', String(body.correlation_id))
      reg.set('ambiente', 'teste')
      reg.set('fonte', 'fixture')
      reg.set('tipo', tipo)
      if (body.ocorrido_em) reg.set('ocorrido_em', String(body.ocorrido_em))
      if (canal) reg.set('canal', canal)
      if (pessoaId) reg.set('pessoa', pessoaId)
      if (body.identidade_ref) reg.set('identidade_ref', String(body.identidade_ref))
      reg.set('payload_hash', hash)
      reg.set('estado', 'aplicado')
      reg.set('owner', e.auth.id)

      // ---- CLASSIFICAÇÃO DA RESPOSTA (SPEC-2-004 / F2-T09) ----
      // Nesta fase a classificação vem de FIXTURE DETERMINÍSTICA: o payload traz o campo,
      // não há inferência de LLM nem chamada externa. Aceita também o caminho payload.classificacao.
      const CLASSIF = ['pergunta', 'conversa', 'desinteresse', 'saida']
      let classificacao = ''
      if (body.classificacao && CLASSIF.indexOf(String(body.classificacao)) !== -1)
        classificacao = String(body.classificacao)
      else if (
        body.payload &&
        typeof body.payload === 'object' &&
        body.payload.classificacao &&
        CLASSIF.indexOf(String(body.payload.classificacao)) !== -1
      )
        classificacao = String(body.payload.classificacao)
      if (classificacao) reg.set('classificacao', classificacao)

      const efeitos = { tipo: tipo, canal: canal, efeito: 'registrado' }

      // pausa + passagem única — SÓ para resposta sem pedido de saída.
      // 'saida' é da F2-T10 (bloqueio global); desinteresse simples NÃO vira opt-out.
      const PAUSA = ['pergunta', 'conversa', 'desinteresse']
      if (pessoaId && PAUSA.indexOf(classificacao) !== -1) {
        // 1. cadências ativas da pessoa em QUALQUER produto/canal → pausada
        let cadenciasPausadas = 0
        try {
          const ativas = $app.findRecordsByFilter(
            'cadencias_ativas',
            "pessoa = {:p} && ambiente = 'teste' && estado = 'ativa'",
            '',
            200,
            0,
            { p: pessoaId },
          )
          for (let i = 0; i < ativas.length; i++) {
            ativas[i].set('estado', 'pausada')
            ativas[i].set('motivo_codigo', 'resposta_recebida')
            ativas[i].set('motivo', 'Resposta (' + classificacao + ') interrompeu a cadência.')
            $app.save(ativas[i])
            cadenciasPausadas++
          }
        } catch (errP) {
          $app.logger().warn('evento: falha ao pausar cadências', 'err', String(errP))
        }

        // 2. toques pendentes da pessoa → cancelados (nenhum toque sai depois da resposta)
        let toquesCancelados = 0
        try {
          const pendentes = $app.findRecordsByFilter(
            'toques',
            "ambiente = 'teste' && estado = 'pendente' && lead.pessoa = {:p}",
            '',
            500,
            0,
            { p: pessoaId },
          )
          for (let i = 0; i < pendentes.length; i++) {
            pendentes[i].set('estado', 'cancelado')
            pendentes[i].set('motivo_codigo', 'resposta_recebida')
            pendentes[i].set('motivo', 'Resposta (' + classificacao + ') antes do toque.')
            $app.save(pendentes[i])
            toquesCancelados++
          }
        } catch (errT) {
          $app.logger().warn('evento: falha ao cancelar toques', 'err', String(errT))
        }

        // 3. reservas ativas da pessoa → liberadas (lease não fica preso)
        let reservasLiberadas = 0
        try {
          const reservas = $app.findRecordsByFilter(
            'reservas',
            "ambiente = 'teste' && ativa = true && toque.lead.pessoa = {:p}",
            '',
            200,
            0,
            { p: pessoaId },
          )
          for (let i = 0; i < reservas.length; i++) {
            reservas[i].set('ativa', false)
            reservas[i].set('estado', 'liberada')
            reservas[i].set('motivo_codigo', 'resposta_recebida')
            $app.save(reservas[i])
            reservasLiberadas++
          }
        } catch (errR) {
          $app.logger().warn('evento: falha ao liberar reservas', 'err', String(errR))
        }

        // 4. PAUSA registrada (índice único por pessoa ativa) — se já existe, é a mesma proteção
        let pausaId = ''
        let pausaEstado = 'criada'
        try {
          const colPausa = $app.findCollectionByNameOrId('pausas_resposta')
          const pausa = new Record(colPausa)
          pausa.set('pessoa', pessoaId)
          pausa.set('evento', reg.id)
          pausa.set('evento_id', eventoId)
          pausa.set('classificacao', classificacao)
          pausa.set('estado', 'ativa')
          if (canal) pausa.set('canal', canal)
          pausa.set('motivo_codigo', 'resposta_recebida')
          pausa.set('motivo', 'Pessoa respondeu (' + classificacao + '): humano assume.')
          if (body.ocorrido_em) pausa.set('ocorrido_em', String(body.ocorrido_em))
          pausa.set('recebido_em', new Date().toISOString().replace('T', ' '))
          pausa.set('owner', e.auth.id)
          pausa.set('ambiente', 'teste')
          $app.save(pausa)
          pausaId = pausa.id
        } catch (errPausa) {
          // já existe pausa ativa para a pessoa: a proteção é a MESMA, não é erro
          pausaEstado = 'ja_ativa'
          try {
            const existentes = $app.findRecordsByFilter(
              'pausas_resposta',
              "pessoa = {:p} && ambiente = 'teste' && estado = 'ativa'",
              '',
              1,
              0,
              { p: pessoaId },
            )
            if (existentes.length > 0) pausaId = existentes[0].id
          } catch (_) {}
        }

        // 5. PASSAGEM ÚNICA (índice único por evento) — o mesmo evento nunca duplica
        let passagemId = ''
        let passagemEstado = 'criada'
        try {
          const colPass = $app.findCollectionByNameOrId('passagens')
          const pass = new Record(colPass)
          pass.set('pessoa', pessoaId)
          pass.set('evento', reg.id)
          pass.set('evento_id', eventoId)
          // produto: herda da cadência pausada (não vem do payload — o evento não manda nisso).
          // Sem cadência ativa, a passagem fica sem produto e isso é correto: não inventamos.
          try {
            const cad = $app.findRecordsByFilter(
              'cadencias_ativas',
              "pessoa = {:p} && ambiente = 'teste' && estado = 'pausada'",
              '-updated',
              1,
              0,
              { p: pessoaId },
            )
            if (cad.length > 0 && cad[0].getString('produto'))
              pass.set('produto', cad[0].getString('produto'))
          } catch (_) {}
          if (canal) pass.set('canal', canal)
          pass.set('classificacao', classificacao)
          pass.set('status', 'aguardando')
          // resumo FACTUAL — sem opinião, sem resumo inventado
          pass.set(
            'resumo',
            'Resposta de ' + classificacao + ' recebida' + (canal ? ' por ' + canal : '') + '.',
          )
          pass.set('motivo_codigo', 'resposta_recebida')
          pass.set('motivo', 'Resposta interrompeu a cadência e exige continuidade humana.')
          // dono: NUNCA chutar sócio por fallback. Sem mapeamento → pendente de revisão.
          pass.set('dono_pendente', true)
          pass.set('owner', e.auth.id)
          pass.set('ambiente', 'teste')
          $app.save(pass)
          passagemId = pass.id
        } catch (errPass) {
          passagemEstado = 'ja_existe'
          try {
            const existentes = $app.findRecordsByFilter(
              'passagens',
              'evento_id = {:e} && ambiente = {:a}',
              '',
              1,
              0,
              { e: eventoId, a: 'teste' },
            )
            if (existentes.length > 0) passagemId = existentes[0].id
          } catch (_) {}
        }

        efeitos.resposta = {
          classificacao: classificacao,
          cadencias_pausadas: cadenciasPausadas,
          toques_cancelados: toquesCancelados,
          reservas_liberadas: reservasLiberadas,
          pausa: pausaEstado,
          pausaId: pausaId,
          passagem: passagemEstado,
          passagemId: passagemId,
        }
      }

      reg.set('resultado', JSON.stringify(efeitos))
      $app.save(reg)

      return e.json(200, {
        estado: 'aplicado',
        eventoId: eventoId,
        reciboId: reg.id,
        payloadHash: hash,
        classificacao: classificacao || null,
        efeitos: efeitos.resposta || null,
        detalhe: 'Evento de teste registrado (nenhum despacho externo).',
      })
    } catch (err) {
      $app.logger().error('falha ao gravar evento de teste', 'err', String(err))
      return e.internalServerError('Evento não aplicado')
    }
  },
  $apis.requireAuth(),
)
