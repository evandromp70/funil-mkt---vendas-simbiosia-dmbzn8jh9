// SPEC-2-002 (F2-T03): avaliador de elegibilidade por coorte — CA-2-002-01.
// POST /backend/v1/politica/avaliar { pessoaId, canal? }
//
// Responde POR QUE a pessoa pode ou não receber toque agora. Nunca "sim" por omissão:
// ausência de política aprovada = PENDENTE.
//
// Ordem de avaliação (cada item deixa recibo em `detalhes`):
//   1. pausa geral ligada            → nao_elegivel  (pausa_geral)
//   2. pessoa bloqueada              → nao_elegivel  (bloqueio)
//   3. sem política aprovada         → pendente      (sem_politica_aprovada)
//   4. relacionamento/atendido       → pendente      (exige_aprovacao_mensagem)
//   5. inbound                       → pendente      (inbound_sem_politica)
//   6. fora da janela de horário     → nao_elegivel  (fora_da_janela)
//   7. nota abaixo do mínimo         → nao_elegivel  (nota_abaixo_minimo)
//   8. senão                         → elegivel
//
// PROTEGIDO: pessoa conhecida NÃO recebe fria; outro decisor da mesma empresa NÃO herda
// o relacionamento (a avaliação é por pessoaId, nunca por empresa).
routerAdd(
  'POST',
  '/backend/v1/politica/avaliar',
  (e) => {
    if (!e.auth) return e.unauthorizedError('Autenticação obrigatória')

    const body = e.requestInfo().body || {}
    const pessoaId = String(body.pessoaId || '')
    const canal = String(body.canal || 'email')
    const ambiente = String(body.ambiente || 'teste')
    if (!pessoaId) return e.badRequestError('pessoaId é obrigatório')

    let pessoa
    try {
      pessoa = $app.findRecordById('pessoas', pessoaId)
    } catch (_) {
      return e.notFoundError('Pessoa não encontrada')
    }

    const detalhes = []
    const responder = (elegivel, motivoCodigo, motivo) => {
      detalhes.push({ motivo_codigo: motivoCodigo, motivo: motivo })
      return e.json(200, {
        elegivel: elegivel,
        motivo_codigo: motivoCodigo,
        motivo: motivo,
        pessoaId: pessoaId,
        canal: canal,
        ambiente: ambiente,
        detalhes: detalhes,
      })
    }

    // ---- 0. pessoa com pedido de saída (checado ANTES de tudo: opt-out não se contorna) ----
    try {
      const saidas = $app.findRecordsByFilter(
        'bloqueios_contato',
        "pessoa = {:p} && ambiente = {:a} && alcance = 'global'",
        '',
        1,
        0,
        { p: pessoaId, a: ambiente },
      )
      if (saidas.length > 0) {
        return responder(false, 'bloqueio', 'Pessoa com bloqueio ativo: não recebe toque.')
      }
    } catch (_) {}

    // ---- 1. pausa geral (fonte: sistema_config) ----
    let pausaGeral = true // default seguro: sem configuração, assume pausa
    try {
      const cfg = $app.findRecordsByFilter(
        'sistema_config',
        'ambiente = {:a}',
        '-created',
        1,
        0,
        { a: ambiente },
      )
      if (cfg.length > 0) pausaGeral = cfg[0].getBool('pausa_geral')
    } catch (_) {}
    if (pausaGeral) {
      return responder(false, 'pausa_geral', 'Pausa geral ativa: nenhum toque é elegível.')
    }
    detalhes.push({ motivo_codigo: 'pausa_geral_off', motivo: 'Pausa geral desligada.' })

    // ---- 2. pausa por resposta (F2-T09) ----
    try {
      const pausas = $app.findRecordsByFilter(
        'pausas_resposta',
        "pessoa = {:p} && ambiente = {:a} && estado = 'ativa'",
        '',
        1,
        0,
        { p: pessoaId, a: ambiente },
      )
      if (pausas.length > 0) {
        return responder(
          false,
          'pausa_resposta',
          'Pessoa respondeu e a conversa é humana: cadência pausada.',
        )
      }
    } catch (_) {}
    detalhes.push({ motivo_codigo: 'sem_pausa_resposta', motivo: 'Sem pausa por resposta.' })

    // ---- 3. coorte da pessoa e política aprovada ----
    let coorte = ''
    try {
      const origens = $app.findRecordsByFilter(
        'pessoas_origens',
        'pessoa = {:p} && ambiente = {:a}',
        '-created',
        1,
        0,
        { p: pessoaId, a: ambiente },
      )
      if (origens.length > 0) coorte = origens[0].getString('coorte')
    } catch (_) {}

    if (!coorte) {
      return responder(
        false,
        'sem_coorte',
        'Pessoa sem origem registrada: coorte indeterminada mantém pendente.',
      )
    }
    detalhes.push({ motivo_codigo: 'coorte', motivo: 'Coorte da pessoa: ' + coorte + '.' })

    // pessoa conhecida NUNCA recebe fria (proteção por pessoa, não por empresa)
    const conhecida = pessoa.getBool('relacionamento_conhecido')
    if (conhecida && coorte === 'fria') {
      return responder(
        false,
        'conhecida_nao_recebe_fria',
        'Pessoa com relacionamento conhecido não entra em coorte fria.',
      )
    }

    let politica = null
    try {
      const ap = $app.findRecordsByFilter(
        'politicas_coorte',
        "coorte = {:c} && ambiente = {:a} && status = 'aprovada'",
        '-versao',
        1,
        0,
        { c: coorte, a: ambiente },
      )
      if (ap.length > 0) politica = ap[0]
    } catch (_) {}

    // ---- 4/5. ausência de política = PENDENTE (nunca "pode") ----
    if (!politica) {
      if (coorte === 'inbound') {
        return responder(
          false,
          'inbound_sem_politica',
          'Inbound promocional sem política aprovada: permanece pendente.',
        )
      }
      return responder(
        false,
        'sem_politica_aprovada',
        'Coorte "' + coorte + '" sem política aprovada: permanece pendente.',
      )
    }
    detalhes.push({
      motivo_codigo: 'politica_aprovada',
      motivo: 'Política v' + politica.getInt('versao') + ' aprovada para ' + coorte + '.',
    })

    // coorte de relacionamento exige aprovação individual da mensagem
    if (politica.getBool('exige_aprovacao_mensagem')) {
      return responder(
        false,
        'exige_aprovacao_mensagem',
        'Coorte de relacionamento: o toque exige aprovação individual da mensagem.',
      )
    }

    // ---- 6. janela de horário ----
    const HHMM = /^([01][0-9]|2[0-3]):[0-5][0-9]$/
    const inicio = politica.getString('janela_inicio')
    const fim = politica.getString('janela_fim')
    if (HHMM.test(inicio) && HHMM.test(fim)) {
      let agora = ''
      try {
        const fmt = new Intl.DateTimeFormat('pt-BR', {
          timeZone: 'America/Sao_Paulo',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        })
        agora = fmt.format(new Date())
      } catch (_) {
        const d = new Date()
        agora =
          String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
      }
      const horaAvaliada =
        body.horaTeste && HHMM.test(String(body.horaTeste)) ? String(body.horaTeste) : agora

      if (horaAvaliada < inicio || horaAvaliada >= fim) {
        detalhes.push({
          motivo_codigo: 'janela',
          motivo: 'Janela permitida ' + inicio + '–' + fim + '; agora ' + horaAvaliada + '.',
        })
        return responder(
          false,
          'fora_da_janela',
          'Fora da janela de horário permitida pela política.',
        )
      }
      detalhes.push({
        motivo_codigo: 'dentro_da_janela',
        motivo: 'Dentro da janela ' + inicio + '–' + fim + ' (' + horaAvaliada + ').',
      })
    }

    // ---- 7. nota mínima ----
    const notaMinima = politica.getInt('nota_minima')
    if (notaMinima > 0) {
      let nota = null
      try {
        const notas = $app.findRecordsByFilter(
          'pontuacoes',
          "lead.pessoa = {:p} && ambiente = {:a} && status = 'calculada'",
          '-created',
          1,
          0,
          { p: pessoaId, a: ambiente },
        )
        if (notas.length > 0) nota = notas[0].getInt('valor')
      } catch (_) {}
      if (nota === null) {
        return responder(
          false,
          'sem_nota',
          'Política exige nota mínima ' + notaMinima + ' e a pessoa não tem nota calculada.',
        )
      }
      if (nota < notaMinima) {
        return responder(
          false,
          'nota_abaixo_minimo',
          'Nota ' + nota + ' abaixo do mínimo ' + notaMinima + '.',
        )
      }
      detalhes.push({ motivo_codigo: 'nota_ok', motivo: 'Nota ' + nota + ' >= ' + notaMinima + '.' })
    }

    // ---- 8. elegível ----
    return responder(true, 'elegivel', 'Pessoa elegível para toque nesta coorte e janela.')
  },
  $apis.requireAuth(),
)
