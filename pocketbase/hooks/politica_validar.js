// SPEC-2-002 (F2-T03): validação da política de coorte — CA-2-002-01.
// O servidor NÃO confia no payload. Regras duras (cada uma provada em tests/politica.test.mjs):
//   1. janela_inicio < janela_fim (HH:MM)
//   2. limites inteiros >= 0
//   3. timezone obrigatório e America/Sao_Paulo nesta fase
//   4. coorte de relacionamento (rede_*, clientes_atendidos) EXIGE aprovação por mensagem
//   5. elegivel_sem_politica é SEMPRE false (ausência nunca vira permissão)
//   6. exige_aprovacao_lote é SEMPRE false nesta fase (fria não tem lote)
//   7. versão APROVADA é imutável: edição exige nova versão
// Toda via termina em e.next() ou throw (lição: record hook sem e.next() engole a escrita).
onRecordCreate((e) => {
  const r = e.record
  const HHMM = /^([01][0-9]|2[0-3]):[0-5][0-9]$/
  const coorte = r.getString('coorte')

  const inicio = r.getString('janela_inicio')
  const fim = r.getString('janela_fim')
  if (!inicio || !HHMM.test(inicio))
    throw new BadRequestError('janela_inicio deve estar no formato HH:MM (00:00 a 23:59)')
  if (!fim || !HHMM.test(fim))
    throw new BadRequestError('janela_fim deve estar no formato HH:MM (00:00 a 23:59)')
  if (inicio >= fim) throw new BadRequestError('janela_inicio deve ser anterior a janela_fim')

  const tz = r.getString('timezone')
  if (!tz) throw new BadRequestError('timezone é obrigatório')
  if (tz !== 'America/Sao_Paulo')
    throw new BadRequestError('Nesta fase o timezone deve ser America/Sao_Paulo')

  for (const campo of [
    'intervalo_min_minutos',
    'limite_dia_por_pessoa',
    'limite_dia_por_canal',
    'limite_dia_por_dono',
  ]) {
    const v = r.getInt(campo)
    if (v < 0) throw new BadRequestError(campo + ' não pode ser negativo')
  }

  const deRelacionamento =
    coorte === 'rede_jose' || coorte === 'rede_evandro' || coorte === 'clientes_atendidos'
  if (deRelacionamento && !r.getBool('exige_aprovacao_mensagem'))
    throw new BadRequestError(
      'Coorte de relacionamento (' +
        coorte +
        ') exige aprovação individual da mensagem — não pode ser desligada.',
    )

  // regras duras: o payload nunca as inverte
  if (r.getBool('elegivel_sem_politica'))
    throw new BadRequestError(
      'elegivel_sem_politica deve ser false: ausência de política aprovada mantém PENDENTE.',
    )
  if (r.getBool('exige_aprovacao_lote'))
    throw new BadRequestError(
      'exige_aprovacao_lote deve ser false nesta fase: coorte fria não usa aprovação por lote.',
    )

  // nasce rascunho a menos que venha explicitamente como aprovada (aprovação é ato do admin)
  if (!r.getString('status')) r.set('status', 'rascunho')
  if (r.getString('status') === 'aprovada') {
    r.set('aprovado_por', e.auth ? e.auth.id : '')
    r.set('aprovado_em', new Date().toISOString().replace('T', ' '))
  }

  return e.next()
}, 'politicas_coorte')

onRecordUpdate((e) => {
  const r = e.record
  const antes = r.original()
  const HHMM = /^([01][0-9]|2[0-3]):[0-5][0-9]$/

  // 7. versão aprovada é imutável — só o próprio status pode virar 'arquivada'
  if (antes.getString('status') === 'aprovada') {
    const mudouConteudo =
      r.getString('coorte') !== antes.getString('coorte') ||
      r.getInt('versao') !== antes.getInt('versao') ||
      r.getBool('exige_aprovacao_mensagem') !== antes.getBool('exige_aprovacao_mensagem') ||
      r.getString('janela_inicio') !== antes.getString('janela_inicio') ||
      r.getString('janela_fim') !== antes.getString('janela_fim') ||
      r.getInt('limite_dia_por_pessoa') !== antes.getInt('limite_dia_por_pessoa') ||
      r.getInt('limite_dia_por_canal') !== antes.getInt('limite_dia_por_canal') ||
      r.getInt('limite_dia_por_dono') !== antes.getInt('limite_dia_por_dono') ||
      r.getInt('intervalo_min_minutos') !== antes.getInt('intervalo_min_minutos') ||
      r.getInt('nota_minima') !== antes.getInt('nota_minima')
    if (mudouConteudo)
      throw new BadRequestError(
        'Versão aprovada é imutável. Crie uma nova versão para alterar a política.',
      )
    if (r.getString('status') !== 'arquivada' && r.getString('status') !== 'aprovada')
      throw new BadRequestError('Versão aprovada só pode ser arquivada.')
  }

  const inicio = r.getString('janela_inicio')
  const fim = r.getString('janela_fim')
  if (!HHMM.test(inicio) || !HHMM.test(fim))
    throw new BadRequestError('janela_inicio e janela_fim devem estar no formato HH:MM')
  if (inicio >= fim) throw new BadRequestError('janela_inicio deve ser anterior a janela_fim')

  const tz = r.getString('timezone')
  if (tz !== 'America/Sao_Paulo')
    throw new BadRequestError('Nesta fase o timezone deve ser America/Sao_Paulo')

  const coorte = r.getString('coorte')
  const deRelacionamento =
    coorte === 'rede_jose' || coorte === 'rede_evandro' || coorte === 'clientes_atendidos'
  if (deRelacionamento && !r.getBool('exige_aprovacao_mensagem'))
    throw new BadRequestError(
      'Coorte de relacionamento (' + coorte + ') exige aprovação individual da mensagem.',
    )

  if (r.getBool('elegivel_sem_politica'))
    throw new BadRequestError('elegivel_sem_politica deve ser false.')
  if (r.getBool('exige_aprovacao_lote'))
    throw new BadRequestError('exige_aprovacao_lote deve ser false nesta fase.')

  // aprovação registrada no servidor
  if (r.getString('status') === 'aprovada' && antes.getString('status') !== 'aprovada') {
    r.set('aprovado_por', e.auth ? e.auth.id : '')
    r.set('aprovado_em', new Date().toISOString().replace('T', ' '))
  }

  return e.next()
}, 'politicas_coorte')
