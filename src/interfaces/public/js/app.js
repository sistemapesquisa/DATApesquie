/* =========================================================
   DATApesquise — Plataforma de Pesquisa de Campo
   app.js — Core Application Logic
   ========================================================= */

// ===================== STATE =====================
const state = {
  activeRole: 'Coordinator',
  activeUserId: 'coord_user',
  forms: [],
  interviews: [],
  users: [],
  logs: [],
  activeForm: { id: '', title: '', status: 'draft', version: 1, questions: [] },
  simSelectedFormId: '',
  simActiveForm: null,
  simAnswers: {},
  simCurrentQuestionIdx: 0,
  simOfflineQueue: [],
  simIsOnline: true,
  simAudioFile: null,
  simIsRecording: false,
  map: null,
  mapMarkers: [],
  statusChart: null
};

const MOCK_USER_IDS = {
  DEV: 'dev_user', Admin: 'admin_user', Analyst: 'analyst_user',
  Coordinator: 'coord_user', Supervisor: 'super_user', Researcher: 'researcher_1'
};
const MOCK_USER_NAMES = {
  DEV: 'Gustavo Dev', Admin: 'Clara Admin', Analyst: 'Felipe Analista',
  Coordinator: 'Helena Coordenadora', Supervisor: 'Marcos Supervisor', Researcher: 'Ana Pesquisadora'
};
const ROLE_LABELS = {
  DEV: 'Suporte Técnico', Admin: 'Administrador', Analyst: 'Analista',
  Coordinator: 'Coordenador', Supervisor: 'Supervisor', Researcher: 'Pesquisador'
};
const RESEARCHER_COLORS = {
  researcher_1: '#ef4444', researcher_2: '#7c3aed',
  researcher_3: '#059669', researcher_4: '#0284c7'
};
const STATUS_LABELS = { approved: 'Aprovada', pending: 'Pendente', rejected: 'Rejeitada' };

// ===================== OFFLINE DETECTION =====================
const IS_OFFLINE_PREVIEW = window.location.protocol === 'file:' || window.location.hostname === '';

// ===================== VIRTUAL DATABASE =====================
const virtualDb = {
  _getStore(key) {
    try { return JSON.parse(localStorage.getItem(key)) || []; } catch { return []; }
  },
  _setStore(key, data) { localStorage.setItem(key, JSON.stringify(data)); },
  ensureSeeded() {
    if (this._getStore('vdb_users').length === 0) {
      this._setStore('vdb_users', [
        { id:'dev_user', name:'Gustavo Dev', email:'dev@corp.com', role:'DEV', status:'active', created_at:new Date().toISOString() },
        { id:'admin_user', name:'Clara Admin', email:'admin@cliente.com', role:'Admin', status:'active', created_at:new Date().toISOString() },
        { id:'analyst_user', name:'Felipe Analista', email:'analyst@cliente.com', role:'Analyst', status:'active', created_at:new Date().toISOString() },
        { id:'coord_user', name:'Helena Coordenadora', email:'coord@cliente.com', role:'Coordinator', status:'active', created_at:new Date().toISOString() },
        { id:'super_user', name:'Marcos Supervisor', email:'super@cliente.com', role:'Supervisor', status:'active', created_at:new Date().toISOString() },
        { id:'researcher_1', name:'Ana Pesquisadora', email:'ana@freelancer.com', role:'Researcher', status:'active', created_at:new Date().toISOString() },
        { id:'researcher_2', name:'Bruno Pesquisador', email:'bruno@freelancer.com', role:'Researcher', status:'active', created_at:new Date().toISOString() },
        { id:'researcher_3', name:'Carla Pesquisadora', email:'carla@freelancer.com', role:'Researcher', status:'active', created_at:new Date().toISOString() },
        { id:'researcher_4', name:'Daniel Pesquisador', email:'daniel@freelancer.com', role:'Researcher', status:'active', created_at:new Date().toISOString() }
      ]);
    }
    if (this._getStore('vdb_forms').length === 0) {
      this._setStore('vdb_forms', [
        { id:'form_censo', title:'Censo Sócio-Econômico do Sertão', version:2, status:'published', questions:[
          { id:'Q1', text:'Qual a sua faixa etária?', type:'single_choice', options:['Menos de 18 anos','18 a 35 anos','36 a 60 anos','Mais de 60 anos'], skipRules:[] },
          { id:'Q2', text:'Você possui acesso à energia elétrica estável?', type:'single_choice', options:['Sim','Não'], skipRules:[{conditionValue:'Não',targetQuestionId:'Q4'}] },
          { id:'Q3', text:'Qual a principal fonte de energia usada em sua casa?', type:'single_choice', options:['Rede pública','Painel Solar','Gerador próprio','Outros'], skipRules:[] },
          { id:'Q4', text:'Descreva brevemente os principais desafios na sua região.', type:'text', options:[], skipRules:[] },
          { id:'Q5', text:'Por favor, grave o depoimento final do entrevistado.', type:'audio_record', options:[], skipRules:[] }
        ]},
        { id:'form_saneamento', title:'Pesquisa Saneamento Interiorano', version:1, status:'published', questions:[
          { id:'S1', text:'Tem água encanada?', type:'single_choice', options:['Sim','Não'], skipRules:[{conditionValue:'Sim',targetQuestionId:'S3'}] },
          { id:'S2', text:'Como você obtém água?', type:'single_choice', options:['Poço artesiano','Caminhão pipa','Chuva/Cisterna','Rio/Lago'], skipRules:[] },
          { id:'S3', text:'Qualidade percebida da água?', type:'single_choice', options:['Excelente','Boa','Regular','Ruim'], skipRules:[] }
        ]}
      ]);
    }
    if (this._getStore('vdb_interviews').length === 0) {
      this._setStore('vdb_interviews', [
        { id:'int_001', form_id:'form_censo', form_version:2, researcher_id:'researcher_1', data:{Q1:'18 a 35 anos',Q2:'Sim',Q3:'Rede pública',Q4:'Falta de pavimentação nas ruas',Q5:'audio_001.mp3'}, latitude:-9.3833, longitude:-40.5, audio_url:'audio_001.mp3', status:'approved', created_at:'2026-06-01T10:30:00Z', approved_by:'analyst_user', notes:'Entrevista bem estruturada e áudio claro.' },
        { id:'int_002', form_id:'form_censo', form_version:2, researcher_id:'researcher_1', data:{Q1:'36 a 60 anos',Q2:'Não',Q4:'Acesso à saúde é muito demorado',Q5:'audio_002.mp3'}, latitude:-9.4122, longitude:-40.5134, audio_url:'audio_002.mp3', status:'pending', created_at:'2026-06-02T14:15:00Z', approved_by:null, notes:'' },
        { id:'int_003', form_id:'form_censo', form_version:2, researcher_id:'researcher_2', data:{Q1:'Mais de 60 anos',Q2:'Sim',Q3:'Painel Solar',Q4:'Segurança no período da noite',Q5:'audio_003.mp3'}, latitude:-3.6888, longitude:-40.3498, audio_url:'audio_003.mp3', status:'pending', created_at:'2026-06-02T11:00:00Z', approved_by:null, notes:'' },
        { id:'int_004', form_id:'form_saneamento', form_version:1, researcher_id:'researcher_3', data:{S1:'Não',S2:'Caminhão pipa',S3:'Regular'}, latitude:-9.897, longitude:-38.6941, audio_url:'audio_004.mp3', status:'approved', created_at:'2026-05-30T16:45:00Z', approved_by:'analyst_user', notes:'Validada.' },
        { id:'int_005', form_id:'form_saneamento', form_version:1, researcher_id:'researcher_4', data:{S1:'Sim',S3:'Excelente'}, latitude:-8.8123, longitude:-38.5678, audio_url:'audio_005.mp3', status:'rejected', created_at:'2026-06-01T09:20:00Z', approved_by:null, notes:'Áudio com chiado excessivo.' }
      ]);
    }
    if (this._getStore('vdb_logs').length === 0) {
      this._setStore('vdb_logs', [
        { id:'log_001', type:'COMMAND_EXECUTION', severity:'LOW', command_requested:'show version', user_role:'DEV', timestamp:new Date().toISOString() },
        { id:'log_002', type:'DESTRUCTIVE_COMMAND_BLOCKED', severity:'CRITICAL', command_requested:'reboot', user_role:'Coordinator', timestamp:new Date().toISOString() },
        { id:'log_003', type:'DESTRUCTIVE_COMMAND_BLOCKED', severity:'HIGH', command_requested:'/interface disable ether1', user_role:'Admin', timestamp:new Date().toISOString() },
        { id:'log_004', type:'UNAUTHORIZED_ACCESS', severity:'MEDIUM', command_requested:'view financials', user_role:'Researcher', timestamp:new Date().toISOString() }
      ]);
    }
    if (this._getStore('vdb_routes').length === 0) {
      this._setStore('vdb_routes', [
        { id: 'route_1', researcher_id: 'researcher_1', form_id: 'form_censo', city: 'Petrolina', created_at: new Date().toISOString() },
        { id: 'route_2', researcher_id: 'researcher_2', form_id: 'form_censo', city: 'Juazeiro', created_at: new Date().toISOString() }
      ]);
    }
    if (this._getStore('vdb_roles').length === 0) {
      this._setStore('vdb_roles', [
        { id: 'role_coord', name: 'Coordenador Master', permissions: 'view_projects,view_map,export_data,delete_data,manage_forms,manage_users', created_at: new Date().toISOString() },
        { id: 'role_super', name: 'Supervisor de Campo', permissions: 'view_projects,view_map,submit_data', created_at: new Date().toISOString() }
      ]);
    }
  }
};

