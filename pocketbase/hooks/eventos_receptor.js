// SPEC-2-003 (F2-T07): receptor de evento de canal de teste — CA-2-003-01/02.
// POST /backend/v1/eventos/teste
// { evento_id, correlation_id?, tipo, ocorrido_em?, canal?, pessoaId?, identidade_ref?,
//   payload }  — payload é objeto FECHADO (campo extra é rejeitado)
//
// Regras (cada uma provada em tests/eventos.test.mjs):
//   1. exige sessão E papel autorizado — NUNCA confia em role/owner do payload
//   2. recusa modo/ambiente real: só `teste` existe
//   3. recusa campo extra (payload fechado)
//   4. mesmo evento_id + mesmo payload_hash → recibo DUPLICADO, sem repetir efeito
//   5. mesmo evento_id + hash diferente → CONFLITO, sem sobrescrever
//   6. efeito + recibo gravados juntos
//
// Lógica INLINE no callback (VM própria do Skip).
routerAdd(
  'POST',
  '/backend/v1/eventos/teste',
  (e) => {
    if (!e.auth) return e.unauthorizedError('Autenticação obrigatória')
    // papel autorizado: admin ou operador; nunca o que vem do payload
    const papel = e.auth.getString('role')
    if (papel !== 'admin' && papel !== 'operador' && papel !== 'vendedor')
      return e.forbiddenError('Papel não autorizado a injetar evento de teste')

    const body = e.requestInfo().body || {}

    // ---- 2. recusa modo/ambiente real, em qualquer forma ----
    if (body.modo === 'real' || body.modo === 'producao')
      return e.badRequestError('Modo real é recusado nesta fase: apenas teste.')
    if (body.ambiente && String(body.ambiente) !== 'teste')
      return e.badRequestError('Ambiente deve ser "teste".')

    // ---- 1. campos proibidos: o payload nunca define autoridade ----
    const PROIBIDOS = ['owner', 'role', 'ambiente_final', 'aprovado_por', 'permissao', 'superuser']
    for (const p of PROIBIDOS) {
      if (Object.prototype.hasOwnProperty.call(body, p))
        return e.badRequestError('Campo não permitido no evento: ' + p)
    }

    // ---- 3. payload FECHADO ----
    const CAMPOS = [
      'evento_id',
      'correlation_id',
      'tipo',
      'ocorrido_em',
      'canal',
      'pessoaId',
      'identidade_ref',
      'payload',
      'ambiente',
      'modo',
    ]
    for (const k of Object.keys(body)) {
      if (CAMPOS.indexOf(k) === -1) return e.badRequestError('Campo não previsto no evento: ' + k)
    }

    const eventoId = String(body.evento_id || '').trim()
    const tipo = String(body.tipo || '').trim()
    if (!eventoId) return e.badRequestError('evento_id é obrigatório')
    if (eventoId.length > 200) return e.badRequestError('evento_id excede 200 caracteres')
    if (!tipo) return e.badRequestError('tipo é obrigatório')

    const CANAIS = ['email', 'whatsapp', 'linkedin', 'telefone', 'interno']
    const canal = body.canal ? String(body.canal) : ''
    if (canal && CANAIS.indexOf(canal) === -1) return e.badRequestError('canal inválido')

    // hash canônico do payload (mesma ideia do contrato v1: chaves ordenadas)
    const jsonCanonico = (v) => {
      if (v === null || typeof v !== 'object') return JSON.stringify(v)
      if (Array.isArray(v)) return '[' + v.map(jsonCanonico).join(',') + ']'
      const chaves = Object.keys(v).sort()
      return '{' + chaves.map((k) => JSON.stringify(k) + ':' + jsonCanonico(v[k])).join(',') + '}'
    }
    const payloadTexto = jsonCanonico(body.payload === undefined ? {} : body.payload)
    let hash = ''
    {
      // djb2 estável — não precisa ser criptográfico, precisa ser determinístico
      let h = 5381
      for (let i = 0; i < payloadTexto.length; i++) h = ((h << 5) + h + payloadTexto.charCodeAt(i)) | 0
      hash = 'h' + (h >>> 0).toString(16) + '-' + payloadTexto.length
    }

    // pessoa opcional: precisa existir (referência não resolvida fica pendente)
    let pessoaId = ''
    if (body.pessoaId) {
      try {
        $app.findRecordById('pessoas', String(body.pessoaId))
        pessoaId = String(body.pessoaId)
      } catch (_) {
        return e.json(200, {
          estado: 'pendente',
          motivo: 'referencia_nao_resolvida',
          detalhe: 'Pessoa informada não existe: evento registrado como pendente, sem efeito.',
        })
      }
    }

    const col = $app.findCollectionByNameOrId('eventos_teste')

    // ---- 4/5. idempotência e conflito ----
    let existente = null
    try {
      const achados = $app.findRecordsByFilter(
        'eventos_teste',
        'evento_id = {:id} && ambiente = {:a}',
        '',
        1,
        0,
        { id: eventoId, a: 'teste' },
      )
      if (achados.length > 0) existente = achados[0]
    } catch (_) {}

    if (existente) {
      const hashAnterior = existente.getString('payload_hash')
      if (hashAnterior === hash) {
        // mesmo ID e mesmo conteúdo: recibo duplicado, SEM repetir efeito
        $app.save(existente) // não altera nada; mantém o registro vivo
        return e.json(200, {
          estado: 'duplicado',
          eventoId: eventoId,
          reciboId: existente.id,
          payloadHash: hash,
          detalhe: 'Evento já aplicado com o mesmo conteúdo — nenhum efeito repetido.',
        })
      }
      // mesmo ID com conteúdo diferente: conflito, NÃO sobrescreve
      if (existente.getString('estado') !== 'conflito') {
        existente.set('estado', 'conflito')
        existente.set('resultado', JSON.stringify({ motivo: 'mesmo evento_id com payload diferente' }))
        $app.save(existente)
      }
      return e.json(409, {
        estado: 'conflito',
        eventoId: eventoId,
        reciboId: existente.id,
        hashAnterior: hashAnterior,
        hashNovo: hash,
        detalhe: 'Mesmo evento_id com conteúdo diferente — nada foi sobrescrito.',
      })
    }

    // ---- 6. grava efeito + recibo juntos ----
    try {
      const reg = new Record(col)
      reg.set('evento_id', eventoId)
      if (body.correlation_id) reg.set('correlation_id', String(body.correlation_id))
      reg.set('ambiente', 'teste')
      reg.set('fonte', 'fixture')
      reg.set('tipo', tipo)
      if (body.ocorrido_em) reg.set('ocorrido_em', String(body.ocorrido_em))
      if (canal) reg.set('canal', canal)
      if (pessoaId) reg.set('pessoa', pessoaId)
      if (body.identidade_ref) reg.set('identidade_ref', String(body.identidade_ref))
      reg.set('payload_hash', hash)
      reg.set('estado', 'aplicado')
      reg.set('owner', e.auth.id)
      reg.set('resultado', JSON.stringify({ tipo: tipo, canal: canal, efeito: 'registrado' }))
      $app.save(reg)

      return e.json(200, {
        estado: 'aplicado',
        eventoId: eventoId,
        reciboId: reg.id,
        payloadHash: hash,
        detalhe: 'Evento de teste registrado (nenhum despacho externo).',
      })
    } catch (err) {
      $app.logger().error('falha ao gravar evento de teste', 'err', String(err))
      return e.internalServerError('Evento não aplicado')
    }
  },
  $apis.requireAuth(),
)
