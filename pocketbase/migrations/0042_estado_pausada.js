// CORREÇÃO da migração 0041 (28/10/2026): o valor 'pausada' NÃO entrou no select de
// `cadencias_ativas.estado`.
//
// SINTOMA QUE DENUNCIOU: `GoError: estado: Invalid value pausada.` — o save da cadência falhava,
// o catch engolia, e o efeito era "cadencias_pausadas: 0". A feature parecia pronta e não pausava
// NADA. Custou várias rodadas porque o erro era mascarado como sucesso.
//
// POR QUE A 0041 FALHOU: atribuir `campo.values = [...]` e salvar não persistiu a alteração do
// select. Aqui a abordagem é a canônica e explícita: remover o campo e recriá-lo com os cinco
// valores. Seguro AGORA porque `cadencias_ativas` está com zero registros (base limpa em 28/10);
// com dados, seria preciso migrar valores antes.
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('cadencias_ativas')
    const campo = col.fields.find((f) => f.name === 'estado')

    // se já aceita 'pausada', não faz nada (idempotente)
    if (campo && (campo.values || []).indexOf('pausada') !== -1) {
      console.log('0042: estado já aceita pausada — nada a fazer')
      return
    }

    if (campo) {
      col.fields.remove(campo.id || campo.name)
    }
    col.fields.add(
      new SelectField({
        name: 'estado',
        required: true,
        maxSelect: 1,
        values: ['ativa', 'concluida', 'cancelada', 'substituida', 'pausada'],
      }),
    )
    app.save(col)
    console.log('0042: cadencias_ativas.estado agora aceita pausada')
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('cadencias_ativas')
      const campo = col.fields.find((f) => f.name === 'estado')
      if (campo) col.fields.remove(campo.id || campo.name)
      col.fields.add(
        new SelectField({
          name: 'estado',
          required: true,
          maxSelect: 1,
          values: ['ativa', 'concluida', 'cancelada', 'substituida'],
        }),
      )
      app.save(col)
    } catch (_) {}
  },
)
