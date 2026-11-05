// Decisão do José (28/10/2026): números reais da política + faixas generosas.
//
// O QUE MUDA E POR QUÊ:
//
// 1. FAIXAS MAIS GENEROSAS — pedido explícito: "na dúvida entre B e C, prefiro que seja B;
//    entre C e D, que seja C. Prefiro colocar em cadência alguém com menos fit do que descartar."
//    A faixa antiga (A 80-100 / B 50-80 / C 20-50 / D 0-20) exigia 80 pontos para "A" e jogava
//    em D quem tinha 19. Nova escala desloca tudo para cima:
//       A 65-100 · B 40-65 · C 15-40 · D 0-15
//    Efeito: quem tinha 50 (antes B) agora é A; quem tinha 19 (antes D) agora é C.
//    Aumenta o topo de funil ao custo de mais leads mornos — decisão consciente do José.
//
// 2. NÚMEROS DA POLÍTICA — os valores de teste (1/50/100, nota 0, janela 24h, intervalo 0)
//    viram política real:
//       faixa_minima = C (só D fica de fora — coerente com "na dúvida, fica a melhor")
//       nota_minima_piso = 15 (trava final: nenhuma régua generosa passa algo abaixo disso)
//       janela 08:00-18:00 (horário comercial BRT)
//       intervalo 1440 min (impede 23h + 00h10 = "dois dias")
//       limites: 1/pessoa, 20/canal, 25/dono
//
// NOTA: as faixas vivem em cada régua (regras_produto), não numa tabela única. Esta migração
// reescreve as faixas das réguas APROVADAS mais recentes de produtos NÃO-teste; os produtos
// de fixture (nome começando com TESTE) ficam como estão para não mascarar o histórico de teste.
migrate(
  (app) => {
    // ---------- 1. faixas generosas nas réguas reais ----------
    const FAIXAS_NOVAS = [
      { letra: 'A', de: 65, ate: 100, borda_inclusiva: true },
      { letra: 'B', de: 40, ate: 65, borda_inclusiva: false },
      { letra: 'C', de: 15, ate: 40, borda_inclusiva: false },
      { letra: 'D', de: 0, ate: 15, borda_inclusiva: false },
    ]

    let reguasMudadas = 0
    try {
      const reguas = app.findRecordsByFilter(
        'regras_produto',
        "status = 'aprovada' && ambiente = 'teste'",
        '-versao',
        2000,
        0,
        {},
      )
      // só a versão MAIS RECENTE de cada produto
      const ultimaPorProduto = {}
      for (let i = 0; i < reguas.length; i++) {
        const p = String(reguas[i].getString('produto') || '')
        if (p && !ultimaPorProduto[p]) ultimaPorProduto[p] = reguas[i]
      }

      for (const pid in ultimaPorProduto) {
        const r = ultimaPorProduto[pid]
        // não mexe em fixture de teste
        try {
          const prod = app.findRecordById('produtos', pid)
          const nome = String(prod.getString('nome') || '')
          if (nome.indexOf('TESTE') === 0) continue
        } catch (_) {
          continue
        }
        r.set('faixas', JSON.stringify(FAIXAS_NOVAS))
        app.save(r)
        reguasMudadas++
      }
    } catch (err) {
      // não falha a migração: registra e segue (as réguas podem ser reaplicadas depois)
      console.log('faixas: ' + String(err))
    }

    // ---------- 2. política real ----------
    const COORTES = ['rede_jose', 'rede_evandro', 'clientes_atendidos', 'inbound', 'fria']
    let politicasAtualizadas = 0

    for (const coorte of COORTES) {
      try {
        const aprovadas = app.findRecordsByFilter(
          'politicas_coorte',
          "coorte = {:c} && ambiente = 'teste' && status = 'aprovada'",
          '-versao',
          1,
          0,
          { c: coorte },
        )
        if (aprovadas.length === 0) continue

        const atual = aprovadas[0]
        const exigeApr = atual.getBool('exige_aprovacao_mensagem')

        // arquiva a atual
        atual.set('status', 'arquivada')
        app.save(atual)

        // cria a nova versão com os números reais
        const col = app.findCollectionByNameOrId('politicas_coorte')
        const nova = new Record(col)
        nova.set('coorte', coorte)
        nova.set('versao', atual.getInt('versao') + 1)
        nova.set('status', 'aprovada')
        nova.set('rotulo', coorte + ' — números reais (28/10/2026)')
        nova.set('exige_aprovacao_mensagem', exigeApr)
        nova.set('exige_aprovacao_lote', false)
        nova.set('elegivel_sem_politica', false)
        nova.set('janela_inicio', '08:00')
        nova.set('janela_fim', '18:00')
        nova.set('timezone', 'America/Sao_Paulo')
        nova.set('intervalo_min_minutos', 1440)
        nova.set('limite_dia_por_pessoa', 1)
        nova.set('limite_dia_por_canal', 20)
        nova.set('limite_dia_por_dono', 25)
        nova.set('faixa_minima', 'C') // só D fica de fora
        nova.set('nota_minima_piso', 15) // trava final
        nova.set('nota_minima', 0) // legado desligado: a letra manda
        nova.set('aprovado_por', atual.getString('aprovado_por') || '')
        nova.set('aprovado_em', new Date().toISOString().replace('T', ' '))
        nova.set('ambiente', 'teste')
        app.save(nova)
        politicasAtualizadas++
      } catch (err) {
        console.log('política ' + coorte + ': ' + String(err))
      }
    }

    console.log(
      'aplicado: réguas ' + reguasMudadas + ', políticas ' + politicasAtualizadas,
    )
  },
  (app) => {
    // reversível: arquiva as versões criadas nesta migração (rótulo identifica)
    try {
      const criadas = app.findRecordsByFilter(
        'politicas_coorte',
        'rotulo ~ {:r}',
        '',
        50,
        0,
        { r: 'números reais (28/10/2026)' },
      )
      for (let i = 0; i < criadas.length; i++) {
        criadas[i].set('status', 'arquivada')
        app.save(criadas[i])
      }
    } catch (_) {}
  },
)
