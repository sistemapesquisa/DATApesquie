const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./data/database.sqlite');
const crypto = require('crypto');

const formId = 'prj_' + crypto.randomBytes(4).toString('hex');

const questions = [
  {
    id: "Q1",
    text: "Você consome carne vermelha ou branca?",
    type: "single_choice",
    options: ["Sim", "Não"],
    required: true,
    skipRules: [
      { conditionValue: "Não", targetQuestionId: "Q3" } // If No, skip Q2, jump to Q3
    ]
  },
  {
    id: "Q2",
    text: "Qual o tipo de carne que você mais consome?",
    type: "single_choice",
    options: ["Bovina", "Frango", "Suína", "Peixe"],
    required: true,
    skipRules: [
      { conditionValue: "", targetQuestionId: "Q4" } // Unconditional jump over Q3 (vegetarian question)
    ]
  },
  {
    id: "Q3",
    text: "Você segue qual tipo de dieta sem carne?",
    type: "single_choice",
    options: ["Vegetariano (Ovolactovegetariano)", "Vegano (Estrito)"],
    required: true,
    skipRules: []
  },
  {
    id: "Q4",
    text: "Você pratica atividades físicas regularmente?",
    type: "single_choice",
    options: ["Sim", "Não"],
    required: true,
    skipRules: [
      { conditionValue: "Não", targetQuestionId: "Q6" } // If No, jump to end (Q6)
    ]
  },
  {
    id: "Q5",
    text: "Quantas vezes na semana você se exercita?",
    type: "single_choice",
    options: ["1 a 2 vezes", "3 a 4 vezes", "5 vezes ou mais"],
    required: true,
    skipRules: []
  },
  {
    id: "Q6",
    text: "Deixe um comentário final sobre sua rotina.",
    type: "text",
    required: false,
    skipRules: []
  }
];

const form = {
  id: formId,
  title: 'Pesquisa de Hábitos com Lógica de Pulo Avançada',
  status: 'published',
  version: 1,
  questions_json: JSON.stringify(questions)
};

db.serialize(() => {
  db.run(
    'INSERT INTO forms (id, title, status, version, questions_json) VALUES (?, ?, ?, ?, ?)',
    [form.id, form.title, form.status, form.version, form.questions_json]
  );
  
  // Create some mock interviews showing both paths
  const lat = -3.1019;
  const lon = -60.0250;
  
  // Path 1: Eats meat, exercises
  db.run(
    'INSERT INTO interviews (id, form_id, form_version, researcher_id, data_json, latitude, longitude, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ['int_skip_1', form.id, 1, 'mock_user', JSON.stringify({ Q1: "Sim", Q2: "Frango", Q4: "Sim", Q5: "3 a 4 vezes", Q6: "Gosto de correr" }), lat, lon, new Date().toISOString()]
  );

  // Path 2: Vegetarian, doesn't exercise
  db.run(
    'INSERT INTO interviews (id, form_id, form_version, researcher_id, data_json, latitude, longitude, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ['int_skip_2', form.id, 1, 'mock_user', JSON.stringify({ Q1: "Não", Q3: "Vegano (Estrito)", Q4: "Não", Q6: "Trabalho muito sentado" }), lat, lon, new Date().toISOString()]
  );
  
  console.log('Formulário com lógicas de pulo criado com sucesso!');
});