function simulateOfflineApi(endpoint, options = {}) {
  virtualDb.ensureSeeded();
  const method = (options.method || 'GET').toUpperCase();
  const body = options.body ? JSON.parse(options.body) : {};

  if (endpoint === '/api/users' && method === 'GET') return virtualDb._getStore('vdb_users');
  if (endpoint === '/api/forms' && method === 'GET') return virtualDb._getStore('vdb_forms');
  if (endpoint === '/api/interviews' && method === 'GET') return virtualDb._getStore('vdb_interviews');
  if (endpoint === '/api/logs' && method === 'GET') return virtualDb._getStore('vdb_logs');

  if (endpoint === '/api/users' && method === 'POST') {
    const users = virtualDb._getStore('vdb_users');
    const newUser = { id:'user_'+Math.random().toString(36).substr(2,8), name:body.name, email:body.email, role:body.role, status:'active', created_at:new Date().toISOString() };
    users.push(newUser);
    virtualDb._setStore('vdb_users', users);
    return { success:true, user:newUser };
  }
  if (endpoint.match(/\/api\/users\//) && method === 'PUT') {
    const uid = endpoint.split('/').pop();
    let users = virtualDb._getStore('vdb_users');
    users = users.map(u => u.id === uid ? {...u, name: body.name, email: body.email, role: body.role} : u);
    virtualDb._setStore('vdb_users', users);
    return { success:true };
  }
  if (endpoint.match(/\/api\/users\//) && method === 'DELETE') {
    const uid = endpoint.split('/').pop();
    let users = virtualDb._getStore('vdb_users');
    users = users.map(u => u.id === uid ? {...u, status:'deleted'} : u);
    virtualDb._setStore('vdb_users', users);
    return { success:true };
  }
  if (endpoint === '/api/roles' && method === 'GET') return virtualDb._getStore('vdb_roles');
  if (endpoint === '/api/roles' && method === 'POST') {
    const roles = virtualDb._getStore('vdb_roles');
    const newRole = { id: 'role_'+Math.random().toString(36).substr(2,8), name: body.name, permissions: body.permissions, created_at: new Date().toISOString() };
    roles.push(newRole);
    virtualDb._setStore('vdb_roles', roles);
    return { success: true, role: newRole };
  }
  if (endpoint.match(/\/api\/roles\//) && method === 'DELETE') {
    const rid = endpoint.split('/').pop();
    let roles = virtualDb._getStore('vdb_roles');
    roles = roles.filter(r => r.id !== rid);
    virtualDb._setStore('vdb_roles', roles);
    return { success: true };
  }
  if (endpoint === '/api/routes' && method === 'GET') {
    const routes = virtualDb._getStore('vdb_routes');
    const users = virtualDb._getStore('vdb_users');
    const forms = virtualDb._getStore('vdb_forms');
    return routes.map(r => ({
      ...r,
      researcher_name: (users.find(u => u.id === r.researcher_id) || {}).name || 'Desconhecido',
      form_title: (forms.find(f => f.id === r.form_id) || {}).title || 'Desconhecido'
    }));
  }
  if (endpoint === '/api/routes' && method === 'POST') {
    const routes = virtualDb._getStore('vdb_routes');
    const newRoute = { id: 'route_'+Math.random().toString(36).substr(2,8), researcher_id: body.researcher_id, form_id: body.form_id, city: body.city, created_at: new Date().toISOString() };
    routes.push(newRoute);
    virtualDb._setStore('vdb_routes', routes);
    return { success: true, routeId: newRoute.id };
  }
  if (endpoint.match(/\/api\/routes\//) && method === 'DELETE') {
    const rid = endpoint.split('/').pop();
    let routes = virtualDb._getStore('vdb_routes');
    routes = routes.filter(r => r.id !== rid);
    virtualDb._setStore('vdb_routes', routes);
    return { success: true };
  }
  if (endpoint === '/api/forms' && method === 'POST') {
    const forms = virtualDb._getStore('vdb_forms');
    const id = body.id || 'form_'+Math.random().toString(36).substr(2,8);
    const existing = forms.find(f => f.id === id);
    const validation = validateSkipLogicLocal(body.questions || []);
    if (existing) {
      let ver = existing.version;
      if (existing.status === 'published' && JSON.stringify(existing.questions) !== JSON.stringify(body.questions)) ver++;
      existing.title = body.title; existing.questions = body.questions; existing.status = body.status; existing.version = ver;
      virtualDb._setStore('vdb_forms', forms);
      return { success:true, form:existing, validation };
    } else {
      const newForm = { id, title:body.title, version:1, status:body.status||'draft', questions:body.questions||[] };
      forms.push(newForm);
      virtualDb._setStore('vdb_forms', forms);
      return { success:true, form:newForm, validation };
    }
  }
  if (endpoint === '/api/interviews' && method === 'POST') {
    const interviews = virtualDb._getStore('vdb_interviews');
    const intId = 'int_'+Math.random().toString(36).substr(2,8);
    const newInt = { id:intId, form_id:body.formId, form_version:body.formVersion, researcher_id:body.researcherId||state.activeUserId, data:body.data, latitude:body.latitude, longitude:body.longitude, audio_url:body.audioFileName?'/audio-vault/'+body.audioFileName:null, status:'pending', created_at:new Date().toISOString(), approved_by:null, notes:'' };
    interviews.push(newInt);
    virtualDb._setStore('vdb_interviews', interviews);
    return { success:true, interviewId:intId };
  }
  if (endpoint.match(/\/api\/interviews\/.*\/status/) && method === 'PUT') {
    const iid = endpoint.split('/')[3];
    let interviews = virtualDb._getStore('vdb_interviews');
    interviews = interviews.map(i => i.id === iid ? {...i, status:body.status, approved_by:state.activeUserId, notes:body.notes||''} : i);
    virtualDb._setStore('vdb_interviews', interviews);
    return { success:true };
  }
  if (endpoint === '/api/network/command' && method === 'POST') {
    const cmd = (body.command || '').trim();
    const destructive = [/reset/i, /reboot/i, /shutdown/i, /format/i, /\/interface disable/i];
    const isDestructive = destructive.some(p => p.test(cmd));
    if (isDestructive) {
      const logId = 'sec_'+Math.random().toString(36).substr(2,8);
      const logs = virtualDb._getStore('vdb_logs');
      logs.unshift({ id:logId, type:'DESTRUCTIVE_COMMAND_BLOCKED', severity:'CRITICAL', command_requested:cmd, user_role:state.activeRole, timestamp:new Date().toISOString() });
      virtualDb._setStore('vdb_logs', logs);
      return { allowed:false, severity:'CRITICAL', message:'Bloqueado: Comando destrutivo detectado.', suggestion:'Esta ação precisa ser feita presencialmente no equipamento.' };
    }
    if (/show version/i.test(cmd)) return { allowed:false, severity:'LOW', message:'RouterOS v7.12 (stable) - Firmware: 7.12 - Uptime: 14d 03:22:15\nBoard: RB750Gr3 (hEX) - Serial: HEX-2024-BR-4491\nMemória: 256MB RAM - Armazenamento: 16MB Flash', suggestion:'Equipamento operando normalmente.' };
    if (/ping/i.test(cmd)) return { allowed:false, severity:'LOW', message:'PING 8.8.8.8: 56 bytes - seq=1 ttl=118 time=23.4ms\nPING 8.8.8.8: 56 bytes - seq=2 ttl=118 time=21.8ms\nPING 8.8.8.8: 56 bytes - seq=3 ttl=118 time=22.1ms\n--- 3 pacotes transmitidos, 3 recebidos, 0% perda ---', suggestion:'Conexão com internet estável.' };
    if (/ip address/i.test(cmd)) return { allowed:false, severity:'LOW', message:'#0 | 192.168.88.1/24  | ether1 (LAN)\n#1 | 10.0.0.2/30      | ether2 (WAN)\n#2 | 172.16.0.1/16    | bridge-local', suggestion:'Interfaces de rede configuradas.' };
    if (/show status/i.test(cmd)) return { allowed:false, severity:'LOW', message:'Latência média de sincronização: 145ms\nÚltimo sync bem-sucedido: há 3 minutos\nQualidade do sinal: EXCELENTE (-42 dBm)\nClientes conectados: 7', suggestion:'Sincronização funcionando corretamente.' };
    const isConfig = /set|add|remove|enable|disable|configure/i.test(cmd);
    return { allowed:false, severity:isConfig?'MEDIUM':'LOW', message:'Sistema opera em modo somente leitura.', suggestion:isConfig?'Este comando altera configurações. Execute manualmente no equipamento.':'Execute o comando diretamente no terminal do equipamento.' };
  }
  return { error:'Endpoint não encontrado na simulação offline.' };
}

function validateSkipLogicLocal(questions) {
  const feedback = [];
  const idToIdx = new Map();
  questions.forEach((q, i) => idToIdx.set(q.id, i));
  questions.forEach((q, idx) => {
    if (!q.skipRules) return;
    q.skipRules.forEach(rule => {
      if (!rule.targetQuestionId) { feedback.push({ type:'ERROR', message:`Pergunta "${q.id}" tem regra de pulo sem destino.` }); return; }
      if (!idToIdx.has(rule.targetQuestionId)) { feedback.push({ type:'ERROR', message:`Pergunta "${q.id}" pula para "${rule.targetQuestionId}" que não existe.` }); return; }
      if (rule.targetQuestionId === q.id) { feedback.push({ type:'ERROR', message:`Pergunta "${q.id}" pula para ela mesma (loop infinito).` }); }
      if (idToIdx.get(rule.targetQuestionId) < idx) { feedback.push({ type:'WARNING', message:`Pergunta "${q.id}" pula para trás. Pode causar loops.` }); }
      if ((q.type==='single_choice'||q.type==='multiple_choice') && rule.conditionValue && !q.options.includes(rule.conditionValue)) {
        feedback.push({ type:'WARNING', message:`Regra em "${q.id}" depende da opção "${rule.conditionValue}" que não existe.` });
      }
    });
  });
  return feedback;
}

async function apiFetch(endpoint, options = {}) {
  if (IS_OFFLINE_PREVIEW) return simulateOfflineApi(endpoint, options);
  try {
    const headers = { 'Content-Type':'application/json', 'x-user-role':state.activeRole, 'x-user-id':state.activeUserId, ...(options.headers||{}) };
    const res = await fetch(endpoint, { ...options, headers });
    if (!res.ok) {
      if (res.status === 403) throw new Error('Você não tem permissão para esta ação.');
      if (res.status >= 500) throw new Error('Ocorreu um erro interno. Tente novamente.');
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Algo deu errado.');
    }
    return await res.json();
  } catch (err) {
    if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
      console.warn('Backend indisponível, usando modo offline.');
      return simulateOfflineApi(endpoint, options);
    }
    throw err;
  }
}

// ===================== TOAST SYSTEM =====================
function showToast(type, message) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  const iconMap = { success:'fa-circle-check', error:'fa-circle-xmark', warning:'fa-triangle-exclamation', info:'fa-circle-info' };
  // Map old severity names
  if (type === 'LOW') type = 'info';
  else if (type === 'MEDIUM') type = 'warning';
  else if (type === 'HIGH' || type === 'CRITICAL') type = 'error';
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<i class="fa-solid ${iconMap[type]||iconMap.info} toast-icon"></i><span class="toast-msg">${message}</span><button class="toast-close" onclick="this.parentElement.remove()">&times;</button>`;
  container.appendChild(toast);
  setTimeout(() => { toast.classList.add('toast-out'); setTimeout(() => toast.remove(), 300); }, 4500);
}

// ===================== CONFIRM MODAL =====================
function showConfirm(title, message, onConfirm, options = {}) {
  const overlay = document.getElementById('confirm-modal');
  const iconEl = document.getElementById('confirm-modal-icon');
  const titleEl = document.getElementById('confirm-modal-title');
  const msgEl = document.getElementById('confirm-modal-message');
  const confirmBtn = document.getElementById('confirm-modal-confirm');
  const cancelBtn = document.getElementById('confirm-modal-cancel');

  titleEl.textContent = title;
  msgEl.textContent = message;
  const type = options.type || 'warning';
  iconEl.className = `modal-icon ${type}`;
  const icons = { warning:'fa-triangle-exclamation', danger:'fa-trash', info:'fa-circle-info' };
  iconEl.innerHTML = `<i class="fa-solid ${icons[type]||icons.warning}"></i>`;
  confirmBtn.textContent = options.confirmText || 'Confirmar';
  confirmBtn.className = type === 'danger' ? 'btn btn-danger-solid' : 'btn btn-primary';
  cancelBtn.textContent = options.cancelText || 'Cancelar';
  overlay.classList.add('active');

  const cleanup = () => { overlay.classList.remove('active'); confirmBtn.onclick = null; cancelBtn.onclick = null; };
  confirmBtn.onclick = () => { cleanup(); onConfirm(); };
  cancelBtn.onclick = cleanup;
}

function setButtonLoading(btn, loading) {
  if (loading) { btn.classList.add('loading'); btn.disabled = true; }
  else { btn.classList.remove('loading'); btn.disabled = false; }
}

// ===================== DATA LOADING =====================
async function loadServerData() {
  try {
    const [users, forms, interviews] = await Promise.all([
      apiFetch('/api/users'), apiFetch('/api/forms'), apiFetch('/api/interviews')
    ]);
    state.users = users || [];
    state.forms = forms || [];
    state.interviews = interviews || [];
  } catch (err) { console.error('Erro ao carregar dados:', err); }
}

// ===================== NAVIGATION =====================
function switchTab(targetId) {
  document.querySelectorAll('.view-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.sidebar-nav .nav-item').forEach(n => n.classList.remove('active'));
  const panel = document.getElementById(targetId);
  if (panel) panel.classList.add('active');
  const navItem = document.querySelector(`.nav-item[data-target="${targetId}"]`);
  if (navItem) navItem.classList.add('active');
  // Close mobile sidebar
  document.getElementById('sidebar').classList.remove('mobile-open');
  // Leaflet resize fix
  if (targetId === 'view-map' && state.map) setTimeout(() => state.map.invalidateSize(), 150);
  // Load logs when switching to logs tab
  if (targetId === 'view-logs') fetchLogs();
  if (targetId === 'view-team') loadTeam();
  if (targetId === 'view-reports') renderReportsTable();
}

// ===================== RBAC =====================
const NAV_PERMISSIONS = {
  'nav-team-routes': ['DEV','Admin','Coordinator'],
  'nav-form-builder': ['DEV','Admin','Analyst'],
  'nav-logs': ['DEV'],
  'nav-ai': ['DEV','Admin','Analyst','Supervisor','Coordinator'],
  'nav-equipment': ['DEV','Admin','Coordinator'],
  'nav-reports': ['DEV','Admin','Analyst','Supervisor','Coordinator'],
};
const SECTION_PERMISSIONS = {
  'financial-dashboard-section': ['DEV','Admin','Analyst'],
  'supervisor-validation-panel': ['DEV','Admin','Analyst','Supervisor'],
  'odk-guide-section': ['DEV','Admin','Coordinator','Analyst'],
};

function applyRoleRestrictions() {
  const role = state.activeRole;
  // Nav items
  Object.entries(NAV_PERMISSIONS).forEach(([navId, roles]) => {
    const el = document.getElementById(navId);
    if (el) el.style.display = roles.includes(role) ? '' : 'none';
  });
  // Show all nav items not in permissions map
  ['nav-dashboard','nav-map','nav-mobile-sim'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = '';
  });
  // Dashboard sections
  Object.entries(SECTION_PERMISSIONS).forEach(([secId, roles]) => {
    const el = document.getElementById(secId);
    if (el) el.style.display = roles.includes(role) ? '' : 'none';
  });
  // If current view is hidden, switch to dashboard
  const activePanel = document.querySelector('.view-panel.active');
  if (activePanel) {
    const activeNav = document.querySelector(`.nav-item[data-target="${activePanel.id}"]`);
    if (activeNav && activeNav.style.display === 'none') switchTab('view-dashboard');
  }
}

function updateUserUI() {
  const name = MOCK_USER_NAMES[state.activeRole] || state.activeRole;
  const roleLabel = ROLE_LABELS[state.activeRole] || state.activeRole;
  document.getElementById('current-user-name').textContent = name;
  document.getElementById('current-user-role-label').textContent = roleLabel;
  document.getElementById('user-avatar').textContent = name.charAt(0).toUpperCase();
}

// ===================== DASHBOARD =====================
function renderDashboard() {
  const grid = document.getElementById('projects-grid');
  if (!grid) return;
  grid.innerHTML = '';

  const publishedForms = state.forms.filter(f => f.status === 'published');
  
  if (publishedForms.length === 0) {
    grid.innerHTML = '<div class="card" style="grid-column: 1 / -1; text-align: center; padding: 3rem;"><i class="fa-solid fa-folder-open" style="font-size: 3rem; color: var(--text-muted); margin-bottom: 1rem;"></i><h3 style="margin-bottom: 0.5rem;">Nenhum Projeto Ativo</h3><p class="text-muted">Crie um formulário e publique para iniciar um novo projeto de coleta.</p></div>';
    return;
  }

  publishedForms.forEach(form => {
    const ints = state.interviews.filter(i => i.form_id === form.id);
    const lastCollect = ints.length > 0 ? new Date(ints[ints.length-1].created_at).toLocaleDateString('pt-BR') : 'Sem dados';
    
    grid.innerHTML += `
      <div class="card" style="cursor:pointer; display:flex; align-items:center; justify-content:space-between; padding: 1rem 1.5rem; transition:transform 0.2s;" onclick="openProject('${form.id}')" onmouseover="this.style.background='var(--bg-sidebar-hover)'; this.style.color='white';" onmouseout="this.style.background='var(--bg-card)'; this.style.color='var(--text-primary)';">
        <div style="display:flex; align-items:center; gap: 1rem;">
          <div style="width: 40px; height: 40px; border-radius: 8px; background: var(--primary-light); color: var(--primary); display: flex; align-items: center; justify-content: center; font-size: 1.2rem;">
            <i class="fa-solid fa-clipboard-list"></i>
          </div>
          <div>
            <h3 style="font-size: 1.1rem; font-weight: 700; margin: 0;">${form.title} <span class="badge badge-success" style="margin-left:0.5rem;font-size:0.7rem;">V${form.version}</span></h3>
            <p class="text-muted" style="font-size: 0.85rem; margin: 0; color:inherit; opacity:0.8;">Clique para gerenciar dados, exportar base ou visualizar mapa.</p>
          </div>
        </div>
        <div style="display:flex; align-items:center; gap: 2rem; text-align:right;">
          <div><span class="text-muted" style="font-size: 0.75rem; display:block; color:inherit; opacity:0.8;">COLETAS</span><strong style="font-size: 1.1rem;">${ints.length}</strong></div>
          <div><span class="text-muted" style="font-size: 0.75rem; display:block; color:inherit; opacity:0.8;">ÚLTIMA COLETA</span><strong style="font-size: 0.9rem;">${lastCollect}</strong></div>
          <i class="fa-solid fa-chevron-right text-muted" style="color:inherit; opacity:0.8;"></i>
        </div>
      </div>
    `;
  });
}

// ===================== PROJECT DETAILS =====================
window.openProject = function(formId) {
  state.activeProjectFormId = formId;
  const form = state.forms.find(f => f.id === formId);
  if (!form) return;

  document.getElementById('project-details-title').innerHTML = `<i class="fa-solid fa-clipboard-list"></i> ${form.title}`;
  switchTab('view-project-details');
  
  loadProjectAccess();

  // Setup tabs
  document.querySelectorAll('#view-project-details .tab-link').forEach(el => {
    el.onclick = function() {
      document.querySelectorAll('#view-project-details .tab-link').forEach(t => {
        t.style.borderBottomColor = 'transparent'; t.style.color = 'var(--text-secondary)';
      });
      this.style.borderBottomColor = 'var(--primary)'; this.style.color = 'var(--primary)';
      document.querySelectorAll('#view-project-details .tab-content').forEach(c => c.style.display = 'none');
      document.getElementById(this.dataset.tab).style.display = 'block';
      if (this.dataset.tab === 'proj-tab-map' && state.map) {
        setTimeout(() => state.map.invalidateSize(), 150);
      }
    };
  });

  renderReportsTable();
  if (!state.map) initMap();
  else renderMapMarkers();
  renderAudioReviewList();
};

// ===================== MAP =====================
function initMap() {
  if (state.map) return;
  state.map = L.map('map').setView([-9.3833, -40.5], 7);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap', maxZoom: 18 }).addTo(state.map);
  
  state.markerCluster = L.markerClusterGroup({
    chunkedLoading: true,
    maxClusterRadius: 50
  });
  state.map.addLayer(state.markerCluster);
  
  renderMapMarkers();
}

function renderMapMarkers() {
  if (!state.map || !state.markerCluster) return;
  
  state.markerCluster.clearLayers();
  
  // Filter only for the active project
  let filtered = state.interviews.filter(i => i.latitude && i.longitude);
  if (state.activeProjectFormId) {
    filtered = filtered.filter(i => i.form_id === state.activeProjectFormId);
  }

  const markers = [];
  filtered.forEach(item => {
    const color = RESEARCHER_COLORS[item.researcher_id] || '#6366f1';
    const researcher = state.users.find(u => u.id === item.researcher_id);
    const researcherName = researcher ? researcher.name : item.researcher_id;
    const form = state.forms.find(f => f.id === item.form_id);
    const formTitle = form ? form.title : item.form_id;
    
    const icon = L.divIcon({ className:'custom-marker', html:`<div style="width:14px;height:14px;background:${color};border-radius:50%;border:2.5px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3);"></div>`, iconSize:[14,14], iconAnchor:[7,7] });
    const popup = `<div style="font-family:Inter,sans-serif;min-width:200px;"><strong style="font-size:0.9rem;">${formTitle}</strong><br><span style="font-size:0.78rem;color:#64748b;">Pesquisador: ${researcherName}</span><br><span style="font-size:0.78rem;color:#64748b;">Data: ${new Date(item.created_at).toLocaleDateString('pt-BR')}</span><br><span style="font-size:0.78rem;color:#64748b;">Dispositivo: ${item.device_id || 'unknown'}</span><br><div style="margin-top:8px;"><button class="btn btn-sm btn-primary" onclick="openInterviewDetails('${item.id}')" style="width:100%;font-size:0.75rem;">Ver Dados</button></div></div>`;
    const marker = L.marker([item.latitude, item.longitude], { icon }).bindPopup(popup);
    markers.push(marker);
  });
  
  state.markerCluster.addLayers(markers);
  if (markers.length > 0) {
    state.map.fitBounds(state.markerCluster.getBounds(), { padding: [50, 50] });
  }
}

// ===================== REPORTS =====================
window.renderReportsTable = function() {
  const tbody = document.getElementById('reports-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  let filtered = [...state.interviews].reverse(); // newest first
  if (state.activeProjectFormId) {
    filtered = filtered.filter(i => i.form_id === state.activeProjectFormId);
  }

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem;">Nenhuma coleta encontrada neste projeto.</td></tr>';
    return;
  }

  filtered.forEach(int => {
    const researcher = state.users.find(u => u.id === int.researcher_id) || {name: int.researcher_id};
    const date = new Date(int.created_at).toLocaleString('pt-BR');
    
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input type="checkbox" class="cb-interview-select" value="${int.id}"></td>
      <td>${int.id.substring(0,8)}</td>
      <td>${researcher.name}</td>
      <td>${int.device_id || 'N/A'}</td>
      <td>${date}</td>
      <td><button class="btn btn-sm btn-primary" onclick="openInterviewDetails('${int.id}')"><i class="fa-solid fa-eye"></i> Ver</button></td>
    `;
    tbody.appendChild(tr);
  });
};

