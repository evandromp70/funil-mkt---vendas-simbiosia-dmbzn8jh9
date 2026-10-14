// SPEC-1-002 (task f5668cd8): proteção de coorte na entrada fria — CA-1-002-03.
// Ao registrar uma origem FRIA para uma pessoa conhecida (relacionamento_conhecido=true),
// a entrada é registrada mas o relacionamento NÃO é apagado (regra 4 da SPEC: entrada fria
// não apaga relacionamento anterior). Toda via termina em e.next() ou throw (guia 3.3).
onRecordCreate((e) => {
  const reg = e.record
  if (reg.getString('coorte') !== 'fria') return e.next()

  try {
    const pessoa = $app.findRecordById('pessoas', reg.getString('pessoa'))
    // conhecida continua conhecida: nada a fazer — o relacionamento prevalece sobre a fria
    if (pessoa.getBool('relacionamento_conhecido')) {
      $app
        .logger()
        .info(
          'origem fria registrada para pessoa conhecida — relacionamento preservado',
          'pessoa',
          pessoa.id,
        )
    }
  } catch (_) {}

  return e.next()
}, 'pessoas_origens')
