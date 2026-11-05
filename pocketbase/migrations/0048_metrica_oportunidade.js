// SPEC-2-006 (F2-T14): métrica de oportunidade e custos de teste — CA-2-006-01.
//
// PRINCÍPIO QUE MANDA NESTA MIGRAÇÃO: "valores de negócio não são inventados".
// A definição de OPORTUNIDADE QUALIFICADA é decisão do José, não do sistema. Aqui só existe a
// ESTRUTURA versionada para guardá-la. Enquanto não houver definição aprovada, a métrica responde
// "não configurada" — e nenhuma resposta/passagem vira oportunidade por suposição.
//
// Duas coleções:
//   definicoes_oportunidade — versão, critérios, status, quem aprovou. Imutável depois de aprovada
//                             (versão nova em vez de editar a antiga: histórico serve para auditar).
//   custos_teste            — fonte, período, moeda, unidade, canal e ambiente. Sem valor de
//                             fornecedor chutado; ausência vira "não disponível", nunca zero.
migrate(
  (app) => {
    const regraAdmin = "@request.auth.id != '' && @request.auth.role = 'admin'"
    const regraLeitura = "@request.auth.id != ''"
    const usersId = app.findCollectionByNameOrId('users').id

    if (!app.hasTable('definicoes_oportunidade')) {
      const c = new Collection({
        name: 'definicoes_oportunidade',
        type: 'base',
        listRule: regraLeitura,
        viewRule: regraLeitura,
        createRule: regraAdmin,
        updateRule: regraAdmin,
        deleteRule: null, // definição não se apaga: arquiva-se
        fields: [
          { name: 'versao', type: 'number', required: true, onlyInt: true, min: 1 },
          {
            name: 'status',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: ['rascunho', 'aprovada', 'arquivada'],
          },
          // critérios: quais fatos contam como oportunidade qualificada. Estrutura livre em JSON
          // porque o conteúdo é decisão de negócio, não do schema.
          { name: 'criterios', type: 'json' },
          { name: 'resumo', type: 'text' },
          {
            name: 'aprovado_por',
            type: 'relation',
            maxSelect: 1,
            collectionId: usersId,
          },
          { name: 'aprovado_em', type: 'date' },
          { name: 'observacao', type: 'text' },
          {
            name: 'ambiente',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: ['teste', 'real'],
          },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          // uma única definição APROVADA por ambiente — é a que vale para o indicador
          "CREATE UNIQUE INDEX idx_def_oportunidade_aprovada ON definicoes_oportunidade (ambiente) WHERE status = 'aprovada'",
          'CREATE UNIQUE INDEX idx_def_oportunidade_versao ON definicoes_oportunidade (versao, ambiente)',
        ],
      })
      app.save(c)
    }

    if (!app.hasTable('custos_teste')) {
      const c = new Collection({
        name: 'custos_teste',
        type: 'base',
        listRule: regraLeitura,
        viewRule: regraLeitura,
        createRule: regraAdmin,
        updateRule: regraAdmin,
        deleteRule: null,
        fields: [
          // fonte explícita: de onde veio o número (nota, contrato, planilha)
          { name: 'fonte', type: 'text', required: true },
          { name: 'periodo_inicio', type: 'date' },
          { name: 'periodo_fim', type: 'date' },
          { name: 'moeda', type: 'text', required: true },
          // unidade de cobrança: mensal, por_mensagem, por_credito, por_hora...
          { name: 'unidade', type: 'text', required: true },
          { name: 'canal_servico', type: 'text' },
          { name: 'valor', type: 'number', required: true, min: 0 },
          { name: 'observacao', type: 'text' },
          {
            name: 'ambiente',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: ['teste', 'real'],
          },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
      })
      app.save(c)
    }
  },
  (app) => {
    try {
      if (app.hasTable('custos_teste')) app.delete(app.findCollectionByNameOrId('custos_teste'))
    } catch (_) {}
    try {
      if (app.hasTable('definicoes_oportunidade'))
        app.delete(app.findCollectionByNameOrId('definicoes_oportunidade'))
    } catch (_) {}
  },
)