window.openInterviewDetails = function(id) {
  const int = state.interviews.find(i => i.id === id);
  if (!int) return;
  const researcher = state.users.find(u => u.id === int.researcher_id) || {name: int.researcher_id};
  const form = state.forms.find(f => f.id === int.form_id) || {title: int.form_id, questions: []};
  
  document.getElementById('interview-modal-form').textContent = form.title;
  document.getElementById('interview-modal-researcher').textContent = researcher.name;
  document.getElementById('interview-modal-date').textContent = new Date(int.created_at).toLocaleString('pt-BR');
  document.getElementById('interview-modal-device').textContent = int.device_id || 'N/A';
  document.getElementById('interview-modal-gps').textContent = (int.latitude && int.longitude) ? `${int.latitude}, ${int.longitude}` : 'Não registrada';
  
  const answersDiv = document.getElementById('interview-modal-answers');
  answersDiv.innerHTML = '';
  Object.keys(int.data || {}).forEach(qId => {
    const qText = form.questions ? (form.questions.find(q => q.id === qId)?.text || qId) : qId;
    const val = int.data[qId];
    answersDiv.innerHTML += `<div style="margin-bottom:0.75rem;"><strong style="color:var(--text-primary);display:block;margin-bottom:0.25rem;">${qText}</strong><span style="color:var(--text-secondary);">${val}</span></div>`;
  });
  
  if (int.audio_url) {
    answersDiv.innerHTML += `<div style="margin-top:1rem;border-top:1px solid var(--border);padding-top:1rem;"><strong style="display:block;margin-bottom:0.5rem;"><i class="fa-solid fa-microphone"></i> Gravação de Áudio</strong><audio controls style="width:100%;height:36px;"><source src="${int.audio_url}"></audio></div>`;
  }
  
  document.getElementById('interview-modal').classList.add('active');
};

