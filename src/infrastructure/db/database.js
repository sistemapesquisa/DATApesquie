const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const jsonLogger = require('../logger/jsonLogger');

const dbPath = process.env.DATABASE_PATH || './data/database.sqlite';

// Ensure the directory for the database file exists
const dir = path.dirname(dbPath);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    jsonLogger.error('Failed to connect to SQLite database', { error: err.message });
  } else {
    jsonLogger.info('Connected to SQLite database at ' + dbPath);
    
    // Otimização para concorrência
    db.run("PRAGMA journal_mode=WAL");
    db.run("PRAGMA synchronous=NORMAL");
  }
});

/**
 * Initializes the database schemas and seeds default data.
 */
function initDb() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // 1. Users Table
      db.run(`CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        role TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        password TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      // 2. Forms Table
      db.run(`CREATE TABLE IF NOT EXISTS forms (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'draft',
        questions_json TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      // 3. Interviews Table
      db.run(`CREATE TABLE IF NOT EXISTS interviews (
        id TEXT PRIMARY KEY,
        form_id TEXT NOT NULL,
        form_version INTEGER NOT NULL,
        researcher_id TEXT NOT NULL,
        data_json TEXT NOT NULL,
        latitude REAL,
        longitude REAL,
        audio_url TEXT,
        device_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      // 3.1 Custom Roles Table
      db.run(`CREATE TABLE IF NOT EXISTS custom_roles (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        permissions_json TEXT NOT NULL
      )`);

      // 4. Security Logs Table
      db.run(`CREATE TABLE IF NOT EXISTS security_logs (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        severity TEXT NOT NULL,
        command_requested TEXT,
        user_role TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      // 5. Routes Table (Assignments for Researchers)
      db.run(`CREATE TABLE IF NOT EXISTS routes (
        id TEXT PRIMARY KEY,
        researcher_id TEXT NOT NULL,
        form_id TEXT NOT NULL,
        city TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      // Seed Users if empty
      db.get("SELECT COUNT(*) as count FROM users", (err, row) => {
        if (err) return reject(err);
        if (row.count === 0) {
          jsonLogger.info('Seeding users table...');
          const stmt = db.prepare("INSERT INTO users (id, name, email, role, status, password) VALUES (?, ?, ?, ?, ?, ?)");
          
          stmt.run("dev_user", "Gustavo Dev", "dev@antigravity.corp", "DEV", "active", "dev123");
          stmt.run("admin_user", "Clara Admin", "admin@cliente.com", "Admin", "active", "admin123");
          stmt.run("analyst_user", "Felipe Analista", "analyst@cliente.com", "Analyst", "active", "analyst123");
          stmt.run("coord_user", "Helena Coordenadora", "coordinator@cliente.com", "Coordinator", "active", "coord123");
          stmt.run("super_user", "Marcos Supervisor", "supervisor@cliente.com", "Supervisor", "active", "super123");
          
          // Researchers
          stmt.run("researcher_1", "Ana Pesquisadora", "ana@freelancer.com", "Researcher", "active", "pesq123");
          stmt.run("researcher_2", "Bruno Pesquisador", "bruno@freelancer.com", "Researcher", "active", "pesq123");
          stmt.run("researcher_3", "Carla Pesquisadora", "carla@freelancer.com", "Researcher", "active", "pesq123");
          stmt.run("researcher_4", "Daniel Pesquisador", "daniel@freelancer.com", "Researcher", "active", "pesq123");
          
          stmt.finalize();
        }
      });

      // Seed Forms if empty
      db.get("SELECT COUNT(*) as count FROM forms", (err, row) => {
        if (err) return reject(err);
        if (row.count === 0) {
          jsonLogger.info('Seeding forms table...');
          const stmt = db.prepare("INSERT INTO forms (id, title, version, status, questions_json) VALUES (?, ?, ?, ?, ?)");
          
          // Form 1: Censo Populacional do Sertão
          const questions1 = [
            {
              id: "Q1",
              text: "Qual a sua faixa etária?",
              type: "single_choice",
              options: ["Menos de 18 anos", "18 a 35 anos", "36 a 60 anos", "Mais de 60 anos"],
              skipRules: []
            },
            {
              id: "Q2",
              text: "Você possui acesso à energia elétrica estável?",
              type: "single_choice",
              options: ["Sim", "Não"],
              skipRules: [
                { conditionValue: "Não", targetQuestionId: "Q4" } // Skip Q3 if no electricity
              ]
            },
            {
              id: "Q3",
              text: "Qual a principal fonte de energia usada em sua casa?",
              type: "single_choice",
              options: ["Rede pública", "Painel Solar", "Gerador próprio", "Outros"],
              skipRules: []
            },
            {
              id: "Q4",
              text: "Descreva brevemente os principais desafios na sua região.",
              type: "text",
              options: [],
              skipRules: []
            },
            {
              id: "Q5",
              text: "Por favor, grave o depoimento final do entrevistado.",
              type: "audio_record",
              options: [],
              skipRules: []
            }
          ];

          // Form 2: Pesquisa de Saneamento Interiorano
          const questions2 = [
            {
              id: "S1",
              text: "Tem água encanada?",
              type: "single_choice",
              options: ["Sim", "Não"],
              skipRules: [
                { conditionValue: "Sim", targetQuestionId: "S3" }
              ]
            },
            {
              id: "S2",
              text: "Como você obtém água?",
              type: "single_choice",
              options: ["Poço artesiano", "Caminhão pipa", "Chuva/Cisterna", "Rio/Lago"],
              skipRules: []
            },
            {
              id: "S3",
              text: "Qualidade percebida da água?",
              type: "single_choice",
              options: ["Excelente", "Boa", "Regular", "Ruim"],
              skipRules: []
            }
          ];

          stmt.run("form_censo", "Censo Sócio-Econômico do Sertão", 2, "published", JSON.stringify(questions1));
          stmt.run("form_saneamento", "Pesquisa Saneamento Interiorano", 1, "published", JSON.stringify(questions2));
          stmt.finalize();
        }
      });

      // Seed Interviews if empty
      db.get("SELECT COUNT(*) as count FROM interviews", (err, row) => {
        if (err) return reject(err);
        if (row.count === 0) {
          jsonLogger.info('Seeding interviews table...');
          const stmt = db.prepare(`INSERT INTO interviews 
            (id, form_id, form_version, researcher_id, data_json, latitude, longitude, audio_url, device_id, created_at) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

          // Petrolina, Juazeiro, Sobral, Canudos coordinates (realistic interior of Northeast Brazil)
          // Ana (researcher_1), Bruno (researcher_2), Carla (researcher_3), Daniel (researcher_4)
          
          stmt.run(
            "int_001", "form_censo", 2, "researcher_1",
            JSON.stringify({ Q1: "18 a 35 anos", Q2: "Sim", Q3: "Rede pública", Q4: "Falta de pavimentação nas ruas", Q5: "audio_001.mp3" }),
            -9.3833, -40.5000, "audio_001.mp3", "collect:7j0qiz3jPzk", "2026-06-01T10:30:00Z"
          );

          stmt.run(
            "int_002", "form_censo", 2, "researcher_1",
            JSON.stringify({ Q1: "36 a 60 anos", Q2: "Não", Q4: "Acesso à saúde é muito demorado", Q5: "audio_002.mp3" }),
            -9.4122, -40.5134, "audio_002.mp3", "collect:7j0qiz3jPzk", "2026-06-02T14:15:00Z"
          );

          stmt.run(
            "int_003", "form_censo", 2, "researcher_2",
            JSON.stringify({ Q1: "Mais de 60 anos", Q2: "Sim", Q3: "Painel Solar", Q4: "Segurança no período da noite", Q5: "audio_003.mp3" }),
            -3.6888, -40.3498, "audio_003.mp3", "collect:8x1qiz3jAab", "2026-06-02T11:00:00Z"
          );

          stmt.run(
            "int_004", "form_saneamento", 1, "researcher_3",
            JSON.stringify({ S1: "Não", S2: "Caminhão pipa", S3: "Regular" }),
            -9.8970, -38.6941, "audio_004.mp3", "collect:1k3qiz3jLop", "2026-05-30T16:45:00Z"
          );

          stmt.run(
            "int_005", "form_saneamento", 1, "researcher_4",
            JSON.stringify({ S1: "Sim", S3: "Excelente" }),
            -8.8123, -38.5678, "audio_005.mp3", "collect:9j2qiz3jXyz", "2026-06-01T09:20:00Z"
          );

          stmt.finalize();
        }
      });

      // Seed Custom Roles if empty
      db.get("SELECT COUNT(*) as count FROM custom_roles", (err, row) => {
        if (err) return reject(err);
        if (row.count === 0) {
          jsonLogger.info('Seeding custom roles table...');
          const stmt = db.prepare("INSERT INTO custom_roles (id, name, permissions_json) VALUES (?, ?, ?)");
          
          stmt.run("role_dev", "Suporte Técnico", JSON.stringify(["all"]));
          stmt.run("role_admin", "Administrador", JSON.stringify(["all"]));
          stmt.run("role_coord", "Coordenador", JSON.stringify(["view_projects", "view_map", "manage_forms", "export_data", "delete_data", "manage_users", "assign_routes"]));
          stmt.run("role_super", "Supervisor", JSON.stringify(["view_projects", "view_map", "export_data"]));
          stmt.run("role_researcher", "Pesquisador", JSON.stringify(["submit_data", "view_own_data"]));
          
          stmt.finalize();
        }
      });

      // Seed Security Logs if empty
      db.get("SELECT COUNT(*) as count FROM security_logs", (err, row) => {
        if (err) return reject(err);
        if (row.count === 0) {
          jsonLogger.info('Seeding security logs table...');
          const stmt = db.prepare("INSERT INTO security_logs (id, type, severity, command_requested, user_role) VALUES (?, ?, ?, ?, ?)");
          
          stmt.run("log_001", "COMMAND_EXECUTION", "LOW", "show version", "DEV");
          stmt.run("log_002", "DESTRUCTIVE_COMMAND_BLOCKED", "CRITICAL", "reboot", "Coordinator");
          stmt.run("log_003", "DESTRUCTIVE_COMMAND_BLOCKED", "HIGH", "/interface disable ether1", "Admin");
          stmt.run("log_004", "UNAUTHORIZED_ACCESS", "MEDIUM", "view financials", "Researcher");
          
          stmt.finalize();
        }
        
        // Seed Routes if empty
        db.get("SELECT COUNT(*) as count FROM routes", (err, row) => {
          if (err) return reject(err);
          if (row.count === 0) {
            jsonLogger.info('Seeding routes table...');
            const stmt = db.prepare("INSERT INTO routes (id, researcher_id, form_id, city) VALUES (?, ?, ?, ?)");
            
            stmt.run("route_1", "researcher_1", "form_censo", "Petrolina");
            stmt.run("route_2", "researcher_2", "form_censo", "Juazeiro");
            stmt.run("route_3", "researcher_3", "form_saneamento", "Sobral");
            stmt.run("route_4", "researcher_4", "form_saneamento", "Canudos");
            
            stmt.finalize();
          }
          resolve();
        });
      });
    });
  });
}

module.exports = {
  db,
  initDb
};
