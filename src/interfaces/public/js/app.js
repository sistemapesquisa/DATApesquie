// Antigravity SPA Core Engine

// State Management
const state = {
  activeRole: 'Coordinator',
  activeUserId: 'coord_user',
  forms: [],
  interviews: [],
  users: [],
  logs: [],
  
  // Form Builder Active Workarea
  activeForm: {
    id: '',
    title: '',
    status: 'draft',
    version: 1,
    questions: []
  },
  
  // Mobile Simulator state
  simSelectedFormId: '',
  simActiveForm: null,
  simAnswers: {},
  simCurrentQuestionIdx: 0,
  simOfflineQueue: [],
  simIsOnline: true,
  simAudioFile: null,
  simIsRecording: false,
  
  // Leaflet map instance
  map: null,
  mapMarkers: [],
  
  // Chart.js instance
  statusChart: null
};

// Mock User Mapping for headers
const MOCK_USER_IDS = {
  DEV: 'dev_user',
  Admin: 'admin_user',
  Analyst: 'analyst_user',
  Coordinator: 'coord_user',
  Supervisor: 'super_user',
  Researcher: 'researcher_1'
};

// Researcher Pins Color Map
const RESEARCHER_COLORS = {
  researcher_1: '#ff3d00', // Ana (Red-Orange)
  researcher_2: '#9d4edd', // Bruno (Purple)
  researcher_3: '#00e676', // Carla (Green)
  researcher_4: '#00e5ff'  // Daniel (Cyan)
};

const DEFAULT_PIN_COLOR = '#ffc400';

// Detection of local static run (direct index.html load in browser)
const IS_OFFLINE_PREVIEW = window.location.protocol === 'file:' || window.location.hostname === '';

// Virtual Database for Offline Preview mode
const virtualDb = {
  initialized: false,
  
  init() {
    if (this.initialized) return;
    
    // Seed initial users if not present
    if (!localStorage.getItem('vdb_users')) {
      const initialUsers = [
        { id: "dev_user", name: "Gustavo Dev", email: "dev@antigravity.corp", role: "DEV", status: "active", created_at: new Date().toISOString() },
        { id: "admin_user", name: "Clara Admin", email: "admin@cliente.com", role: "Admin", status: "active", created_at: new Date().toISOString() },
        { id: "analyst_user", name: "Felipe Analista", email: "analyst@cliente.com", role: "Analyst", status: "active", created_at: new Date().toISOString() },
        { id: "coord_user", name: "Helena Coordenadora", email: "coordinator@cliente.com", role: "Coordinator", status: "active", created_at: new Date().toISOString() },
        { id: "super_user", name: "Marcos Supervisor", email: "supervisor@cliente.com", role: "Supervisor", status: "active", created_at: new Date().toISOString() },
        { id: "researcher_1", name: "Ana Pesquisadora", email: "ana@freelancer.com", role: "Researcher", status: "active", created_at: new Date().toISOString() },
        { id: "researcher_2", name: "Bruno Pesquisador", email: "bruno@freelancer.com", role: "Researcher", status: "active", created_at: new Date().toISOString() },
        { id: "researcher_3", name: "Carla Pesquisadora", email: "carla@freelancer.com", role: "Researcher", status: "active", created_at: new Date().toISOString() },
        { id: "researcher_4", name: "Daniel Pesquisador", email: "daniel@freelancer.com", role: "Researcher", status: "active", created_at: new Date().toISOString() }
      ];
      localStorage.setItem('vdb_users', JSON.stringify(initialUsers));
    }

    // Seed initial forms if not present
    if (!localStorage.getItem('vdb_forms')) {
      const initialForms = [
        {
          id: "form_censo",
          title: "Censo Sócio-Econômico do Sertão",
          version: 2,
          status: "published",
          questions_json: JSON.stringify([
            { id: "Q1", text: "Qual a sua faixa etária?", type: "single_choice", options: ["Menos de 18 anos", "18 a 35 anos", "36 a 60 anos", "Mais de 60 anos"], skipRules: [] },
            { id: "Q2", text: "Você possui acesso à energia elétrica estável?", type: "single_choice", options: ["Sim", "Não"], skipRules: [{ conditionValue: "Não", targetQuestionId: "Q4" }] },
            { id: "Q3", text: "Qual a principal fonte de energia usada em sua casa?", type: "single_choice", options: ["Rede pública", "Painel Solar", "Gerador próprio", "Outros"], skipRules: [] },
            { id: "Q4", text: "Descreva brevemente os principais desafios na sua região.", type: "text", options: [], skipRules: [] },
            { id: "Q5", text: "Por favor, grave o depoimento final do entrevistado.", type: "audio_record", options: [], skipRules: [] }
          ])
        },
        {
          id: "form_saneamento",
          title: "Pesquisa Saneamento Interiorano",
          version: 1,
          status: "published",
          questions_json: JSON.stringify([
            { id: "S1", text: "Tem água encanada?", type: "single_choice", options: ["Sim", "Não"], skipRules: [{ conditionValue: "Sim", targetQuestionId: "S3" }] },
            { id: "S2", text: "Como você obtém água?", type: "single_choice", options: ["Poço artesiano", "Caminhão pipa", "Chuva/Cisterna", "Rio/Lago"], skipRules: [] },
            { id: "S3", text: "Qualidade percebida da água?", type: "single_choice", options: ["Excelente", "Boa", "Regular", "Ruim"], skipRules: [] }
          ])
        }
      ];
      localStorage.setItem('vdb_forms', JSON.stringify(initialForms));
    }

    // Seed initial interviews if not present
    if (!localStorage.getItem('vdb_interviews')) {
      const initialInterviews = [
        {
          id: "int_001", form_id: "form_censo", form_version: 2, researcher_id: "researcher_1",
          data_json: JSON.stringify({ Q1: "18 a 35 anos", Q2: "Sim", Q3: "Rede pública", Q4: "Falta de pavimentação nas ruas", Q5: "audio_001.mp3" }),
          latitude: -9.3833, longitude: -40.5000, audio_url: "/audio-vault/audio_001.mp3", status: "approved", created_at: "2026-06-01T10:30:00Z", approved_by: "analyst_user", notes: "Entrevista bem estruturada e áudio claro."
        },
        {
          id: "int_002", form_id: "form_censo", form_version: 2, researcher_id: "researcher_1",
          data_json: JSON.stringify({ Q1: "36 a 60 anos", Q2: "Não", Q4: "Acesso à saúde é muito demorado", Q5: "audio_002.mp3" }),
          latitude: -9.4122, longitude: -40.5134, audio_url: "/audio-vault/audio_002.mp3", status: "pending", created_at: "2026-06-02T14:15:00Z", approved_by: null, notes: ""
        },
        {
          id: "int_003", form_id: "form_censo", form_version: 2, researcher_id: "researcher_2",
          data_json: JSON.stringify({ Q1: "Mais de 60 anos", Q2: "Sim", Q3: "Painel Solar", Q4: "Segurança no período da noite", Q5: "audio_003.mp3" }),
          latitude: -3.6888, longitude: -40.3498, audio_url: "/audio-vault/audio_003.mp3", status: "pending", created_at: "2026-06-02T11:00:00Z", approved_by: null, notes: ""
        },
        {
          id: "int_004", form_id: "form_saneamento", form_version: 1, researcher_id: "researcher_3",
          data_json: JSON.stringify({ S1: "Não", S2: "Caminhão pipa", S3: "Regular" }),
          latitude: -9.8970, longitude: -38.6941, audio_url: "/audio-vault/audio_004.mp3", status: "approved", created_at: "2026-05-30T16:45:00Z", approved_by: "analyst_user", notes: "Validada."
        },
        {
          id: "int_005", form_id: "form_saneamento", form_version: 1, researcher_id: "researcher_4",
          data_json: JSON.stringify({ S1: "Sim", S3: "Excelente" }),
          latitude: -8.8123, longitude: -38.5678, audio_url: "/audio-vault/audio_005.mp3", status: "rejected", created_at: "2026-06-01T09:20:00Z", approved_by: null, notes: "Áudio com chiado excessivo e sem voz inteligível."
        }
      ];
      localStorage.setItem('vdb_interviews', JSON.stringify(initialInterviews));
    }

    // Seed initial security logs if not present
    if (!localStorage.getItem('vdb_logs')) {
      const initialLogs = [
        { id: "log_001", type: "COMMAND_EXECUTION", severity: "LOW", command_requested: "show version", user_role: "DEV", timestamp: "2026-06-02T18:00:00Z" },
        { id: "log_002", type: "DESTRUCTIVE_COMMAND_BLOCKED", severity: "CRITICAL", command_requested: "reboot", user_role: "Coordinator", timestamp: "2026-06-02T19:15:00Z" },
        { id: "log_003", type: "DESTRUCTIVE_COMMAND_BLOCKED", severity: "HIGH", command_requested: "/interface disable ether1", user_role: "Admin", timestamp: "2026-06-02T19:30:00Z" },
        { id: "log_004", type: "UNAUTHORIZED_ACCESS", severity: "MEDIUM", command_requested: "view financials", user_role: "Researcher", timestamp: "2026-06-02T19:45:00Z" }
      ];
      localStorage.setItem('vdb_logs', JSON.stringify(initialLogs));
    }

    this.initialized = true;
  },

  get(key) {
    this.init();
    return JSON.parse(localStorage.getItem('vdb_' + key) || '[]');
  },

  set(key, val) {
    this.init();
    localStorage.setItem('vdb_' + key, JSON.stringify(val));
  }
};

