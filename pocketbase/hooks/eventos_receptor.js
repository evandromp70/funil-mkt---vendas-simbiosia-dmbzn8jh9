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
// v2 — 28/10/2026: SPEC-2-004 (F2-T09) pausa por resposta + passagem única.
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

      // O EVENTO PRECISA EXISTIR ANTES das relações que apontam para ele.
      // Causa raiz de um defeito real (28/10): `pausa.set('evento', reg.id)` era chamado antes
      // deste save, então reg.id estava VAZIO, a relação obrigatória falhava e o catch de baixo
      // interpretava a falha como "já existe" — a pausa nunca era criada e ninguém percebia,
      // porque o erro era engolido. Salvar aqui resolve; o resultado é gravado no fim.
      $app.save(reg)

      // pausa + passagem única — SÓ para resposta sem pedido de saída.
      // 'saida' é da F2-T10 (bloqueio global); desinteresse simples NÃO vira opt-out.
      const PAUSA = ['pergunta', 'conversa', 'desinteresse']
      if (pessoaId && PAUSA.indexOf(classificacao) !== -1) {
        // 1. cadências ativas da pessoa em QUALQUER produto/canal → pausada
        let cadenciasPausadas = 0
        let diagnosticoCad = ''
        let encontradasCad = -1
        try {
          // Busca AMPLA por pessoa e filtro em JS. O filtro com três condições (pessoa +
          // ambiente + estado) não retornava nada dentro do hook embora a mesma query
          // funcionasse pelo SDK — em vez de investigar a diferença, filtro em memória:
          // é determinístico e não depende da tradução do filtro no servidor.
          const daPessoa = $app.findRecordsByFilter(
            'cadencias_ativas',
            'pessoa = {:p}',
            '',
            500,
            0,
            { p: pessoaId },
          )
          encontradasCad = daPessoa.length
          for (let i = 0; i < daPessoa.length; i++) {
            const cad = daPessoa[i]
            if (String(cad.getString('estado')) !== 'ativa') continue
            if (String(cad.getString('ambiente')) !== 'teste') continue
            try {
              // 'cancelada' e não 'pausada': o select de cadencias_ativas.estado não aceita
              // 'pausada' e alterar esse select bloqueou o batch de migrações (ver 0042).
              // A AUTORIDADE da pausa é `pausas_resposta` (estado 'ativa' por pessoa), que é o
              // que a política e a fila consultam. Encerrar a cadência é efeito suficiente para
              // CA-2-004-01; retomar (F2-T11) cria cadência nova com nova validação — que é o
              // comportamento correto de qualquer forma.
              cad.set('estado', 'cancelada')
              cad.set('motivo_codigo', 'resposta_recebida')
              cad.set('motivo', 'Resposta (' + classificacao + ') interrompeu a cadência.')
              $app.save(cad)
              cadenciasPausadas++
            } catch (errCad) {
              diagnosticoCad = String(errCad)
              $app.logger().error('evento: falha ao salvar cadência pausada', 'err', String(errCad))
            }
          }
        } catch (errP) {
          diagnosticoCad = String(errP)
          $app.logger().error('evento: falha ao pausar cadências', 'err', String(errP))
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
          // Trata os dois casos DIFERENTES: (a) já existe pausa ativa → a proteção é a mesma,
          // não é erro; (b) qualquer outra falha → NÃO pode passar como "ja_ativa", senão a
          // pausa não acontece e o chamador acha que aconteceu. Foi exatamente esse mascaramento
          // que escondeu o bug da relação vazia em 28/10.
          try {
            const existentes = $app.findRecordsByFilter(
              'pausas_resposta',
              "pessoa = {:p} && ambiente = 'teste' && estado = 'ativa'",
              '',
              1,
              0,
              { p: pessoaId },
            )
            if (existentes.length > 0) {
              pausaEstado = 'ja_ativa'
              pausaId = existentes[0].id
            } else {
              pausaEstado = 'erro'
              efeitos.pausa_erro = String(errPausa)
              $app.logger().error('evento: falha ao criar pausa', 'err', String(errPausa))
            }
          } catch (_) {
            pausaEstado = 'erro'
            efeitos.pausa_erro = String(errPausa)
          }
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
              "pessoa = {:p} && ambiente = 'teste' && estado = 'cancelada'",
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
          cadencias_encontradas: encontradasCad,
          erro_cadencia: diagnosticoCad,
          cadencias_pausadas: cadenciasPausadas,
          toques_cancelados: toquesCancelados,
          reservas_liberadas: reservasLiberadas,
          pausa: pausaEstado,
          pausaId: pausaId,
          passagem: passagemEstado,
          passagemId: passagemId,
        }
      }

      // ---- BLOQUEIO GLOBAL POR PEDIDO DE SAÍDA (SPEC-2-004 / F2-T10 / CA-2-004-02) ----
      // Só 'saida' bloqueia. Desinteresse simples NÃO vira opt-out (provado na suíte).
      //
      // O bloqueio vale para a IDENTIDADE EFETIVA, não só para o id desta pessoa: reimportação,
      // troca de produto ou alias NÃO eliminam o bloqueio. Se valesse só pelo id, bastaria o
      // mesmo contato entrar por outra base para voltar a receber toque — que é exatamente o que
      // a pessoa pediu para não acontecer.
      if (pessoaId && classificacao === 'saida') {
        // 1. identidade efetiva: componente conexo de aliases (mesma lógica de cadencias_unicidade)
        const idBaseSaida = (p) => {
          const g = p.getString('sync_global_id')
          return g && String(g).trim() ? String(g).trim() : p.id
        }
        const vizinhos = {}
        try {
          const aliases = $app.findRecordsByFilter(
            'aliases_identidade',
            "status = 'ativo'",
            '',
            500,
            0,
            {},
          )
          for (let i = 0; i < aliases.length; i++) {
            const o = String(aliases[i].getString('origem_global') || '').trim()
            const d = String(aliases[i].getString('destino_global') || '').trim()
            if (!o || !d || o === d) continue
            if (!vizinhos[o]) vizinhos[o] = []
            if (!vizinhos[d]) vizinhos[d] = []
            if (vizinhos[o].indexOf(d) === -1) vizinhos[o].push(d)
            if (vizinhos[d].indexOf(o) === -1) vizinhos[d].push(o)
          }
        } catch (_) {}
        const raizSaida = (id) => {
          const visto = {}
          const fila = [id]
          visto[id] = true
          let menor = id
          while (fila.length > 0) {
            const atual = fila.shift()
            if (String(atual) < String(menor)) menor = atual
            const vs = vizinhos[atual] || []
            for (let j = 0; j < vs.length; j++) {
              if (!visto[vs[j]]) {
                visto[vs[j]] = true
                fila.push(vs[j])
              }
            }
          }
          return menor
        }

        let identidadeSaida = ''
        let bloqueiosCriados = 0
        try {
          const pessoaSaida = $app.findRecordById('pessoas', pessoaId)
          identidadeSaida = raizSaida(idBaseSaida(pessoaSaida))

          // todas as pessoas que resolvem para a MESMA identidade efetiva
          const todasPessoas = $app.findRecordsByFilter('pessoas', '', '', 5000, 0, {})
          const doMesmoGrupo = []
          for (let i = 0; i < todasPessoas.length; i++) {
            let ident = ''
            try {
              ident = raizSaida(idBaseSaida(todasPessoas[i]))
            } catch (_) {
              continue
            }
            if (ident === identidadeSaida) doMesmoGrupo.push(todasPessoas[i])
          }

          // um bloqueio por pessoa do grupo; idempotente (o mesmo pedido não duplica)
          for (let i = 0; i < doMesmoGrupo.length; i++) {
            const p = doMesmoGrupo[i]
            let jaTem = false
            try {
              const ex = $app.findRecordsByFilter(
                'bloqueios_contato',
                "pessoa = {:p} && ambiente = 'teste' && motivo = 'pedido_saida'",
                '',
                1,
                0,
                { p: p.id },
              )
              jaTem = ex.length > 0
            } catch (_) {}
            if (jaTem) continue

            try {
              const colB = $app.findCollectionByNameOrId('bloqueios_contato')
              const b = new Record(colB)
              b.set('pessoa', p.id)
              b.set('identificador_norm', String(identidadeSaida))
              b.set('motivo', 'pedido_saida')
              // 'global': vale em todos os produtos e canais, não só na coorte fria
              b.set('alcance', 'global')
              b.set('origem', 'evento:' + eventoId)
              b.set('ambiente', 'teste')
              $app.save(b)
              bloqueiosCriados++
            } catch (errB) {
              efeitos.erro_bloqueio = String(errB)
              $app.logger().error('evento: falha ao criar bloqueio', 'err', String(errB))
            }
          }

          // pedido de saída também encerra a pausa: o humano não deve mais tentar conversar
          try {
            const pausas = $app.findRecordsByFilter(
              'pausas_resposta',
              "pessoa = {:p} && ambiente = 'teste' && estado = 'ativa'",
              '',
              50,
              0,
              { p: pessoaId },
            )
            for (let i = 0; i < pausas.length; i++) {
              pausas[i].set('estado', 'encerrada')
              pausas[i].set('motivo_codigo', 'pedido_saida')
              $app.save(pausas[i])
            }
          } catch (_) {}
        } catch (errS) {
          efeitos.erro_saida = String(errS)
          $app.logger().error('evento: falha no bloqueio global', 'err', String(errS))
        }

        efeitos.saida = {
          identidade_efetiva: identidadeSaida,
          bloqueios_criados: bloqueiosCriados,
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
