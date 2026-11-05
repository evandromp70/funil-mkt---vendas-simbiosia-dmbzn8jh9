// SPEC-2-003 (F2-T07): adaptadores locais de teste — CA-2-003-04.
// POST /backend/v1/adaptadores/teste { tipo, entrada }
//   tipo: 'captacao' | 'enriquecimento' | 'canal'
//
// NENHUM fornecedor, chave, LLM, webhook ou HTTP. Resposta é LITERAL no código (determinística).
// Recusa modo real explicitamente. Cada execução é registrada em adaptadores_teste.
routerAdd(
  'POST',
  '/backend/v1/adaptadores/teste',
  (e) => {
    if (!e.auth) return e.unauthorizedError('Autenticação obrigatória')
    const papel = e.auth.getString('role')
    if (papel !== 'admin' && papel !== 'operador' && papel !== 'vendedor')
      return e.forbiddenError('Papel não autorizado')

    const body = e.requestInfo().body || {}

    // recusa modo real em qualquer forma — o adaptador NUNCA fala com o mundo
    if (body.modo === 'real' || body.modo === 'producao')
      return e.badRequestError('Adaptadores são apenas simulados nesta fase; modo real é recusado.')
    if (body.ambiente && String(body.ambiente) !== 'teste')
      return e.badRequestError('Ambiente deve ser "teste".')

    const TIPOS = ['captacao', 'enriquecimento', 'canal']
    const tipo = String(body.tipo || '')
    if (TIPOS.indexOf(tipo) === -1)
      return e.badRequestError('tipo deve ser captacao, enriquecimento ou canal')

    const entrada = body.entrada && typeof body.entrada === 'object' ? body.entrada : {}
    let resposta = null

    if (tipo === 'captacao') {
      // 3 contatos FICTÍCIOS e determinísticos, derivados do termo buscado
      const termo = String(entrada.termo || 'fixture')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .substring(0, 24)
      resposta = {
        fonte: 'adaptador-sintetico',
        termo: termo,
        contatos: [
          {
            nome: 'Contato Sintético A ' + termo,
            email: 'a.' + termo + '@exemplo-teste.local',
            cargo: 'Diretor de Operações',
            empresa: 'Empresa Fictícia A',
          },
          {
            nome: 'Contato Sintético B ' + termo,
            email: 'b.' + termo + '@exemplo-teste.local',
            cargo: 'Gerente de TI',
            empresa: 'Empresa Fictícia B',
          },
          {
            nome: 'Contato Sintético C ' + termo,
            email: 'c.' + termo + '@exemplo-teste.local',
            cargo: 'CEO',
            empresa: 'Empresa Fictícia C',
          },
        ],
        total: 3,
        modo: 'simulado',
      }
    } else if (tipo === 'enriquecimento') {
      // resposta determinística por CNPJ de fixture (sem consulta externa)
      const cnpj = String(entrada.cnpj || '').replace(/\D/g, '')
      const setores = ['Indústria', 'Serviços', 'Comércio', 'Tecnologia', 'Saúde']
      const portes = ['Médio', 'Médio-Grande', 'Grande']
      const idx = cnpj ? cnpj.charCodeAt(cnpj.length - 1) % setores.length : 0
      resposta = {
        fonte: 'adaptador-sintetico',
        cnpj: cnpj,
        setor: setores[idx],
        porte: portes[cnpj ? cnpj.length % portes.length : 0],
        funcionarios_faixa: '101 a 300',
        uf: 'SP',
        modo: 'simulado',
        confianca: 'fixture',
      }
    } else {
      // canal: SEMPRE simulado, nunca "enviado de verdade"
      const destino = String(entrada.destino || 'destino@exemplo-teste.local')
      resposta = {
        fonte: 'adaptador-sintetico',
        canal: String(entrada.canal || 'email'),
        destino: destino,
        status: 'simulado',
        entregue: false,
        motivo: 'Adaptador de teste: nenhum despacho real é executado.',
        correlation_id: 'sim-' + Date.now() + '-' + Math.floor(Math.random() * 100000),
        modo: 'simulado',
      }
    }

    // auditoria da resposta sintética
    try {
      const col = $app.findCollectionByNameOrId('adaptadores_teste')
      const reg = new Record(col)
      reg.set('tipo', tipo)
      reg.set('entrada', JSON.stringify(entrada))
      reg.set('resposta', JSON.stringify(resposta))
      reg.set('modo', 'simulado')
      reg.set('ambiente', 'teste')
      reg.set('ator', e.auth.id)
      $app.save(reg)
    } catch (err) {
      $app.logger().warn('falha ao auditar adaptador', 'err', String(err))
    }

    return e.json(200, { ok: true, tipo: tipo, resposta: resposta, modo: 'simulado' })
  },
  $apis.requireAuth(),
)
