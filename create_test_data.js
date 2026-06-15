const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');
const path = require('path');

const dbPath = path.join(__dirname, 'src', 'db', 'database.sqlite');
const db = new sqlite3.Database(dbPath);

const formId = 'form_' + crypto.randomBytes(6).toString('hex');
const testForm = {
  id: formId,
  title: 'Formulário Teste - Completo',
  status: 'published',
  version: 1,
  questions: [
    { id: 'Q1', text: 'Qual o seu nome?', type: 'text', required: true },
    { id: 'Q2', text: 'Qual sua idade?', type: 'integer', required: true, constraint: '. >= 0' },
    { id: 'Q3', text: 'Qual a sua renda (R$)?', type: 'decimal' },
    { id: 'Q4', text: 'Selecione seu gênero', type: 'select_one', options: ['Masculino', 'Feminino', 'Outro'] },
    { id: 'Q5', text: 'Quais esportes você pratica?', type: 'select_multiple', options: ['Futebol', 'Natação', 'Corrida', 'Nenhum'] },
    { id: 'Q6', text: 'Você trabalha atualmente?', type: 'select_one', options: ['Sim', 'Não'] },
    { id: 'Q7', text: 'Qual sua profissão?', type: 'text', relevant: '${Q6} = \'Sim\'' },
    { id: 'Q8', text: 'Tire uma foto do ambiente', type: 'image' },
    { id: 'Q9', text: 'Grave um breve vídeo do local', type: 'video' },
    { id: 'Q10', text: 'Capture as coordenadas GPS da entrevista', type: 'geopoint' },
    { id: 'Q11', text: 'Grave um áudio de feedback do entrevistado', type: 'audio' },
    { id: 'Q12', text: 'Qual a sua cor favorita?', type: 'text' },
    { id: 'Q13', text: 'Nota de satisfação (0 a 10)', type: 'integer', constraint: '. >= 0 and . <= 10' },
    { id: 'Q14', text: 'Alguma observação adicional?', type: 'text' },
    { id: 'Q15', text: 'Você recomendaria o serviço?', type: 'select_one', options: ['Com certeza', 'Talvez', 'Não'] }
  ]
};

db.serialize(() => {
  // Update old interviews to Manaus coordinates
  db.run("UPDATE interviews SET latitude = -3.1190, longitude = -60.0217 WHERE latitude = -9.3833");

  // Insert the massive test form
  const stmt = db.prepare('INSERT INTO forms (id, title, status, version, questions, created_by) VALUES (?, ?, ?, ?, ?, ?)');
  stmt.run(
    testForm.id,
    testForm.title,
    testForm.status,
    testForm.version,
    JSON.stringify(testForm.questions),
    'admin_dev',
    function(err) {
      if (err) {
        console.error("Erro ao inserir form:", err.message);
      } else {
        console.log("Formulario de teste criado com sucesso! ID:", formId);
      }
    }
  );
  stmt.finalize();
});

db.close();
