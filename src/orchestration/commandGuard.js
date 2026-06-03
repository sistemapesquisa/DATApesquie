const crypto = require('crypto');
const jsonLogger = require('../infrastructure/logger/jsonLogger');
const { sendExternalAlert } = require('../services/externalAlerts');
const { db } = require('../infrastructure/db/database');

// Commands to check for destructive behavior
const DESTRUCTIVE_COMMANDS = [
  { pattern: /reset/i, severity: 'CRITICAL', label: 'System/Factory Reset' },
  { pattern: /reboot/i, severity: 'CRITICAL', label: 'System Reboot' },
  { pattern: /\/system reset/i, severity: 'CRITICAL', label: 'RouterOS System Reset' },
  { pattern: /\/interface disable/i, severity: 'HIGH', label: 'Disable Network Interface' },
  { pattern: /\/ip route remove/i, severity: 'HIGH', label: 'Remove Route' },
  { pattern: /shutdown/i, severity: 'CRITICAL', label: 'System Shutdown' },
  { pattern: /format/i, severity: 'CRITICAL', label: 'Disk Format' }
];

/**
 * Audit command requested by user, logs structured JSON, saves to DB,
 * blocks execution, and triggers external alerts if severity is CRITICAL/HIGH.
 * 
 * @param {string} command Command text entered by operator.
 * @param {string} userRole Role of the active operator.
 * @returns {Promise<{ allowed: boolean, severity: string, message: string, suggestion: string }>}
 */
async function evaluateCommand(command, userRole) {
  const sanitizedCommand = (command || '').trim();
  
  if (!sanitizedCommand) {
    return {
      allowed: false,
      severity: 'LOW',
      message: 'Comando vazio.',
      suggestion: 'Digite um comando válido.'
    };
  }

  // 1. Check if the command is destructive
  let severity = 'LOW';
  let isDestructive = false;
  let threatLabel = '';

  for (const item of DESTRUCTIVE_COMMANDS) {
    if (item.pattern.test(sanitizedCommand)) {
      severity = item.severity;
      isDestructive = true;
      threatLabel = item.label;
      break;
    }
  }

  // If not destructive but changes config, classify as MEDIUM
  if (!isDestructive) {
    const isConfigChange = /set|add|remove|enable|disable|configure/i.test(sanitizedCommand);
    severity = isConfigChange ? 'MEDIUM' : 'LOW';
  }

  const logId = 'sec_' + crypto.randomBytes(8).toString('hex');
  const timestamp = new Date().toISOString();

  // 2. Structured JSON Log (as required by prompt)
  const auditMeta = {
    logId,
    eventType: isDestructive ? 'DESTRUCTIVE_COMMAND_BLOCKED' : 'COMMAND_READ_ONLY_BLOCKED',
    commandRequested: sanitizedCommand,
    userRole,
    severity,
    timestamp
  };

  jsonLogger.security(
    `Security Audit: Command execution blocked [Role: ${userRole}, Severity: ${severity}]`,
    severity,
    auditMeta
  );

  // 3. Persist log to DB
  await new Promise((resolve) => {
    db.run(
      `INSERT INTO security_logs (id, type, severity, command_requested, user_role, timestamp) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [logId, auditMeta.eventType, severity, sanitizedCommand, userRole, timestamp],
      (err) => {
        if (err) {
          jsonLogger.error('Failed to save security log to database', { error: err.message });
        }
        resolve();
      }
    );
  });

  // 4. Trigger external API alert if CRITICAL or HIGH
  if (severity === 'CRITICAL' || severity === 'HIGH') {
    // Fire and forget so we don't block response execution (using clean promise structure)
    sendExternalAlert({
      incidentId: logId,
      severity,
      role: userRole,
      command: sanitizedCommand,
      details: `Tentativa de execução de comando destrutivo (${threatLabel}) em modo Read-Only.`,
      timestamp
    }).catch(err => {
      jsonLogger.error('Unhandled exception in sendExternalAlert background call', { error: err.message });
    });
  }

  // 5. Build responses & safe human suggestion (since we never run commands on equipment directly)
  if (isDestructive) {
    return {
      allowed: false,
      severity,
      message: `Bloqueado: Comando destrutivo detectado (${threatLabel}).`,
      suggestion: `AÇÃO PROIBIDA. Solicite aprovação física e intervenção manual local se for realmente necessário.`
    };
  } else {
    // Read command or non-destructive config change
    let suggestion = `Sugestão para operador: Execute manualmente o comando no terminal do equipamento:\n  > ${sanitizedCommand}`;
    if (severity === 'MEDIUM') {
      suggestion += `\n(Atenção: Este comando altera configurações. Valide com a equipe de engenharia antes de executar.)`;
    }

    return {
      allowed: false,
      severity,
      message: `Bloqueado: Sistema opera em modo estritamente READ-ONLY para equipamentos.`,
      suggestion
    };
  }
}

module.exports = {
  evaluateCommand
};