// API Fetch helper containing role headers or client virtual DB fallback
async function apiFetch(url, options = {}) {
  // If we run in Offline direct html double click preview, simulate server client-side
  if (IS_OFFLINE_PREVIEW) {
    return simulateOfflineApi(url, options);
  }

  try {
    const headers = {
      'Content-Type': 'application/json',
      'x-user-role': state.activeRole,
      'x-user-id': state.activeUserId,
      ...(options.headers || {})
    };
    
    const response = await fetch(url, { ...options, headers });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }
    
    return await response.json();
  } catch (err) {
    // Failover silently to offline simulation to keep user experience wowed even if Node is not running
    console.warn("Backend server not reached. Bypassing to Client-Side Local Storage database simulation.");
    return simulateOfflineApi(url, options);
  }
}

// Client-Side Virtual Monolith API Routing Simulation
function simulateOfflineApi(url, options) {
  const method = options.method || 'GET';
  const body = options.body ? JSON.parse(options.body) : null;
  const userRole = state.activeRole;
  const userId = state.activeUserId;

  // 1. GET /api/forms
  if (url === '/api/forms' && method === 'GET') {
    const list = virtualDb.get('forms');
    return list.map(f => ({ ...f, questions: JSON.parse(f.questions_json) }));
  }

  // 2. POST /api/forms (FormBuilder save)
  if (url === '/api/forms' && method === 'POST') {
    const list = virtualDb.get('forms');
    const questions = body.questions;
    let target = list.find(f => f.id === body.id);
    
    // Evaluate logic warnings client side
    const validation = [];
    const idToIndex = new Map();
    questions.forEach((q, idx) => idToIndex.set(q.id, idx));
    
    questions.forEach((q, idx) => {
      (q.skipRules || []).forEach(rule => {
        if (!rule.targetQuestionId) {
          validation.push({ type: 'ERROR', message: `Questão "${q.id}" possui regra de pulo sem questão de destino.` });
        } else {
          const targetIdx = idToIndex.get(rule.targetQuestionId);
          if (targetIdx === undefined) {
            validation.push({ type: 'ERROR', message: `Questão "${q.id}" pula para "${rule.targetQuestionId}", que não existe.` });
          } else if (rule.targetQuestionId === q.id) {
            validation.push({ type: 'ERROR', message: `Questão "${q.id}" pula para ela mesma (loop).` });
          } else if (targetIdx < idx) {
            validation.push({ type: 'WARNING', message: `Questão "${q.id}" pula para trás para "${rule.targetQuestionId}" (risco de loop).` });
          }
        }
      });
    });

    let savedForm;
    if (target) {
      let version = target.version;
      const qChanged = target.questions_json !== JSON.stringify(questions);
      if (target.status === 'published' && qChanged) {
        version++;
      }
      target.title = body.title;
      target.status = body.status;
      target.version = version;
      target.questions_json = JSON.stringify(questions);
      savedForm = target;
    } else {
      const newForm = {
        id: 'form_' + Math.random().toString(36).substring(2, 8),
        title: body.title,
        status: body.status,
        version: 1,
        questions_json: JSON.stringify(questions)
      };
      list.push(newForm);
      savedForm = newForm;
    }
    
    virtualDb.set('forms', list);
    return {
      success: true,
      form: { ...savedForm, questions },
      validation
    };
  }

  // 3. GET /api/interviews
  if (url === '/api/interviews' && method === 'GET') {
    const list = virtualDb.get('interviews');
    return list.map(i => ({ ...i, data: JSON.parse(i.data_json) }));
  }

  // 4. POST /api/interviews
  if (url === '/api/interviews' && method === 'POST') {
    const list = virtualDb.get('interviews');
    const interviewId = 'int_' + Math.random().toString(36).substring(2, 8);
    const audioUrl = body.audioFileName ? `/audio-vault/${body.audioFileName}` : null;
    
    const newInterview = {
      id: interviewId,
      form_id: body.formId,
      form_version: parseInt(body.formVersion),
      researcher_id: userId || 'researcher_1',
      data_json: JSON.stringify(body.data),
      latitude: parseFloat(body.latitude) || null,
      longitude: parseFloat(body.longitude) || null,
      audio_url: audioUrl,
      status: 'pending',
      created_at: new Date().toISOString(),
      approved_by: null,
      notes: ''
    };
    
    list.push(newInterview);
    virtualDb.set('interviews', list);
    return { success: true, interviewId, audioUrl };
  }

  // 5. PUT /api/interviews/:id/status (Approval)
  if (url.startsWith('/api/interviews/') && url.endsWith('/status') && method === 'PUT') {
    const interviewId = url.split('/')[3];
    const list = virtualDb.get('interviews');
    const target = list.find(i => i.id === interviewId);
    if (target) {
      target.status = body.status;
      target.notes = body.notes;
      target.approved_by = userId;
      virtualDb.set('interviews', list);
    }
    return { success: true };
  }

  // 6. GET /api/users
  if (url === '/api/users' && method === 'GET') {
    return virtualDb.get('users');
  }

  // 7. POST /api/users (Freelancer creation)
  if (url === '/api/users' && method === 'POST') {
    const list = virtualDb.get('users');
    const newId = 'researcher_' + (list.length + 1);
    const newUser = {
      id: newId,
      name: body.name,
      email: body.email,
      role: body.role,
      status: 'active',
      created_at: new Date().toISOString()
    };
    list.push(newUser);
    virtualDb.set('users', list);
    return { success: true, user: newUser };
  }

  // 8. DELETE /api/users/:id (Freelancer soft delete)
  if (url.startsWith('/api/users/') && method === 'DELETE') {
    const uid = url.split('/')[3];
    const list = virtualDb.get('users');
    const target = list.find(u => u.id === uid);
    if (target) {
      target.status = 'deleted';
      virtualDb.set('users', list);
    }
    return { success: true };
  }

  // 9. GET /api/logs
  if (url === '/api/logs' && method === 'GET') {
    return virtualDb.get('logs');
  }

  // 10. POST /api/network/command (Read-only Command guard simulation)
  if (url === '/api/network/command' && method === 'POST') {
    const command = body.command.trim();
    const list = virtualDb.get('logs');
    
    // Command evaluator matching rules
    let severity = 'LOW';
    let allowed = false;
    let message = '';
    let suggestion = '';
    
    const isDestructive = /reboot|reset|shutdown|format/i.test(command) || 
                          /\/system reset/i.test(command) || 
                          /\/interface disable/i.test(command) || 
                          /\/ip route remove/i.test(command);
    
    if (isDestructive) {
      severity = /reboot|reset|shutdown|format/i.test(command) ? 'CRITICAL' : 'HIGH';
      message = `Bloqueado: Comando destrutivo detectado.`;
      suggestion = `AÇÃO PROIBIDA. Solicite aprovação física e intervenção manual local se for realmente necessário.`;
    } else {
      const isConfig = /set|add|remove|enable|disable/i.test(command);
      severity = isConfig ? 'MEDIUM' : 'LOW';
      message = `Bloqueado: Sistema opera em modo estritamente READ-ONLY para equipamentos.`;
      suggestion = `Sugestão para operador: Execute manualmente o comando no terminal do equipamento:\n  > ${command}`;
    }
    
    // Add audit log
    const logId = 'sec_' + Math.random().toString(36).substring(2, 10);
    const newLog = {
      id: logId,
      type: isDestructive ? 'DESTRUCTIVE_COMMAND_BLOCKED' : 'COMMAND_READ_ONLY_BLOCKED',
      severity,
      command_requested: command,
      user_role: userRole,
      timestamp: new Date().toISOString()
    };
    list.unshift(newLog);
    virtualDb.set('logs', list);
    
    return { allowed, severity, message, suggestion };
  }

  return Promise.reject(new Error('Endpoint virtual não encontrado'));
}


// Initial Bootstrapping
window.addEventListener('DOMContentLoaded', async () => {
  initRoleSwitcher();
  initNavigation();
  initMap();
  
  // Load initial data
  await loadServerData();
  
  // Init other parts
  initFormBuilder();
  initMobileSimulator();
  initCliConsole();
  initDataExporter();
  
  // Render Dashboard
  renderDashboard();

  // Set ODK server url based on current host
  const odkUrlEl = document.getElementById('odk-server-url');
  if (odkUrlEl) {
    if (window.location.protocol === 'file:') {
      odkUrlEl.innerText = `http://[IP_SEU_SERVIDOR]:3000/api`;
    } else {
      odkUrlEl.innerText = `${window.location.protocol}//${window.location.host}/api`;
    }
  }
  
  // Background interval for logs (if DEV)
  setInterval(() => {
    if (state.activeRole === 'DEV') {
      fetchLogsQuietly();
    }
  }, 5000);
});

// Load Forms, Interviews, and Users from API
async function loadServerData() {
  try {
    state.forms = await apiFetch('/api/forms');
    state.interviews = await apiFetch('/api/interviews');
    state.users = await apiFetch('/api/users');
    
    // Render builder lists & maps
    renderFormBuilderList();
    renderMapInterviews();
    renderSupervisorReviewList();
    renderFinancials();
  } catch (err) {
    console.error('Failed to load server data:', err);
    showToast('HIGH', 'Falha ao carregar dados do servidor: ' + err.message);
  }
}

