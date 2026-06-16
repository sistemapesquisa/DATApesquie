const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./data/database.sqlite');
const crypto = require('crypto');

db.get('SELECT id FROM forms LIMIT 1', (err, form) => {
  if (!form) { console.log('No form found'); return; }
  const formId = form.id;
  
  for(let i=0; i<5; i++) {
    const interviewId = 'int_' + crypto.randomBytes(6).toString('hex');
    const dataJson = JSON.stringify({
      q_0: 'Resposta mockada ' + i,
      q_1: Math.floor(Math.random() * 50 + 10)
    });
    const lat = -9.3833 + (Math.random() - 0.5) * 0.05;
    const lon = -40.5000 + (Math.random() - 0.5) * 0.05;
    const now = new Date().toISOString();
    
    db.run(
      'INSERT INTO interviews (id, form_id, form_version, researcher_id, data_json, latitude, longitude, device_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [interviewId, formId, 1, 'mock_user', dataJson, lat, lon, 'simulator', now]
    );
  }
  console.log('Mock data inserted');
});
