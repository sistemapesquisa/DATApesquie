const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { db } = require('../infrastructure/db/database');
const { checkPermission, PERMISSIONS, ROLES } = require('../core/rules/rbac');
const { saveForm } = require('../orchestration/formFlow');
const { evaluateCommand } = require('../orchestration/commandGuard');
const { uploadAudioMock } = require('../services/audioStorage');
const { convertToXForm } = require('../core/rules/xformSerializer');
const jsonLogger = require('../infrastructure/logger/jsonLogger');

// Configure multer to save ODK file submissions in public audio-vault
const uploadDir = path.join(__dirname, 'public', 'audio-vault');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  }
});

const upload = multer({ storage });


// Middleware to mock user parsing from headers
function authenticate(req, res, next) {
  const role = req.headers['x-user-role'];
  const userId = req.headers['x-user-id'] || 'anonymous';
  
  req.user = { id: userId, role: role || ROLES.RESEARCHER };
  next();
}

router.use(authenticate);

// --- AUTHENTICATION ---
router.post('/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'E-mail e senha são obrigatórios' });
  }

  db.get('SELECT id, name, email, role, status FROM users WHERE email = ? AND password = ?', [email, password], (err, user) => {
    if (err) {
      jsonLogger.error('Login error', { error: err.message });
      return res.status(500).json({ error: 'Erro interno no banco de dados' });
    }
    if (!user) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }
    if (user.status === 'deleted') {
      return res.status(403).json({ error: 'Conta de usuário inativa/excluída' });
    }
    res.json({ success: true, user });
  });
});

