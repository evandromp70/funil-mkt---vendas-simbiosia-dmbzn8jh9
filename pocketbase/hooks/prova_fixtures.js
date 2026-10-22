// HOOK TEMPORÁRIO de fixtures da prova cadastro→lead — remover após uso.
// POST /backend/v1/admin/prova-fixtures — só admin.
// acao 'criar': cria empresa/pessoas/bloqueio com marcador PROVA- e devolve IDs.
// acao 'limpar': apaga TODO registro com marcador de prova (empresas PROVA-*, pessoas/bloqueios/leads prova-*).
routerAdd(
  'POST',
  '/backend/v1/admin/prova-fixtures',
  (e) => {
    const auth = e.auth
    if (!auth) return e.unauthorizedError('Autenticação necessária')
    if (auth.getString('role') !== 'admin')
      return e.forbiddenError('Só admin manipula fixtures de prova')

    const body = e.requestInfo().body || {}
    const acao = String(body.acao || '')

    if (acao === 'criar') {
      const emp = new Record($app.findCollectionByNameOrId('empresas'))
      emp.set('razao_social', 'PROVA-CL Indústria Ltda')
      emp.set('cnpj_norm', '99988877766655')
      emp.set('ambiente', 'teste')
      $app.save(emp)

      const pes = new Record($app.findCollectionByNameOrId('pessoas'))
      pes.set('nome', 'Prova Cadastro Lead')
      pes.set('email_norm', 'prova-cadastro-lead@exemplo.com')
      pes.set('ambiente', 'teste')
      $app.save(pes)

      const pesSaida = new Record($app.findCollectionByNameOrId('pessoas'))
      pesSaida.set('nome', 'Prova Pedido Saida')
      pesSaida.set('email_norm', 'prova-saida@exemplo.com')
      pesSaida.set('ambiente', 'teste')
      $app.save(pesSaida)

      const pes2 = new Record($app.findCollectionByNameOrId('pessoas'))
      pes2.set('nome', 'Prova Empresa Invalida')
      pes2.set('email_norm', 'prova-emp-invalida@exemplo.com')
      pes2.set('ambiente', 'teste')
      $app.save(pes2)

      const bl = new Record($app.findCollectionByNameOrId('bloqueios_contato'))
      bl.set('pessoa', pesSaida.id)
      bl.set('motivo', 'pedido_saida')
      bl.set('alcance', 'global')
      bl.set('origem', 'prova')
      bl.set('ambiente', 'teste')
      $app.save(bl)

      return e.json(200, {
        empresaId: emp.id,
        pessoaId: pes.id,
        pessoaSaidaId: pesSaida.id,
        pessoa2Id: pes2.id,
      })
    }

    if (acao === 'limpar') {
      const relatorio = {}
      // leads com rastro de prova
      for (const l of $app.findRecordsByFilter(
        'leads',
        "migracao_origem_id ~ 'cadastro:' && contato_email ~ 'prova-'",
        '',
        1000,
        0,
      )) {
        $app.delete(l)
        relatorio[l.id] = 'lead'
      }
      for (const b of $app.findRecordsByFilter(
        'bloqueios_contato',
        "origem = 'prova'",
        '',
        1000,
        0,
      )) {
        $app.delete(b)
        relatorio[b.id] = 'bloqueio'
      }
      for (const p of $app.findRecordsByFilter(
        'pessoas',
        "nome ~ 'Prova ' || email_norm ~ 'prova-'",
        '',
        1000,
        0,
      )) {
        $app.delete(p)
        relatorio[p.id] = 'pessoa'
      }
      for (const em of $app.findRecordsByFilter(
        'empresas',
        "razao_social ~ 'PROVA-'",
        '',
        1000,
        0,
      )) {
        $app.delete(em)
        relatorio[em.id] = 'empresa'
      }
      return e.json(200, {
        acao: 'limpar',
        apagados: Object.keys(relatorio).length,
        relatorio: relatorio,
      })
    }

    return e.badRequestError('acao deve ser criar ou limpar')
  },
  $apis.requireAuth(),
)