window.clearTestInterviews = function() {
  const checkboxes = document.querySelectorAll('.cb-interview-select:checked');
  const ids = Array.from(checkboxes).map(cb => cb.value);
  if (ids.length === 0) {
    showToast('warning', 'Selecione pelo menos uma entrevista para apagar.');
    return;
  }

  showConfirm('Limpar Testes', `Tem certeza que deseja apagar permanentemente ${ids.length} entrevista(s)? Essa ação não pode ser desfeita.`, async () => {
    try {
      const res = await apiFetch('/api/interviews/clear', { method: 'DELETE', body: JSON.stringify({ ids }) });
      if (res.success) {
        showToast('success', `${res.deletedCount} entrevistas removidas com sucesso.`);
        await loadServerData();
        renderReportsTable();
        renderMapMarkers();
        renderAudioReviewList();
      }
    } catch(err) { showToast('error', err.message); }
  }, { type:'danger', confirmText:'Apagar Dados' });
};

// ===================== AUDIO REVIEW =====================
function renderAudioReviewList() {
  const container = document.getElementById('audio-review-list');
  if (!container) return;
  container.innerHTML = '';
  
  let auditable = state.interviews.filter(i => i.audio_url);
  if (state.activeProjectFormId) {
    auditable = auditable.filter(i => i.form_id === state.activeProjectFormId);
  }

  if (auditable.length === 0) {
    container.innerHTML = '<div class="empty-state" style="padding:3rem;"><i class="fa-solid fa-headphones"></i><h4>Nenhuma gravação encontrada neste projeto</h4><p>As gravações de áudio aparecerão aqui quando os pesquisadores as enviarem.</p></div>';
    return;
  }
  
  auditable.forEach(item => {
    const researcher = state.users.find(u => u.id === item.researcher_id);
    const researcherName = researcher ? researcher.name : item.researcher_id;
    const div = document.createElement('div');
    div.style = "padding:1rem; border-bottom:1px solid var(--border);";
    div.innerHTML = `
      <div style="display:flex; justify-content:space-between; margin-bottom:0.5rem;">
        <div><strong>Pesquisador:</strong> ${researcherName}</div>
        <div class="text-muted">${new Date(item.created_at).toLocaleString('pt-BR')}</div>
      </div>
      <audio controls style="width:100%;height:36px;"><source src="${item.audio_url}"></audio>
    `;
    container.appendChild(div);
  });
}

// ===================== FORM BUILDER =====================
let draggedQuestionIndex = null;

function initFormBuilder() {
  document.getElementById('btn-new-form').addEventListener('click', () => {
    loadFormIntoBuilder({ id:'', title:'Novo Formulário', status:'draft', version:1, questions:[] });
  });
  document.getElementById('btn-add-question').addEventListener('click', () => {
    const qId = 'Q' + (state.activeForm.questions.length + 1);
    state.activeForm.questions.push({ id:qId, text:'', type:'text', options:[], required: false });
    renderBuilderQuestions();
  });
  document.getElementById('btn-save-form').addEventListener('click', saveActiveForm);
}

function renderFormBuilderList() {
  const container = document.getElementById('forms-list-container');
  container.innerHTML = '';
  if (state.forms.length === 0) {
    container.innerHTML = '<div class="empty-state"><i class="fa-solid fa-clipboard-list"></i><h4>Nenhum formulário</h4><p>Clique em "Novo" para criar o primeiro formulário.</p></div>';
    return;
  }
  state.forms.forEach(form => {
    const div = document.createElement('div');
    div.className = `form-list-item ${state.activeForm.id === form.id ? 'active' : ''}`;
    const badge = form.status === 'published' ? '<span class="badge badge-success">PUB</span>' : '<span class="badge badge-draft">RASCUNHO</span>';
    div.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;"><span class="form-list-title">${form.title}</span>${badge}</div><div class="form-list-meta">Versão ${form.version} · ${form.questions.length} perguntas</div>`;
    div.addEventListener('click', () => loadFormIntoBuilder(form));
    container.appendChild(div);
  });
}

function loadFormIntoBuilder(form) {
  state.activeForm = JSON.parse(JSON.stringify(form));
  document.getElementById('form-edit-title').value = state.activeForm.title;
  document.getElementById('form-edit-version').textContent = state.activeForm.version;
  document.getElementById('form-edit-status').value = state.activeForm.status;
  document.getElementById('skip-logic-errors').classList.remove('visible');
  renderBuilderQuestions();
  renderFormBuilderList();
}

