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
const xlsx = require('xlsx');

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


function parseDigest(header) {
  const dict = {};
  const re = /(\w+)=(?:"([^"]+)"|([^,]+))/g;
  let match;
  while ((match = re.exec(header.substring(7))) !== null) {
    dict[match[1]] = match[2] || match[3];
  }
  return dict;
}

const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'datapesquise_super_secret';

// --- AUTHENTICATION ---
router.post('/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Usuário e senha são obrigatórios' });
  }

  db.get('SELECT id, name, email, role, status FROM users WHERE (id = ? OR name = ? OR email = ?) AND password = ?', [username, username, username, password], (err, user) => {
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
    
    // Generate JWT
    const token = jwt.sign(
      { id: user.id, role: user.role, name: user.name },
      JWT_SECRET,
      { expiresIn: '12h' }
    );
    
    res.json({ success: true, user, token });
  });
});

// Middleware for authentication
function authenticate(req, res, next) {
  const isOdkEndpoint = req.path.includes('/formList') || req.path.includes('/odk/') || req.path.includes('/submission') || req.path === '/';
  
  if (isOdkEndpoint) {
    res.set('X-OpenRosa-Version', '1.0');
    // Allow CORS for ODK
    res.set('Access-Control-Allow-Origin', '*');
  }

  const authHeader = req.headers.authorization;
  if (isOdkEndpoint) console.log(`ODK Request: ${req.method} ${req.path} | Auth: ${authHeader}`);
  
  // 1. ODK Collect Digest Authentication
  if (authHeader && authHeader.startsWith('Digest ')) {
    const digest = parseDigest(authHeader);
    const email = digest.username;
    
    db.get('SELECT id, name, email, role, status, password FROM users WHERE email = ? OR name = ?', [email, email], (err, user) => {
      if (!err && user && user.status !== 'deleted') {
        const HA1 = crypto.createHash('md5').update(`${email}:${digest.realm}:${user.password}`).digest('hex');
        const HA2 = crypto.createHash('md5').update(`${req.method}:${digest.uri}`).digest('hex');
        const expectedResponse = crypto.createHash('md5').update(`${HA1}:${digest.nonce}:${digest.nc}:${digest.cnonce}:${digest.qop}:${HA2}`).digest('hex');
        
        if (digest.response === expectedResponse) {
          req.user = user;
          req.headers['x-user-id'] = user.id;
          return next();
        }
      }
      if (isOdkEndpoint) res.set('X-OpenRosa-Version', '1.0');
      res.set('WWW-Authenticate', `Digest realm="DATApesquise ODK", qop="auth", nonce="${crypto.randomBytes(16).toString('hex')}", opaque="odk"`);
      return res.status(401).send('Credenciais inválidas.');
    });
    return;
  }

  // 2. ODK Collect Basic Authentication
  if (authHeader && authHeader.startsWith('Basic ')) {
    const credentials = Buffer.from(authHeader.split(' ')[1], 'base64').toString('utf8');
    const [email, password] = credentials.split(':');
    
    db.get('SELECT id, name, email, role, status FROM users WHERE (email = ? OR name = ?) AND password = ?', [email, email, password], (err, user) => {
      if (!err && user && user.status !== 'deleted') {
        req.user = user;
        req.headers['x-user-id'] = user.id;
        return next();
      }
      if (isOdkEndpoint) res.set('X-OpenRosa-Version', '1.0');
      res.set('WWW-Authenticate', 'Basic realm="DATApesquise ODK"');
      return res.status(401).send('Credenciais inválidas.');
    });
    return;
  }

  // 3. Web UI Authentication (JWT Bearer Token)
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = decoded;
      return next();
    } catch (err) {
      return res.status(401).json({ error: 'Sessão expirada ou token inválido.' });
    }
  }

  // Enforce Auth for ODK endpoints if not provided
  if (isOdkEndpoint) {
    res.set('WWW-Authenticate', `Digest realm="DATApesquise ODK", qop="auth", nonce="${crypto.randomBytes(16).toString('hex')}", opaque="odk"`);
    return res.status(401).send('Autenticação necessária.');
  }

  // Reject all other unauthenticated requests
  return res.status(401).json({ error: 'Acesso não autorizado. Faça login novamente.' });
}

