/**
 * Role-Based Access Control (RBAC) definitions and validation logic.
 * Simple, declarative mapping of capabilities to application roles.
 */

const ROLES = {
  DEV: 'DEV',
  ADMIN: 'Admin',
  ANALYST: 'Analyst',
  COORDINATOR: 'Coordinator',
  SUPERVISOR: 'Supervisor',
  RESEARCHER: 'Researcher'
};

const PERMISSIONS = {
  // DEV permissions
  VIEW_LOGS: 'view_logs',
  VIEW_FINANCIALS: 'view_financials',

  // Client Admin permissions
  MANAGE_COORDINATORS: 'manage_coordinators',
  MANAGE_SUPERVISORS: 'manage_supervisors',
  MANAGE_ANALYSTS: 'manage_analysts',
  SYSTEM_CONFIG: 'system_config',

  // Coordinator permissions
  MANAGE_RESEARCHERS: 'manage_researchers',
  TRACK_FIELD_ROUTES: 'track_field_routes',

  // Analyst permissions
  BUILD_FORMS: 'build_forms',
  APPROVE_PAYMENT: 'approve_payment', // Approve interviews for payments

  // Supervisor permissions
  MONITOR_FIELD: 'monitor_field',
  AUDIT_INTERVIEW_AUDIO: 'audit_interview_audio', // Play audio and validate structure

  // Researcher permissions
  SUBMIT_INTERVIEWS: 'submit_interviews',
  DOWNLOAD_FORMS: 'download_forms'
};

const ROLE_PERMISSIONS = {
  [ROLES.DEV]: [
    PERMISSIONS.VIEW_LOGS,
    PERMISSIONS.VIEW_FINANCIALS,
    PERMISSIONS.MANAGE_COORDINATORS,
    PERMISSIONS.MANAGE_SUPERVISORS,
    PERMISSIONS.MANAGE_ANALYSTS,
    PERMISSIONS.SYSTEM_CONFIG,
    PERMISSIONS.MANAGE_RESEARCHERS,
    PERMISSIONS.TRACK_FIELD_ROUTES,
    PERMISSIONS.BUILD_FORMS,
    PERMISSIONS.APPROVE_PAYMENT,
    PERMISSIONS.MONITOR_FIELD,
    PERMISSIONS.AUDIT_INTERVIEW_AUDIO,
    PERMISSIONS.SUBMIT_INTERVIEWS,
    PERMISSIONS.DOWNLOAD_FORMS
  ],
  [ROLES.ADMIN]: [
    PERMISSIONS.MANAGE_COORDINATORS,
    PERMISSIONS.MANAGE_SUPERVISORS,
    PERMISSIONS.MANAGE_ANALYSTS,
    PERMISSIONS.SYSTEM_CONFIG,
    PERMISSIONS.MANAGE_RESEARCHERS,
    PERMISSIONS.TRACK_FIELD_ROUTES,
    PERMISSIONS.BUILD_FORMS,
    PERMISSIONS.APPROVE_PAYMENT,
    PERMISSIONS.MONITOR_FIELD,
    PERMISSIONS.AUDIT_INTERVIEW_AUDIO,
    PERMISSIONS.SUBMIT_INTERVIEWS,
    PERMISSIONS.DOWNLOAD_FORMS
  ],
  [ROLES.ANALYST]: [
    PERMISSIONS.BUILD_FORMS,
    PERMISSIONS.APPROVE_PAYMENT,
    PERMISSIONS.AUDIT_INTERVIEW_AUDIO, // Analyst can also check form answers
    PERMISSIONS.DOWNLOAD_FORMS
  ],
  [ROLES.COORDINATOR]: [
    PERMISSIONS.MANAGE_RESEARCHERS,
    PERMISSIONS.TRACK_FIELD_ROUTES,
    PERMISSIONS.DOWNLOAD_FORMS
  ],
  [ROLES.SUPERVISOR]: [
    PERMISSIONS.MONITOR_FIELD,
    PERMISSIONS.AUDIT_INTERVIEW_AUDIO,
    PERMISSIONS.TRACK_FIELD_ROUTES, // Supervisors can also track their field team
    PERMISSIONS.DOWNLOAD_FORMS
  ],
  [ROLES.RESEARCHER]: [
    PERMISSIONS.SUBMIT_INTERVIEWS,
    PERMISSIONS.DOWNLOAD_FORMS
  ]
};

/**
 * Validates whether a user's role grants them permission to execute an action.
 * @param {string} role The user's role.
 * @param {string} permission The action permission code.
 * @returns {boolean}
 */
function checkPermission(role, permission) {
  if (!role || !permission) return false;
  const permissions = ROLE_PERMISSIONS[role];
  if (!permissions) return false;
  return permissions.includes(permission);
}

module.exports = {
  ROLES,
  PERMISSIONS,
  checkPermission
};