function renderBuilderQuestions() {
  const container = document.getElementById('builder-questions-list');
  container.innerHTML = '';
  if (state.activeForm.questions.length === 0) {
    container.innerHTML = '<div class="empty-state"><i class="fa-solid fa-list-ol"></i><h4>Nenhuma pergunta adicionada</h4><p>Clique em "Adicionar Pergunta" acima para começar a criar o questionário.</p></div>';
    return;
  }
  state.activeForm.questions.forEach((q, idx) => {
    const card = document.createElement('div');
    card.className = 'question-card';
    card.draggable = true;
    card.dataset.index = idx;
    
    // Drag & Drop Listeners
    card.addEventListener('dragstart', (e) => {
      draggedQuestionIndex = idx;
      setTimeout(() => card.style.opacity = '0.5', 0);
    });
    card.addEventListener('dragend', (e) => {
      card.style.opacity = '1';
      draggedQuestionIndex = null;
    });
    card.addEventListener('dragover', (e) => {
      e.preventDefault();
      card.style.borderTop = '2px solid var(--primary)';
    });
    card.addEventListener('dragleave', (e) => {
      card.style.borderTop = '';
    });
    card.addEventListener('drop', (e) => {
      e.preventDefault();
      card.style.borderTop = '';
      if (draggedQuestionIndex !== null && draggedQuestionIndex !== idx) {
        // Move item in array
        const draggedItem = state.activeForm.questions.splice(draggedQuestionIndex, 1)[0];
        state.activeForm.questions.splice(idx, 0, draggedItem);
        renderBuilderQuestions();
      }
    });

    const isChoice = q.type === 'single_choice' || q.type === 'select_one' || q.type === 'multiple_choice' || q.type === 'select_multiple';
    // Options HTML
    let optionsHtml = '';
    if (isChoice) {
      optionsHtml = '<div style="margin-top:0.5rem;"><label class="form-label">Opções de resposta</label>';
      q.options.forEach((opt, oi) => {
        const val = typeof opt === 'object' ? opt.label : opt;
        optionsHtml += `<div class="option-item"><input type="text" class="form-input" value="${val}" onchange="updateOption(${idx},${oi},this.value)" /><button class="btn btn-sm btn-danger" onclick="removeOption(${idx},${oi})" title="Remover opção"><i class="fa-solid fa-minus"></i></button></div>`;
      });
      optionsHtml += `<button class="btn btn-sm" onclick="addOption(${idx})" style="margin-top:0.3rem;"><i class="fa-solid fa-plus"></i> Nova opção</button></div>`;
    }
    
    // Skip rules HTML (Backwards compatibility)
    let rulesHtml = '';
    if (q.skipRules && q.skipRules.length > 0) {
      let targetOpts = '<option value="">(Próxima pergunta)</option>';
      state.activeForm.questions.forEach((oq, oi) => {
        if (oi !== idx) targetOpts += `<option value="${oq.id}">Pergunta ${oi+1}${oq.text?' - '+oq.text.substring(0,25)+'...':''}</option>`;
      });
      q.skipRules.forEach((rule, ri) => {
        rulesHtml += `<div class="skip-rule-row"><span>Se resposta =</span><input type="text" class="form-input" value="${rule.conditionValue||''}" onchange="updateSkipValue(${idx},${ri},this.value)" style="width:90px;" placeholder="valor" /><span>→ Ir para</span><select class="form-select" onchange="updateSkipTarget(${idx},${ri},this.value)" style="width:auto;">${targetOpts.replace(`value="${rule.targetQuestionId}"`,`value="${rule.targetQuestionId}" selected`)}</select><button class="btn btn-sm btn-danger" onclick="confirmDeleteSkipRule(${idx},${ri})" title="Remover regra"><i class="fa-solid fa-trash"></i></button></div>`;
      });
    }

    card.innerHTML = `
      <div class="question-header" style="cursor: grab;">
        <div style="display:flex;align-items:center;gap:0.5rem;"><div class="question-number">${idx+1}</div><span style="font-size:0.75rem;color:var(--text-muted);font-family:var(--font-mono);">${q.id}</span></div>
        <div class="question-actions">
          <button class="btn btn-sm" onclick="openQuestionSettingsModal(${idx})" title="Configurações Avançadas"><i class="fa-solid fa-gear"></i></button>
          <button class="btn btn-sm" onclick="duplicateQuestion(${idx})" title="Duplicar"><i class="fa-solid fa-copy"></i></button>
          <button class="btn btn-sm btn-danger" onclick="confirmDeleteQuestion(${idx})" title="Excluir"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:2fr 1fr;gap:0.75rem;margin-bottom:0.5rem;">
        <div class="form-group"><label class="form-label">Texto da Pergunta</label><input type="text" class="form-input" value="${q.text}" onchange="updateQText(${idx},this.value)" placeholder="Escreva a pergunta aqui..." /></div>
        <div class="form-group"><label class="form-label">Tipo de Entrada <span class="tooltip-trigger"><span class="tooltip-icon">?</span><span class="tooltip-text">Escolha como o pesquisador vai responder esta pergunta.</span></span></label>
        <select class="form-select" onchange="updateQType(${idx},this.value)">
          <option value="text" ${q.type==='text'?'selected':''}>Texto Livre</option>
          <option value="number" ${q.type==='number'||q.type==='decimal'?'selected':''}>Número (Decimal)</option>
          <option value="integer" ${q.type==='integer'?'selected':''}>Número (Inteiro)</option>
          <option value="single_choice" ${q.type==='single_choice'||q.type==='select_one'?'selected':''}>Seleção Única</option>
          <option value="multiple_choice" ${q.type==='multiple_choice'||q.type==='select_multiple'?'selected':''}>Múltipla Escolha</option>
          <option value="geopoint" ${q.type==='geopoint'?'selected':''}>Localização (GPS)</option>
          <option value="image" ${q.type==='image'?'selected':''}>Foto / Imagem</option>
          <option value="video" ${q.type==='video'?'selected':''}>Vídeo</option>
          <option value="audio_record" ${q.type==='audio_record'||q.type==='audio'?'selected':''}>Gravação de Áudio</option>
        </select></div>
      </div>
      ${optionsHtml}
      <div style="margin-top:0.75rem;padding-top:0.6rem;border-top:1px solid var(--border);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.3rem;">
          <span style="font-size:0.78rem;font-weight:600;color:var(--text-secondary);">Regras de Pulo <span class="tooltip-trigger"><span class="tooltip-icon">?</span><span class="tooltip-text">Se o entrevistado responder algo específico, pule para outra pergunta automaticamente.</span></span></span>
          <button class="btn btn-sm" onclick="addSkipRule(${idx})"><i class="fa-solid fa-plus"></i> Regra</button>
        </div>
        ${rulesHtml}
      </div>`;
    container.appendChild(card);
  });
}

// Question handlers
window.updateQText = (idx, val) => { state.activeForm.questions[idx].text = val; };
window.updateQType = (idx, val) => { state.activeForm.questions[idx].type = val; if(!state.activeForm.questions[idx].options) state.activeForm.questions[idx].options=[]; renderBuilderQuestions(); };
window.addOption = (idx) => { 
  if(!state.activeForm.questions[idx].options) state.activeForm.questions[idx].options=[];
  state.activeForm.questions[idx].options.push({ name: 'opt_'+crypto.randomUUID().substring(0,6), label: 'Nova opção' }); 
  renderBuilderQuestions(); 
};
window.removeOption = (idx, oi) => {
  if (state.activeForm.questions[idx].options.length <= 1) { showToast('warning', 'A pergunta precisa ter pelo menos uma opção.'); return; }
  state.activeForm.questions[idx].options.splice(oi, 1); renderBuilderQuestions();
};
window.updateOption = (idx, oi, val) => { 
  let opt = state.activeForm.questions[idx].options[oi];
  if(typeof opt === 'string') state.activeForm.questions[idx].options[oi] = { name: opt, label: val };
  else opt.label = val; 
};
window.addSkipRule = (idx) => {
  if (!state.activeForm.questions[idx].skipRules) state.activeForm.questions[idx].skipRules = [];
  state.activeForm.questions[idx].skipRules.push({ conditionValue:'Sim', targetQuestionId:'' });
  renderBuilderQuestions();
};
window.updateSkipValue = (qi, ri, val) => { state.activeForm.questions[qi].skipRules[ri].conditionValue = val; };
window.updateSkipTarget = (qi, ri, val) => { state.activeForm.questions[qi].skipRules[ri].targetQuestionId = val; };
window.confirmDeleteQuestion = (idx) => {
  showConfirm('Excluir Pergunta', 'Tem certeza?', () => { state.activeForm.questions.splice(idx,1); renderBuilderQuestions(); });
};

window.openQuestionSettingsModal = (idx) => {
  const q = state.activeForm.questions[idx];
  document.getElementById('q-settings-id').value = idx;
  document.getElementById('q-settings-required').checked = !!q.required;
  document.getElementById('q-settings-relevant').value = q.relevant || '';
  document.getElementById('q-settings-constraint').value = q.constraint || '';
  document.getElementById('q-settings-constraint-msg').value = q.constraint_message || '';
  document.getElementById('question-settings-modal').classList.add('active');
};

window.closeQuestionSettingsModal = () => {
  document.getElementById('question-settings-modal').classList.remove('active');
};

window.saveQuestionSettings = () => {
  const idx = parseInt(document.getElementById('q-settings-id').value, 10);
  const q = state.activeForm.questions[idx];
  
  q.required = document.getElementById('q-settings-required').checked;
  
  const relevantVal = document.getElementById('q-settings-relevant').value.trim();
  if (relevantVal) q.relevant = relevantVal; else delete q.relevant;
  
  const constraintVal = document.getElementById('q-settings-constraint').value.trim();
  if (constraintVal) q.constraint = constraintVal; else delete q.constraint;
  
  const constraintMsgVal = document.getElementById('q-settings-constraint-msg').value.trim();
  if (constraintMsgVal) q.constraint_message = constraintMsgVal; else delete q.constraint_message;
  
  closeQuestionSettingsModal();
  renderBuilderQuestions();
};
window.confirmDeleteSkipRule = (qi, ri) => { showConfirm('Remover Regra', 'Deseja remover esta regra de pulo?', () => { state.activeForm.questions[qi].skipRules.splice(ri,1); renderBuilderQuestions(); }, { type:'warning' }); };
window.duplicateQuestion = (idx) => {
  const clone = JSON.parse(JSON.stringify(state.activeForm.questions[idx]));
  clone.id = clone.id + '_CPY';
  state.activeForm.questions.splice(idx+1, 0, clone);
  renderBuilderQuestions();
};
window.confirmDeleteQuestion = (idx) => {
  showConfirm('Excluir Pergunta', `Tem certeza que deseja excluir a pergunta ${idx+1}? Esta ação não pode ser desfeita.`, () => { state.activeForm.questions.splice(idx,1); renderBuilderQuestions(); }, { type:'danger', confirmText:'Excluir' });
};

async function saveActiveForm() {
  const title = document.getElementById('form-edit-title').value.trim();
  const status = document.getElementById('form-edit-status').value;
  if (!title) { showToast('warning', 'O nome do formulário não pode ficar vazio.'); return; }
  // Validate questions have text
  for (const q of state.activeForm.questions) {
    if (!q.text.trim()) { showToast('warning', 'Todas as perguntas precisam ter um texto.'); return; }
  }
  state.activeForm.title = title;
  state.activeForm.status = status;
  const btn = document.getElementById('btn-save-form');
  setButtonLoading(btn, true);
  try {
    const payload = { id:state.activeForm.id||undefined, title, status, questions:state.activeForm.questions };
    const result = await apiFetch('/api/forms', { method:'POST', body:JSON.stringify(payload) });
    if (result.success) {
      showToast('success', `Formulário "${title}" salvo com sucesso!`);
      loadFormIntoBuilder(result.form);
      const warningsDiv = document.getElementById('skip-logic-errors');
      if (result.validation && result.validation.length > 0) {
        warningsDiv.classList.add('visible');
        warningsDiv.innerHTML = `<h4><i class="fa-solid fa-triangle-exclamation"></i> Avisos de Lógica (${result.validation.length})</h4><ul>${result.validation.map(e => `<li>${e.message}</li>`).join('')}</ul>`;
        showToast('warning', 'Foram encontrados avisos na lógica do formulário.');
      } else { warningsDiv.classList.remove('visible'); }
      await loadServerData();
      renderFormBuilderList();
    }
  } catch (err) { showToast('error', 'Erro ao salvar: ' + err.message); }
  setButtonLoading(btn, false);
}