// ----------------- ROLE & PERMISSIONS CONTROL -----------------
function initRoleSwitcher() {
  const select = document.getElementById('role-select');
  select.value = state.activeRole;
  
  select.addEventListener('change', async (e) => {
    state.activeRole = e.target.value;
    state.activeUserId = MOCK_USER_IDS[state.activeRole] || 'anonymous';
    
    // Reset mobile simulator answers to prevent leaks
    state.simAnswers = {};
    state.simCurrentQuestionIdx = 0;
    
    // Update active prompt CLI prefix
    document.getElementById('cli-prompt-label').innerText = `${state.activeRole}@node01:~$`;
    
    // Sync state
    await loadServerData();
    applyRbacRestrictions();
    renderDashboard();
    
    showToast('LOW', `Perfil Operacional alterado para: ${state.activeRole}`);
  });

  applyRbacRestrictions();
}

function applyRbacRestrictions() {
  const role = state.activeRole;
  
  // 1. Logs Tab Visibility
  const navLogs = document.getElementById('nav-logs');
  const viewLogs = document.getElementById('view-logs');
  if (role === 'DEV') {
    navLogs.style.display = 'block';
    viewLogs.classList.remove('disabled');
    fetchLogs();
  } else {
    navLogs.style.display = 'none';
    viewLogs.classList.add('disabled');
    if (viewLogs.classList.contains('active')) {
      switchTab('view-dashboard');
    }
  }

  // 2. Financials Section Visibility (DEV/Admin/Analyst)
  const finSection = document.getElementById('financial-dashboard-section');
  if (role === 'DEV' || role === 'Admin' || role === 'Analyst') {
    finSection.classList.remove('disabled');
  } else {
    finSection.classList.add('disabled');
  }

  // 3. Form Builder Tab Visibility (Analyst/Admin/DEV)
  const navBuilder = document.getElementById('nav-form-builder');
  const viewBuilder = document.getElementById('view-form-builder');
  if (role === 'Analyst' || role === 'Admin' || role === 'DEV') {
    navBuilder.style.display = 'block';
    viewBuilder.classList.remove('disabled');
  } else {
    navBuilder.style.display = 'none';
    viewBuilder.classList.add('disabled');
    if (viewBuilder.classList.contains('active')) {
      switchTab('view-dashboard');
    }
  }

  // 4. Supervisor Review Panel Visibility (Supervisor/Analyst/Admin/DEV)
  const superPanel = document.getElementById('supervisor-validation-panel');
  if (role === 'Supervisor' || role === 'Analyst' || role === 'Admin' || role === 'DEV') {
    superPanel.classList.remove('disabled');
  } else {
    superPanel.classList.add('disabled');
  }
}

// Navigation Tabs
function initNavigation() {
  const navItems = document.querySelectorAll('#main-nav .nav-item');
  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const target = item.getAttribute('data-target');
      
      // If disabled view, do not navigate
      const viewPanel = document.getElementById(target);
      if (viewPanel.classList.contains('disabled')) return;
      
      switchTab(target);
    });
  });
}

function switchTab(targetId) {
  // Toggle nav classes
  const navItems = document.querySelectorAll('#main-nav .nav-item');
  navItems.forEach(item => {
    if (item.getAttribute('data-target') === targetId) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  // Toggle view panels
  const panels = document.querySelectorAll('.view-panel');
  panels.forEach(panel => {
    if (panel.id === targetId) {
      panel.classList.add('active');
      
      // If map is selected, recalculate size
      if (targetId === 'view-map' && state.map) {
        setTimeout(() => state.map.invalidateSize(), 200);
      }
    } else {
      panel.classList.remove('active');
    }
  });
}

// ----------------- DASHBOARD RENDER & CHARTS -----------------
function renderDashboard() {
  document.getElementById('dashboard-welcome').innerText = `Painel de Acompanhamento - Perfil: ${state.activeRole}`;
  
  // Set metric totals
  document.getElementById('metric-total-interviews').innerText = state.interviews.length;
  document.getElementById('metric-total-forms').innerText = state.forms.length;
  
  // Filter active freelancers (users with Researcher role and status active)
  const freelancers = state.users.filter(u => u.role === 'Researcher' && u.status === 'active');
  document.getElementById('metric-total-researchers').innerText = freelancers.length;
  
  // Count blocked security logs
  dbCountBlockedSecurityLogs();
  
  // Draw Status chart
  renderStatusChart();
}

function dbCountBlockedSecurityLogs() {
  // Count items from log array
  let blockedCount = 0;
  // Fallback if logs not loaded: fetch counts from server if DEV
  if (state.activeRole === 'DEV') {
    blockedCount = state.logs.filter(l => l.type === 'DESTRUCTIVE_COMMAND_BLOCKED').length;
    document.getElementById('metric-blocked-commands').innerText = blockedCount;
  } else {
    // Mock simulation counter based on interviews and default
    document.getElementById('metric-blocked-commands').innerText = 3;
  }
}

function renderStatusChart() {
  const ctx = document.getElementById('chart-statuses').getContext('2d');
  
  // Aggregate counts
  let pending = 0;
  let approved = 0;
  let rejected = 0;
  
  state.interviews.forEach(i => {
    if (i.status === 'pending') pending++;
    else if (i.status === 'approved') approved++;
    else if (i.status === 'rejected') rejected++;
  });
  
  if (state.statusChart) {
    state.statusChart.destroy();
  }
  
  state.statusChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Aprovada para Pagamento', 'Pendente', 'Rejeitada'],
      datasets: [{
        data: [approved, pending, rejected],
        backgroundColor: ['#00e676', '#ffc400', '#ff3d00'],
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.08)'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: {
            color: '#f8f9fa',
            font: { family: 'Outfit' }
          }
        }
      }
    }
  });
}

function renderFinancials() {
  const tbody = document.getElementById('financials-tbody');
  tbody.innerHTML = '';
  
  // Group metrics by researcher
  const researchers = state.users.filter(u => u.role === 'Researcher');
  
  researchers.forEach(r => {
    const list = state.interviews.filter(i => i.researcher_id === r.id);
    const approved = list.filter(i => i.status === 'approved').length;
    const rejected = list.filter(i => i.status === 'rejected').length;
    const total = list.length;
    
    // Freelancers earn R$ 50.00 per approved interview
    const earned = approved * 50.00;
    const rejectionRate = total > 0 ? ((rejected / total) * 100).toFixed(0) + '%' : '0%';
    
    const row = document.createElement('tr');
    row.style.borderBottom = '1px solid var(--glass-border)';
    
    // Status text
    const statusText = r.status === 'active' 
      ? `<span class="form-tag tag-pub" style="margin:0;">Ativo</span>`
      : `<span class="form-tag tag-draft" style="background:rgba(255,61,0,0.15); color:var(--status-red); margin:0;">Excluído</span>`;

    row.innerHTML = `
      <td style="padding: 0.8rem; font-weight:600;">${r.name}</td>
      <td style="padding: 0.8rem;">${total}</td>
      <td style="padding: 0.8rem; color: var(--status-green);">${approved}</td>
      <td style="padding: 0.8rem; color: ${rejected > 0 ? 'var(--status-red)' : 'inherit'}">${rejectionRate}</td>
      <td style="padding: 0.8rem; font-weight:700; color: var(--accent-cyan);">R$ ${earned.toFixed(2)}</td>
      <td style="padding: 0.8rem;">${statusText}</td>
    `;
    tbody.appendChild(row);
  });
}

// ----------------- INTERACTIVE FIELD MAP -----------------
function initMap() {
  // Centered in interior of Northeast Brazil (Juazeiro/Petrolina area)
  state.map = L.map('map').setView([-9.1000, -39.8000], 7);
  
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap contributors'
  }).addTo(state.map);
  
  // Set up event listeners for filters
  document.getElementById('map-filter-researcher').addEventListener('change', renderMapInterviews);
  document.getElementById('map-filter-status').addEventListener('change', renderMapInterviews);
  document.getElementById('map-filter-date').addEventListener('change', renderMapInterviews);
  
  document.getElementById('btn-clear-map-filters').addEventListener('click', () => {
    document.getElementById('map-filter-researcher').value = 'all';
    document.getElementById('map-filter-status').value = 'all';
    document.getElementById('map-filter-date').value = '';
    renderMapInterviews();
  });
}

