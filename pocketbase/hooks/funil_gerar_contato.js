// Gera rascunho de primeiro contato para um lead (etapa HA — humano revisa antes de enviar).
routerAdd(
  'POST',
  '/backend/v1/funil/gerar-contato',
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

    // Só o dono do lead pode gerar rascunho
    if (!e.auth) {
      return e.unauthorizedError('Autenticação necessária')
    }

    const prompt =
      'Crie um rascunho de primeiro contato (mensagem curta, tom cordial e direto, em português) para o seguinte lead:\n' +
      'Empresa: ' +
      lead.getString('nome_empresa') +
      '\n' +
      'Contato: ' +
      (lead.getString('contato_nome') || 'não informado') +
      '\n' +
      'Origem: ' +
      lead.getString('origem') +
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
      return e.internalServerError('Não foi possível gerar o rascunho agora')
    }

    return e.json(200, { rascunho: result.content })
  },
  $apis.requireAuth(),
)