// ===================== MOBILE SIMULATOR =====================
function initMobileSimulator() {
  document.getElementById('sim-toggle-network').addEventListener('change', (e) => {
    state.simIsOnline = e.target.checked;
    const badge = document.getElementById('net-status-text');
    badge.textContent = state.simIsOnline ? 'Conectado (Online)' : 'Desconectado (Offline)';
    if (state.simIsOnline) syncOfflineQueue();
    renderMobileScreen();
  });
  document.getElementById('sim-btn-download-templates').addEventListener('click', downloadTemplates);
  document.getElementById('sim-btn-sync-queue').addEventListener('click', syncOfflineQueue);
  const cachedQueue = localStorage.getItem('datapesquise_offline_queue');
  if (cachedQueue) { state.simOfflineQueue = JSON.parse(cachedQueue); document.getElementById('sim-offline-queue-count').textContent = state.simOfflineQueue.length; }
  renderMobileScreen();
}

function downloadTemplates() {
  if (!state.simIsOnline) { showToast('error', 'Conecte à internet para baixar os formulários.'); return; }
  const published = state.forms.filter(f => f.status === 'published');
  localStorage.setItem('datapesquise_sim_templates', JSON.stringify(published));
  showToast('success', `${published.length} formulário(s) baixado(s) para o celular.`);
  renderMobileScreen();
}

function syncOfflineQueue() {
  if (state.simOfflineQueue.length === 0) { showToast('info', 'Nenhuma pesquisa pendente.'); return; }
  if (!state.simIsOnline) { showToast('warning', 'Conecte à internet para enviar.'); return; }
  const total = state.simOfflineQueue.length;
  showToast('info', `Enviando ${total} pesquisa(s)...`);
  Promise.all(state.simOfflineQueue.map(p => apiFetch('/api/interviews', { method:'POST', body:JSON.stringify(p) }).catch(() => null)))
    .then(async (results) => {
      const ok = results.filter(r => r && r.success).length;
      showToast('success', `${ok} de ${total} pesquisa(s) enviada(s)!`);
      state.simOfflineQueue = state.simOfflineQueue.slice(ok);
      localStorage.setItem('datapesquise_offline_queue', JSON.stringify(state.simOfflineQueue));
      document.getElementById('sim-offline-queue-count').textContent = state.simOfflineQueue.length;
      await loadServerData(); renderDashboard(); renderMobileScreen();
    });
}

function renderMobileScreen() {
  const screen = document.getElementById('phone-screen-body');
  const header = document.getElementById('phone-header-bar');
  if (!screen || !header) return;
  const netBadge = state.simIsOnline ? '<span class="network-badge-online">Online</span>' : '<span class="network-badge-offline">Offline</span>';
  header.innerHTML = `<span style="font-weight:700;font-size:0.78rem;"><i class="fa-solid fa-chart-pie" style="color:var(--primary);"></i> DATApesquise</span>${netBadge}`;
  screen.innerHTML = '';

  if (!state.simActiveForm) {
    // Form selection view
    const templates = JSON.parse(localStorage.getItem('datapesquise_sim_templates') || '[]');
    let opts = '<option value="">-- Selecione o formulário --</option>';
    templates.forEach(t => { opts += `<option value="${t.id}">${t.title} (V${t.version})</option>`; });
    const warn = templates.length === 0 ? '<div style="margin-top:1rem;padding:0.7rem;background:var(--warning-light);border-radius:8px;font-size:0.75rem;color:var(--warning);text-align:center;"><i class="fa-solid fa-circle-exclamation"></i> Nenhum formulário baixado. Clique em "Baixar Formulários" primeiro.</div>' : '';
    screen.innerHTML = `<div style="flex:1;display:flex;flex-direction:column;justify-content:center;padding:0.5rem;"><div style="text-align:center;margin-bottom:1.5rem;"><i class="fa-solid fa-clipboard-question" style="font-size:2.5rem;color:var(--primary);margin-bottom:0.5rem;display:block;"></i><h4 style="font-size:1rem;">Iniciar Pesquisa</h4><p style="font-size:0.78rem;color:var(--text-secondary);margin-top:0.3rem;">Selecione um formulário para começar.</p></div><select class="form-select" id="sim-select-form" style="margin-bottom:0.75rem;">${opts}</select><button class="btn btn-primary" style="width:100%;" onclick="simStartInterview()"><i class="fa-solid fa-play"></i> Começar</button>${warn}</div>`;
    setTimeout(() => { const s = document.getElementById('sim-select-form'); if (s) { s.value = state.simSelectedFormId; s.addEventListener('change', e => state.simSelectedFormId = e.target.value); } }, 10);
  } else {
    const qList = state.simActiveForm.questions;
    const ci = state.simCurrentQuestionIdx;
    if (ci < qList.length) {
      // Question view
      const q = qList[ci];
      const isLast = ci === qList.length - 1;
      let inputHtml = '';
      if (q.type === 'text') inputHtml = `<input type="text" id="sim-ans-${q.id}" class="form-input" style="margin-top:0.6rem;" value="${state.simAnswers[q.id]||''}" placeholder="Escreva a resposta..." />`;
      else if (q.type === 'number') inputHtml = `<input type="number" id="sim-ans-${q.id}" class="form-input" style="margin-top:0.6rem;" value="${state.simAnswers[q.id]||''}" placeholder="Digite um número..." />`;
      else if (q.type === 'single_choice') {
        inputHtml = '<div style="margin-top:0.6rem;">';
        q.options.forEach(opt => { const chk = state.simAnswers[q.id]===opt?'checked':''; inputHtml += `<label style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.5rem;font-size:0.88rem;cursor:pointer;"><input type="radio" name="sim-rad-${q.id}" value="${opt}" ${chk} style="transform:scale(1.15);" /> ${opt}</label>`; });
        inputHtml += '</div>';
      } else if (q.type === 'multiple_choice') {
        const arr = state.simAnswers[q.id] || [];
        inputHtml = '<div style="margin-top:0.6rem;">';
        q.options.forEach(opt => { const chk = arr.includes(opt)?'checked':''; inputHtml += `<label style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.5rem;font-size:0.88rem;cursor:pointer;"><input type="checkbox" name="sim-chk-${q.id}" value="${opt}" ${chk} style="transform:scale(1.15);" /> ${opt}</label>`; });
        inputHtml += '</div>';
      } else if (q.type === 'audio_record') {
        const isRec = state.simIsRecording;
        inputHtml = `<div class="sim-audio-widget"><p style="font-size:0.78rem;color:var(--text-secondary);margin-bottom:0.4rem;">${isRec?'Gravando... Fale no microfone.':'Pressione para iniciar.'}</p><div class="wave-container ${isRec?'recording':''}"><span class="wave-bar"></span><span class="wave-bar"></span><span class="wave-bar"></span><span class="wave-bar"></span><span class="wave-bar"></span><span class="wave-bar"></span></div><button class="record-btn ${isRec?'recording':''}" onclick="simToggleRecord()"></button><div style="font-size:0.75rem;margin-top:0.3rem;">${state.simAudioFile?`<span style="color:var(--success);"><i class="fa-solid fa-file-audio"></i> ${state.simAudioFile}</span>`:'<span style="color:var(--text-muted);">Nenhum áudio gravado</span>'}</div></div>`;
      }
      screen.innerHTML = `<div style="flex:1;display:flex;flex-direction:column;padding:0.25rem;"><div style="font-size:0.7rem;color:var(--primary);font-weight:700;margin-bottom:0.15rem;">Questão ${ci+1} de ${qList.length}</div><div class="progress-bar" style="margin-bottom:0.75rem;"><div class="progress-fill blue" style="width:${((ci+1)/qList.length*100).toFixed(0)}%;"></div></div><h4 style="font-size:1rem;line-height:1.4;margin-bottom:0.25rem;">${q.text}</h4>${inputHtml}<div style="display:flex;gap:0.5rem;margin-top:auto;padding-top:1rem;"><button class="btn" style="flex:1;" onclick="simPrev()"><i class="fa-solid fa-arrow-left"></i> Voltar</button><button class="btn btn-primary" style="flex:2;" onclick="simNext()">${isLast?'<i class="fa-solid fa-circle-check"></i> Finalizar':'Avançar <i class="fa-solid fa-arrow-right"></i>'}</button></div><button class="btn btn-sm" style="margin-top:0.5rem;width:100%;border:none;color:var(--danger);font-size:0.75rem;" onclick="simAbort()"><i class="fa-solid fa-ban"></i> Cancelar Coleta</button></div>`;
    } else {
      // Confirmation view
      screen.innerHTML = `<div style="flex:1;display:flex;flex-direction:column;justify-content:center;padding:0.5rem;text-align:center;"><i class="fa-solid fa-circle-check" style="font-size:3rem;color:var(--success);margin-bottom:0.75rem;"></i><h3 style="margin-bottom:0.3rem;">Coleta Concluída!</h3><p style="font-size:0.82rem;color:var(--text-secondary);margin-bottom:1rem;">Todos os dados foram preenchidos.</p><div style="background:var(--bg-page);padding:0.6rem;border-radius:8px;margin-bottom:1rem;font-size:0.75rem;text-align:left;max-height:110px;overflow-y:auto;">${Object.entries(state.simAnswers).map(([k,v])=>`<div><strong>${k}:</strong> ${v}</div>`).join('')}${state.simAudioFile?`<div><strong>Áudio:</strong> ${state.simAudioFile}</div>`:''}</div><button class="btn btn-success" style="width:100%;margin-bottom:0.5rem;" onclick="simSubmit()"><i class="fa-solid fa-cloud-arrow-up"></i> Enviar Respostas</button><button class="btn" style="width:100%;" onclick="simReset()">Voltar ao Início</button></div>`;
    }
  }
}