function renderMapInterviews() {
  if (!state.map) return;
  
  // Clear markers
  state.mapMarkers.forEach(m => state.map.removeLayer(m));
  state.mapMarkers = [];
  
  // Read filter options
  const filterResearcher = document.getElementById('map-filter-researcher').value;
  const filterStatus = document.getElementById('map-filter-status').value;
  const filterDate = document.getElementById('map-filter-date').value;
  
  const filtered = state.interviews.filter(item => {
    if (filterResearcher !== 'all' && item.researcher_id !== filterResearcher) return false;
    if (filterStatus !== 'all' && item.status !== filterStatus) return false;
    
    if (filterDate) {
      const interviewDay = item.created_at.substring(0, 10);
      if (interviewDay !== filterDate) return false;
    }
    
    return item.latitude !== null && item.longitude !== null;
  });
  
  // Render pins
  filtered.forEach(item => {
    const color = RESEARCHER_COLORS[item.researcher_id] || DEFAULT_PIN_COLOR;
    const researcher = state.users.find(u => u.id === item.researcher_id);
    const researcherName = researcher ? researcher.name : item.researcher_id;
    const form = state.forms.find(f => f.id === item.form_id);
    const formTitle = form ? form.title : item.form_id;

    // Custom colored HTML marker representation
    const iconHtml = `<div style="background-color:${color}; width: 14px; height: 14px; border-radius: 50%; border: 2px solid #fff; box-shadow: 0 0 8px rgba(0,0,0,0.5);"></div>`;
    const customIcon = L.divIcon({
      html: iconHtml,
      className: 'custom-map-pin',
      iconSize: [14, 14],
      iconAnchor: [7, 7]
    });
    
    // Status badges
    let statusBadge = '';
    if (item.status === 'approved') statusBadge = '<span style="color:#00e676; font-weight:700;">Aprovada</span>';
    else if (item.status === 'rejected') statusBadge = '<span style="color:#ff3d00; font-weight:700;">Rejeitada</span>';
    else statusBadge = '<span style="color:#ffc400; font-weight:700;">Pendente</span>';

    // Build popup content
    let popupHtml = `
      <div style="font-family: 'Outfit', sans-serif; min-width: 220px; font-size:0.85rem;">
        <h4 style="color:var(--accent-cyan); font-size:0.95rem; margin-bottom: 4px;">${formTitle}</h4>
        <div style="margin-bottom: 6px; font-size:0.75rem; color:#888;">ID: ${item.id} (V${item.form_version})</div>
        <div><strong>Pesquisador:</strong> ${researcherName}</div>
        <div><strong>Coordenadas:</strong> ${item.latitude.toFixed(4)}, ${item.longitude.toFixed(4)}</div>
        <div><strong>Data/Hora:</strong> ${new Date(item.created_at).toLocaleString()}</div>
        <div><strong>Status:</strong> ${statusBadge}</div>
        <hr style="margin:8px 0; border:0; border-top:1px solid rgba(255,255,255,0.1);" />
        <strong>Respostas:</strong>
        <div style="background:rgba(0,0,0,0.3); padding:4px 8px; border-radius:4px; margin-top:4px; font-size:0.8rem; max-height: 80px; overflow-y:auto; color:#bbb;">
    `;
    
    for (const [qId, value] of Object.entries(item.data)) {
      if (qId !== 'Q5' && qId !== 'audio') { // skip large audio recordings in text summary
        popupHtml += `<div><strong>${qId}:</strong> ${value}</div>`;
      }
    }
    
    popupHtml += `</div>`;

    // Audio Playback integration if recording exists
    if (item.audio_url) {
      popupHtml += `
        <div style="margin-top: 10px;">
          <strong>Gravação de Áudio:</strong>
          <!-- Simulated responsive premium audio visualizer -->
          <div style="background:rgba(0,240,255,0.08); border:1px solid rgba(0,240,255,0.2); padding: 4px 8px; border-radius: 6px; display:flex; align-items:center; gap: 8px; margin-top: 4px;">
            <i class="fa-solid fa-play" style="color:var(--accent-cyan); cursor:pointer;" onclick="this.className = this.className.includes('play') ? 'fa-solid fa-pause' : 'fa-solid fa-play'"></i>
            <span style="font-size:0.75rem; color:#fff; flex:1;">${item.audio_url.replace('/audio-vault/', '')}</span>
            <span style="font-size:0.7rem; color:#888;">0:12</span>
          </div>
        </div>
      `;
    }

    popupHtml += `</div>`;

    const marker = L.marker([item.latitude, item.longitude], { icon: customIcon })
      .addTo(state.map)
      .bindPopup(popupHtml);
      
    state.mapMarkers.push(marker);
  });
}

// ----------------- SUPERVISOR REVIEW & VALIDATION -----------------
function renderSupervisorReviewList() {
  const container = document.getElementById('audio-review-list');
  container.innerHTML = '';
  
  // Show pending interviews with audio URLs first
  const auditable = state.interviews.filter(i => i.audio_url);
  
  if (auditable.length === 0) {
    container.innerHTML = '<div style="color:var(--text-secondary); text-align:center; padding:1rem;">Nenhuma gravação de áudio encontrada para auditoria.</div>';
    return;
  }
  
  auditable.forEach(item => {
    const researcher = state.users.find(u => u.id === item.researcher_id);
    const researcherName = researcher ? researcher.name : item.researcher_id;
    const form = state.forms.find(f => f.id === item.form_id);
    const formTitle = form ? form.title : item.form_id;

    const div = document.createElement('div');
    div.className = 'audio-review-item';
    
    // Status text wrapper
    let statusText = '';
    if (item.status === 'approved') statusText = '<span style="color:var(--status-green); font-weight:700;">Aprovada</span>';
    else if (item.status === 'rejected') statusText = '<span style="color:var(--status-red); font-weight:700;">Rejeitada</span>';
    else statusText = '<span style="color:var(--status-yellow); font-weight:700;">Pendente</span>';

    div.innerHTML = `
      <div style="flex:1;">
        <h4 style="color:var(--text-primary);">${formTitle}</h4>
        <div style="font-size:0.8rem; color:var(--text-secondary); margin-bottom: 0.5rem;">
          Pesquisador: <strong>${researcherName}</strong> | Data: ${new Date(item.created_at).toLocaleDateString()} | Status: ${statusText}
        </div>
        
        <!-- Audio Player mock widget -->
        <div style="display:flex; align-items:center; gap: 0.8rem; background:rgba(0,0,0,0.2); padding:0.6rem; border-radius:8px; margin-bottom:0.5rem; max-width: 450px;">
          <button class="btn" style="padding:0.4rem 0.8rem; margin:0;" onclick="playSimulatedAudio(this)">
            <i class="fa-solid fa-play"></i> Ouvir Áudio
          </button>
          <span style="font-family:var(--font-mono); font-size:0.8rem; color:var(--accent-cyan);">${item.audio_url.replace('/audio-vault/', '')}</span>
          <div style="flex:1; display:flex; gap:2px; align-items:center; height:15px;" class="mini-wave">
            <span style="width:2px; height:4px; background:#444;"></span>
            <span style="width:2px; height:8px; background:#444;"></span>
            <span style="width:2px; height:12px; background:#444;"></span>
            <span style="width:2px; height:6px; background:#444;"></span>
            <span style="width:2px; height:4px; background:#444;"></span>
          </div>
        </div>
      </div>
      
      <!-- Approval buttons -->
      <div style="display:flex; flex-direction:column; gap:0.5rem; justify-content:center;">
        <div style="display:flex; gap:0.5rem;">
          <button class="btn btn-primary" style="padding:0.4rem 0.8rem; font-size:0.8rem; background:var(--status-green);" onclick="auditInterviewStatus('${item.id}', 'approved')"><i class="fa-solid fa-check"></i> Aprovar</button>
          <button class="btn btn-danger" style="padding:0.4rem 0.8rem; font-size:0.8rem;" onclick="auditInterviewStatus('${item.id}', 'rejected')"><i class="fa-solid fa-xmark"></i> Rejeitar</button>
        </div>
        <input type="text" placeholder="Observações..." id="notes-${item.id}" class="filter-input" style="padding:0.4rem; font-size:0.8rem;" value="${item.notes || ''}" />
      </div>
    `;
    
    container.appendChild(div);
  });
}

window.playSimulatedAudio = function(btn) {
  const icon = btn.querySelector('i');
  const miniWave = btn.parentElement.querySelector('.mini-wave');
  const waveSpans = miniWave.querySelectorAll('span');
  
  if (icon.classList.contains('fa-play')) {
    icon.className = 'fa-solid fa-pause';
    // Start mini wave bouncing
    waveSpans.forEach((span, idx) => {
      span.style.background = 'var(--accent-cyan)';
      span.style.animation = `wave-bounce 0.8s ease-in-out infinite alternate`;
      span.style.animationDelay = `${idx * 0.15}s`;
    });
    
    // Auto-stop after 5 seconds
    setTimeout(() => {
      icon.className = 'fa-solid fa-play';
      waveSpans.forEach(span => {
        span.style.background = '#444';
        span.style.animation = 'none';
      });
    }, 5000);
  } else {
    icon.className = 'fa-solid fa-play';
    waveSpans.forEach(span => {
      span.style.background = '#444';
      span.style.animation = 'none';
    });
  }
};

