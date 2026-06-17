const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');

const dbPath = path.join(__dirname, '..', 'data', 'database.sqlite');
const db = new sqlite3.Database(dbPath);

const LAT_MANAUS = -3.1190;
const LNG_MANAUS = -60.0217;

const generateForms = () => {
  const forms = [];
  for (let i = 1; i <= 3; i++) {
    const questions = [];
    
    // Generate 30 questions with diverse types
    questions.push({ id: `q1`, text: `Nome do entrevistado`, type: `text`, required: true });
    questions.push({ id: `q2`, text: `Idade`, type: `integer`, required: true });
    questions.push({ id: `q3`, text: `Possui veículo?`, type: `select_one`, options: [{label: 'Sim', value: 'sim'}, {label: 'Não', value: 'nao'}], required: true });
    
    // Nested Logic Level 1 (Depends on q3)
    questions.push({ id: `q4`, text: `Qual tipo de veículo?`, type: `select_multiple`, options: [{label: 'Carro', value: 'carro'}, {label: 'Moto', value: 'moto'}, {label: 'Bicicleta', value: 'bicicleta'}], relevant: `(\${q3} = 'sim')` });
    
    // Nested Logic Level 2 (Depends on q4 which depends on q3)
    questions.push({ id: `q5`, text: `Quantas portas tem o carro?`, type: `integer`, relevant: `(\${q4} = 'carro')` });
    
    questions.push({ id: `q6`, text: `Renda Mensal Estimada`, type: `decimal` });
    questions.push({ id: `q7`, text: `Data de Nascimento`, type: `date` });
    questions.push({ id: `q8`, text: `Hora de Acordar`, type: `time` });
    
    questions.push({ id: `q9`, text: `Gostaria de avaliar o bairro?`, type: `select_one`, options: [{label: 'Sim', value: 'sim'}, {label: 'Não', value: 'nao'}] });
    // Nested
    questions.push({ id: `q10`, text: `Descreva o que falta no bairro`, type: `text`, relevant: `(\${q9} = 'sim')` });
    questions.push({ id: `q11`, text: `Grave um áudio sobre o bairro`, type: `audio`, relevant: `(\${q9} = 'sim')` });
    
    questions.push({ id: `q12`, text: `Foto da rua (Opcional)`, type: `image` });
    questions.push({ id: `q13`, text: `Anotação do Pesquisador`, type: `note`, label: `O bairro apresenta asfaltamento recente.` });
    questions.push({ id: `q14`, text: `Localização da Casa`, type: `gps` });

    // Fill the rest up to 30
    for(let j = 15; j <= 30; j++) {
      questions.push({ id: `q${j}`, text: `Pergunta de Opinião ${j}`, type: `select_one`, options: [{label: 'Ótimo', value: 'otimo'}, {label: 'Bom', value: 'bom'}, {label: 'Ruim', value: 'ruim'}] });
    }

    forms.push({
      id: `form_manaus_${i}_${crypto.randomBytes(4).toString('hex')}`,
      title: `Pesquisa Manaus Teste ${i}`,
      questions_json: JSON.stringify(questions),
      status: 'published',
      version: 1,
      created_by: 'dev',
      created_at: new Date().toISOString()
    });
  }
  return forms;
};

