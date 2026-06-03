/**
 * Form Skip Logic Validator and Engine.
 * Ensures forms don't contain faulty skip routing (e.g. self-loops, back-jumps, or invalid questions).
 */

/**
 * Validates the skip logic rules of a form.
 * @param {Array} questions List of questions in order.
 * @returns {Array} List of validation feedback objects { type: 'ERROR'|'WARNING', message, questionId }
 */
function validateSkipLogic(questions) {
  const feedback = [];
  const questionMap = new Map();
  const idToIndex = new Map();

  questions.forEach((q, idx) => {
    questionMap.set(q.id, q);
    idToIndex.set(q.id, idx);
  });

  questions.forEach((q, idx) => {
    if (!q.skipRules || !Array.isArray(q.skipRules)) return;

    q.skipRules.forEach(rule => {
      const { conditionValue, targetQuestionId } = rule;

      // Rule 1: Missing target question
      if (!targetQuestionId) {
        feedback.push({
          type: 'ERROR',
          questionId: q.id,
          message: `Questão "${q.id}" possui regra de pulo sem questão de destino especificada.`
        });
        return;
      }

      // Rule 2: Target does not exist in form
      if (!questionMap.has(targetQuestionId)) {
        feedback.push({
          type: 'ERROR',
          questionId: q.id,
          message: `Questão "${q.id}" pula para "${targetQuestionId}", que não existe no formulário.`
        });
        return;
      }

      const targetIdx = idToIndex.get(targetQuestionId);

      // Rule 3: Self-loop
      if (targetQuestionId === q.id) {
        feedback.push({
          type: 'ERROR',
          questionId: q.id,
          message: `Questão "${q.id}" pula para ela mesma, gerando um loop infinito.`
        });
      }

      // Rule 4: Backward jump (creates risk of infinite cycles in field execution)
      if (targetIdx < idx) {
        feedback.push({
          type: 'WARNING',
          questionId: q.id,
          message: `Questão "${q.id}" pula para trás para a questão "${targetQuestionId}". Isso pode causar loops repetitivos para o pesquisador.`
        });
      }

      // Rule 5: Jump targets standard options validator
      if (q.type === 'single_choice' || q.type === 'multiple_choice') {
        if (conditionValue && !q.options.includes(conditionValue)) {
          feedback.push({
            type: 'WARNING',
            questionId: q.id,
            message: `Regra de pulo na questão "${q.id}" depende da opção "${conditionValue}", que não está na lista de opções.`
          });
        }
      }
    });
  });

  return feedback;
}

/**
 * Calculates the next question ID based on current answers.
 * @param {Array} questions List of questions.
 * @param {number} currentIdx Current question index.
 * @param {Object} answers Current answered state.
 * @returns {string|null} ID of the next question, or null if end of form.
 */
function getNextQuestionId(questions, currentIdx, answers) {
  if (currentIdx >= questions.length) return null;
  const currentQ = questions[currentIdx];
  
  if (currentQ.skipRules && currentQ.skipRules.length > 0) {
    const answer = answers[currentQ.id];
    
    for (const rule of currentQ.skipRules) {
      const { conditionValue, targetQuestionId } = rule;
      // If rule checks for a specific option match, or if it is an unconditional jump
      if (!conditionValue || String(answer) === String(conditionValue)) {
        return targetQuestionId;
      }
    }
  }

  // Default fallback: next question in array
  if (currentIdx + 1 < questions.length) {
    return questions[currentIdx + 1].id;
  }
  
  return null;
}

module.exports = {
  validateSkipLogic,
  getNextQuestionId
};
