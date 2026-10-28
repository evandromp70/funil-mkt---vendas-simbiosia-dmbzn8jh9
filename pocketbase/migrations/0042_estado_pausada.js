// NEUTRALIZADA (28/10/2026) — não altera schema. Existe só para desbloquear o batch de migrações.
//
// O que tentei e por que desisti:
//   0041 tentou adicionar 'pausada' ao select de `cadencias_ativas.estado` mutando `campo.values`
//   → NÃO persistiu ("Invalid value pausada" no save da cadência).
//   0042 tentou remover e recriar o campo → o runtime rejeitou (`Object has no member 'remove'`),
//   e uma migração falhando bloqueia TODAS as seguintes.
//
// DECISÃO DE DESENHO (sem tocar schema): a autoridade da pausa é a coleção `pausas_resposta`
// (estado 'ativa' por pessoa). A cadência passa a 'cancelada' com motivo_codigo
// 'resposta_recebida' — parar a cadência é efeito suficiente para CA-2-004-01, e retomar (F2-T11)
// cria cadência nova com validação, que é o comportamento correto de qualquer forma.
//
// Isso evita mexer no select de uma coleção que a Fase 2 inteira usa. Se um dia 'pausada' for
// necessária como estado próprio, a alteração precisa ser feita com a coleção vazia e testada
// isoladamente antes.
migrate(
  (app) => {
    console.log(
      '0042: neutralizada — a pausa vive em pausas_resposta, sem alterar cadencias_ativas',
    )
  },
  (app) => {
    // nada a reverter
  },
)