const generateInterviews = (forms, researchers) => {
  const interviews = [];
  forms.forEach(form => {
    const questions = JSON.parse(form.questions_json);
    for (let i = 0; i < 100; i++) {
      const researcherId = researchers[Math.floor(Math.random() * researchers.length)] || 'admin';
      
      // Random coordinates around Manaus (within ~5km)
      const lat = LAT_MANAUS + (Math.random() - 0.5) * 0.1;
      const lng = LNG_MANAUS + (Math.random() - 0.5) * 0.1;
      
      const data = {};
      
      data['q1'] = `Morador Manaus ${crypto.randomBytes(2).toString('hex')}`;
      data['q2'] = Math.floor(Math.random() * 60) + 18;
      
      const hasVehicle = Math.random() > 0.5 ? 'sim' : 'nao';
      data['q3'] = hasVehicle;
      
      if (hasVehicle === 'sim') {
        const types = ['carro', 'moto', 'bicicleta'];
        const type = types[Math.floor(Math.random() * types.length)];
        data['q4'] = type;
        
        if (type === 'carro') {
          data['q5'] = Math.random() > 0.5 ? 2 : 4;
        }
      }
      
      data['q6'] = (Math.random() * 5000 + 1000).toFixed(2);
      data['q7'] = `19${Math.floor(Math.random() * 40) + 50}-05-10`;
      data['q8'] = `06:30`;
      
      const evalBairro = Math.random() > 0.5 ? 'sim' : 'nao';
      data['q9'] = evalBairro;
      if (evalBairro === 'sim') {
        data['q10'] = 'Falta mais segurança e asfalto no Centro.';
        data['q11'] = '/audio-vault/mock-audio.webm';
      }
      
      for(let j = 15; j <= 30; j++) {
        const ops = ['otimo', 'bom', 'ruim'];
        data[`q${j}`] = ops[Math.floor(Math.random() * ops.length)];
      }

      interviews.push({
        id: `int_${crypto.randomBytes(6).toString('hex')}`,
        form_id: form.id,
        form_version: form.version,
        researcher_id: researcherId,
        data_json: JSON.stringify(data),
        latitude: lat,
        longitude: lng,
        audio_url: evalBairro === 'sim' ? '/audio-vault/mock-audio.webm' : null,
        device_id: `tablet_manaus_${Math.floor(Math.random() * 10)}`,
        created_at: new Date(Date.now() - Math.random() * 10000000000).toISOString()
      });
    }
  });
  return interviews;
};

db.serialize(() => {
  db.all("SELECT id FROM users", [], (err, rows) => {
    if (err) throw err;
    const userIds = rows.map(r => r.id);
    
    // WIPING DATABASES
    console.log("Apagando forms e interviews...");
    db.run("DELETE FROM forms");
    db.run("DELETE FROM interviews");
    
    console.log("Gerando 3 formulários com lógicas aninhadas...");
    const forms = generateForms();
    const insertForm = db.prepare("INSERT INTO forms (id, title, questions_json, status, version, created_at) VALUES (?, ?, ?, ?, ?, ?)");
    forms.forEach(f => insertForm.run(f.id, f.title, f.questions_json, f.status, f.version, f.created_at));
    insertForm.finalize();

    console.log("Gerando 300 entrevistas distribuídas em Manaus...");
    const interviews = generateInterviews(forms, userIds);
    const insertInt = db.prepare("INSERT INTO interviews (id, form_id, form_version, researcher_id, data_json, latitude, longitude, audio_url, device_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
    
    // Also assign researchers to forms in 'routes' table
    console.log("Atribuindo pesquisadores aos projetos na tabela routes...");
    db.run("DELETE FROM routes");
    const insertRoute = db.prepare("INSERT INTO routes (id, researcher_id, form_id, city) VALUES (?, ?, ?, ?)");
    const assigned = new Set();

    db.run("BEGIN TRANSACTION");
    interviews.forEach(i => {
      insertInt.run(i.id, i.form_id, i.form_version, i.researcher_id, i.data_json, i.latitude, i.longitude, i.audio_url, i.device_id, i.created_at);
      const routeKey = `${i.researcher_id}_${i.form_id}`;
      if (!assigned.has(routeKey)) {
        assigned.add(routeKey);
        const routeId = `route_${crypto.randomBytes(4).toString('hex')}`;
        insertRoute.run(routeId, i.researcher_id, i.form_id, 'Manaus/AM');
      }
    });
    insertInt.finalize();
    insertRoute.finalize();
    db.run("COMMIT", () => {
      console.log("Concluído com sucesso! 3 formulários e 300 entrevistas injetadas no BD.");
      db.close();
    });
  });
});
