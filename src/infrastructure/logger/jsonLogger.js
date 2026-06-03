/**
 * Structured JSON Logger for Antigravity Monolith.
 * Logs to standard output in clean JSON format for parsing in production.
 */

const LOG_LEVELS = {
  DEBUG: 'DEBUG',
  INFO: 'INFO',
  WARN: 'WARN',
  ERROR: 'ERROR'
};

const SEVERITY_LEVELS = {
  CRITICAL: 'CRITICAL',
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW'
};

const CURRENT_LOG_LEVEL = process.env.LOG_LEVEL ? process.env.LOG_LEVEL.toUpperCase() : 'DEBUG';

const LEVEL_PRECEDENCE = {
  [LOG_LEVELS.DEBUG]: 0,
  [LOG_LEVELS.INFO]: 1,
  [LOG_LEVELS.WARN]: 2,
  [LOG_LEVELS.ERROR]: 3
};

function writeLog(level, message, meta = {}, severity = null) {
  // Respect log levels in standard cases
  if (LEVEL_PRECEDENCE[level] < LEVEL_PRECEDENCE[CURRENT_LOG_LEVEL]) {
    return;
  }

  const logEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...meta
  };

  if (severity) {
    logEntry.severity = severity;
  }

  // Print to stdout in JSON format
  console.log(JSON.stringify(logEntry));
}

module.exports = {
  debug: (msg, meta) => writeLog(LOG_LEVELS.DEBUG, msg, meta),
  info: (msg, meta) => writeLog(LOG_LEVELS.INFO, msg, meta),
  warn: (msg, meta) => writeLog(LOG_LEVELS.WARN, msg, meta),
  error: (msg, meta) => writeLog(LOG_LEVELS.ERROR, msg, meta),
  
  /**
   * Log specifically for security audits.
   * @param {string} msg 
   * @param {string} severity 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
   * @param {Object} meta 
   */
  security: (msg, severity, meta = {}) => {
    writeLog(LOG_LEVELS.WARN, msg, meta, severity);
  },
  
  LOG_LEVELS,
  SEVERITY_LEVELS
};
