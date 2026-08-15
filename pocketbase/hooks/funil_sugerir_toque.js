// Sugere o próximo toque de cadência para um lead (etapa HA — humano revisa antes de enviar).
routerAdd(
  'POST',
  '/backend/v1/funil/sugerir-toque',
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

    // Histórico de cadência do lead
    let historico = ''
    try {
      const cadencias = $app.findRecordsByFilter(
        'cadencias',
        'lead = {:leadId}',
        '-created',
        20,
        0,
        { leadId },
      )
      historico = cadencias
        .map(function (c) {
          return (
            'Toque ' +
            c.get('toque') +
            ' | canal: ' +
            c.getString('canal') +
            ' | status: ' +
            c.getString('status') +
            ' | data: ' +
            (c.getString('data_envio') || '—')
          )
        })
        .join('\n')
    } catch (_) {}

    const prompt =
      'Sugira o próximo toque de cadência para o lead abaixo, com canal, assunto e mensagem pronta (em português, curto e direto):\n' +
      'Empresa: ' +
      lead.getString('nome_empresa') +
      '\n' +
      'Contato: ' +
      (lead.getString('contato_nome') || 'não informado') +
      '\n' +
      'Etapa atual: ' +
      lead.getString('etapa') +
      '\n' +
      'Observações: ' +
      (lead.getString('observacoes') || 'sem observações') +
      '\n' +
      'Histórico de cadência:\n' +
      (historico || 'nenhum toque registrado')

    let result
    try {
      result = $ai.agent('assistente-funil').chat({
        user_id: e.auth.id,
        conversation_id: null,
        message: prompt,
      })
    } catch (err) {
      $app.logger().error('falha ao chamar assistente-funil', 'err', String(err))
      return e.internalServerError('Não foi possível sugerir o próximo toque agora')
    }

    return e.json(200, { sugestao: result.content })
  },
  $apis.requireAuth(),
)