window.auditInterviewStatus = async function(id, status) {
  const notesField = document.getElementById(`notes-${id}`);
  const notes = notesField ? notesField.value : '';
  
  try {
    const result = await apiFetch(`/api/interviews/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status, notes })
    });
    
    if (result.success) {
      showToast('LOW', `Entrevista ${id} classificada como: ${status === 'approved' ? 'APROVADA' : 'REJEITADA'}`);
      await loadServerData();
      renderDashboard();
    }
  } catch (err) {
    showToast('HIGH', 'Erro ao classificar entrevista: ' + err.message);
  }
};

// ----------------- FORM BUILDER CONTROLS -----------------
function initFormBuilder() {
  document.getElementById('btn-new-form').addEventListener('click', () => {
    loadFormIntoBuilder({
      id: '',
      title: 'Novo Formulário do Campo',
      status: 'draft',
      version: 1,
      questions: []
    });
  });

  document.getElementById('btn-add-question').addEventListener('click', () => {
    const qId = 'Q' + (state.activeForm.questions.length + 1);
    state.activeForm.questions.push({
      id: qId,
      text: 'Escreva a pergunta aqui...',
      type: 'single_choice',
      options: ['Sim', 'Não'],
      skipRules: []
    });
    renderBuilderQuestions();
  });

  document.getElementById('btn-save-form').addEventListener('click', saveActiveForm);
}

function renderFormBuilderList() {
  const container = document.getElementById('forms-list-container');
  container.innerHTML = '';
  
  state.forms.forEach(form => {
    const div = document.createElement('div');
    div.className = `form-list-item ${state.activeForm.id === form.id ? 'active' : ''}`;
    
    const tagClass = form.status === 'published' ? 'tag-pub' : 'tag-draft';
    const tagText = form.status === 'published' ? 'PUB' : 'DRAFT';
    
    div.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <h4 style="margin:0;">${form.title}</h4>
        <span class="form-tag ${tagClass}">${tagText}</span>
      </div>
      <div style="font-size: 0.8rem; color: var(--text-secondary); margin-top:0.4rem;">
        Versão: <strong>${form.version}</strong> | Perguntas: ${form.questions.length}
      </div>
    `;
    
    div.addEventListener('click', () => {
      loadFormIntoBuilder(form);
    });
    
    container.appendChild(div);
  });
}

function loadFormIntoBuilder(form) {
  // Deep clone
  state.activeForm = JSON.parse(JSON.stringify(form));
  
  document.getElementById('form-edit-title').value = state.activeForm.title;
  document.getElementById('form-edit-version').innerText = state.activeForm.version;
  document.getElementById('form-edit-status').value = state.activeForm.status;
  
  // Hide validation errors initially
  document.getElementById('skip-logic-errors').style.display = 'none';
  
  renderBuilderQuestions();
  renderFormBuilderList(); // refresh active highlight
}

function renderBuilderQuestions() {
  const container = document.getElementById('builder-questions-list');
  container.innerHTML = '';
  
  if (state.activeForm.questions.length === 0) {
    container.innerHTML = '<div style="color:var(--text-secondary); text-align:center; padding:2rem; border:1px dashed var(--glass-border); border-radius:8px;">Nenhuma pergunta adicionada ainda. Clique em "Adicionar Pergunta" acima.</div>';
    return;
  }

  state.activeForm.questions.forEach((q, idx) => {
    const card = document.createElement('div');
    card.className = 'question-card';
    
    // Select options logic
    const isChoice = q.type === 'single_choice' || q.type === 'multiple_choice';
    const optionsText = isChoice ? q.options.join(', ') : '';

    // Create options list for skip routing selector
    let targetOptionsHtml = '<option value="">(Próxima pergunta padrão)</option>';
    state.activeForm.questions.forEach((otherQ, otherIdx) => {
      // Show questions appearing further in the list
      if (otherIdx > idx) {
        targetOptionsHtml += `<option value="${otherQ.id}">${otherQ.id} - ${otherQ.text.substring(0, 30)}...</option>`;
      }
      // Or earlier (to demonstrate backward cycle warnings)
      if (otherIdx <= idx) {
        targetOptionsHtml += `<option value="${otherQ.id}" style="color:var(--status-red); font-style:italic;">${otherQ.id} (Pulo para trás - Gera Alerta)</option>`;
      }
    });

    // Skip rules html
    let rulesHtml = '';
    if (q.skipRules && q.skipRules.length > 0) {
      q.skipRules.forEach((rule, rIdx) => {
        rulesHtml += `
          <div class="skip-rule-item" style="margin-top: 4px;">
            <span>Se resposta for </span>
            <input type="text" class="filter-input" style="padding:0.2rem; font-size:0.8rem; width:80px;" value="${rule.conditionValue || ''}" onchange="updateSkipRuleValue(${idx}, ${rIdx}, this.value)" placeholder="valor" />
            <span> pula para </span>
            <select class="filter-input" style="padding:0.2rem; font-size:0.8rem;" onchange="updateSkipRuleTarget(${idx}, ${rIdx}, this.value)">
              ${targetOptionsHtml.replace(`value="${rule.targetQuestionId}"`, `value="${rule.targetQuestionId}" selected`)}
            </select>
            <button class="btn btn-danger" style="padding:0.2rem 0.4rem; font-size:0.7rem;" onclick="deleteSkipRule(${idx}, ${rIdx})"><i class="fa-solid fa-trash"></i></button>
          </div>
        `;
      });
    }

    card.innerHTML = `
      <div class="question-header">
        <div>
          <span class="question-index">#${idx + 1} (${q.id})</span>
          <input type="text" class="filter-input" style="padding:0.2rem 0.5rem; font-weight:700; width:60px; font-family:var(--font-mono); font-size:0.85rem;" value="${q.id}" onchange="updateQuestionId(${idx}, this.value)" />
        </div>
        
        <div style="display:flex; gap:0.5rem;">
          <button class="btn" style="padding:0.3rem 0.6rem; font-size:0.8rem;" onclick="duplicateQuestion(${idx})"><i class="fa-solid fa-copy"></i> Duplicar</button>
          <button class="btn btn-danger" style="padding:0.3rem 0.6rem; font-size:0.8rem;" onclick="deleteQuestion(${idx})"><i class="fa-solid fa-trash"></i> Excluir</button>
        </div>
      </div>
      
      <div style="display:grid; grid-template-columns: 2fr 1fr; gap:1rem; margin-bottom: 0.8rem;">
        <div>
          <label style="font-size:0.8rem; color:var(--text-secondary); display:block; margin-bottom:0.2rem;">Texto da Pergunta</label>
          <input type="text" class="filter-input" style="width:100%;" value="${q.text}" onchange="updateQuestionText(${idx}, this.value)" />
        </div>
        <div>
          <label style="font-size:0.8rem; color:var(--text-secondary); display:block; margin-bottom:0.2rem;">Tipo de Entrada</label>
          <select class="filter-input" style="width:100%;" onchange="updateQuestionType(${idx}, this.value)">
            <option value="text" ${q.type === 'text' ? 'selected' : ''}>Texto Livre</option>
            <option value="single_choice" ${q.type === 'single_choice' ? 'selected' : ''}>Seleção Única (Rádio)</option>
            <option value="multiple_choice" ${q.type === 'multiple_choice' ? 'selected' : ''}>Múltipla Escolha (Checkbox)</option>
            <option value="number" ${q.type === 'number' ? 'selected' : ''}>Numérico</option>
            <option value="audio_record" ${q.type === 'audio_record' ? 'selected' : ''}>Gravação de Áudio (Entrevista)</option>
          </select>
        </div>
      </div>
      
      ${isChoice ? `
        <div style="margin-bottom:0.8rem;">
          <label style="font-size:0.8rem; color:var(--text-secondary); display:block; margin-bottom:0.2rem;">Opções (separadas por vírgula)</label>
          <input type="text" class="filter-input" style="width:100%;" value="${optionsText}" onchange="updateQuestionOptions(${idx}, this.value)" placeholder="Opção 1, Opção 2, Opção 3" />
        </div>
      ` : ''}
      
      <div style="border-top:1px solid rgba(255,255,255,0.05); padding-top:0.6rem;">
        <span style="font-size:0.85rem; font-weight:600; color:var(--text-secondary);">Regras de Pulo Condicional</span>
        <button class="btn" style="padding:0.1rem 0.4rem; font-size:0.75rem; margin-left:0.5rem;" onclick="addSkipRule(${idx})"><i class="fa-solid fa-plus"></i> Add Regra</button>
        <div class="skip-rules-list" style="${q.skipRules.length === 0 ? 'display:none;' : ''}">
          ${rulesHtml}
        </div>
      </div>
    `;
    
    container.appendChild(card);
  });
}

// Inline question update handlers
window.updateQuestionId = function(idx, val) {
  state.activeForm.questions[idx].id = val.toUpperCase().trim();
  renderBuilderQuestions();
};
window.updateQuestionText = function(idx, val) {
  state.activeForm.questions[idx].text = val;
};
window.updateQuestionType = function(idx, val) {
  state.activeForm.questions[idx].type = val;
  renderBuilderQuestions();
};
window.updateQuestionOptions = function(idx, val) {
  state.activeForm.questions[idx].options = val.split(',').map(s => s.trim()).filter(s => s.length > 0);
  renderBuilderQuestions();
};
window.addSkipRule = function(idx) {
  if (!state.activeForm.questions[idx].skipRules) {
    state.activeForm.questions[idx].skipRules = [];
  }
  state.activeForm.questions[idx].skipRules.push({
    conditionValue: 'Sim',
    targetQuestionId: ''
  });
  renderBuilderQuestions();
};
window.updateSkipRuleValue = function(qIdx, rIdx, val) {
  state.activeForm.questions[qIdx].skipRules[rIdx].conditionValue = val;
};
window.updateSkipRuleTarget = function(qIdx, rIdx, val) {
  state.activeForm.questions[qIdx].skipRules[rIdx].targetQuestionId = val;
};
window.deleteSkipRule = function(qIdx, rIdx) {
  state.activeForm.questions[qIdx].skipRules.splice(rIdx, 1);
  renderBuilderQuestions();
};
window.duplicateQuestion = function(idx) {
  const source = state.activeForm.questions[idx];
  const clone = JSON.parse(JSON.stringify(source));
  clone.id = clone.id + '_COPY';
  clone.copySourceId = source.id;
  state.activeForm.questions.splice(idx + 1, 0, clone);
  renderBuilderQuestions();
};
window.deleteQuestion = function(idx) {
  state.activeForm.questions.splice(idx, 1);
  renderBuilderQuestions();
};

