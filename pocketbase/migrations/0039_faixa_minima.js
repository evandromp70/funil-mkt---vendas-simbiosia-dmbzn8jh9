// SPEC-2-002 (decisão do José, 28/10/2026): portão por LETRA com piso absoluto.
//
// POR QUÊ: a nota mínima é um número solto. Cada produto tem a sua régua, com pesos próprios —
// o mesmo 60 significa coisas diferentes em réguas diferentes. A LETRA carrega o julgamento da
// régua que a produziu, então é ela que deve portar a cadência.
//
// Campos:
//   faixa_minima      — menor faixa aceita para abordagem (A|B|C|D). Default C.
//   nota_minima_piso  — piso numérico absoluto, independente da régua. 0 = desligado.
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('politicas_coorte')

    if (!col.fields.some((f) => f.name === 'faixa_minima')) {
      col.fields.add(
        new SelectField({
          name: 'faixa_minima',
          required: false,
          maxSelect: 1,
          values: ['A', 'B', 'C', 'D'],
        }),
      )
    }
    if (!col.fields.some((f) => f.name === 'nota_minima_piso')) {
      col.fields.add(
        new NumberField({ name: 'nota_minima_piso', required: false, min: 0, max: 100 }),
      )
    }
    app.save(col)
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('politicas_coorte')
      for (const nome of ['nota_minima_piso', 'faixa_minima']) {
        const f = col.fields.find((x) => x.name === nome)
        if (f) col.fields.remove(f.id || f.name)
      }
      app.save(col)
    } catch (_) {}
  },
)
