// SPEC-1-002 (task 3b736d7d): identidade de pessoas — CA-1-002-02.
// Regra: identificador individual confirmado (e-mail individual, telefone, LinkedIn) que já
// pertence a OUTRA pessoa → registra conflito na fila e NEGAR a criação (sem fundir, sem expor).
// F2-T01: recuperado do Skip 50182 (fonte executável) para o repositório.
onRecordCreate((e) => {
  const novo = e.record
  const ambiente = novo.getString('ambiente') || 'teste'

  try {
    const email = (novo.getString('email_norm') || '').trim().toLowerCase()
    if (email && email !== novo.getString('email_norm')) novo.set('email_norm', email)
    const tel = (novo.getString('telefone_norm') || '').replace(/\D/g, '')
    if (tel && tel !== novo.getString('telefone_norm')) novo.set('telefone_norm', tel)
  } catch (_) {}

  for (const campo of ['email_norm', 'telefone_norm', 'linkedin_norm']) {
    const valor = (novo.getString(campo) || '').trim()
    if (!valor) continue

    if (
      campo === 'email_norm' &&
      /^(contato|comercial|financeiro|geral|vendas|suporte|marketing|rh|juridico|financeira)@/i.test(
        valor,
      )
    ) {
      continue
    }

    let outras = []
    try {
      const existentes = $app.findRecordsByFilter('pessoas', campo + ' = {:v}', '', 2, 0, {
        v: valor,
      })
      outras = existentes.filter((p) => p.id !== novo.id)
    } catch (_) {
      continue
    }
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
      throw new BadRequestError(
        'Identificador já confirmado para outra pessoa — conflito registrado para revisão.',
      )
    }
  }

  return e.next()
}, 'pessoas')
