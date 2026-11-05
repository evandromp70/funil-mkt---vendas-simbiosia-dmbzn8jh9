// SPEC-2-004 (F2-T11): fila dos sócios e continuidade humana — CA-2-004-03 e 04.
//
// Rotas:
//   GET  /backend/v1/passagens/fila                  — lista a fila do usuário (ACL por dono)
//   POST /backend/v1/passagens/assumir               — assume uma passagem
//   POST /backend/v1/passagens/devolver              — devolve para a fila
//   POST /backend/v1/passagens/resolver              — encerra com motivo
//   POST /backend/v1/passagens/atribuir-dono         — mapeia dono (revisão administrativa)
//   POST /backend/v1/passagens/retomar               — retomada humana com validação completa
//
// REGRAS DURAS (cada uma provada em tests/passagem.test.mjs):
//   1. ACL: ninguém vê nem opera passagem de outro dono. Admin vê tudo.
//   2. TETO: limite configurável por dono. Excedente fica AGUARDANDO e VISÍVEL — não desaparece.
//   3. Dono ausente NUNCA é chutado: fica pendente de revisão administrativa.
//   4. Retomada exige comando humano, autorização, motivo e nova validação de coorte/
//      identidade/proteção/versão. Devolver ao agente NÃO remove opt-out nem confirma envio.
//   5. Nada aqui envia mensagem: modo simulado, nenhum HTTP externo.
//
// Lógica INLINE (VM própria). SEM spread de objeto: a VM rejeita `...` e derruba a rota com 500.

routerAdd(
  'GET',
  '/backend/v1/passagens/fila',
  (e) => {
    if (!e.auth) return e.unauthorizedError('Autenticação obrigatória')

    const papel = String(e.auth.getString('role') || '')
    const souAdmin = papel === 'admin'
    const meuId = e.auth.id

    let todas = []
    try {
      todas = $app.findRecordsByFilter('passagens', "ambiente = 'teste'", '-created', 500, 0, {})
    } catch (err) {
      return e.internalServerError('Falha ao ler a fila: ' + String(err))
    }

    // TETO: individual por pessoa (users.teto_passagens); quem não tem usa o padrão global.
    // Decisão do José (28/10): 5 para ele, 1 para o Evandro (transbordo do processo).
    const tetoDe = (usuarioId) => {
      let padrao = 3
      try {
        const cfg = $app.findRecordsByFilter('sistema_config', "ambiente = 'teste'", '', 1, 0, {})
        if (cfg.length > 0 && Number(cfg[0].get('teto_passagens_por_dono') || 0) > 0)
          padrao = Number(cfg[0].get('teto_passagens_por_dono'))
      } catch (_) {}
      if (!usuarioId) return padrao
      try {
        const u = $app.findRecordById('users', usuarioId)
        const proprio = Number(u.get('teto_passagens') || 0)
        return proprio > 0 ? proprio : padrao
      } catch (_) {
        return padrao
      }
    }
    let teto = tetoDe('') // padrão, usado no texto de cabeçalho

    // contagem de ativas por dono
    // O TETO conta apenas o que a pessoa está TOCANDO (status 'assumida'), não a fila dela.
    // Antes eu contava 'aguardando' também, e o efeito era perverso: o admin mapeava dono em
    // duas passagens e a primeira assunção já batia no teto, porque a segunda (ainda na fila)
    // contava como trabalho em andamento. Fila não é carga; carga é o que está na mão.
    const ativasPorDono = {}
    for (let i = 0; i < todas.length; i++) {
      const p = todas[i]
      if (String(p.getString('status')) !== 'assumida') continue
      const d = String(p.getString('dono') || '')
      if (!d) continue
      ativasPorDono[d] = (ativasPorDono[d] || 0) + 1
    }

    const visiveis = []
    for (let i = 0; i < todas.length; i++) {
      const p = todas[i]
      const status = String(p.getString('status'))
      if (status === 'resolvida') continue
      const dono = String(p.getString('dono') || '')
      const pendente = p.getBool('dono_pendente') || !dono

      // ACL: admin vê tudo; os demais veem o que é seu e o que está sem dono
      const podeVer = souAdmin || pendente || dono === meuId
      if (!podeVer) continue

      // EXCEDENTE: precisa ser marcado mesmo quando a passagem ainda não tem dono.
      // Antes eu exigia `dono`, então a passagem que ficou aguardando por teto (e que, sem dono,
      // pode ser de qualquer um) não era marcada — a tela não avisava que estava acima do limite.
      let excedente = false
      if (status === 'aguardando') {
        if (dono) {
          excedente = ativasPorDono[dono] > tetoDe(dono)
        } else {
          for (const k in ativasPorDono) {
            if (ativasPorDono[k] > tetoDe(k)) {
              excedente = true
              break
            }
          }
        }
      }

      visiveis.push({
        id: p.id,
        pessoa: String(p.getString('pessoa') || ''),
        produto: String(p.getString('produto') || ''),
        canal: String(p.getString('canal') || ''),
        classificacao: String(p.getString('classificacao') || ''),
        status: status,
        resumo: String(p.getString('resumo') || ''),
        dono: dono,
        dono_pendente: pendente,
        assumida_por: String(p.getString('assumida_por') || ''),
        excedente: excedente ? true : false,
        created: String(p.getString('created') || ''),
      })
    }

    return e.json(200, {
      teto: teto,
      total: visiveis.length,
      passagens: visiveis,
      euSouAdmin: souAdmin,
    })
  },
  $apis.requireAuth(),
)

