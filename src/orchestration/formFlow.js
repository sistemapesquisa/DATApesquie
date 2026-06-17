const crypto = require('crypto');
const { db } = require('../infrastructure/db/database');
const { validateSkipLogic } = require('../core/rules/skipLogic');
const jsonLogger = require('../infrastructure/logger/jsonLogger');

/**
 * Saves or updates a form, auto-incrementing the version if it was already published.
 * Triggers skip logic validation and returns warnings alongside the saved form.
 * 
 * @param {Object} formData { id, title, questions, status }
 * @returns {Promise<{ success: boolean, form: Object, validation: Array }>}
 */
function saveForm(formData) {
  return new Promise((resolve, reject) => {
    const { title, questions, status = 'draft', settings = {} } = formData;
    let id = formData.id;

    // Validate skip logic rules
    const validation = validateSkipLogic(questions);

    // If ID is not provided, create a new form
    if (!id) {
      id = 'form_' + crypto.randomBytes(6).toString('hex');
      const version = 1;
      const qJson = JSON.stringify(questions);
      const sJson = JSON.stringify(settings);
      const now = new Date().toISOString();

      db.run(
        `INSERT INTO forms (id, title, version, status, questions_json, settings_json, created_at, updated_at) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, title, version, status, qJson, sJson, now, now],
        (err) => {
          if (err) {
            jsonLogger.error('Failed to create form', { error: err.message });
            return reject(err);
          }
          jsonLogger.info(`Created new form [${id}] - Version ${version}`);
          resolve({
            success: true,
            form: { id, title, version, status, questions, settings },
            validation
          });
        }
      );
    } else {
      // Check existing form details for versioning
      db.get(`SELECT version, status, questions_json, settings_json FROM forms WHERE id = ?`, [id], (err, existing) => {
        if (err) {
          jsonLogger.error('Error fetching existing form for update', { error: err.message });
          return reject(err);
        }

        if (!existing) {
          // If ID provided but not found, insert as version 1
          const version = 1;
          const qJson = JSON.stringify(questions);
          const sJson = JSON.stringify(settings);
          const now = new Date().toISOString();
          db.run(
            `INSERT INTO forms (id, title, version, status, questions_json, settings_json, created_at, updated_at) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, title, version, status, qJson, sJson, now, now],
            (err) => {
              if (err) return reject(err);
              resolve({
                success: true,
                form: { id, title, version, status, questions, settings },
                validation
              });
            }
          );
          return;
        }

        // Versioning Logic:
        // If the form is currently published, any modifications must bump the version number.
        // If it is in draft, we can update in-place without bumping version.
        let newVersion = existing.version;
        const questionsChanged = existing.questions_json !== JSON.stringify(questions);
        const settingsChanged = existing.settings_json !== JSON.stringify(settings);
        
        if (existing.status === 'published' && (questionsChanged || settingsChanged)) {
          newVersion = existing.version + 1;
          jsonLogger.info(`Form [${id}] was already published. Bumping version to ${newVersion} due to changes.`);
        }

        const now = new Date().toISOString();
        db.run(
          `UPDATE forms SET title = ?, version = ?, status = ?, questions_json = ?, settings_json = ?, updated_at = ? WHERE id = ?`,
          [title, newVersion, status, JSON.stringify(questions), JSON.stringify(settings), now, id],
          (err) => {
            if (err) {
              jsonLogger.error('Failed to update form', { error: err.message });
              return reject(err);
            }
            jsonLogger.info(`Updated form [${id}] - Version ${newVersion} (Status: ${status})`);
            resolve({
              success: true,
              form: { id, title, version: newVersion, status, questions, settings },
              validation
            });
          }
        );
      });
    }
  });
}

module.exports = {
  saveForm
};
