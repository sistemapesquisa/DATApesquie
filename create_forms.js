const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./data/database.sqlite');
const crypto = require('crypto');

const form1 = {
  id: 'prj_' + crypto.randomBytes(4).toString('hex'),
  title: 'Levantamento Socioeconômico e Estrutural',
  status: 'published',
  version: 1,
  questions_json: JSON.stringify([
    { id: 'q_nome', type: 'text', text: 'Nome completo do entrevistado', required: true },
    { id: 'q_idade', type: 'integer', text: 'Qual a sua idade?', required: true, constraint: '. >= 18' },
    { id: 'q_foto', type: 'image', text: 'Tire uma foto da fachada da residência', required: false },
    { 
      id: 'q_renda', 
      type: 'select_one', 
      text: 'Qual a faixa de renda familiar?', 
      required: true, 
      options: [
        { name: 'ate_1', label: 'Até 1 salário mínimo' },
        { name: '1_a_3', label: 'De 1 a 3 salários' },
        { name: 'mais_3', label: 'Mais de 3 salários' }
      ]
    },
    { 
      id: 'q_saneamento', 
      type: 'select_multiple', 
      text: 'Quais serviços de saneamento chegam até a residência?', 
      required: true,
      options: [
        { name: 'agua', label: 'Água encanada' },
        { name: 'esgoto', label: 'Rede de esgoto' },
        { name: 'lixo', label: 'Coleta de lixo' }
      ]
    },
    { id: 'q_nota', type: 'note', text: 'Obrigado pelas respostas iniciais. Vamos para a próxima etapa.' },
    { id: 'q_obs', type: 'text', text: 'Observações do pesquisador', required: false }
  ])
};

const form2 = {
  id: 'prj_' + crypto.randomBytes(4).toString('hex'),
  title: 'Monitoramento de Fauna - Expedição Amazônia',
  status: 'published',
  version: 2,
  questions_json: JSON.stringify([
    { id: 'q_especie', type: 'text', text: 'Espécie avistada (Nome comum)', required: true },
    { id: 'q_quant', type: 'integer', text: 'Quantidade de indivíduos', required: true },
    { id: 'q_foto_animal', type: 'image', text: 'Registro fotográfico', required: true },
    { id: 'q_audio_canto', type: 'audio', text: 'Gravação do canto (se for ave)', required: false },
    { 
      id: 'q_comportamento', 
      type: 'select_one', 
      text: 'Comportamento no momento do avistamento', 
      required: true,
      options: [
        { name: 'alimentacao', label: 'Alimentação' },
        { name: 'descanso', label: 'Descanso' },
        { name: 'fuga', label: 'Fuga' },
        { name: 'vocalizacao', label: 'Vocalização' }
      ]
    }
  ])
};

db.serialize(() => {
  db.run(
    'INSERT INTO forms (id, title, status, version, questions_json) VALUES (?, ?, ?, ?, ?)',
    [form1.id, form1.title, form1.status, form1.version, form1.questions_json]
  );
  db.run(
    'INSERT INTO forms (id, title, status, version, questions_json) VALUES (?, ?, ?, ?, ?)',
    [form2.id, form2.title, form2.status, form2.version, form2.questions_json]
  );
  console.log('2 forms criados com sucesso!');
});