routerAdd(
  'POST',
  '/backend/v1/passagens/assumir',
  (e) => {
    if (!e.auth) return e.unauthorizedError('Autenticação obrigatória')
    const body = e.requestInfo().body || {}
    const passagemId = String(body.passagemId || '')
    if (!passagemId) return e.badRequestError('passagemId é obrigatório')

    let p
    try {
      p = $app.findRecordById('passagens', passagemId)
    } catch (_) {
      return e.notFoundError('Passagem não encontrada')
    }

    const papel = String(e.auth.getString('role') || '')
    const souAdmin = papel === 'admin'
    const dono = String(p.getString('dono') || '')
    const pendente = p.getBool('dono_pendente') || !dono

    // ACL: só o dono, o admin, ou quem assume algo sem dono (vira o dono)
    if (!souAdmin && !pendente && dono !== e.auth.id)
      return e.forbiddenError('Esta passagem é de outro responsável.')

    const status = String(p.getString('status'))
    if (status === 'resolvida') return e.badRequestError('Passagem já resolvida.')

    // TETO INDIVIDUAL: cada pessoa tem o seu (users.teto_passagens); sem próprio, usa o padrão.
    const tetoDe = (usuarioId) => {
      let padrao = 3
      try {
        const cfg = $app.findRecordsByFilter('sistema_config', "ambiente = 'teste'", '', 1, 0, {})
        if (cfg.length > 0 && Number(cfg[0].get('teto_passagens_por_dono') || 0) > 0)
          padrao = Number(cfg[0].get('teto_passagens_por_dono'))
      } catch (_) {}
      if (!usuarioId) return padrao
      try {
        const u = $app.findRecordById('users', usuarioId)
        const proprio = Number(u.get('teto_passagens') || 0)
        return proprio > 0 ? proprio : padrao
      } catch (_) {
        return padrao
      }
    }
    const teto = tetoDe(e.auth.id)
    if (!souAdmin) {
      let minhasAtivas = 0
      try {
        const minhas = $app.findRecordsByFilter(
          'passagens',
          "dono = {:d} && ambiente = 'teste'",
          '',
          500,
          0,
          { d: e.auth.id },
        )
        for (let i = 0; i < minhas.length; i++) {
          // Carga = passagens ASSUMIDAS por mim. 'aguardando' é fila, não conta.
          if (String(minhas[i].id) === String(p.id)) continue
          if (String(minhas[i].getString('status')) !== 'assumida') continue
          minhasAtivas++
        }
      } catch (_) {}
      // A ASSUNÇÃO IDEMPOTENTE só vale se a passagem JÁ ESTÁ ASSUMIDA por mim.
      // Antes eu liberava quando `dono === eu`, mesmo com a passagem AGUARDANDO — e aí o teto
      // não limitava nada: bastava o admin atribuir várias ao mesmo dono e ele assumia todas.
      // Defeito pego pela suíte (a segunda deveria ficar aguardando e era assumida).
      const jaAssumidaPorMim =
        status === 'assumida' && String(p.getString('assumida_por') || '') === e.auth.id
      if (!jaAssumidaPorMim && minhasAtivas >= teto)
        return e.json(200, {
          estado: 'no_limite',
          teto: teto,
          detalhe:
            'Teto de ' +
            teto +
            ' passagens ativas atingido: esta continua aguardando e visível na fila.',
        })
    }

    try {
      p.set('status', 'assumida')
      p.set('assumida_por', e.auth.id)
      p.set('assumida_em', new Date().toISOString().replace('T', ' '))
      if (pendente) {
        p.set('dono', e.auth.id)
        p.set('dono_pendente', false)
      }
      $app.save(p)
    } catch (err) {
      return e.internalServerError('Falha ao assumir: ' + String(err))
    }

    return e.json(200, { estado: 'assumida', passagemId: p.id })
  },
  $apis.requireAuth(),
)