router.use(authenticate);

// --- OPENROSA ROOT ---
router.all('/', (req, res) => {
  res.set('X-OpenRosa-Version', '1.0');
  res.status(204).send();
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

router.put('/users/:id', (req, res) => {
  const userId = req.params.id;
  const { name, email, role, password } = req.body;

  const isCoordinator = checkPermission(req.user.role, PERMISSIONS.MANAGE_RESEARCHERS);
  const isAdmin = checkPermission(req.user.role, PERMISSIONS.MANAGE_COORDINATORS);
  
  if (!isCoordinator && !isAdmin) {
    return res.status(403).json({ error: 'Acesso negado: permissões insuficientes.' });
  }

  // If password is empty, don't update it
  let query = 'UPDATE users SET name = ?, email = ?, role = ? WHERE id = ?';
  let params = [name, email, role, userId];
  
  if (password && password.trim() !== '') {
    query = 'UPDATE users SET name = ?, email = ?, role = ?, password = ? WHERE id = ?';
    params = [name, email, role, password, userId];
  }

  db.run(query, params, (err) => {
    if (err) return res.status(500).json({ error: err.message });
    jsonLogger.info(`User updated: ${userId} by ${req.user.id}`);
    res.json({ success: true });
  });
});

// --- ROUTES MANAGEMENT (Assignments) ---
router.get('/routes', (req, res) => {
  const query = `
    SELECT r.id, r.researcher_id, r.form_id, r.city, r.created_at, 
           u.name as researcher_name, f.title as form_title
    FROM routes r
    JOIN users u ON r.researcher_id = u.id
    JOIN forms f ON r.form_id = f.id
    ORDER BY r.created_at DESC
  `;
  db.all(query, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

router.post('/routes', (req, res) => {
  const { researcher_id, form_id, city } = req.body;
  const isCoordinator = checkPermission(req.user.role, PERMISSIONS.MANAGE_RESEARCHERS);
  const isAdmin = checkPermission(req.user.role, PERMISSIONS.MANAGE_COORDINATORS);
  
  if (!isCoordinator && !isAdmin) {
    return res.status(403).json({ error: 'Acesso negado: apenas coordenadores ou admins.' });
  }

  db.get('SELECT id FROM routes WHERE researcher_id = ? AND form_id = ?', [researcher_id, form_id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (row) return res.status(400).json({ error: 'Este pesquisador já possui acesso a este projeto.' });

    const routeId = 'route_' + crypto.randomBytes(6).toString('hex');
    db.run(
      'INSERT INTO routes (id, researcher_id, form_id, city) VALUES (?, ?, ?, ?)',
      [routeId, researcher_id, form_id, city || ''],
      (err) => {
        if (err) return res.status(500).json({ error: err.message });
        jsonLogger.info(`Route assignment created: ${routeId} by ${req.user.id}`);
        res.json({ success: true, routeId });
      }
    );
  });
});

router.delete('/routes/:id', (req, res) => {
  const routeId = req.params.id;
  const isCoordinator = checkPermission(req.user.role, PERMISSIONS.MANAGE_RESEARCHERS);
  const isAdmin = checkPermission(req.user.role, PERMISSIONS.MANAGE_COORDINATORS);
  
  if (!isCoordinator && !isAdmin) {
    return res.status(403).json({ error: 'Acesso negado: permissões insuficientes.' });
  }

  db.run("DELETE FROM routes WHERE id = ?", [routeId], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    jsonLogger.info(`Route assignment deleted: ${routeId} by ${req.user.id}`);
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
      questions: JSON.parse(r.questions_json),
      settings: r.settings_json ? JSON.parse(r.settings_json) : {}
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

router.post('/forms/upload-xlsform', upload.single('file'), async (req, res) => {
  if (!checkPermission(req.user.role, PERMISSIONS.BUILD_FORMS)) {
    return res.status(403).json({ error: 'Acesso negado.' });
  }

  try {
    if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
    
    const workbook = xlsx.readFile(req.file.path);
    const surveySheet = workbook.Sheets['survey'];
    const choicesSheet = workbook.Sheets['choices'];
    const settingsSheet = workbook.Sheets['settings'];
    
    if (!surveySheet) return res.status(400).json({ error: 'Aba "survey" não encontrada na planilha.' });
    
    const surveyData = xlsx.utils.sheet_to_json(surveySheet);
    const choicesData = choicesSheet ? xlsx.utils.sheet_to_json(choicesSheet) : [];
    
    const questions = [];
    surveyData.forEach((row, i) => {
      const typeStr = row.type || '';
      const name = row.name || `q_${i}`;
      const label = row.label || row['label::Portuguese'] || name;
      
      let type = 'text';
      let options = [];
      
      if (typeStr.startsWith('select_one') || typeStr.startsWith('select multiple')) {
        type = typeStr.startsWith('select_one') ? 'select_one' : 'select_multiple';
        const listName = typeStr.split(' ')[1];
        options = choicesData.filter(c => c.list_name === listName).map(c => ({
          name: c.name,
          label: c.label || c['label::Portuguese'] || c.name
        }));
      } else if (typeStr === 'integer') type = 'integer';
      else if (typeStr === 'decimal') type = 'decimal';
      else if (typeStr === 'geopoint') type = 'geopoint';
      else if (typeStr === 'audio') type = 'audio';
      else if (typeStr === 'image') type = 'image';
      
      if (typeStr && typeStr !== 'begin group' && typeStr !== 'end group' && typeStr !== 'note') {
        questions.push({
          id: name,
          type: type,
          text: label,
          required: row.required === 'yes' || row.required === 'true',
          options: options,
          relevant: row.relevant || ''
        });
      }
    });

    let settings = {};
    if (settingsSheet) {
      const settingsData = xlsx.utils.sheet_to_json(settingsSheet);
      if (settingsData.length > 0) {
        if (settingsData[0].audit_location === 'yes' || settingsData[0].audit_location === 'true' || settingsData[0].audit_location === true) {
          settings.audit_location = true;
        }
        if (settingsData[0].audit_audio === 'yes' || settingsData[0].audit_audio === 'true' || settingsData[0].audit_audio === true) {
          settings.audit_audio = true;
        }
      }
    }

    const formTitle = req.file.originalname.replace('.xlsx', '').replace('.xls', '');
    const formId = 'prj_' + crypto.randomBytes(4).toString('hex');
    
    const formData = {
      id: formId,
      title: formTitle,
      status: 'draft',
      version: 1,
      questions: questions,
      settings: settings
    };

    const result = await saveForm(formData);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/forms/:id/export-xlsform', (req, res) => {
  if (!checkPermission(req.user.role, PERMISSIONS.BUILD_FORMS)) {
    return res.status(403).json({ error: 'Acesso negado.' });
  }

  db.get('SELECT * FROM forms WHERE id = ?', [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Formulário não encontrado' });

    try {
      const questions = JSON.parse(row.schema);
      const surveyData = [];
      const choicesData = [];

      questions.forEach(q => {
        let typeStr = q.type;
        if (q.type === 'select_one' || q.type === 'single_choice') {
          typeStr = `select_one list_${q.id}`;
          (q.options || []).forEach(opt => {
            choicesData.push({
              list_name: `list_${q.id}`,
              name: typeof opt === 'object' ? opt.name : opt,
              label: typeof opt === 'object' ? opt.label : opt
            });
          });
        } else if (q.type === 'select_multiple' || q.type === 'multiple_choice') {
          typeStr = `select_multiple list_${q.id}`;
          (q.options || []).forEach(opt => {
            choicesData.push({
              list_name: `list_${q.id}`,
              name: typeof opt === 'object' ? opt.name : opt,
              label: typeof opt === 'object' ? opt.label : opt
            });
          });
        } else if (q.type === 'rank') {
          typeStr = `rank list_${q.id}`;
          (q.options || []).forEach(opt => {
            choicesData.push({
              list_name: `list_${q.id}`,
              name: typeof opt === 'object' ? opt.name : opt,
              label: typeof opt === 'object' ? opt.label : opt
            });
          });
        }

        const surveyRow = {
          type: typeStr,
          name: q.id,
          label: q.text,
          required: q.required ? 'yes' : 'no'
        };

        if (q.relevant) surveyRow.relevant = q.relevant;
        if (q.constraint) surveyRow.constraint = q.constraint;
        if (q.constraint_message) surveyRow.constraint_message = q.constraint_message;
        if (q.choice_filter) surveyRow.choice_filter = q.choice_filter;
        if (q.parameters && q.parameters.calculation) surveyRow.calculation = q.parameters.calculation;
        if (q.hint) surveyRow.hint = q.hint;
        
        surveyData.push(surveyRow);
      });

      // Include settings as audit
      const settings = row.settings ? JSON.parse(row.settings) : {};
      if (settings.audit_audio) surveyData.push({ type: 'audit', name: '', label: '', parameters: 'audio' });
      if (settings.audit_location) surveyData.push({ type: 'audit', name: '', label: '', parameters: 'location' });

      const wb = xlsx.utils.book_new();
      const wsSurvey = xlsx.utils.json_to_sheet(surveyData);
      xlsx.utils.book_append_sheet(wb, wsSurvey, 'survey');
      
      if (choicesData.length > 0) {
        const wsChoices = xlsx.utils.json_to_sheet(choicesData);
        xlsx.utils.book_append_sheet(wb, wsChoices, 'choices');
      }

      const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
      res.setHeader('Content-Disposition', `attachment; filename="${row.title || 'form'}.xlsx"`);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.send(buffer);
    } catch (e) {
      res.status(500).json({ error: 'Erro ao gerar XLSForm: ' + e.message });
    }
  });
});

router.patch('/forms/:id/archive', (req, res) => {
  const formId = req.params.id;
  if (!checkPermission(req.user.role, PERMISSIONS.BUILD_FORMS)) {
    return res.status(403).json({ error: 'Acesso negado.' });
  }

  db.run('UPDATE forms SET status = ? WHERE id = ?', ['archived', formId], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    jsonLogger.info(`Form archived: ${formId} by ${req.user.id}`);
    res.json({ success: true });
  });
});

router.delete('/forms/:id', (req, res) => {
  const formId = req.params.id;
  if (!checkPermission(req.user.role, PERMISSIONS.BUILD_FORMS)) {
    return res.status(403).json({ error: 'Acesso negado.' });
  }

  db.run('DELETE FROM forms WHERE id = ?', [formId], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    jsonLogger.info(`Form deleted: ${formId} by ${req.user.id}`);
    res.json({ success: true });
  });
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

  const { formId, formVersion, data, latitude, longitude, audioFileName, deviceId } = req.body;
  if (!formId || !formVersion || !data) {
    return res.status(400).json({ error: 'Campos obrigatórios ausentes.' });
  }

  const interviewId = 'int_' + crypto.randomBytes(6).toString('hex');
  let audioUrl = null;

  // Handle mock audio upload if applicable
  if (audioFileName) {
    if (audioFileName.startsWith('http') || audioFileName.startsWith('data:')) {
      audioUrl = audioFileName;
    } else {
      const uploadRes = await uploadAudioMock(interviewId, audioFileName);
      if (uploadRes && uploadRes.success) {
        audioUrl = uploadRes.audioUrl;
      } else {
        jsonLogger.warn(`Audio upload failed for ${interviewId}, continuing submission with empty recording file.`);
      }
    }
  }

  const qJson = JSON.stringify(data);
  const now = new Date().toISOString();

  db.run(
    `INSERT INTO interviews (id, form_id, form_version, researcher_id, data_json, latitude, longitude, audio_url, device_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [interviewId, formId, parseInt(formVersion), req.user.id, qJson, parseFloat(latitude) || null, parseFloat(longitude) || null, audioUrl, deviceId || 'simulator', now],
    (err) => {
      if (err) {
        jsonLogger.error('Failed to save interview response', { error: err.message });
        return res.status(500).json({ error: 'Falha ao salvar respostas no banco.' });
      }
      jsonLogger.info(`Saved interview [${interviewId}] for form [${formId}] V${formVersion} submitted by [${req.user.id}]`);
      if (req.app.locals.broadcast) {
        req.app.locals.broadcast('new_submission', {
          id: interviewId, form_id: formId, researcher_id: req.user.id,
          latitude, longitude, created_at: now
        });
      }
      res.json({ success: true, interviewId, audioUrl });
    }
  );
});

// Clear Test Interviews
router.delete('/interviews/clear', (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'Nenhum ID fornecido.' });
  }

  // Permission check
  const isCoordinator = checkPermission(req.user.role, PERMISSIONS.MANAGE_FORMS);
  const isAdmin = checkPermission(req.user.role, PERMISSIONS.MANAGE_COORDINATORS);
  
  if (!isCoordinator && !isAdmin) {
    return res.status(403).json({ error: 'Acesso negado: permissões insuficientes.' });
  }

  const placeholders = ids.map(() => '?').join(',');
  db.run(`DELETE FROM interviews WHERE id IN (${placeholders})`, ids, (err) => {
    if (err) return res.status(500).json({ error: err.message });
    jsonLogger.info(`Deleted ${ids.length} test interviews by ${req.user.id}`);
    res.json({ success: true, deletedCount: ids.length });
  });
});

// --- CUSTOM ROLES MANAGEMENT ---
router.get('/roles', (req, res) => {
  db.all('SELECT * FROM custom_roles', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows.map(r => ({ ...r, permissions: JSON.parse(r.permissions_json) })));
  });
});

router.post('/roles', (req, res) => {
  const { name, permissions } = req.body;
  const isAdmin = checkPermission(req.user.role, PERMISSIONS.MANAGE_COORDINATORS);
  if (!isAdmin) return res.status(403).json({ error: 'Acesso negado: apenas Administradores.' });
  
  if (!name || !Array.isArray(permissions)) return res.status(400).json({ error: 'Nome e permissões obrigatórios.' });

  const roleId = 'role_' + crypto.randomBytes(4).toString('hex');
  db.run(
    'INSERT INTO custom_roles (id, name, permissions_json) VALUES (?, ?, ?)',
    [roleId, name, JSON.stringify(permissions)],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      jsonLogger.info(`Custom role created: ${name}`);
      res.json({ success: true, role: { id: roleId, name, permissions } });
    }
  );
});

router.delete('/roles/:id', (req, res) => {
  const roleId = req.params.id;
  const isAdmin = checkPermission(req.user.role, PERMISSIONS.MANAGE_COORDINATORS);
  if (!isAdmin) return res.status(403).json({ error: 'Acesso negado: apenas Administradores.' });
  
  // Prevent deleting default critical roles if needed
  if (['role_dev', 'role_admin'].includes(roleId)) return res.status(403).json({ error: 'Papéis primários não podem ser deletados.' });

  db.run('DELETE FROM custom_roles WHERE id = ?', [roleId], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
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
  const researcherId = req.user.id;
  
  let query = 'SELECT id, title, version FROM forms WHERE status = "published"';
  let params = [];
  
  if (req.user.role === ROLES.RESEARCHER) {
    query = `
      SELECT f.id, f.title, f.version 
      FROM forms f
      JOIN routes r ON f.id = r.form_id
      WHERE f.status = "published" AND r.researcher_id = ?
    `;
    params = [researcherId];
  }

  db.all(query, params, (err, rows) => {
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
      questions: JSON.parse(row.questions_json),
      settings: row.settings_json ? JSON.parse(row.settings_json) : {}
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
router.head(['/submission', '/odk/submission'], (req, res) => {
  res.set('X-OpenRosa-Version', '1.0');
  res.status(204).send();
});

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

  let foundGps = false;
  for (const key in parsedAnswers) {
    const val = parsedAnswers[key].trim();
    // Match ODK geopoint format: "lat lon alt acc"
    // e.g., "-3.119027 -60.021731 0.0 5.0"
    const coordsMatch = val.match(/^(-?\d+\.\d{3,})\s+(-?\d+\.\d{3,})(\s+-?\d+(\.\d+)?\s+\d+(\.\d+)?)?$/);
    if (coordsMatch) {
      latitude = parseFloat(coordsMatch[1]);
      longitude = parseFloat(coordsMatch[2]);
      foundGps = true;
      break;
    }
  }

  // Se a tag contiver explícitamente gps ou geopoint e não bateu no regex (fallback antigo)
  if (!foundGps) {
    const geopointMatch = xmlText.match(/<[a-zA-Z0-9_]+(gps|geopoint)[^>]*>([^<]+)<\/[a-zA-Z0-9_]+(gps|geopoint)>/i);
    if (geopointMatch) {
      const parts = geopointMatch[2].trim().split(/\s+/);
      if (parts.length >= 2) {
        latitude = parseFloat(parts[0]);
        longitude = parseFloat(parts[1]);
      }
    }
  }

  const interviewId = 'odk_' + crypto.randomBytes(6).toString('hex');
  const now = new Date().toISOString();
  // Read submission collector ID
  const researcherId = req.headers['x-user-id'] || 'researcher_1';
  const deviceId = req.query.deviceID || 'unknown';

  db.run(
    `INSERT INTO interviews (id, form_id, form_version, researcher_id, data_json, latitude, longitude, audio_url, device_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [interviewId, formId, formVersion, researcherId, JSON.stringify(parsedAnswers), latitude, longitude, audioUrl, deviceId, now],
    (err) => {
      if (err) {
        jsonLogger.error('ODK DB Save failed', { error: err.message });
        return res.status(500).send('Erro interno ao salvar ODK no banco.');
      }
      
      jsonLogger.info(`ODK submission successfully processed: ${interviewId} (Form: ${formId} V${formVersion} Device: ${deviceId})`);
      
      if (req.app.locals.broadcast) {
        req.app.locals.broadcast('new_submission', {
          id: interviewId, form_id: formId, researcher_id: researcherId,
          latitude, longitude, created_at: now
        });
      }
      
      res.set({
        'Content-Type': 'text/xml; charset=utf-8',
        'X-OpenRosa-Version': '1.0'
      });
      res.status(201).send(`<?xml version='1.0' encoding='UTF-8' ?>
<OpenRosaResponse xmlns="http://openrosa.org/http/response">
  <message jr:value="Sucesso">Entrevista salva com sucesso na plataforma DATApesquise.</message>
</OpenRosaResponse>`);
    }
  );
});
// --- DATA EXPORT ---
router.get('/export/:formId', (req, res) => {
  const formId = req.params.formId;
  const isAdminOrAnalyst = checkPermission(req.user.role, PERMISSIONS.VIEW_REPORTS);
  if (!isAdminOrAnalyst) return res.status(403).json({ error: 'Acesso negado: apenas Administradores e Analistas podem exportar dados.' });

  db.get('SELECT * FROM forms WHERE id = ?', [formId], (err, formRow) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!formRow) return res.status(404).json({ error: 'Formulário não encontrado' });

    let questions = [];
    try {
      questions = JSON.parse(formRow.questions_json) || [];
    } catch {}

    db.all('SELECT * FROM interviews WHERE form_id = ? ORDER BY created_at DESC', [formId], (err, interviews) => {
      if (err) return res.status(500).json({ error: err.message });

      const headers = ['ID_Entrevista', 'Data_Hora', 'Pesquisador', 'Dispositivo', 'Latitude', 'Longitude'];
      questions.forEach(q => headers.push(q.text));

      const rows = [];
      rows.push(headers.map(h => `"${(h || '').toString().replace(/"/g, '""')}"`).join(','));

      interviews.forEach(int => {
        const row = [
          int.id,
          int.created_at,
          int.researcher_id,
          int.device_id || 'N/A',
          int.latitude || '',
          int.longitude || ''
        ];
        
        let ans = {};
        try { ans = JSON.parse(int.data_json) || {}; } catch {}

        questions.forEach(q => {
          row.push(ans[q.id] || '');
        });

        rows.push(row.map(cell => `"${(cell || '').toString().replace(/"/g, '""')}"`).join(','));
      });

      const csvContent = rows.join('\n');
      res.set({
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="export_${formId}.csv"`
      });
      res.send(Buffer.from('\uFEFF' + csvContent, 'utf-8'));
    });
  });
});
// --- AI QUALITY ANALYTICS ---
router.get('/analytics/quality/:formId', (req, res) => {
  const formId = req.params.formId;
  const isAuthorized = checkPermission(req.user.role, PERMISSIONS.VIEW_REPORTS);
  if (!isAuthorized) return res.status(403).json({ error: 'Acesso negado.' });

  db.all('SELECT * FROM interviews WHERE form_id = ?', [formId], (err, interviews) => {
    if (err) return res.status(500).json({ error: err.message });
    
    if (!interviews || interviews.length === 0) {
      return res.json({ results: [] });
    }

    const results = [];
    const researcherCounts = {};
    const noGpsCounts = {};
    const noAudioCounts = {};
    
    interviews.forEach(int => {
      const rid = int.researcher_id;
      researcherCounts[rid] = (researcherCounts[rid] || 0) + 1;
      
      if (!int.latitude || !int.longitude) {
        noGpsCounts[rid] = (noGpsCounts[rid] || 0) + 1;
      }
      if (!int.audio_url) {
        noAudioCounts[rid] = (noAudioCounts[rid] || 0) + 1;
      }
    });

    for (const rid in noGpsCounts) {
      if (noGpsCounts[rid] > 0 && noGpsCounts[rid] === researcherCounts[rid]) {
        results.push({ type: 'danger', icon: 'fa-solid fa-location-dot', title: 'Alerta de GPS Crítico', message: `O pesquisador <strong>${rid}</strong> enviou ${researcherCounts[rid]} coletas sem registrar nenhuma localização.` });
      } else if (noGpsCounts[rid] > 0) {
        results.push({ type: 'warning', icon: 'fa-solid fa-location-crosshairs', title: 'GPS Incompleto', message: `O pesquisador <strong>${rid}</strong> enviou ${noGpsCounts[rid]} coletas com falha ou sem sinal de localização.` });
      }
    }
    
    for (const rid in researcherCounts) {
      if (researcherCounts[rid] > 100) {
        results.push({ type: 'danger', icon: 'fa-solid fa-triangle-exclamation', title: 'Volume Altamente Suspeito', message: `O pesquisador <strong>${rid}</strong> enviou impressionantes ${researcherCounts[rid]} coletas neste projeto. Verifique risco de fraude automatizada.` });
      } else if (researcherCounts[rid] > 40) {
        results.push({ type: 'warning', icon: 'fa-solid fa-gauge-high', title: 'Alto Volume', message: `O pesquisador <strong>${rid}</strong> enviou ${researcherCounts[rid]} coletas. Verifique se condiz com o tempo médio.` });
      }
    }

    if (results.length === 0) {
      results.push({ type: 'ok', icon: 'fa-solid fa-shield-check', title: 'Dados Consistentes', message: 'Nenhuma anomalia de telemetria ou GPS foi detectada no lote atual.' });
    }

    res.json({ results });
  });
});

module.exports = router;

