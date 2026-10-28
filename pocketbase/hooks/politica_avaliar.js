// SPEC-2-002 (F2-T03 + decisão do José 28/10): avaliador de elegibilidade por coorte.
// POST /backend/v1/politica/avaliar { pessoaId, canal?, horaTeste? }
//
// Ordem: pausa → bloqueio → coorte → conhecida/fria → política aprovada →
//        aprovação por mensagem → janela → FAIXA MÍNIMA + PISO → elegível
//
// PORTÃO POR LETRA (28/10): a LETRA carrega o julgamento da régua; o número solto não,
// porque cada produto tem pesos próprios. Piso absoluto é a trava final.
// Ausência de política aprovada = PENDENTE, nunca "sim".
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

    // ---- 1. pausa geral ----
    let pausaGeral = true
    try {
      const cfg = $app.findRecordsByFilter('sistema_config', 'ambiente = {:a}', '-created', 1, 0, {
        a: ambiente,
      })
      if (cfg.length > 0) pausaGeral = cfg[0].getBool('pausa_geral')
    } catch (_) {}
    if (pausaGeral) {
      return responder(false, 'pausa_geral', 'Pausa geral ativa: nenhum toque é elegível.')
    }
    detalhes.push({ motivo_codigo: 'pausa_geral_off', motivo: 'Pausa geral desligada.' })

    // ---- 2. bloqueios ----
    let temBloqueio = false
    try {
      const bloqueios = $app.findRecordsByFilter(
        'bloqueios_contato',
        'pessoa = {:p} && ambiente = {:a}',
        '',
        1,
        0,
        { p: pessoaId, a: ambiente },
      )
      temBloqueio = bloqueios.length > 0
    } catch (_) {
      temBloqueio = true
    }
    if (temBloqueio) {
      return responder(false, 'bloqueio', 'Pessoa com bloqueio ativo: não recebe toque.')
    }
    detalhes.push({ motivo_codigo: 'sem_bloqueio', motivo: 'Sem bloqueio ativo.' })

    // ---- 2.5 PAUSA POR RESPOSTA (SPEC-2-004 / F2-T09) ----
    // Quem respondeu está com um humano, não com o agente. Sem esta checagem a política
    // diria "elegível" e o agente proporia toque para uma pessoa que acabou de responder —
    // exatamente o oposto do que a resposta significa.
    try {
      const pausas = $app.findRecordsByFilter(
        'pausas_resposta',
        "pessoa = {:p} && ambiente = 'teste' && estado = 'ativa'",
        '',
        1,
        0,
        { p: pessoaId },
      )
      if (pausas.length > 0) {
        return responder(
          false,
          'pausa_resposta',
          'Pessoa respondeu (' +
            pausas[0].getString('classificacao') +
            '): a conversa está com um humano e nenhum toque é elegível.',
        )
      }
    } catch (_) {}

    // ---- 3. coorte ----
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

    // ---- 7. FAIXA MÍNIMA + PISO ABSOLUTO (decisão do José, 28/10) ----
    const faixaMinima = String(politica.getString('faixa_minima') || '').trim()
    const notaPiso = Number(politica.get('nota_minima_piso') || 0)
    const ORDEM_FAIXA = { A: 4, B: 3, C: 2, D: 1 }
    const notaAntiga = Number(politica.get('nota_minima') || 0)

    let nota = null
    let letra = ''
    try {
      const notas = $app.findRecordsByFilter(
        'pontuacoes',
        "lead.pessoa = {:p} && ambiente = {:a} && status = 'calculada'",
        '-created',
        1,
        0,
        { p: pessoaId, a: ambiente },
      )
      if (notas.length > 0) {
        nota = Number(notas[0].get('valor') || 0)
        // `faixa` é campo TEXTO com a letra ("A"), não objeto. Ler só objeto fazia o
        // portão cair sempre em sem_nota — bug corrigido em 28/10.
        const fa = notas[0].get('faixa')
        if (typeof fa === 'string') {
          const t = fa.trim()
          if (t === 'A' || t === 'B' || t === 'C' || t === 'D') letra = t
          else {
            try {
              const p = JSON.parse(t)
              if (p && p.letra) letra = String(p.letra)
            } catch (_) {}
          }
        } else if (fa && typeof fa === 'object' && fa.letra) {
          letra = String(fa.letra)
        }
      }
    } catch (_) {}

    if (faixaMinima) {
      if (nota === null || !letra) {
        return responder(
          false,
          'sem_nota',
          'Política exige faixa mínima ' + faixaMinima + ' e a pessoa não tem faixa calculada.',
        )
      }
      if ((ORDEM_FAIXA[letra] || 0) < (ORDEM_FAIXA[faixaMinima] || 0)) {
        return responder(
          false,
          'faixa_abaixo_minimo',
          'Faixa ' + letra + ' abaixo da mínima ' + faixaMinima + '.',
        )
      }
      if (notaPiso > 0 && nota < notaPiso) {
        return responder(
          false,
          'nota_abaixo_piso',
          'Faixa ' + letra + ' mas nota ' + nota + ' abaixo do piso absoluto ' + notaPiso + '.',
        )
      }
      detalhes.push({
        motivo_codigo: 'faixa_ok',
        motivo: 'Faixa ' + letra + ' >= ' + faixaMinima + ' (nota ' + nota + ')',
      })
    } else if (notaAntiga > 0) {
      if (nota === null) {
        return responder(
          false,
          'sem_nota',
          'Política exige nota mínima ' + notaAntiga + ' e a pessoa não tem nota calculada.',
        )
      }
      if (nota < notaAntiga) {
        return responder(
          false,
          'nota_abaixo_minimo',
          'Nota ' + nota + ' abaixo do mínimo ' + notaAntiga + '.',
        )
      }
      detalhes.push({
        motivo_codigo: 'nota_ok',
        motivo: 'Nota ' + nota + ' >= ' + notaAntiga + '.',
      })
    }

    // ---- 8. elegível ----
    return responder(true, 'elegivel', 'Pessoa elegível para toque nesta coorte e janela.')
  },
  $apis.requireAuth(),
)