window.simStartInterview = function() {
  const select = document.getElementById('sim-select-form');
  if (!select || !select.value) { showToast('warning', 'Selecione um formulário para começar.'); return; }
  const templates = JSON.parse(localStorage.getItem('datapesquise_sim_templates') || '[]');
  const form = templates.find(t => t.id === select.value);
  if (form) { state.simActiveForm = form; state.simAnswers = {}; state.simCurrentQuestionIdx = 0; state.simAudioFile = null; state.simIsRecording = false; renderMobileScreen(); }
};
window.simAbort = function() { showConfirm('Cancelar Coleta', 'Todas as respostas preenchidas serão perdidas. Continuar?', () => simReset(), { type:'danger', confirmText:'Sim, cancelar' }); };
function simReset() { state.simActiveForm = null; state.simAnswers = {}; state.simCurrentQuestionIdx = 0; state.simAudioFile = null; state.simIsRecording = false; renderMobileScreen(); }
window.simPrev = function() { if (state.simCurrentQuestionIdx > 0) { state.simCurrentQuestionIdx--; renderMobileScreen(); } else { state.simActiveForm = null; renderMobileScreen(); } };
window.simNext = function() {
  const q = state.simActiveForm.questions[state.simCurrentQuestionIdx];
  let val = '';
  if (q.type === 'text' || q.type === 'number') { const el = document.getElementById(`sim-ans-${q.id}`); val = el ? el.value.trim() : ''; }
  else if (q.type === 'single_choice') { const r = document.querySelector(`input[name="sim-rad-${q.id}"]:checked`); val = r ? r.value : ''; }
  else if (q.type === 'multiple_choice') { val = Array.from(document.querySelectorAll(`input[name="sim-chk-${q.id}"]:checked`)).map(c => c.value); }
  else if (q.type === 'audio_record') { val = state.simAudioFile || ''; }
  if (!val || (Array.isArray(val) && val.length === 0)) { showToast('warning', 'Preencha esta questão para continuar.'); return; }
  state.simAnswers[q.id] = val;
  // Skip logic
  let nextId = null;
  if (q.skipRules && q.skipRules.length > 0) { for (const rule of q.skipRules) { if (!rule.conditionValue || String(val) === String(rule.conditionValue)) { nextId = rule.targetQuestionId; break; } } }
  if (nextId) { const ni = state.simActiveForm.questions.findIndex(x => x.id === nextId); state.simCurrentQuestionIdx = ni !== -1 ? ni : state.simActiveForm.questions.length; }
  else { state.simCurrentQuestionIdx++; }
  renderMobileScreen();
};
window.simToggleRecord = function() {
  if (state.simIsRecording) { state.simIsRecording = false; state.simAudioFile = `audio_${Math.floor(Math.random()*900)+100}.mp3`; renderMobileScreen(); }
  else { state.simIsRecording = true; renderMobileScreen(); setTimeout(() => { if (state.simIsRecording) { state.simIsRecording = false; state.simAudioFile = `audio_${Math.floor(Math.random()*900)+100}.mp3`; renderMobileScreen(); } }, 3000); }
};
window.simSubmit = async function() {
  const researcherId = document.getElementById('sim-active-researcher').value;
  const lat = parseFloat(document.getElementById('sim-lat').value);
  const lng = parseFloat(document.getElementById('sim-lng').value);
  const payload = { formId:state.simActiveForm.id, formVersion:state.simActiveForm.version, data:state.simAnswers, latitude:lat, longitude:lng, audioFileName:state.simAudioFile, researcherId };
  if (state.simIsOnline) {
    try {
      const result = await apiFetch('/api/interviews', { method:'POST', body:JSON.stringify(payload) });
      if (result.success) { showToast('success', 'Entrevista enviada com sucesso!'); await loadServerData(); renderDashboard(); simReset(); }
    } catch (err) { showToast('error', 'Erro ao enviar: ' + err.message); }
  } else {
    state.simOfflineQueue.push(payload);
    localStorage.setItem('datapesquise_offline_queue', JSON.stringify(state.simOfflineQueue));
    document.getElementById('sim-offline-queue-count').textContent = state.simOfflineQueue.length;
    showToast('warning', 'Você está offline. A pesquisa foi salva no celular.');
    simReset();
  }
};

// ===================== EQUIPMENT =====================
window.runEquipmentCommand = async function(command) {
  const container = document.getElementById('equipment-results');
  container.innerHTML = '<div class="equipment-result"><i class="fa-solid fa-spinner fa-spin"></i> Consultando equipamento...</div>';
  try {
    const result = await apiFetch('/api/network/command', { method:'POST', body:JSON.stringify({ command }) });
    let cssClass = '';
    if (result.severity === 'CRITICAL' || result.severity === 'HIGH') {
      cssClass = 'color:var(--danger);';
      showToast('error', 'Comando bloqueado por segurança.');
      await loadServerData(); renderDashboard();
    }
    container.innerHTML = `<div class="equipment-result"><div style="${cssClass}font-weight:600;margin-bottom:0.4rem;">${result.message}</div><div style="color:var(--success);font-size:0.8rem;margin-top:0.3rem;"><i class="fa-solid fa-lightbulb"></i> ${result.suggestion}</div></div>`;
  } catch (err) { container.innerHTML = `<div class="equipment-result" style="color:var(--danger);">Erro: ${err.message}</div>`; }
};

// ===================== AI ANALYSIS =====================
window.runAiAnalysis = function() {
  const status = document.getElementById('ai-status');
  const container = document.getElementById('ai-results-container');
  status.innerHTML = '<span style="color:var(--primary);"><i class="fa-solid fa-spinner fa-spin"></i> Analisando dados...</span>';
  container.innerHTML = '<div class="empty-state"><i class="fa-solid fa-spinner fa-spin" style="opacity:1;"></i><h4>Processando verificação...</h4><p>Analisando padrões de deslocamento e qualidade do áudio.</p></div>';
  setTimeout(() => {
    status.innerHTML = '<span style="color:var(--success);"><i class="fa-solid fa-check"></i> Verificação concluída.</span>';
    container.innerHTML = `
      <div class="ai-result-card anomaly"><h4 style="color:var(--danger);"><i class="fa-solid fa-triangle-exclamation"></i> Anomalia de Velocidade</h4><p>O pesquisador <strong>Bruno Pesquisador</strong> preencheu 3 questionários em menos de 2 minutos. Possível fraude.</p></div>
      <div class="ai-result-card warning"><h4 style="color:var(--warning);"><i class="fa-solid fa-wave-square"></i> Qualidade de Áudio Suspeita</h4><p>A entrevista <strong>int_005</strong> apresenta 80% de silêncio sem vozes inteligíveis. Recomendada auditoria manual.</p></div>
      <div class="ai-result-card ok"><h4 style="color:var(--success);"><i class="fa-solid fa-location-dot"></i> GPS Consistente</h4><p>Todos os deslocamentos da <strong>Ana Pesquisadora</strong> hoje (14km) são consistentes com a malha viária e o tempo de coleta.</p></div>`;
    showToast('success', 'Verificação de qualidade finalizada.');
  }, 2500);
};

// ===================== LOGS =====================
async function fetchLogs() {
  const container = document.getElementById('log-console-container');
  if (state.activeRole !== 'DEV') { container.innerHTML = '<div class="empty-state"><i class="fa-solid fa-lock"></i><h4>Acesso restrito</h4><p>Apenas o perfil de Suporte Técnico (DEV) pode visualizar os registros.</p></div>'; return; }
  try {
    const logs = await apiFetch('/api/logs');
    state.logs = logs;
    if (!logs || logs.length === 0) { container.innerHTML = '<div class="empty-state"><i class="fa-solid fa-shield-halved"></i><h4>Nenhum registro</h4><p>Os eventos de segurança aparecerão aqui.</p></div>'; return; }
    let html = '<table class="data-table"><thead><tr><th>Data/Hora</th><th>Severidade</th><th>Tipo</th><th>Comando</th><th>Perfil</th></tr></thead><tbody>';
    logs.forEach(l => {
      html += `<tr><td style="font-size:0.78rem;">${new Date(l.timestamp).toLocaleString('pt-BR')}</td><td><span class="severity-badge sev-${l.severity}">${l.severity}</span></td><td style="font-size:0.82rem;">${l.type}</td><td style="font-family:var(--font-mono);font-size:0.78rem;">${l.command_requested||'-'}</td><td>${l.user_role||'-'}</td></tr>`;
    });
    html += '</tbody></table>';
    container.innerHTML = html;
  } catch (err) { container.innerHTML = `<div style="color:var(--danger);">Erro ao carregar registros: ${err.message}</div>`; }
}