async function saveActiveForm() {
  const title = document.getElementById('form-edit-title').value.trim();
  const status = document.getElementById('form-edit-status').value;
  
  if (!title) {
    showToast('MEDIUM', 'Título do formulário não pode ser vazio.');
    return;
  }
  
  state.activeForm.title = title;
  state.activeForm.status = status;
  
  try {
    const payload = {
      id: state.activeForm.id || undefined,
      title: state.activeForm.title,
      status: state.activeForm.status,
      questions: state.activeForm.questions
    };
    
    const result = await apiFetch('/api/forms', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    
    if (result.success) {
      showToast('LOW', `Formulário "${title}" salvo com sucesso!`);
      
      // Load saved version back into workspace
      loadFormIntoBuilder(result.form);
      
      // Render warnings if skip validation failed
      const warningsDiv = document.getElementById('skip-logic-errors');
      if (result.validation && result.validation.length > 0) {
        warningsDiv.style.display = 'block';
        let warningsHtml = `<h4><i class="fa-solid fa-triangle-exclamation"></i> Avisos de Lógica Detectados (${result.validation.length})</h4><ul style="margin-left: 1.5rem; font-size:0.85rem;">`;
        result.validation.forEach(err => {
          warningsHtml += `<li style="margin-bottom:0.2rem;">[${err.type}] ${err.message}</li>`;
        });
        warningsHtml += `</ul>`;
        warningsDiv.innerHTML = warningsHtml;
        showToast('MEDIUM', 'Avisos de lógica detectados. Revise o formulário para evitar erros em campo.');
      } else {
        warningsDiv.style.display = 'none';
      }
      
      // Reload server forms
      await loadServerData();
    }
  } catch (err) {
    showToast('HIGH', 'Erro ao salvar formulário: ' + err.message);
  }
}

// ----------------- MOBILE RESEARCHER SIMULATOR -----------------
function initMobileSimulator() {
  // Sync checkbox state
  const onlineCheck = document.getElementById('sim-toggle-network');
  onlineCheck.addEventListener('change', (e) => {
    state.simIsOnline = e.target.checked;
    
    const badge = document.getElementById('net-status-text');
    if (state.simIsOnline) {
      badge.innerText = 'Conectado ao Servidor (Online)';
      badge.className = 'network-badge network-online';
      // Auto sync offline queue
      syncOfflineQueue();
    } else {
      badge.innerText = 'Desconectado (Offline)';
      badge.className = 'network-badge network-offline';
    }
    
    renderMobileScreen();
  });
  
  // Download templates
  document.getElementById('sim-btn-download-templates').addEventListener('click', downloadTemplatesToLocalDevice);
  
  // Sync local queue
  document.getElementById('sim-btn-sync-queue').addEventListener('click', syncOfflineQueue);
  
  // Load cached local queue
  const cachedQueue = localStorage.getItem('antigravity_offline_queue');
  if (cachedQueue) {
    state.simOfflineQueue = JSON.parse(cachedQueue);
    document.getElementById('sim-offline-queue-count').innerText = state.simOfflineQueue.length;
  }
  
  renderMobileScreen();
}

function downloadTemplatesToLocalDevice() {
  if (!state.simIsOnline) {
    showToast('HIGH', 'Você está offline. Conecte à internet para baixar os novos formulários.');
    return;
  }
  
  // Save active published forms to simulation memory
  const publishedForms = state.forms.filter(f => f.status === 'published');
  localStorage.setItem('antigravity_sim_templates', JSON.stringify(publishedForms));
  
  showToast('LOW', `${publishedForms.length} formulários baixados para o dispositivo do pesquisador.`);
  renderMobileScreen();
}

function syncOfflineQueue() {
  if (state.simOfflineQueue.length === 0) {
    showToast('LOW', 'Nenhuma entrevista pendente na fila offline.');
    return;
  }
  
  if (!state.simIsOnline) {
    showToast('MEDIUM', 'Não é possível sincronizar enquanto estiver offline.');
    return;
  }
  
  const total = state.simOfflineQueue.length;
  let successCount = 0;
  
  showToast('LOW', `Iniciando envio de ${total} entrevistas retidas...`);
  
  // Process sequentially (delta syncing)
  const promises = state.simOfflineQueue.map(async (payload) => {
    try {
      // Force researcher active role header to overwrite current session role for simulation
      const headers = {
        'x-user-role': 'Researcher',
        'x-user-id': document.getElementById('sim-active-researcher').value
      };
      
      const response = await fetch('/api/interviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(payload)
      });
      
      if (response.ok) {
        successCount++;
      }
    } catch (err) {
      console.error('Failed to sync offline item', err);
    }
  });
  
  Promise.all(promises).then(async () => {
    showToast('LOW', `${successCount} de ${total} entrevistas sincronizadas com sucesso.`);
    
    // Clear sent items
    state.simOfflineQueue = state.simOfflineQueue.slice(successCount);
    localStorage.setItem('antigravity_offline_queue', JSON.stringify(state.simOfflineQueue));
    document.getElementById('sim-offline-queue-count').innerText = state.simOfflineQueue.length;
    
    await loadServerData();
    renderDashboard();
    renderMobileScreen();
  });
}

