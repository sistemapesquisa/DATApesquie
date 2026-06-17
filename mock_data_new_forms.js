const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./data/database.sqlite');
const crypto = require('crypto');

db.all("SELECT id, title FROM forms WHERE title LIKE '%Levantamento%' OR title LIKE '%Monitoramento%'", (err, forms) => {
  if (err) return console.error(err);
  if (!forms || forms.length === 0) return console.log('No new forms found');
  
  forms.forEach(form => {
    for(let i=0; i<5; i++) {
      const interviewId = 'int_mock_' + crypto.randomBytes(6).toString('hex');
      let dataObj = {};
      if (form.title.includes('Levantamento')) {
        dataObj = {
          q_nome: 'Entrevistado Teste ' + i,
          q_idade: 20 + i * 5,
          q_renda: 'ate_1',
          q_saneamento: ['agua', 'lixo'],
          q_obs: 'Observação mockada'
        };
      } else {
        dataObj = {
          q_especie: 'Animal ' + i,
          q_quant: i + 1,
          q_comportamento: 'alimentacao'
        };
      }
      
      const dataJson = JSON.stringify(dataObj);
      const lat = -3.1019 + (Math.random() - 0.5) * 0.05; // Manaus aprox
      const lon = -60.0250 + (Math.random() - 0.5) * 0.05;
      const now = new Date().toISOString();
      
      db.run(
        'INSERT INTO interviews (id, form_id, form_version, researcher_id, data_json, latitude, longitude, device_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [interviewId, form.id, 1, 'mock_user', dataJson, lat, lon, 'simulator', now]
      );
    }
    console.log('Inserted 5 interviews for: ' + form.title);
  });
});
