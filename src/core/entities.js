/**
 * Core Domain Entities for the Antigravity Research Platform.
 * Built with pure JS/ES6, free of any database/framework dependencies.
 */

class User {
  constructor({ id, name, email, role, status = 'active', createdAt = new Date() }) {
    this.id = id;
    this.name = name;
    this.email = email;
    this.role = role; // 'DEV', 'Admin', 'Analyst', 'Coordinator', 'Supervisor', 'Researcher'
    this.status = status; // 'active', 'deleted'
    this.createdAt = createdAt;
  }

  validate() {
    const validRoles = ['DEV', 'Admin', 'Analyst', 'Coordinator', 'Supervisor', 'Researcher'];
    if (!this.name || typeof this.name !== 'string') throw new Error('Invalid user name');
    if (!this.email || !this.email.includes('@')) throw new Error('Invalid user email');
    if (!validRoles.includes(this.role)) throw new Error(`Invalid user role: ${this.role}`);
    return true;
  }
}

class Form {
  constructor({ id, title, version = 1, status = 'draft', questions = [], createdAt = new Date(), updatedAt = new Date() }) {
    this.id = id;
    this.title = title;
    this.version = version; // Integer (auto-incremented on publish/change)
    this.status = status; // 'draft', 'published', 'archived'
    this.questions = questions; // Array of Question instances or raw structures
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }

  validate() {
    if (!this.title || typeof this.title !== 'string') throw new Error('Invalid form title');
    if (this.version < 1) throw new Error('Form version must be greater than or equal to 1');
    return true;
  }
}

class Question {
  constructor({ id, text, type, options = [], skipRules = [], copySourceId = null }) {
    this.id = id;
    this.text = text;
    this.type = type; // 'text', 'single_choice', 'multiple_choice', 'number', 'audio_record'
    this.options = options; // Array of strings (for choices)
    this.skipRules = skipRules; // Skip actions/logic mappings
    this.copySourceId = copySourceId; // Track question duplication
  }
}

class Interview {
  constructor({
    id,
    formId,
    formVersion,
    researcherId,
    data = {},
    latitude = null,
    longitude = null,
    audioUrl = null,
    status = 'pending', // 'pending', 'approved', 'rejected'
    createdAt = new Date(),
    approvedBy = null,
    notes = ''
  }) {
    this.id = id;
    this.formId = formId;
    this.formVersion = formVersion;
    this.researcherId = researcherId;
    this.data = data; // Answers key-value (questionId -> answer)
    this.latitude = latitude;
    this.longitude = longitude;
    this.audioUrl = audioUrl;
    this.status = status;
    this.createdAt = createdAt;
    this.approvedBy = approvedBy;
    this.notes = notes;
  }

  validateCoordinates() {
    if (this.latitude === null || this.longitude === null) return false;
    const lat = parseFloat(this.latitude);
    const lng = parseFloat(this.longitude);
    return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
  }
}

class SecurityLog {
  constructor({ id, type, severity, commandRequested, userRole, timestamp = new Date() }) {
    this.id = id;
    this.type = type; // 'COMMAND_EXECUTION', 'UNAUTHORIZED_ACCESS', 'DESTRUCTIVE_COMMAND_BLOCKED'
    this.severity = severity; // 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'
    this.commandRequested = commandRequested;
    this.userRole = userRole;
    this.timestamp = timestamp;
  }
}

module.exports = {
  User,
  Form,
  Question,
  Interview,
  SecurityLog
};
