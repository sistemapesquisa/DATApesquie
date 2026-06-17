const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('./data/database.sqlite');
db.all(`SELECT f.id, f.title, f.version FROM forms f JOIN routes r ON f.id = r.form_id WHERE f.status = 'published' AND r.researcher_id = ?`, ['researcher_2'], (err, rows) => {
  console.log('Error:', err);
  console.log('Rows:', rows);
});