// ===================== DATA EXPORTER =====================
function initDataExporter() {
  document.getElementById('btn-export-data').addEventListener('click', () => {
    let toExport = state.interviews;
    if (state.activeProjectFormId) {
      toExport = toExport.filter(i => i.form_id === state.activeProjectFormId);
    }
    
    if (toExport.length === 0) { showToast('warning', 'Nenhum dado disponível para exportar neste projeto.'); return; }
    
    // Extract all unique JSON keys
    let keys = new Set();
    toExport.forEach(i => {
      if (i.data) {
        Object.keys(i.data).forEach(k => keys.add(k));
      }
    });
    const dataKeys = Array.from(keys);
    
    let csv = 'ID;FormId;Versao;Pesquisador;DeviceID;Latitude;Longitude;AudioUrl;DataCriacao;AprovadoPor;';
    csv += dataKeys.join(';') + '\r\n';
    
    toExport.forEach(i => {
      let row = `"${i.id}";"${i.form_id}";${i.form_version};"${i.researcher_id}";"${i.device_id||''}";"${i.latitude||''}";"${i.longitude||''}";"${i.audio_url||''}";"${i.created_at}";"${i.approved_by||''}";`;
      let ansVals = dataKeys.map(k => {
        let val = (i.data && i.data[k]) ? i.data[k] : '';
        if (Array.isArray(val)) val = val.join(', ');
        return `"${String(val).replace(/"/g, '""')}"`;
      });
      row += ansVals.join(';') + '\r\n';
      csv += row;
    });
    
    // Use BOM for Excel UTF-8 support
    const blob = new Blob(["\uFEFF" + csv], { type:'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `datapesquise_entrevistas_${new Date().toISOString().substring(0,10)}.csv`;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('success', 'Planilha exportada com sucesso!');
  });
}

// ===================== TEAM =====================
async function loadTeam() {
  const usersTable = document.getElementById('users-tbody');
  try {
    const users = await apiFetch('/api/users');
    const routes = await apiFetch('/api/routes');
    const forms = await apiFetch('/api/forms');
    
    if(usersTable) {
      usersTable.innerHTML = '';
      users.filter(u => u.status !== 'deleted').forEach(u => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><strong>${u.name}</strong><br><span style="font-size:0.75rem;color:var(--text-muted);">${u.email}</span></td>
          <td><span class="badge badge-info">${ROLE_LABELS[u.role]||u.role}</span></td>
          <td>
            <button class="btn-icon" style="color:var(--primary)" onclick="editUser('${u.id}')" title="Editar"><i class="fa-solid fa-pen-to-square"></i></button>
            <button class="btn-icon" style="color:var(--danger)" onclick="deleteUser('${u.id}')" title="Remover"><i class="fa-solid fa-trash"></i></button>
          </td>
        `;
        usersTable.appendChild(tr);
      });
    }

    
    const resSelect = document.getElementById('route-form-researcher');
    if(resSelect) {
      resSelect.innerHTML = users.filter(u => u.status !== 'deleted' && u.role === 'Researcher').map(u => `<option value="${u.id}">${u.name}</option>`).join('');
    }
  } catch(err) {
    showToast('error', 'Erro ao carregar equipe.');
  }
}

async function loadProjectAccess() {
  if (!state.activeProjectFormId) return;
  const routesTable = document.getElementById('routes-tbody');
  if (!routesTable) return;
  try {
    const routes = await apiFetch('/api/routes');
    const projectRoutes = routes.filter(r => r.form_id === state.activeProjectFormId);
    
    routesTable.innerHTML = '';
    if (projectRoutes.length === 0) {
      routesTable.innerHTML = '<tr><td colspan="4" style="text-align:center;">Nenhum pesquisador atribuído a este projeto.</td></tr>';
      return;
    }
    
    projectRoutes.forEach(r => {
      const date = new Date(r.created_at).toLocaleDateString('pt-BR');
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${r.researcher_name}</strong></td>
        <td>${date}</td>
        <td>
          <button class="btn-icon" style="color:var(--danger)" onclick="deleteRoute('${r.id}')" title="Remover Acesso"><i class="fa-solid fa-trash"></i></button>
        </td>
      `;
      routesTable.appendChild(tr);
    });
    
    // Certifique-se de popular o select de pesquisadores se ainda não estiver
    const users = await apiFetch('/api/users');
    const resSelect = document.getElementById('route-form-researcher');
    if (resSelect && resSelect.options.length === 0) {
      resSelect.innerHTML = users.filter(u => u.status !== 'deleted' && u.role === 'Researcher').map(u => `<option value="${u.id}">${u.name}</option>`).join('');
    }
  } catch(err) {
    showToast('error', 'Erro ao carregar acessos do projeto.');
  }
}

window.openUserModal = function() {
  document.getElementById('user-form-id').value = '';
  document.getElementById('user-form-name').value = '';
  document.getElementById('user-form-email').value = '';
  document.getElementById('user-form-role').value = 'Researcher';
  document.getElementById('user-form-password').value = '';
  document.getElementById('user-modal-title').textContent = 'Novo Usuário';
  document.getElementById('user-modal').classList.add('active');
};
window.closeUserModal = function() { document.getElementById('user-modal').classList.remove('active'); };
window.saveUser = async function() {
  const id = document.getElementById('user-form-id').value;
  const name = document.getElementById('user-form-name').value;
  const email = document.getElementById('user-form-email').value;
  const role = document.getElementById('user-form-role').value;
  const password = document.getElementById('user-form-password').value;
  
  if(!name || !email) { showToast('warning', 'Preencha nome e e-mail.'); return; }
  
  try {
    if(id) {
      await apiFetch(`/api/users/${id}`, { method: 'PUT', body: JSON.stringify({ name, email, role, password }) });
      showToast('success', 'Usuário atualizado!');
    } else {
      if(!password) { showToast('warning', 'A senha inicial é obrigatória.'); return; }
      await apiFetch('/api/users', { method: 'POST', body: JSON.stringify({ name, email, role, password }) });
      showToast('success', 'Usuário criado!');
    }
    closeUserModal();
    loadTeam();
  } catch(err) { showToast('error', err.message); }
};
window.editUser = async function(id) {
  try {
    const users = await apiFetch('/api/users');
    const u = users.find(x => x.id === id);
    if(u) {
      document.getElementById('user-form-id').value = u.id;
      document.getElementById('user-form-name').value = u.name;
      document.getElementById('user-form-email').value = u.email;
      document.getElementById('user-form-role').value = u.role;
      document.getElementById('user-form-password').value = '';
      document.getElementById('user-modal-title').textContent = 'Editar Usuário';
      document.getElementById('user-modal').classList.add('active');
    }
  } catch(err) {}
};
window.deleteUser = function(id) {
  showConfirm('Remover Usuário', 'Tem certeza que deseja desativar este usuário?', async () => {
    try {
      await apiFetch(`/api/users/${id}`, { method: 'DELETE' });
      showToast('success', 'Usuário removido.');
      loadTeam();
    } catch(err) { showToast('error', err.message); }
  });
};

window.openRouteModal = function() {
  if (!state.activeProjectFormId) {
    showToast('error', 'Nenhum projeto selecionado.');
    return;
  }
  document.getElementById('route-modal').classList.add('active');
};
window.closeRouteModal = function() { document.getElementById('route-modal').classList.remove('active'); };
window.saveRoute = async function() {
  const researcher_id = document.getElementById('route-form-researcher').value;
  const form_id = state.activeProjectFormId;
  if(!researcher_id || !form_id) { showToast('warning', 'Selecione o pesquisador.'); return; }
  try {
    await apiFetch('/api/routes', { method: 'POST', body: JSON.stringify({ researcher_id, form_id }) });
    showToast('success', 'Acesso habilitado para o projeto!');
    closeRouteModal();
    loadProjectAccess();
  } catch(err) { showToast('error', err.message); }
};
window.deleteRoute = function(id) {
  showConfirm('Remover Acesso', 'O pesquisador não terá mais acesso a este projeto no aplicativo. Continuar?', async () => {
    try {
      await apiFetch(`/api/routes/${id}`, { method: 'DELETE' });
      showToast('success', 'Acesso removido.');
      loadProjectAccess();
    } catch(err) { showToast('error', err.message); }
  });
};

// ===================== ODK URL COPY =====================
window.copyOdkUrl = function() {
  const url = document.getElementById('odk-server-url').textContent;
  navigator.clipboard.writeText(url).then(() => showToast('success', 'Endereço copiado!')).catch(() => showToast('info', 'Copie manualmente: ' + url));
};

// ===================== ROLES & PERMISSIONS =====================
async function loadRoles() {
  const tbody = document.getElementById('roles-tbody');
  if (!tbody) return;
  try {
    const roles = await apiFetch('/api/roles');
    tbody.innerHTML = '';
    if (roles.length === 0) {
      tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">Nenhum cargo customizado criado.</td></tr>';
      return;
    }
    roles.forEach(role => {
      const perms = role.permissions.split(',').map(p => `<span class="badge badge-info" style="margin:2px;">${p}</span>`).join('');
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${role.name}</strong></td>
        <td>${perms}</td>
        <td><button class="btn btn-sm btn-danger" onclick="deleteRole('${role.id}')"><i class="fa-solid fa-trash"></i></button></td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    showToast('error', 'Erro ao carregar cargos: ' + err.message);
  }
}

window.saveNewRole = async function() {
  const name = document.getElementById('role-form-name').value;
  const checkboxes = document.querySelectorAll('.role-perm-cb:checked');
  const permissions = Array.from(checkboxes).map(cb => cb.value).join(',');
  
  if (!name || !permissions) {
    showToast('warning', 'Preencha o nome do cargo e selecione pelo menos uma permissão.');
    return;
  }
  
  try {
    await apiFetch('/api/roles', { method: 'POST', body: JSON.stringify({ name, permissions }) });
    showToast('success', 'Cargo criado com sucesso!');
    document.getElementById('role-form-name').value = '';
    document.querySelectorAll('.role-perm-cb').forEach(cb => cb.checked = false);
    loadRoles();
  } catch (err) {
    showToast('error', 'Erro ao salvar cargo: ' + err.message);
  }
};

window.deleteRole = function(id) {
  showConfirm('Excluir Cargo', 'Tem certeza que deseja apagar este cargo? Usuários com este cargo perderão os acessos.', async () => {
    try {
      await apiFetch(`/api/roles/${id}`, { method: 'DELETE' });
      showToast('success', 'Cargo apagado com sucesso!');
      loadRoles();
    } catch(err) {
      showToast('error', 'Erro ao apagar cargo: ' + err.message);
    }
  }, { type: 'danger', confirmText: 'Apagar' });
};

// ===================== INIT =====================
document.addEventListener('DOMContentLoaded', async () => {
  // Navigation
  document.querySelectorAll('.sidebar-nav .nav-item').forEach(item => {
    item.addEventListener('click', (e) => { e.preventDefault(); switchTab(item.dataset.target); });
  });

  // Mobile sidebar toggle
  document.getElementById('sidebar-toggle-mobile').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('mobile-open');
  });

  // Role switcher
  document.getElementById('role-select').addEventListener('change', async (e) => {
    state.activeRole = e.target.value;
    state.activeUserId = MOCK_USER_IDS[state.activeRole] || 'anonymous';
    updateUserUI();
    applyRoleRestrictions();
    await loadServerData();
    renderDashboard();
    renderFormBuilderList();
    renderAudioReviewList();
  });

  // Load data
  await loadServerData();

  // Initialize components
  updateUserUI();
  applyRoleRestrictions();
  renderDashboard();
  initFormBuilder();
  renderFormBuilderList();
  if (state.forms.length > 0) loadFormIntoBuilder(state.forms[0]);
  initMobileSimulator();
  initDataExporter();
  renderAudioReviewList();

  // Refresh logs button
  document.getElementById('btn-refresh-logs').addEventListener('click', fetchLogs);

  // Reports Events
  const btnExportReports = document.getElementById('btn-export-reports');
  if (btnExportReports) {
    btnExportReports.addEventListener('click', () => {
      const btnExportMain = document.getElementById('btn-export-data');
      if (btnExportMain) btnExportMain.click();
    });
  }
  ['report-filter-form','report-filter-researcher','report-filter-status','report-filter-date'].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.addEventListener('change', renderReportsTable);
  });

  // Init map on first map tab visit
  const mapNav = document.getElementById('nav-map');
  if (mapNav) {
    const initMapOnce = () => { setTimeout(() => initMap(), 200); mapNav.removeEventListener('click', initMapOnce); };
    mapNav.addEventListener('click', initMapOnce);
  }

  // Try loading logs quietly
  try { state.logs = await apiFetch('/api/logs'); } catch {}
  renderDashboard();
  
  // Load roles panel if accessible
  const rolesNav = document.querySelector('.nav-item[data-target="view-roles"]');
  if (rolesNav) {
    rolesNav.addEventListener('click', () => loadRoles());
  }
});
