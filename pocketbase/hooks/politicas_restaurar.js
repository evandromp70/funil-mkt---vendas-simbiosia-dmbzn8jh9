// Restauração da configuração canônica das políticas — POST /backend/v1/config/politicas-restaurar
//
// POR QUE ESTA ROTA EXISTE (28/10/2026):
// As suítes de teste precisam de uma política APROVADA para testar, e o índice único permite só
// uma por coorte. Então elas arquivam a política REAL e criam a sua — com janela 00:00-23:59,
// faixa mínima vazia e piso zero. Depois da bateria, as 3 políticas de produção ficavam assim:
// portão por letra inexistente, sem trava nenhuma, e SEM ERRO NENHUM avisando.
//
// Tentei consertar restaurando dentro do próprio teste, com uma lista em memória. NÃO FUNCIONA:
// node --test roda cada arquivo em processo separado, e a lista morre com o processo. Precisa
// viver no servidor.
//
// Esta rota reaplica os valores canônicos. É idempotente e só-admin:
//   1. apaga as políticas de teste (rótulo 'TESTE')
//   2. arquiva qualquer aprovada cujos valores divergem do canônico
//   3. garante UMA aprovada por coorte, com os valores canônicos
//
// Uso: POST /backend/v1/config/politicas-restaurar { modo?: 'relatorio' }

routerAdd(
  'POST',
  '/backend/v1/config/politicas-restaurar',
  (e) => {
    if (!e.auth) return e.unauthorizedError('Autenticação obrigatória')
    if (String(e.auth.getString('role')) !== 'admin') return e.forbiddenError('Somente admin')

    const body = e.requestInfo().body || {}
    const executar = String(body.modo || 'executar') === 'executar'

    // VALORES CANÔNICOS — decisão do José (28/10/2026)
    const CANONICO = {
      faixa_minima: 'C', // só D fica de fora: "na dúvida, fica a melhor faixa"
      nota_minima_piso: 15, // trava final contra régua generosa
      nota_minima: 0, // legado desligado: a letra manda
      janela_inicio: '08:00',
      janela_fim: '18:00',
      timezone: 'America/Sao_Paulo',
      intervalo_min_minutos: 1440,
      limite_dia_por_pessoa: 1,
      limite_dia_por_canal: 20,
      limite_dia_por_dono: 25,
      elegivel_sem_politica: false,
      exige_aprovacao_lote: false,
    }
    const COORTES = ['rede_jose', 'rede_evandro', 'clientes_atendidos', 'inbound', 'fria']

    const acoes = []

    // 1. apaga políticas de TESTE
    let testeApagadas = 0
    if (executar) {
      try {
        const deTeste = $app.findRecordsByFilter(
          'politicas_coorte',
          "ambiente = 'teste' && rotulo ~ 'TESTE'",
          '',
          500,
          0,
        )
        for (let i = 0; i < deTeste.length; i++) {
          try {
            $app.delete(deTeste[i])
            testeApagadas++
          } catch (_) {}
        }
      } catch (err) {
        acoes.push({ passo: 'apagar_teste', erro: String(err) })
      }
    }
    acoes.push({ passo: 'apagar_politicas_de_teste', apagadas: testeApagadas })

    // 2 e 3. por coorte: garante uma aprovada com os valores canônicos
    for (let c = 0; c < COORTES.length; c++) {
      const coorte = COORTES[c]
      let aprovadas = []
      try {
        aprovadas = $app.findRecordsByFilter(
          'politicas_coorte',
          "coorte = {:c} && ambiente = 'teste' && status = 'aprovada'",
          '-versao',
          20,
          0,
          { c: coorte },
        )
      } catch (_) {
        continue
      }
      if (aprovadas.length === 0) continue // coorte sem política: não inventa

      // a "boa" é a mais recente que já bate com o canônico
      let boa = null
      for (let i = 0; i < aprovadas.length; i++) {
        const p = aprovadas[i]
        const bate =
          String(p.getString('faixa_minima') || '') === CANONICO.faixa_minima &&
          Number(p.get('nota_minima_piso') || 0) === CANONICO.nota_minima_piso &&
          p.getString('janela_inicio') === CANONICO.janela_inicio &&
          p.getString('janela_fim') === CANONICO.janela_fim &&
          p.getInt('intervalo_min_minutos') === CANONICO.intervalo_min_minutos
        if (bate) {
          boa = p
          break
        }
      }

      if (boa) {
        if (executar) {
          for (let i = 0; i < aprovadas.length; i++) {
            if (aprovadas[i].id !== boa.id) {
              try {
                aprovadas[i].set('status', 'arquivada')
                $app.save(aprovadas[i])
              } catch (_) {}
            }
          }
        }
        acoes.push({ coorte: coorte, acao: 'ja_canonica', preservada: boa.getString('rotulo') })
      } else if (executar) {
        // arquiva todas e cria uma nova com o canônico
        for (let i = 0; i < aprovadas.length; i++) {
          try {
            aprovadas[i].set('status', 'arquivada')
            $app.save(aprovadas[i])
          } catch (_) {}
        }
        try {
          const col = $app.findCollectionByNameOrId('politicas_coorte')
          const nova = new Record(col)
          nova.set('coorte', coorte)
          nova.set('versao', Date.now())
          nova.set('status', 'aprovada')
          nova.set('rotulo', coorte + ' — números reais 28/10/2026')
          nova.set(
            'exige_aprovacao_mensagem',
            coorte === 'rede_jose' || coorte === 'rede_evandro' || coorte === 'clientes_atendidos',
          )
          nova.set('faixa_minima', CANONICO.faixa_minima)
          nova.set('nota_minima_piso', CANONICO.nota_minima_piso)
          nova.set('nota_minima', CANONICO.nota_minima)
          nova.set('janela_inicio', CANONICO.janela_inicio)
          nova.set('janela_fim', CANONICO.janela_fim)
          nova.set('timezone', CANONICO.timezone)
          nova.set('intervalo_min_minutos', CANONICO.intervalo_min_minutos)
          nova.set('limite_dia_por_pessoa', CANONICO.limite_dia_por_pessoa)
          nova.set('limite_dia_por_canal', CANONICO.limite_dia_por_canal)
          nova.set('limite_dia_por_dono', CANONICO.limite_dia_por_dono)
          nova.set('elegivel_sem_politica', CANONICO.elegivel_sem_politica)
          nova.set('exige_aprovacao_lote', CANONICO.exige_aprovacao_lote)
          nova.set('ambiente', 'teste')
          $app.save(nova)
          acoes.push({ coorte: coorte, acao: 'recriada_canonica' })
        } catch (err) {
          acoes.push({ coorte: coorte, acao: 'erro', erro: String(err) })
        }
      } else {
        acoes.push({ coorte: coorte, acao: 'precisa_corrigir', aprovadas: aprovadas.length })
      }
    }

    return e.json(200, {
      executado: executar,
      canonico: CANONICO,
      acoes: acoes,
    })
  },
  $apis.requireAuth(),
)
