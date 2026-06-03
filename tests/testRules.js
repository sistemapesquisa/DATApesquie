/**
 * Automated Verification Script for Antigravity Research Platform.
 * Can be run locally or inside the Docker container to verify domain business rules.
 */

const assert = require('assert');
const { checkPermission, PERMISSIONS, ROLES } = require('../src/core/rules/rbac');
const { validateSkipLogic } = require('../src/core/rules/skipLogic');
const { evaluateCommand } = require('../src/orchestration/commandGuard');
const { initDb, db } = require('../src/infrastructure/db/database');

async function runTests() {
  console.log('\x1b[36m%s\x1b[0m', '=== INICIANDO VERIFICAÇÃO AUTOMATIZADA DA ARQUITETURA ===\n');

  // 1. Test RBAC Rules
  console.log('1. Testando Matriz de Permissões (RBAC)...');
  try {
    assert.strictEqual(checkPermission(ROLES.DEV, PERMISSIONS.VIEW_LOGS), true, 'DEV deveria ver logs');
    assert.strictEqual(checkPermission(ROLES.RESEARCHER, PERMISSIONS.VIEW_LOGS), false, 'Pesquisador NÃO deveria ver logs');
    assert.strictEqual(checkPermission(ROLES.COORDINATOR, PERMISSIONS.MANAGE_RESEARCHERS), true, 'Coordenador deveria gerenciar pesquisadores');
    assert.strictEqual(checkPermission(ROLES.RESEARCHER, PERMISSIONS.SUBMIT_INTERVIEWS), true, 'Pesquisador deve poder submeter entrevistas');
    console.log('   \x1b[32m[OK]\x1b[0m Permissões de RBAC validadas.');
  } catch (err) {
    console.error('   \x1b[31m[FALHA]\x1b[0m Erro em RBAC:', err.message);
    process.exit(1);
  }

  // 2. Test Skip Logic Validation
  console.log('\n2. Testando Validador de Lógicas de Pulo (Skip Logic)...');
  try {
    // Flow A: Valid forward skip
    const validQuestions = [
      { id: 'Q1', type: 'single_choice', options: ['Sim', 'Não'], skipRules: [{ conditionValue: 'Não', targetQuestionId: 'Q3' }] },
      { id: 'Q2', type: 'text', skipRules: [] },
      { id: 'Q3', type: 'text', skipRules: [] }
    ];
    const warningsA = validateSkipLogic(validQuestions);
    assert.strictEqual(warningsA.length, 0, 'Fluxo válido não deveria gerar avisos');

    // Flow B: Invalid backward skip (loop danger)
    const invalidQuestions = [
      { id: 'Q1', type: 'text', skipRules: [] },
      { id: 'Q2', type: 'single_choice', options: ['Sim', 'Não'], skipRules: [{ conditionValue: 'Sim', targetQuestionId: 'Q1' }] }
    ];
    const warningsB = validateSkipLogic(invalidQuestions);
    assert.strictEqual(warningsB.length, 1, 'Deveria alertar sobre pulo para trás');
    assert.ok(warningsB[0].message.includes('pula para trás'), 'Aviso deveria alertar sobre loops');

    // Flow C: Target question missing
    const missingTargetQuestions = [
      { id: 'Q1', type: 'single_choice', options: ['Sim'], skipRules: [{ conditionValue: 'Sim', targetQuestionId: 'Q99' }] }
    ];
    const warningsC = validateSkipLogic(missingTargetQuestions);
    assert.strictEqual(warningsC.length, 1, 'Deveria alertar sobre questão que não existe');
    assert.ok(warningsC[0].message.includes('não existe'), 'Aviso correto sobre destino inexistente');

    console.log('   \x1b[32m[OK]\x1b[0m Skip Logic Engine validado.');
  } catch (err) {
    console.error('   \x1b[31m[FALHA]\x1b[0m Erro em Skip Logic:', err.message);
    process.exit(1);
  }

  // 3. Test Network Security Command Blocking
  console.log('\n3. Testando Interceptador de Comandos Destrutivos (Read-Only Guard)...');
  
  // We initialize database to record audit logs during command evaluation
  await initDb();
  
  try {
    // Test dangerous command: reboot
    const res1 = await evaluateCommand('reboot', ROLES.COORDINATOR);
    assert.strictEqual(res1.allowed, false, 'Comando reboot deve ser bloqueado');
    assert.strictEqual(res1.severity, 'CRITICAL', 'Reboot deve ter severidade CRITICAL');
    assert.ok(res1.message.includes('destrutivo'), 'Mensagem deve indicar bloqueio destrutivo');

    // Test safe command: show version
    const res2 = await evaluateCommand('show version', ROLES.DEV);
    assert.strictEqual(res2.allowed, false, 'Sistema é estritamente Read-Only, show version local também é sugerido ao operador');
    assert.strictEqual(res2.severity, 'LOW', 'Show version deve ter severidade LOW');
    assert.ok(res2.suggestion.includes('Execute manualmente'), 'Deve sugerir execução manual ao operador');

    console.log('   \x1b[32m[OK]\x1b[0m Interceptador de comandos de segurança validado.');
  } catch (err) {
    console.error('   \x1b[31m[FALHA]\x1b[0m Erro no Interceptador de Comandos:', err.message);
    db.close();
    process.exit(1);
  }

  db.close();
  console.log('\n\x1b[32m%s\x1b[0m', '=== TODAS AS VERIFICAÇÕES PASSARAM COM SUCESSO! ===');
}

// Execute
runTests().catch(err => {
  console.error(err);
  process.exit(1);
});
