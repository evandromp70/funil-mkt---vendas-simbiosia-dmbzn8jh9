// MCP & API Keys — gestão de chaves (20/10/2026).
//
// A chave completa (sk_live_<32 hex>) NUNCA é guardada: guardamos só o SHA-256 dela
// em key_hash (único) e um prefixo exibível (ex.: "sk_abc12...") para o usuário
// reconhecer a chave no painel. A chave volta EM CLARO uma única vez, na resposta
// do POST. O uso das chaves (JSON-RPC MCP) fica em pocketbase/hooks/mcp_servidor.js.
//
// Rotas (todas autenticadas por sessão de usuário, NÃO por API key):
//   POST   /backend/v1/keys        { nome, escopo }  → cria e devolve a chave 1x
//   GET    /backend/v1/keys        → lista (admin vê todas)
//   DELETE /backend/v1/keys/{id}   → revoga (ativa=false)
//
// Toda a lógica é INLINE no callback (VM própria do Skip: declarações de topo
// não são visíveis dentro dos callbacks).

routerAdd(
  'POST',
  '/backend/v1/keys',
  (e) => {
    if (!e.auth) return e.unauthorizedError('Autenticação obrigatória')

    const ESCOPOS = ['leitura', 'leitura_escrita', 'admin']
    const body = e.requestInfo().body || {}
    const nome = String(body.nome || '').trim()
    const escopo = String(body.escopo || '').trim()
    if (!nome) return e.badRequestError('nome é obrigatório')
    if (nome.length > 100) return e.badRequestError('nome deve ter até 100 caracteres')
    if (ESCOPOS.indexOf(escopo) === -1)
      return e.badRequestError("escopo inválido — use 'leitura', 'leitura_escrita' ou 'admin'")

    // gera sk_live_ + 32 hex aleatórios (16 bytes → 32 caracteres)
    const bytes = $security.randomString(64)
    let hex = ''
    const ALFABETO = '0123456789abcdef'
    for (let i = 0; i < 32; i++) {
      hex = hex + ALFABETO.charAt(bytes.charCodeAt(i % bytes.length) % 16)
    }
    const chave = 'sk_live_' + hex
    const prefixo = chave.substring(0, 12) + '...'
    const hash = $security.sha256(chave)

    const col = $app.findCollectionByNameOrId('api_keys')
    const rec = new Record(col)
    rec.set('owner', e.auth.id)
    rec.set('nome', nome)
    rec.set('prefixo', prefixo)
    rec.set('key_hash', hash)
    rec.set('escopo', escopo)
    rec.set('ativa', true)
    rec.set('criado_por', e.auth.id)
    try {
      $app.save(rec)
    } catch (err) {
      return e.internalServerError('Não foi possível criar a chave: ' + String(err))
    }

    $app.logger().info('mcp: chave criada', 'id', rec.id, 'owner', e.auth.id, 'escopo', escopo)
    // ÚNICA vez que a chave sai em claro
    return e.json(200, {
      id: rec.id,
      nome: nome,
      prefixo: prefixo,
      escopo: escopo,
      ativa: true,
      chave: chave,
      aviso: 'Guarde esta chave agora — ela não será exibida novamente.',
    })
  },
  $apis.requireAuth(),
)

routerAdd(
  'GET',
  '/backend/v1/keys',
  (e) => {
    if (!e.auth) return e.unauthorizedError('Autenticação obrigatória')
    const ehAdmin = e.auth.getString('role') === 'admin'

    let registros = []
    try {
      registros = ehAdmin
        ? $app.findRecordsByFilter('api_keys', '', '-created', 500, 0, {})
        : $app.findRecordsByFilter('api_keys', 'owner = {:o}', '-created', 500, 0, {
            o: e.auth.id,
          })
    } catch (_) {
      registros = []
    }

    const itens = []
    for (let i = 0; i < registros.length; i++) {
      const r = registros[i]
      itens.push({
        id: r.id,
        nome: r.getString('nome'),
        prefixo: r.getString('prefixo'),
        escopo: r.getString('escopo'),
        ativa: r.getBool('ativa'),
        ultimo_uso_em: String(r.getString('ultimo_uso_em') || ''),
        criada_em: String(r.getString('created') || ''),
        dono: r.getString('owner'),
      })
    }

    return e.json(200, { total: itens.length, itens: itens, admin: ehAdmin })
  },
  $apis.requireAuth(),
)

routerAdd(
  'DELETE',
  '/backend/v1/keys/{id}',
  (e) => {
    if (!e.auth) return e.unauthorizedError('Autenticação obrigatória')
    const ehAdmin = e.auth.getString('role') === 'admin'

    const id = e.request.pathValue('id')
    let rec
    try {
      rec = $app.findRecordById('api_keys', id)
    } catch (_) {
      return e.notFoundError('Chave não encontrada')
    }
    if (!ehAdmin && rec.getString('owner') !== e.auth.id)
      return e.forbiddenError('Você só pode revogar as suas próprias chaves')

    if (!rec.getBool('ativa')) {
      return e.json(200, { id: rec.id, ativa: false, detalhe: 'A chave já estava revogada.' })
    }
    rec.set('ativa', false)
    try {
      $app.save(rec)
    } catch (err) {
      return e.internalServerError('Não foi possível revogar a chave: ' + String(err))
    }

    $app.logger().info('mcp: chave revogada', 'id', rec.id, 'por', e.auth.id)
    return e.json(200, {
      id: rec.id,
      ativa: false,
      detalhe: 'Chave revogada — chamadas MCP com ela passam a devolver 401.',
    })
  },
  $apis.requireAuth(),
)