// --- USERS MANAGEMENT (Coordinator / Admin / DEV) ---
router.get('/users', (req, res) => {
  // To load researcher list, coordinate field map
  db.all('SELECT id, name, email, role, status, created_at FROM users', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

router.post('/users', (req, res) => {
  const { name, email, role, password } = req.body;
  
  // Enforce permissions (Coordinator or Admin or DEV)
  const isCoordinator = checkPermission(req.user.role, PERMISSIONS.MANAGE_RESEARCHERS);
  const isAdmin = checkPermission(req.user.role, PERMISSIONS.MANAGE_COORDINATORS);
  
  if (!isCoordinator && !isAdmin) {
    return res.status(403).json({ error: 'Acesso negado: permissões insuficientes.' });
  }

  if (!name || !email || !role || !password) {
    return res.status(400).json({ error: 'Todos os campos são obrigatórios' });
  }

  const userId = 'user_' + crypto.randomBytes(6).toString('hex');
  db.run(
    'INSERT INTO users (id, name, email, role, status, password) VALUES (?, ?, ?, ?, ?, ?)',
    [userId, name, email, role, 'active', password],
    (err) => {
      if (err) {
        if (err.message.includes('UNIQUE')) {
          return res.status(400).json({ error: 'E-mail já cadastrado.' });
        }
        return res.status(500).json({ error: err.message });
      }
      jsonLogger.info(`User created: ${userId} (${role}) by ${req.user.id}`);
      res.json({ success: true, user: { id: userId, name, email, role } });
    }
  );
});

router.delete('/users/:id', (req, res) => {
  const userId = req.params.id;

  const isCoordinator = checkPermission(req.user.role, PERMISSIONS.MANAGE_RESEARCHERS);
  const isAdmin = checkPermission(req.user.role, PERMISSIONS.MANAGE_COORDINATORS);
  
  if (!isCoordinator && !isAdmin) {
    return res.status(403).json({ error: 'Acesso negado: permissões insuficientes.' });
  }

  // Soft delete researchers
  db.run("UPDATE users SET status = 'deleted' WHERE id = ?", [userId], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    jsonLogger.info(`User deleted: ${userId} by ${req.user.id}`);
    res.json({ success: true });
  });
});

// --- FORM BUILDER (Analyst / Admin / DEV) ---
router.get('/forms', (req, res) => {
  db.all('SELECT * FROM forms ORDER BY updated_at DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    
    // Parse questions json
    const forms = rows.map(r => ({
      ...r,
      questions: JSON.parse(r.questions_json)
    }));
    res.json(forms);
  });
});

router.post('/forms', async (req, res) => {
  if (!checkPermission(req.user.role, PERMISSIONS.BUILD_FORMS)) {
    return res.status(403).json({ error: 'Acesso negado: apenas Analistas ou Admins podem criar formulários.' });
  }

  try {
    const result = await saveForm(req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- INTERVIEWS SUBMISSION & MONITORING (Researcher / Supervisor / Analyst / Coordinator) ---
router.get('/interviews', (req, res) => {
  db.all('SELECT * FROM interviews ORDER BY created_at DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    
    const list = rows.map(r => ({
      ...r,
      data: JSON.parse(r.data_json)
    }));
    res.json(list);
  });
});

router.post('/interviews', async (req, res) => {
  if (!checkPermission(req.user.role, PERMISSIONS.SUBMIT_INTERVIEWS)) {
    return res.status(403).json({ error: 'Acesso negado: pesquisadores freelancer apenas podem enviar entrevistas.' });
  }

  const { formId, formVersion, data, latitude, longitude, audioFileName } = req.body;
  if (!formId || !formVersion || !data) {
    return res.status(400).json({ error: 'Campos obrigatórios ausentes.' });
  }

  const interviewId = 'int_' + crypto.randomBytes(6).toString('hex');
  let audioUrl = null;

  // Handle mock audio upload if applicable
  if (audioFileName) {
    const uploadRes = await uploadAudioMock(interviewId, audioFileName);
    if (uploadRes.success) {
      audioUrl = uploadRes.audioUrl;
    } else {
      // Return details of fallback
      jsonLogger.warn(`Audio upload failed for ${interviewId}, continuing submission with empty recording file.`);
    }
  }

  const qJson = JSON.stringify(data);
  const now = new Date().toISOString();

  db.run(
    `INSERT INTO interviews (id, form_id, form_version, researcher_id, data_json, latitude, longitude, audio_url, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [interviewId, formId, parseInt(formVersion), req.user.id, qJson, parseFloat(latitude) || null, parseFloat(longitude) || null, audioUrl, 'pending', now],
    (err) => {
      if (err) {
        jsonLogger.error('Failed to save interview response', { error: err.message });
        return res.status(500).json({ error: 'Falha ao salvar respostas no banco.' });
      }
      jsonLogger.info(`Saved interview [${interviewId}] for form [${formId}] V${formVersion} submitted by [${req.user.id}]`);
      res.json({ success: true, interviewId, audioUrl });
    }
  );
});

// Update interview status (Approve/Reject)
router.put('/interviews/:id/status', (req, res) => {
  const interviewId = req.params.id;
  const { status, notes } = req.body; // 'approved' or 'rejected'

  const canApprovePayments = checkPermission(req.user.role, PERMISSIONS.APPROVE_PAYMENT);
  const canAuditAudio = checkPermission(req.user.role, PERMISSIONS.AUDIT_INTERVIEW_AUDIO);

  if (!canApprovePayments && !canAuditAudio) {
    return res.status(403).json({ error: 'Acesso negado: perfil sem direitos de auditoria ou aprovação.' });
  }

  if (!['approved', 'rejected', 'pending'].includes(status)) {
    return res.status(400).json({ error: 'Status de avaliação inválido.' });
  }

  db.run(
    'UPDATE interviews SET status = ?, approved_by = ?, notes = ? WHERE id = ?',
    [status, req.user.id, notes || '', interviewId],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      jsonLogger.info(`Interview [${interviewId}] status changed to [${status}] by auditor [${req.user.id}]`);
      res.json({ success: true });
    }
  );
});

// --- READ-ONLY NETWORK COMMAND CONSOLE ---
router.post('/network/command', async (req, res) => {
  const { command } = req.body;
  
  try {
    const result = await evaluateCommand(command, req.user.role);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- SECURITY LOGS (DEV View) ---
router.get('/logs', (req, res) => {
  if (!checkPermission(req.user.role, PERMISSIONS.VIEW_LOGS)) {
    return res.status(403).json({ error: 'Acesso negado: apenas o perfil DEV de suporte técnico pode ler logs.' });
  }

  db.all('SELECT * FROM security_logs ORDER BY timestamp DESC LIMIT 100', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// --- ODK COLLECT OPENROSA API INTEGRATIONS ---

// 1. ODK Form List Endpoint (OpenRosa Compliant)
router.get(['/formList', '/odk/formList'], (req, res) => {
  db.all('SELECT id, title, version FROM forms WHERE status = "published"', [], (err, rows) => {
    if (err) return res.status(500).send(err.message);
    
    res.set({
      'Content-Type': 'text/xml; charset=utf-8',
      'X-OpenRosa-Version': '1.0'
    });
    
    const host = req.get('host');
    const protocol = req.protocol;
    
    let xml = `<?xml version='1.0' encoding='UTF-8' ?>\n`;
    xml += `<xforms xmlns="http://openrosa.org/xforms/xformsList">\n`;
    rows.forEach(form => {
      xml += `  <xform>\n`;
      xml += `    <formID>${form.id}</formID>\n`;
      xml += `    <jr:formID>${form.id}</jr:formID>\n`; // jr namespace compatibility
      xml += `    <name>${form.title}</name>\n`;
      xml += `    <version>${form.version}</version>\n`;
      xml += `    <hash>md5:${crypto.createHash('md5').update(form.id + form.version).digest('hex')}</hash>\n`;
      xml += `    <downloadUrl>${protocol}://${host}/api/odk/forms/${form.id}</downloadUrl>\n`;
      xml += `  </xform>\n`;
    });
    xml += `</xforms>`;
    res.send(xml);
  });
});

// 2. ODK Form Download Endpoint
router.get('/odk/forms/:id', (req, res) => {
  const formId = req.params.id;
  db.get('SELECT * FROM forms WHERE id = ?', [formId], (err, row) => {
    if (err) return res.status(500).send(err.message);
    if (!row) return res.status(404).send('Formulário não encontrado.');

    const form = {
      ...row,
      questions: JSON.parse(row.questions_json)
    };

    res.set({
      'Content-Type': 'text/xml; charset=utf-8',
      'X-OpenRosa-Version': '1.0'
    });

    const xml = convertToXForm(form);
    res.send(xml);
  });
});

// 3. ODK Submission Endpoint (Multipart XML + Audio parser)
router.post(['/submission', '/odk/submission'], upload.any(), (req, res) => {
  const files = req.files || [];
  const xmlFile = files.find(f => f.fieldname === 'xml_submission_file');
  
  if (!xmlFile) {
    return res.status(400).send('xml_submission_file ausente.');
  }

  const xmlPath = xmlFile.path;
  const xmlText = fs.readFileSync(xmlPath, 'utf8');

  // Delete temp XML file
  fs.unlinkSync(xmlPath);

  // Parse questions answer from XML
  const parsedAnswers = {};
  const cleanedText = xmlText.replace(/<jr:meta>|<\/jr:meta>/g, '');
  const tagsRegex = /<([a-zA-Z0-9_]+)>([^<]*)<\/([a-zA-Z0-9_]+)>/g;
  let tagMatch;
  while ((tagMatch = tagsRegex.exec(cleanedText)) !== null) {
    const tagName = tagMatch[1];
    const tagValue = tagMatch[2];
    parsedAnswers[tagName] = tagValue;
  }

  // Parse form ID and version
  const rootMatch = xmlText.match(/<data\s+id="([^"]+)"\s+version="([^"]+)"/i) || 
                    xmlText.match(/<([a-zA-Z0-9_-]+)\s+id="([^"]+)"\s+version="([^"]+)"/i);
  let formId = '';
  let formVersion = 1;
  if (rootMatch) {
    if (rootMatch.length === 3) {
      formId = rootMatch[1];
      formVersion = parseInt(rootMatch[2]);
    } else if (rootMatch.length === 4) {
      formId = rootMatch[2];
      formVersion = parseInt(rootMatch[3]);
    }
  }

  // Check file attachment
  let audioUrl = null;
  const audioFile = files.find(f => f.mimetype.startsWith('audio/'));
  if (audioFile) {
    audioUrl = `/audio-vault/${audioFile.filename}`;
    jsonLogger.info(`ODK Collect uploaded audio attachment: ${audioFile.filename}`);
  }

  // Default coordinate set (Sertão Bahia location + randomized spreading)
  let latitude = -9.3833 + (Math.random() - 0.5) * 0.05;
  let longitude = -40.5000 + (Math.random() - 0.5) * 0.05;

  const geopointMatch = xmlText.match(/<[a-zA-Z_]+gps[^>]*>([^<]+)<\/[a-zA-Z_]+gps>/i) || 
                        xmlText.match(/<[a-zA-Z_]+geopoint[^>]*>([^<]+)<\/[a-zA-Z_]+geopoint>/i);
  if (geopointMatch) {
    const parts = geopointMatch[1].trim().split(/\s+/);
    if (parts.length >= 2) {
      latitude = parseFloat(parts[0]);
      longitude = parseFloat(parts[1]);
    }
  }

  const interviewId = 'odk_' + crypto.randomBytes(6).toString('hex');
  const now = new Date().toISOString();
  // Read submission collector ID
  const researcherId = req.headers['x-user-id'] || 'researcher_1';

  db.run(
    `INSERT INTO interviews (id, form_id, form_version, researcher_id, data_json, latitude, longitude, audio_url, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [interviewId, formId, formVersion, researcherId, JSON.stringify(parsedAnswers), latitude, longitude, audioUrl, 'pending', now],
    (err) => {
      if (err) {
        jsonLogger.error('ODK DB Save failed', { error: err.message });
        return res.status(500).send('Erro interno ao salvar ODK no banco.');
      }
      
      jsonLogger.info(`ODK submission successfully processed: ${interviewId} (Form: ${formId} V${formVersion})`);
      
      res.set({
        'Content-Type': 'text/xml; charset=utf-8',
        'X-OpenRosa-Version': '1.0'
      });
      res.status(201).send(`<?xml version='1.0' encoding='UTF-8' ?>
<OpenRosaResponse xmlns="http://openrosa.org/http/response">
  <message jr:value="Sucesso">Entrevista salva com sucesso na plataforma Antigravity.</message>
</OpenRosaResponse>`);
    }
  );
});

module.exports = router;