function renderMobileScreen() {
  const screen = document.getElementById('phone-screen-body');
  screen.innerHTML = '';
  
  // Top indicators
  const netClass = state.simIsOnline ? 'network-online' : 'network-offline';
  const netText = state.simIsOnline ? 'ONLINE' : 'OFFLINE';
  
  const headerDiv = document.createElement('div');
  headerDiv.className = 'phone-header';
  headerDiv.innerHTML = `
    <span style="font-weight:700; font-size:0.8rem;"><i class="fa-solid fa-mobile"></i> Coleta</span>
    <span class="network-badge ${netClass}" style="font-size:0.65rem;">${netText}</span>
  `;
  screen.appendChild(headerDiv);
  
  // Check if researcher has templates
  const templatesJson = localStorage.getItem('antigravity_sim_templates');
  const templates = templatesJson ? JSON.parse(templatesJson) : [];
  
  // 1. SELECT FORM VIEW
  if (!state.simActiveForm) {
    let formOptionsHtml = '<option value="">-- Selecione o formulário --</option>';
    templates.forEach(t => {
      formOptionsHtml += `<option value="${t.id}">${t.title} (V${t.version})</option>`;
    });
    
    const viewDiv = document.createElement('div');
    viewDiv.style.flex = '1';
    viewDiv.style.display = 'flex';
    viewDiv.style.flexDirection = 'column';
    viewDiv.style.justifyContent = 'center';
    
    viewDiv.innerHTML = `
      <div style="text-align:center; margin-bottom:1.5rem;">
        <i class="fa-solid fa-clipboard-question" style="font-size:3rem; color:var(--accent-purple); margin-bottom:0.5rem; display:block;"></i>
        <h4 style="margin:0;">Iniciar Nova Pesquisa</h4>
        <p style="font-size:0.8rem; color:var(--text-secondary); margin-top:0.4rem;">Selecione um formulário carregado no aparelho para iniciar.</p>
      </div>
      
      <select class="filter-input" id="sim-select-form" style="width:100%; margin-bottom:1rem; border-color:var(--accent-purple);">
        ${formOptionsHtml}
      </select>
      
      <button class="btn btn-primary" style="width:100%; background:var(--accent-purple); color:#fff;" onclick="simStartInterview()"><i class="fa-solid fa-play"></i> Iniciar Questionário</button>
      
      ${templates.length === 0 ? `
        <div style="margin-top:1.5rem; background:rgba(255,196,0,0.1); border:1px dashed var(--status-yellow); padding:0.8rem; border-radius:8px; font-size:0.75rem; color:var(--status-yellow); text-align:center;">
          <i class="fa-solid fa-circle-exclamation"></i> Nenhum formulário baixado. Clique em "Baixar Modelos" à esquerda primeiro.
        </div>
      ` : ''}
    `;
    screen.appendChild(viewDiv);
    
    // Bind change listener
    setTimeout(() => {
      const select = document.getElementById('sim-select-form');
      if (select) {
        select.value = state.simSelectedFormId;
        select.addEventListener('change', (e) => state.simSelectedFormId = e.target.value);
      }
    }, 10);
  } else {
    // 2. FILL QUESTIONNAIRE VIEW
    const qList = state.simActiveForm.questions;
    const currentIdx = state.simCurrentQuestionIdx;
    
    if (currentIdx < qList.length) {
      const q = qList[currentIdx];
      const isLast = currentIdx === qList.length - 1;
      
      // Question rendering structure
      const qDiv = document.createElement('div');
      qDiv.className = 'phone-question-container';
      
      let inputHtml = '';
      if (q.type === 'text') {
        inputHtml = `<input type="text" id="sim-ans-${q.id}" class="filter-input" style="width:100%; margin-top:0.8rem;" value="${state.simAnswers[q.id] || ''}" placeholder="Escreva a resposta..." />`;
      } else if (q.type === 'number') {
        inputHtml = `<input type="number" id="sim-ans-${q.id}" class="filter-input" style="width:100%; margin-top:0.8rem;" value="${state.simAnswers[q.id] || ''}" placeholder="Digite um valor numérico..." />`;
      } else if (q.type === 'single_choice') {
        let optionsHtml = '';
        q.options.forEach(opt => {
          const checked = state.simAnswers[q.id] === opt ? 'checked' : '';
          optionsHtml += `
            <label style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.6rem; font-size:0.9rem; cursor:pointer;">
              <input type="radio" name="sim-rad-${q.id}" value="${opt}" ${checked} style="transform:scale(1.2);" /> ${opt}
            </label>
          `;
        });
        inputHtml = `<div style="margin-top:0.8rem; display:flex; flex-direction:column;">${optionsHtml}</div>`;
      } else if (q.type === 'multiple_choice') {
        let optionsHtml = '';
        const answeredArr = state.simAnswers[q.id] || [];
        q.options.forEach(opt => {
          const checked = answeredArr.includes(opt) ? 'checked' : '';
          optionsHtml += `
            <label style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.6rem; font-size:0.9rem; cursor:pointer;">
              <input type="checkbox" name="sim-chk-${q.id}" value="${opt}" ${checked} style="transform:scale(1.2);" /> ${opt}
            </label>
          `;
        });
        inputHtml = `<div style="margin-top:0.8rem; display:flex; flex-direction:column;">${optionsHtml}</div>`;
      } else if (q.type === 'audio_record') {
        const isRec = state.simIsRecording;
        const recordBtnClass = isRec ? 'record-btn recording' : 'record-btn';
        
        inputHtml = `
          <div class="sim-audio-widget">
            <span style="font-size:0.8rem; color:var(--text-secondary); display:block; margin-bottom:0.4rem;">
              ${isRec ? 'Gravando entrevista... Fale no microfone.' : 'Pressione para iniciar gravação'}
            </span>
            <div class="wave-container ${isRec ? 'recording' : ''}">
              <span class="wave-bar"></span>
              <span class="wave-bar"></span>
              <span class="wave-bar"></span>
              <span class="wave-bar"></span>
              <span class="wave-bar"></span>
              <span class="wave-bar"></span>
            </div>
            <button class="${recordBtnClass}" onclick="simToggleAudioRecord()"></button>
            <div style="font-size:0.8rem; margin-top:0.4rem;" id="sim-audio-status-label">
              ${state.simAudioFile ? `<span style="color:var(--status-green);"><i class="fa-solid fa-file-audio"></i> ${state.simAudioFile}</span>` : '<span style="color:var(--text-muted);">Nenhum arquivo gravado</span>'}
            </div>
          </div>
        `;
      }
      
      qDiv.innerHTML = `
        <div style="font-size:0.75rem; color:var(--accent-purple); font-weight:700; margin-bottom:0.2rem;">Questão ${currentIdx + 1} de ${qList.length}</div>
        <h4 style="font-size:1.1rem; line-height:1.4;">${q.text}</h4>
        ${inputHtml}
        
        <div style="display:flex; justify-content:space-between; margin-top:2rem; gap:0.8rem;">
          <button class="btn" style="flex:1;" onclick="simPrevQuestion()"><i class="fa-solid fa-arrow-left"></i> Voltar</button>
          <button class="btn btn-primary" style="flex:2; background:var(--accent-purple); color:#fff;" onclick="simNextQuestion()">${isLast ? '<i class="fa-solid fa-circle-check"></i> Finalizar' : 'Avançar <i class="fa-solid fa-arrow-right"></i>'}</button>
        </div>
        
        <button class="btn btn-danger" style="margin-top:1rem; padding:0.4rem; font-size:0.75rem; width:100%; border:none; background:transparent;" onclick="simAbortInterview()"><i class="fa-solid fa-ban"></i> Cancelar Coleta</button>
      `;
      screen.appendChild(qDiv);
    } else {
      // 3. CONFIRMATION VIEW
      const confirmDiv = document.createElement('div');
      confirmDiv.className = 'phone-question-container';
      confirmDiv.innerHTML = `
        <div style="text-align:center; margin-bottom:1.5rem;">
          <i class="fa-solid fa-circle-check" style="font-size:4rem; color:var(--status-green); margin-bottom:1rem; display:block;"></i>
          <h3>Coleta Concluída!</h3>
          <p style="font-size:0.85rem; color:var(--text-secondary); margin-top:0.4rem;">Todos os dados foram preenchidos localmente no dispositivo.</p>
        </div>
        
        <div style="background:rgba(0,0,0,0.2); padding:0.8rem; border-radius:8px; margin-bottom:1.5rem; font-size:0.8rem;">
          <strong>Resumo das Respostas:</strong>
          <div style="margin-top:0.5rem; max-height:120px; overflow-y:auto; text-align:left; color:#bbb;">
            ${Object.entries(state.simAnswers).map(([k, v]) => `<div>- <strong>${k}</strong>: ${v}</div>`).join('')}
            ${state.simAudioFile ? `<div>- <strong>Áudio</strong>: ${state.simAudioFile}</div>` : ''}
          </div>
        </div>
        
        <button class="btn btn-primary" style="width:100%; background:var(--status-green); border:none; color:#fff;" onclick="simSubmitInterview()"><i class="fa-solid fa-cloud-arrow-up"></i> Enviar Respostas</button>
        <button class="btn" style="width:100%; margin-top:0.5rem;" onclick="simResetFormState()">Voltar ao Início</button>
      `;
      screen.appendChild(confirmDiv);
    }
  }
}

window.simStartInterview = function() {
  const select = document.getElementById('sim-select-form');
  if (!select || !select.value) {
    showToast('MEDIUM', 'Selecione um formulário para iniciar a coleta.');
    return;
  }
  
  const templatesJson = localStorage.getItem('antigravity_sim_templates');
  const templates = templatesJson ? JSON.parse(templatesJson) : [];
  const form = templates.find(t => t.id === select.value);
  
  if (form) {
    state.simActiveForm = form;
    state.simAnswers = {};
    state.simCurrentQuestionIdx = 0;
    state.simAudioFile = null;
    state.simIsRecording = false;
    renderMobileScreen();
  }
};

window.simAbortInterview = function() {
  if (confirm('Deseja realmente cancelar esta entrevista? Todas as respostas preenchidas serão perdidas.')) {
    simResetFormState();
  }
};

function simResetFormState() {
  state.simActiveForm = null;
  state.simAnswers = {};
  state.simCurrentQuestionIdx = 0;
  state.simAudioFile = null;
  state.simIsRecording = false;
  renderMobileScreen();
}

window.simPrevQuestion = function() {
  if (state.simCurrentQuestionIdx > 0) {
    state.simCurrentQuestionIdx--;
    renderMobileScreen();
  } else {
    state.simActiveForm = null;
    renderMobileScreen();
  }
};

window.simNextQuestion = function() {
  const qList = state.simActiveForm.questions;
  const currentIdx = state.simCurrentQuestionIdx;
  const q = qList[currentIdx];
  
  // Read value from input
  let val = '';
  if (q.type === 'text' || q.type === 'number') {
    val = document.getElementById(`sim-ans-${q.id}`).value.trim();
  } else if (q.type === 'single_choice') {
    const radio = document.querySelector(`input[name="sim-rad-${q.id}"]:checked`);
    val = radio ? radio.value : '';
  } else if (q.type === 'multiple_choice') {
    const checked = document.querySelectorAll(`input[name="sim-chk-${q.id}"]:checked`);
    val = Array.from(checked).map(c => c.value);
  } else if (q.type === 'audio_record') {
    val = state.simAudioFile || '';
  }
  
  // Validation
  if (!val || (Array.isArray(val) && val.length === 0)) {
    showToast('MEDIUM', 'Por favor, preencha esta questão para continuar.');
    return;
  }
  
  // Save answer
  state.simAnswers[q.id] = val;
  
  // Evaluate Client-Side Skip Logic
  let nextQId = null;
  if (q.skipRules && q.skipRules.length > 0) {
    for (const rule of q.skipRules) {
      if (!rule.conditionValue || String(val) === String(rule.conditionValue)) {
        nextQId = rule.targetQuestionId;
        break;
      }
    }
  }
  
  if (nextQId) {
    const nextIdx = qList.findIndex(item => item.id === nextQId);
    if (nextIdx !== -1) {
      state.simCurrentQuestionIdx = nextIdx;
    } else {
      // Skip target missing or end of form target
      state.simCurrentQuestionIdx = qList.length; // triggers confirmation screen
    }
  } else {
    // Normal progress
    state.simCurrentQuestionIdx++;
  }
  
  renderMobileScreen();
};

