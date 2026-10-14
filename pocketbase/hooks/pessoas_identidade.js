// SPEC-1-002 (task 3b736d7d): identidade de pessoas — CA-1-002-02.
// Na criação de pessoas: se um identificador individual confirmado (e-mail individual,
// telefone, LinkedIn) já pertence a OUTRA pessoa, registra conflito na fila e nega a criação
// (400) — sem fundir e sem expor dados. Duplicata exata do mesmo par pessoa+identificador é
// negada pelo índice único; o serviço resolve reuso antes de criar.
onRecordCreate('pessoas', (e) => {
  const novo = e.record
  const ambiente = novo.getString('ambiente') || 'teste'

  // normalizações defensivas (o serviço também normaliza no cliente)
  try {
    const email = (novo.getString('email_norm') || '').trim().toLowerCase()
    if (email && email !== novo.getString('email_norm')) novo.set('email_norm', email)
    const tel = (novo.getString('telefone_norm') || '').replace(/\D/g, '')
    if (tel && tel !== novo.getString('telefone_norm')) novo.set('telefone_norm', tel)
  } catch (_) {}

  for (const campo of ['email_norm', 'telefone_norm', 'linkedin_norm']) {
    const valor = (novo.getString(campo) || '').trim()
    if (!valor) continue

    // e-mail genérico não é chave de pessoa (contato@, comercial@, ...)
    if (
      campo === 'email_norm' &&
      /^(contato|comercial|financeiro|geral|vendas|suporte|marketing|rh|juridico|financeira)@/i.test(
        valor,
      )
    ) {
      continue
    }

    try {
      const existentes = $app.findRecordsByFilter('pessoas', campo + ' = {:v}', '', 2, 0, {
        v: valor,
      })
      // outra pessoa (id diferente) já tem este identificador confirmado → conflito
      const outras = existentes.filter((p) => p.id !== novo.id)
      if (outras.length > 0) {
        try {
          const col = $app.findCollectionByNameOrId('conflitos_cadastro')
          const reg = new Record(col)
          reg.set('entidade', 'pessoas')
          reg.set('identificador_tipo', campo.replace('_norm', ''))
          reg.set('identificador_norm', valor)
          reg.set('ids_envolvidos', JSON.stringify([novo.id].concat(outras.map((p) => p.id))))
          reg.set(
            'detalhe',
            'Identificador confirmado pertence a mais de uma pessoa; revisão do admin (sem fusão automática).',
          )
          reg.set('status', 'pendente')
          reg.set('ambiente', ambiente)
          $app.save(reg)
        } catch (errReg) {
          $app.logger().warn('falha ao registrar conflito de identidade', 'err', String(errReg))
        }
        // nega a criação sem expor dados da outra pessoa
        return e.error(
          400,
          'Identificador já confirmado para outra pessoa — conflito registrado para revisão.',
        )
      }
    } catch (_) {}
  }
})
