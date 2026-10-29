// SPEC-2-005 (F2-T13): revisões por DOMÍNIO — base de CA-2-005-02/03.
//
// POR QUE: até aqui a exportação mandava `revisao: 1` fixo. Sem revisão real não existe
// "revisão velha", e a regra que impede uma revisão antiga de liberar alguém não pode ser
// provada — ela só existiria no papel.
//
// MODELO: cada domínio tem a SUA revisão, monotônica por pessoa:
//   - comercial  → já existe em `contextos_comerciais.revisao` (migração 0032). Nada a criar.
//   - proteção   → passa a viver em `bloqueios_contato.revisao` (aqui).
//
// DOMÍNIOS INDEPENDENTES: cadastro revisão 10 e comercial revisão 2 não interferem um no outro.
// É isso que permite comparar revisão dentro do domínio certo e nunca entre domínios.
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('bloqueios_contato')
    if (!col.fields.some((f) => f.name === 'revisao')) {
      col.fields.add(new NumberField({ name: 'revisao', required: false, min: 0 }))
      app.save(col)
    }

    // Bloqueios que já existem ganham revisão 1 (o menor valor válido). Não invento revisão
    // alta para bloqueio antigo: revisão alta é sinal de decisão recente.
    try {
      const existentes = app.findRecordsByFilter('bloqueios_contato', '', '', 2000, 0, {})
      for (let i = 0; i < existentes.length; i++) {
        const b = existentes[i]
        const atual = Number(b.get('revisao') || 0)
        if (atual > 0) continue
        b.set('revisao', 1)
        app.save(b)
      }
    } catch (err) {
      console.log('0047: falha ao semear revisao: ' + String(err))
    }
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('bloqueios_contato')
      const f = col.fields.find((x) => x.name === 'revisao')
      if (f) col.fields.remove(f.id)
      app.save(col)
    } catch (_) {}
  },
)