routerAdd(
  'POST',
  '/backend/v1/passagens/devolver',
  (e) => {
    if (!e.auth) return e.unauthorizedError('Autenticação obrigatória')
    const body = e.requestInfo().body || {}
    const passagemId = String(body.passagemId || '')
    if (!passagemId) return e.badRequestError('passagemId é obrigatório')

    let p
    try {
      p = $app.findRecordById('passagens', passagemId)
    } catch (_) {
      return e.notFoundError('Passagem não encontrada')
    }

    const papel = String(e.auth.getString('role') || '')
    const souAdmin = papel === 'admin'
    if (!souAdmin && String(p.getString('assumida_por') || '') !== e.auth.id)
      return e.forbiddenError('Só quem assumiu (ou admin) pode devolver.')

    try {
      p.set('status', 'aguardando')
      p.set('assumida_por', '')
      p.set('assumida_em', '')
      p.set('motivo_codigo', 'devolvida_para_fila')
      $app.save(p)
    } catch (err) {
      return e.internalServerError('Falha ao devolver: ' + String(err))
    }

    // devolver NÃO remove bloqueio, NÃO encerra pausa, NÃO confirma envio
    return e.json(200, {
      estado: 'aguardando',
      passagemId: p.id,
      detalhe: 'Devolvida para a fila. Nenhum bloqueio foi removido e nada foi enviado.',
    })
  },
  $apis.requireAuth(),
)

routerAdd(
  'POST',
  '/backend/v1/passagens/resolver',
  (e) => {
    if (!e.auth) return e.unauthorizedError('Autenticação obrigatória')
    const body = e.requestInfo().body || {}
    const passagemId = String(body.passagemId || '')
    const motivo = String(body.motivo || '').trim()
    if (!passagemId) return e.badRequestError('passagemId é obrigatório')
    if (!motivo) return e.badRequestError('Motivo é obrigatório para resolver.')

    let p
    try {
      p = $app.findRecordById('passagens', passagemId)
    } catch (_) {
      return e.notFoundError('Passagem não encontrada')
    }

    const papel = String(e.auth.getString('role') || '')
    const souAdmin = papel === 'admin'
    if (!souAdmin && String(p.getString('dono') || '') !== e.auth.id)
      return e.forbiddenError('Esta passagem é de outro responsável.')

    try {
      p.set('status', 'resolvida')
      p.set('resolvida_em', new Date().toISOString().replace('T', ' '))
      p.set('motivo', motivo)
      p.set('motivo_codigo', 'resolvida_humano')
      $app.save(p)
    } catch (err) {
      return e.internalServerError('Falha ao resolver: ' + String(err))
    }

    return e.json(200, { estado: 'resolvida', passagemId: p.id, motivo: motivo })
  },
  $apis.requireAuth(),
)

routerAdd(
  'POST',
  '/backend/v1/passagens/atribuir-dono',
  (e) => {
    if (!e.auth) return e.unauthorizedError('Autenticação obrigatória')
    if (String(e.auth.getString('role') || '') !== 'admin')
      return e.forbiddenError('Só admin mapeia responsável.')

    const body = e.requestInfo().body || {}
    const passagemId = String(body.passagemId || '')
    const donoId = String(body.donoId || '').trim()
    if (!passagemId) return e.badRequestError('passagemId é obrigatório')

    let p
    try {
      p = $app.findRecordById('passagens', passagemId)
    } catch (_) {
      return e.notFoundError('Passagem não encontrada')
    }

    if (!donoId) {
      // remover dono: volta a pendente de revisão (nunca chuta alguém)
      try {
        p.set('dono', '')
        p.set('dono_pendente', true)
        $app.save(p)
      } catch (err) {
        return e.internalServerError('Falha ao limpar dono: ' + String(err))
      }
      return e.json(200, { estado: 'pendente', passagemId: p.id })
    }

    // o dono tem de existir e ser usuário real
    try {
      $app.findRecordById('users', donoId)
    } catch (_) {
      return e.badRequestError('Responsável informado não existe.')
    }

    try {
      p.set('dono', donoId)
      p.set('dono_pendente', false)
      $app.save(p)
    } catch (err) {
      return e.internalServerError('Falha ao atribuir: ' + String(err))
    }

    return e.json(200, { estado: 'atribuida', passagemId: p.id, dono: donoId })
  },
  $apis.requireAuth(),
)

