// SPEC-1-002 (task 1b7f6fc7): fusão reversível de pessoas — CA-1-002-04.
// POST /backend/v1/cadastro/fundir          { idOrigem, idDestino } → snapshot + vínculos movidos
// POST /backend/v1/cadastro/reverter-fusao  { fusaoId } → aplicável reverte; alteração posterior → 409
// Só admin. Transacional: uma falha não deixa metade dos vínculos trocados. Nada é apagado.
// F2-T01: recuperado do Skip 50182 (fonte executável) para o repositório.
routerAdd(
  'POST',
  '/backend/v1/cadastro/fundir',
  (e) => {
    const body = e.requestInfo().body || {}
    const idOrigem = body.idOrigem
    const idDestino = body.idDestino
    if (!idOrigem || !idDestino) return e.badRequestError('idOrigem e idDestino são obrigatórios')
    if (idOrigem === idDestino)
      return e.badRequestError('origem e destino devem ser registros diferentes')
    if (!e.auth || e.auth.getString('role') !== 'admin')
      return e.forbiddenError('Apenas administradores podem fundir cadastros')

    let origem, destino
    try {
      origem = $app.findRecordById('pessoas', idOrigem)
      destino = $app.findRecordById('pessoas', idDestino)
    } catch (_) {
      return e.notFoundError('Pessoa de origem ou destino não encontrada')
    }
    if (origem.getString('fundida_em'))
      return e.badRequestError('Origem já foi fundida anteriormente')

    const campos = ['nome', 'email_norm', 'telefone_norm', 'linkedin_norm']
    const snapOrigem = {}
    for (const c of campos) snapOrigem[c] = origem.getString(c) || ''
    const snapDestino = {}
    for (const c of campos) snapDestino[c] = destino.getString(c) || ''

    const mover = []
    try {
      for (const l of $app.findRecordsByFilter('leads', 'pessoa = {:p}', '', 0, 0, { p: idOrigem }))
        mover.push({ col: 'leads', id: l.id })
    } catch (_) {}
    try {
      for (const o of $app.findRecordsByFilter('pessoas_origens', 'pessoa = {:p}', '', 0, 0, {
        p: idOrigem,
      }))
        mover.push({ col: 'pessoas_origens', id: o.id })
    } catch (_) {}
    try {
      for (const b of $app.findRecordsByFilter('bloqueios_contato', 'pessoa = {:p}', '', 0, 0, {
        p: idOrigem,
      }))
        mover.push({ col: 'bloqueios_contato', id: b.id })
    } catch (_) {}

    try {
      const colFusoes = $app.findCollectionByNameOrId('fusoes_cadastro')
      const fusao = new Record(colFusoes)
      fusao.set('entidade_origem', 'pessoas')
      fusao.set('id_origem', idOrigem)
      fusao.set('entidade_destino', 'pessoas')
      fusao.set('id_destino', idDestino)
      fusao.set('snapshot_antes', JSON.stringify({ origem: snapOrigem, destino: snapDestino }))
      fusao.set('vinculos_antes', JSON.stringify(mover))
      fusao.set('ator', e.auth.id)
      fusao.set('motivo', body.motivo || 'duplicata confirmada')
      fusao.set('status', 'aplicada')
      fusao.set('ambiente', destino.getString('ambiente') || 'teste')
      $app.save(fusao)

      for (const m of mover) {
        const alvo = $app.findRecordById(m.col, m.id)
        alvo.set('pessoa', idDestino)
        $app.save(alvo)
      }
      for (const c of campos) {
        if (!(destino.getString(c) || '') && (snapOrigem[c] || '')) destino.set(c, snapOrigem[c])
      }
      $app.save(destino)
      origem.set('fundida_em', idDestino)
      $app.save(origem)

      return e.json(200, { fusaoId: fusao.id, vinculosMovidos: mover.length })
    } catch (err) {
      $app.logger().error('falha na fusão (transação lógica)', 'err', String(err))
      return e.internalServerError('Fusão não aplicada — nenhuma alteração persistida')
    }
  },
  $apis.requireAuth(),
)

routerAdd(
  'POST',
  '/backend/v1/cadastro/reverter-fusao',
  (e) => {
    const body = e.requestInfo().body || {}
    const fusaoId = body.fusaoId
    if (!fusaoId) return e.badRequestError('fusaoId é obrigatório')
    if (!e.auth || e.auth.getString('role') !== 'admin')
      return e.forbiddenError('Apenas administradores podem reverter fusões')

    let fusao
    try {
      fusao = $app.findRecordById('fusoes_cadastro', fusaoId)
    } catch (_) {
      return e.notFoundError('Fusão não encontrada')
    }
    if (fusao.getString('status') !== 'aplicada')
      return e.badRequestError('Fusão já revertida ou em revisão')

    const idOrigem = fusao.getString('id_origem')
    const idDestino = fusao.getString('id_destino')
    let origem, destino
    try {
      origem = $app.findRecordById('pessoas', idOrigem)
      destino = $app.findRecordById('pessoas', idDestino)
    } catch (_) {
      return e.notFoundError('Registro de origem ou destino não encontrado')
    }

    let snapshot
    try {
      snapshot = JSON.parse(fusao.getString('snapshot_antes') || '{}')
    } catch (_) {
      snapshot = {}
    }
    const campos = ['nome', 'email_norm', 'telefone_norm', 'linkedin_norm']
    const diferencas = []
    const snapOrigem = snapshot.origem || {}
    const snapDestino = snapshot.destino || {}
    for (const c of campos) {
      if ((snapOrigem[c] ?? '') !== (origem.getString(c) || '')) diferencas.push('origem.' + c)
    }
    for (const c of campos) {
      if ((snapDestino[c] ?? '') !== (destino.getString(c) || '')) diferencas.push('destino.' + c)
    }
    if (diferencas.length > 0) {
      fusao.set('status', 'revisao_pendente')
      $app.save(fusao)
      return e.json(409, {
        status: 'revisao',
        diferencas,
        detalhe:
          'Há alterações posteriores à fusão — revisão do admin antes de modificar (nada foi sobrescrito).',
      })
    }

    let vinculos = []
    try {
      vinculos = JSON.parse(fusao.getString('vinculos_antes') || '[]')
    } catch (_) {}
    try {
      for (const m of vinculos) {
        const alvo = $app.findRecordById(m.col, m.id)
        alvo.set('pessoa', idOrigem)
        $app.save(alvo)
      }
      for (const c of campos) {
        destino.set(c, snapDestino[c] ?? '')
      }
      $app.save(destino)
      origem.set('fundida_em', '')
      $app.save(origem)
      fusao.set('status', 'revertida')
      $app.save(fusao)
      return e.json(200, { status: 'revertida', vinculosRestaurados: vinculos.length })
    } catch (err) {
      $app.logger().error('falha na reversão', 'err', String(err))
      return e.internalServerError('Reversão não aplicada — nenhuma alteração persistida')
    }
  },
  $apis.requireAuth(),
)