window.simToggleAudioRecord = function() {
  if (state.simIsRecording) {
    // Stop recording
    state.simIsRecording = false;
    const fileId = Math.floor(Math.random() * 900) + 100;
    state.simAudioFile = `audio_interview_${fileId}.mp3`;
    renderMobileScreen();
  } else {
    // Start recording
    state.simIsRecording = true;
    renderMobileScreen();
    // Simulate speaking audio bounce animation: auto stop recording after 3 seconds
    setTimeout(() => {
      if (state.simIsRecording) {
        state.simIsRecording = false;
        const fileId = Math.floor(Math.random() * 900) + 100;
        state.simAudioFile = `audio_interview_${fileId}.mp3`;
        renderMobileScreen();
      }
    }, 3000);
  }
};

window.simSubmitInterview = async function() {
  const researcherId = document.getElementById('sim-active-researcher').value;
  const lat = parseFloat(document.getElementById('sim-lat').value);
  const lng = parseFloat(document.getElementById('sim-lng').value);
  
  const payload = {
    formId: state.simActiveForm.id,
    formVersion: state.simActiveForm.version,
    data: state.simAnswers,
    latitude: lat,
    longitude: lng,
    audioFileName: state.simAudioFile
  };
  
  if (state.simIsOnline) {
    try {
      showToast('LOW', 'Enviando respostas diretamente para a sede...');
      
      // Override request headers role to simulation researcher
      const result = await apiFetch('/api/interviews', {
        method: 'POST',
        headers: {
          'x-user-role': 'Researcher',
          'x-user-id': researcherId
        },
        body: JSON.stringify(payload)
      });
      
      if (result.success) {
        showToast('LOW', 'Entrevista enviada e salva no servidor da sede.');
        await loadServerData();
        renderDashboard();
        simResetFormState();
      }
    } catch (err) {
      showToast('HIGH', 'Erro ao enviar entrevista: ' + err.message);
    }
  } else {
    // Offline caching mode
    state.simOfflineQueue.push(payload);
    localStorage.setItem('antigravity_offline_queue', JSON.stringify(state.simOfflineQueue));
    
    document.getElementById('sim-offline-queue-count').innerText = state.simOfflineQueue.length;
    showToast('MEDIUM', 'Você está offline. A entrevista foi salva localmente no aparelho para envio posterior.');
    
    simResetFormState();
  }
};

// ----------------- NETWORK CLI CONSOLE -----------------
function initCliConsole() {
  const input = document.getElementById('cli-input');
  const history = document.getElementById('cli-history');
  
  // Set prompt role based on state
  document.getElementById('cli-prompt-label').innerText = `${state.activeRole}@node01:~$`;
  
  input.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      const command = input.value.trim();
      input.value = '';
      
      if (!command) return;
      
      // Write command line to history
      history.innerHTML += `<div><span class="term-prompt">${state.activeRole}@node01:~$</span> <span style="color:#fff;">${command}</span></div>`;
      
      if (command === 'clear') {
        history.innerHTML = '';
        return;
      }
      if (command === 'help') {
        history.innerHTML += `
          <div style="color:var(--text-secondary); margin: 0.5rem 0;">
            Comandos Disponíveis:<br/>
            - <code>show version</code> : Versão do firmware.<br/>
            - <code>ping 8.8.8.8</code> : Teste de ping externo.<br/>
            - <code>/ip address print</code> : Imprimir IPs ativos.<br/>
            - <code>show status</code> : Exibir latência de sincronização.<br/>
            - <code>reboot</code> / <code>reset</code> / <code>/system reset</code> / <code>/interface disable ether1</code> : Comandos de redes.<br/>
            - <code>clear</code> : Limpa a tela.
          </div>
        `;
        scrollCliToBottom();
        return;
      }

      try {
        // Send command execution request to backend
        const result = await apiFetch('/api/network/command', {
          method: 'POST',
          body: JSON.stringify({ command })
        });
        
        let outputClass = 'color: #a9b1d6;';
        if (result.severity === 'CRITICAL' || result.severity === 'HIGH') {
          outputClass = 'color: var(--status-red); font-weight:700;';
          // Trigger floating toast immediately
          showToast(result.severity, `ALERTA DE SEGURANÇA: Comando "${command}" bloqueado!`);
          
          // Re-render dashboard metrics counts
          setTimeout(() => {
            loadServerData().then(() => renderDashboard());
          }, 300);
        } else if (result.severity === 'MEDIUM') {
          outputClass = 'color: var(--status-yellow);';
        }
        
        history.innerHTML += `
          <div style="${outputClass} margin: 0.4rem 0;">
            ${result.message}
          </div>
          <div style="color:#00e5ff; font-style:italic; margin-bottom: 0.8rem;">
            ${result.suggestion}
          </div>
        `;

      } catch (err) {
        history.innerHTML += `<div style="color:var(--status-red); margin-bottom: 0.8rem;">Error: ${err.message}</div>`;
      }
      
      scrollCliToBottom();
    }
  });
}

function scrollCliToBottom() {
  const body = document.getElementById('cli-terminal-body');
  body.scrollTop = body.scrollHeight;
}

// ----------------- STRUCTURED LOGS (DEV PANEL) -----------------
async function fetchLogs() {
  const container = document.getElementById('log-console-container');
  
  if (state.activeRole !== 'DEV') return;
  
  try {
    const logs = await apiFetch('/api/logs');
    state.logs = logs;
    
    container.innerHTML = '';
    
    if (logs.length === 0) {
      container.innerHTML = '<div style="color:var(--text-secondary);">Sem logs de segurança registrados no banco.</div>';
      return;
    }
    
    logs.forEach(log => {
      const row = document.createElement('div');
      row.className = 'log-entry-row';
      
      const timeStr = new Date(log.timestamp).toLocaleString();
      const rawJson = JSON.stringify({
        id: log.id,
        timestamp: log.timestamp,
        eventType: log.type,
        severity: log.severity,
        commandRequested: log.command_requested,
        userRole: log.user_role
      });
      
      row.innerHTML = `
        <span class="log-time">[${timeStr}]</span>
        <span class="log-severity sev-${log.severity}">${log.severity}</span>
        <span style="color:#e0af68;">${log.type}</span> - 
        <code style="color: #00e5ff;">${rawJson}</code>
      `;
      container.appendChild(row);
    });
  } catch (err) {
    container.innerHTML = `<div style="color:var(--status-red);">Erro ao ler logs de auditoria: ${err.message}</div>`;
  }
}

// Quiet background logs fetching to sync metrics without drawing console
async function fetchLogsQuietly() {
  if (state.activeRole !== 'DEV') return;
  try {
    state.logs = await apiFetch('/api/logs');
  } catch (e) {}
}

// ----------------- DATA EXPORTER -----------------
function initDataExporter() {
  document.getElementById('btn-export-data').addEventListener('click', () => {
    if (state.interviews.length === 0) {
      showToast('MEDIUM', 'Nenhum dado de entrevista disponível para exportar.');
      return;
    }
    
    // Create CSV content
    let csv = 'ID,FormId,Version,ResearcherId,Latitude,Longitude,AudioUrl,Status,CreatedAt,ApprovedBy,Notes,AnswersJSON\r\n';
    
    state.interviews.forEach(i => {
      const answersStr = JSON.stringify(i.data).replace(/"/g, '""');
      const notesStr = (i.notes || '').replace(/"/g, '""');
      
      csv += `"${i.id}","${i.form_id}",${i.form_version},"${i.researcher_id}",${i.latitude || ''},${i.longitude || ''},"${i.audio_url || ''}","${i.status}","${i.created_at}","${i.approved_by || ''}","${notesStr}","${answersStr}"\r\n`;
    });
    
    // Download triggers
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `antigravity_base_entrevistas_${new Date().toISOString().substring(0,10)}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showToast('LOW', 'Base de dados exportada com sucesso em formato CSV.');
  });
}

// ----------------- FLOATING TOAST ALERTS -----------------
function showToast(severity, message) {
  const container = document.getElementById('alert-toast-container');
  
  const toast = document.createElement('div');
  toast.className = 'alert-toast';
  
  // Style toast based on severity
  if (severity === 'CRITICAL') {
    toast.style.background = 'rgba(255, 23, 68, 0.95)';
    toast.style.borderColor = '#ff1744';
  } else if (severity === 'HIGH') {
    toast.style.background = 'rgba(255, 109, 0, 0.95)';
    toast.style.borderColor = '#ff6d00';
  } else if (severity === 'MEDIUM') {
    toast.style.background = 'rgba(255, 196, 0, 0.95)';
    toast.style.borderColor = '#ffc400';
    toast.style.color = '#000';
  } else {
    // LOW / INFO
    toast.style.background = 'rgba(18, 21, 38, 0.95)';
    toast.style.borderColor = 'var(--accent-cyan)';
    toast.style.color = '#fff';
  }

  toast.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; font-weight:700; font-size:0.8rem; text-transform:uppercase; letter-spacing:1px; margin-bottom: 2px;">
      <span><i class="fa-solid fa-triangle-exclamation"></i> Alerta [${severity}]</span>
      <span style="font-size:0.7rem; color:inherit; opacity:0.8;">${new Date().toLocaleTimeString()}</span>
    </div>
    <div style="font-size:0.85rem; font-weight:500;">${message}</div>
  `;
  
  container.appendChild(toast);
  
  // Auto slide out after 4 seconds
  setTimeout(() => {
    toast.style.animation = 'slideInRight 0.3s ease-out reverse forwards';
    setTimeout(() => {
      container.removeChild(toast);
    }, 300);
  }, 4000);
}