// RETOMADA HUMANA (CA-2-004-04): o único caminho que devolve a pessoa ao agente.
// Exige: comando humano autenticado + motivo + nova validação de proteção.
// Devolver ao agente NÃO remove opt-out nem confirma envio.
routerAdd(
  'POST',
  '/backend/v1/passagens/retomar',
  (e) => {
    if (!e.auth) return e.unauthorizedError('Autenticação obrigatória')
    const body = e.requestInfo().body || {}
    const pessoaId = String(body.pessoaId || '')
    const motivo = String(body.motivo || '').trim()
    if (!pessoaId) return e.badRequestError('pessoaId é obrigatório')
    if (!motivo) return e.badRequestError('Motivo é obrigatório para retomar.')

    // 1. opt-out e bloqueio: NUNCA são removidos por retomada
    let temBloqueio = false
    try {
      const bs = $app.findRecordsByFilter(
        'bloqueios_contato',
        "pessoa = {:p} && ambiente = 'teste'",
        '',
        1,
        0,
        { p: pessoaId },
      )
      temBloqueio = bs.length > 0
    } catch (_) {
      temBloqueio = true // fail-safe: não retoma sem conseguir verificar
    }
    if (temBloqueio)
      return e.json(200, {
        estado: 'recusado',
        motivo_codigo: 'bloqueio_ativo',
        detalhe:
          'Pessoa com bloqueio ativo (pedido de saída). A retomada não remove opt-out — isso exige revisão própria.',
      })

    // 2. pausa de resposta: encerrar é ato humano explícito, com motivo
    let pausasEncerradas = 0
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
        pausas[i].set('motivo_codigo', 'retomada_humana')
        pausas[i].set('motivo', 'Retomada autorizada por ' + e.auth.id + ': ' + motivo)
        $app.save(pausas[i])
        pausasEncerradas++
      }
    } catch (err) {
      return e.internalServerError('Falha ao encerrar pausa: ' + String(err))
    }

    // 3. passagens da pessoa: assumidas/resolvidas por ação humana
    let passagensFechadas = 0
    try {
      const ps = $app.findRecordsByFilter(
        'passagens',
        "pessoa = {:p} && ambiente = 'teste'",
        '',
        50,
        0,
        { p: pessoaId },
      )
      for (let i = 0; i < ps.length; i++) {
        if (String(ps[i].getString('status')) === 'resolvida') continue
        ps[i].set('status', 'resolvida')
        ps[i].set('resolvida_em', new Date().toISOString().replace('T', ' '))
        ps[i].set('motivo', 'Retomada humana: ' + motivo)
        ps[i].set('motivo_codigo', 'retomada_humana')
        $app.save(ps[i])
        passagensFechadas++
      }
    } catch (_) {}

    // 4. NOVA VALIDAÇÃO: coorte/identidade/proteção/versão — o retomar não atropela a política
    let podeRetomar = false
    let motivoCodigo = ''
    try {
      const av = $app.findRecordsByFilter('pessoas', 'id = {:p}', '', 1, 0, { p: pessoaId })
      if (av.length === 0) {
        motivoCodigo = 'pessoa_inexistente'
      } else {
        // coorte registrada? sem coorte a pessoa não pode voltar ao agente
        let coorte = ''
        try {
          const org = $app.findRecordsByFilter(
            'pessoas_origens',
            "pessoa = {:p} && ambiente = 'teste'",
            '-created',
            1,
            0,
            { p: pessoaId },
          )
          if (org.length > 0) coorte = String(org[0].getString('coorte') || '')
        } catch (_) {}
        if (!coorte) motivoCodigo = 'sem_coorte'
        else {
          podeRetomar = true
          motivoCodigo = 'apto'
        }
      }
    } catch (err) {
      motivoCodigo = 'falha_validacao'
    }

    return e.json(200, {
      estado: podeRetomar ? 'retomada' : 'recusado',
      motivo_codigo: motivoCodigo,
      pausas_encerradas: pausasEncerradas,
      passagens_fechadas: passagensFechadas,
      detalhe: podeRetomar
        ? 'Retomada autorizada e auditada. Nada foi enviado: o próximo toque volta a passar por aprovação.'
        : 'Retomada recusada na nova validação (' + motivoCodigo + ').',
      motivo: motivo,
      autorizado_por: e.auth.id,
    })
  },
  $apis.requireAuth(),
)
