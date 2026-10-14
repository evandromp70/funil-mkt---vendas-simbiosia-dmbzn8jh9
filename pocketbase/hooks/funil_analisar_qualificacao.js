// Analisa a qualificação de um lead (etapa HA — humano revisa antes de decidir).
routerAdd(
  'POST',
  '/backend/v1/funil/analisar-qualificacao',
  (e) => {
    const body = e.requestInfo().body || {}
    const leadId = body.leadId
    if (!leadId) return e.badRequestError('leadId é obrigatório')

    let lead
    try {
      lead = $app.findRecordById('leads', leadId)
    } catch (_) {
      return e.notFoundError('Lead não encontrado')
    }

    if (!e.auth) {
      return e.unauthorizedError('Autenticação necessária')
    }

    const prompt =
      'Analise a qualificação do lead abaixo e devolva: (1) notas de 0 a 10 para fit, dor, orçamento, timing e acesso; (2) score total de 0 a 100; (3) pontos fortes; (4) lacunas que impedem a qualificação. Seja específico e acionável, em português:\n' +
      'Empresa: ' +
      lead.getString('nome_empresa') +
      '\n' +
      'Contato: ' +
      (lead.getString('contato_nome') || 'não informado') +
      '\n' +
      'Origem: ' +
      lead.getString('origem') +
      '\n' +
      'Etapa atual: ' +
      lead.getString('etapa') +
      '\n' +
      'Observações: ' +
      (lead.getString('observacoes') || 'sem observações')

    // SPEC-1-001 (task 20c86bd2): despachos instrumentados e neutralizados em backend TESTE.
    // Portão primeiro: com pausa geral ativa, a chamada NÃO chega ao despacho (contador por
    // correlação permanece 0). Controle positivo: body.provar_interceptacao (só em pausa).
    let cfgPausa = true
    let cfgExterno = false
    try {
      const cfgs = $app.findRecordsByFilter('sistema_config', '', '', 1, 0)
      if (cfgs.length > 0) {
        cfgPausa = cfgs[0].getBool('pausa_geral')
        cfgExterno = cfgs[0].getBool('integracoes_externas_habilitadas')
      }
    } catch (_) {}

    if (cfgPausa && body.provar_interceptacao !== true) {
      return e.json(200, {
        analise:
          '[AMBIENTE DE TESTE] Análise interceptada (SPEC-1-001): nenhuma chamada externa foi executada durante a construção.',
        interceptado: true,
      })
    }

    const correlationId = 'disp-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)
    try {
      const col = $app.findCollectionByNameOrId('teste_despachos')
      const reg = new Record(col)
      reg.set('correlation_id', correlationId)
      reg.set('rota', '/backend/v1/funil/analisar-qualificacao')
      reg.set('tipo', 'ai')
      reg.set('tentativas', 1)
      $app.save(reg)
    } catch (errReg) {
      $app.logger().warn('falha ao registrar despacho interceptado', 'err', String(errReg))
    }

    if (cfgPausa) {
      return e.json(200, {
        analise:
          '[AMBIENTE DE TESTE] Controle positivo: tentativa de despacho registrada (correlação ' +
          correlationId +
          ') sem rede. Nenhuma chamada externa foi executada.',
        interceptado: true,
        correlation_id: correlationId,
      })
    }

    if (!cfgExterno) {
      return e.internalServerError('Integrações externas desabilitadas (SPEC-1-001)')
    }

    // Caminho original — só executa com pausa desligada e integrações externas habilitadas
    let result
    try {
      result = $ai.agent('assistente-funil').chat({
        user_id: e.auth.id,
        conversation_id: null,
        message: prompt,
      })
    } catch (err) {
      $app.logger().error('falha ao chamar assistente-funil', 'err', String(err))
      return e.internalServerError('Não foi possível analisar a qualificação agora')
    }

    return e.json(200, { analise: result.content })
  },
  $apis.requireAuth(),
)
