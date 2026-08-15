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
