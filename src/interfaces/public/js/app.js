/* =========================================================
   DATApesquise — Plataforma de Pesquisa de Campo
   app.js — Core Application Logic
   ========================================================= */

// ===================== STATE =====================
const state = {
  activeRole: null,
  activeUserId: null,
  activeUserName: null,
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
  try {
    const headers = { 'Content-Type':'application/json', 'x-user-role':state.activeRole, 'x-user-id':state.activeUserId, ...(options.headers||{}) };
    const res = await fetch(endpoint, { ...options, headers });
    if (!res.ok) {
      if (res.status === 403) throw new Error('Você não tem permissão para esta ação.');
      if (res.status >= 500) throw new Error('Ocorreu um erro interno. Tente novamente.');
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Algo deu errado.');
    }
    // Handle 204 No Content
    if (res.status === 204) return { success: true };
    return await res.json();
  } catch (err) {
    if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
      throw new Error('Servidor indisponível. Verifique se o backend está rodando.');
    }
    throw err;
  }
}

// ===================== AUTHENTICATION =====================
window.fazerLogin = async () => {
  const userEl = document.getElementById('login-username');
  const passEl = document.getElementById('login-password');
  const username = userEl.value.trim();
  const password = passEl.value;

  if (!username || !password) {
    return showToast('error', 'Preencha o usuário e a senha.');
  }

  const btn = document.getElementById('btn-login');
  const oldText = btn.innerHTML;
  btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Entrando...';
  btn.disabled = true;

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao realizar login');

    localStorage.setItem('auth_user', JSON.stringify(data.user));
    state.activeRole = data.user.role;
    state.activeUserId = data.user.id;
    state.activeUserName = data.user.name;

    document.querySelector('.sidebar').style.display = 'flex';
    
    await loadServerData();
    updateUserUI();
    applyRoleRestrictions();
    renderDashboard();
    initFormBuilder();
    renderFormBuilderList();
    if (state.forms.length > 0) loadFormIntoBuilder(state.forms[0]);
    initMobileSimulator();
    initDataExporter();
    renderAudioReviewList();

    switchTab('view-dashboard');
    showToast('success', 'Bem-vindo(a) ao DATApesquise!');
  } catch (err) {
    showToast('error', err.message);
  } finally {
    btn.innerHTML = oldText;
    btn.disabled = false;
  }
};

window.logout = () => {
  localStorage.removeItem('auth_user');
  state.activeRole = null;
  state.activeUserId = null;
  state.activeUserName = null;
  document.querySelector('.sidebar').style.display = 'none';
  document.getElementById('login-username').value = '';
  document.getElementById('login-password').value = '';
  switchTab('view-login');
};

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

  const publishedForms = state.forms; // Show all forms in the dashboard for Kobo style
  
  if (publishedForms.length === 0) {
    grid.innerHTML = '<tr><td colspan="8" style="text-align:center; padding: 2rem; color: #64748b;">Nenhum projeto encontrado. Clique em NOVO para começar.</td></tr>';
    return;
  }

  const name = MOCK_USER_NAMES[state.activeRole] || state.activeRole;
  const initial = name.charAt(0).toUpperCase();

  publishedForms.forEach(form => {
    const ints = state.interviews.filter(i => i.form_id === form.id);
    const isPub = form.status === 'published';
    const isArchived = form.status === 'archived';
    
    let statusBadge = '';
    if (isArchived) {
      statusBadge = '<span class="kobo-status-badge" style="background:#475569;color:#f8fafc;"><i class="fa-solid fa-box-archive"></i> arquivado</span>';
    } else if (isPub) {
      statusBadge = '<span class="kobo-status-badge"><i class="fa-solid fa-satellite-dish"></i> disponibilizado</span>';
    } else {
      statusBadge = '<span class="kobo-status-badge" style="background:#f1f5f9;color:#64748b;"><i class="fa-solid fa-pen"></i> rascunho</span>';
    }
    
    // Fallbacks for missing dates since the DB schema didn't track these closely initially
    const modDateStr = form.updated_at ? new Date(form.updated_at).toLocaleDateString('pt-BR') : new Date().toLocaleDateString('pt-BR');
    const pubDateStr = isPub ? modDateStr : '-';

    grid.innerHTML += `
      <tr>
        <td><input type="checkbox" class="proj-checkbox" value="${form.id}"></td>
        <td><span class="kobo-project-name" onclick="openProject('${form.id}')">${form.title}</span></td>
        <td>${statusBadge}</td>
        <td><div class="kobo-owner-badge"><div class="kobo-owner-circle">${initial}</div> ${name.split(' ')[0].toLowerCase()}</div></td>
        <td>${modDateStr}</td>
        <td>${modDateStr}</td>
        <td>${pubDateStr}</td>
        <td><span class="kobo-count-pill">${ints.length}</span></td>
      </tr>
    `;
  });
}

// ===================== PROJECT DETAILS =====================
window.openProject = function(formId) {
  state.activeProjectFormId = formId;
  const form = state.forms.find(f => f.id === formId);
  if (!form) return;

  const ints = state.interviews.filter(i => i.form_id === formId);
  const isPub = form.status === 'published';
  const isArchived = form.status === 'archived';

  document.getElementById('project-details-title-top').textContent = form.title;
  
  // Populate Resumo Info
  let statusBadgeHtml = '';
  if (isArchived) {
    statusBadgeHtml = '<i class="fa-solid fa-box-archive"></i> arquivado';
    document.getElementById('pd-status-badge').style.background = '#475569';
    document.getElementById('pd-status-badge').style.color = '#f8fafc';
  } else if (isPub) {
    statusBadgeHtml = '<i class="fa-solid fa-satellite-dish"></i> disponibilizado';
    document.getElementById('pd-status-badge').style.background = '#e0f2fe';
    document.getElementById('pd-status-badge').style.color = '#0369a1';
  } else {
    statusBadgeHtml = '<i class="fa-solid fa-pen"></i> rascunho';
    document.getElementById('pd-status-badge').style.background = '#f1f5f9';
    document.getElementById('pd-status-badge').style.color = '#64748b';
  }
  document.getElementById('pd-status-badge').innerHTML = statusBadgeHtml;
  
  document.getElementById('pd-questions-count').textContent = form.questions.length;
  
  const name = state.activeUserName || MOCK_USER_NAMES[state.activeRole] || state.activeRole || 'Usuário';
  const initial = name.charAt(0).toUpperCase();
  const shortName = name.split(' ')[0];

  document.getElementById('pd-owner-initial').textContent = initial;
  document.getElementById('pd-owner-name').textContent = shortName;
  document.getElementById('pd-editor-initial').textContent = initial;
  document.getElementById('pd-editor-name').textContent = shortName;
  
  document.getElementById('pd-total-submissions').textContent = ints.length;
  document.getElementById('pd-last-resp').textContent = ints.length > 0 ? new Date(ints[ints.length-1].created_at).toLocaleDateString('pt-BR') : '-';

  switchTab('view-project-details');
  loadProjectAccess();

  // Reset to default tab (RESUMO)
  koboSwitchTab('proj-tab-resumo');

  renderReportsTable();
  renderCharts();
  if (!state.map) initMap();
  else renderMapMarkers();
  renderAudioReviewList();
};

window.koboSwitchTab = function(tabId) {
  document.querySelectorAll('.kobo-proj-tab').forEach(t => {
    t.classList.remove('active');
    if (t.dataset.tab === tabId) t.classList.add('active');
  });
  document.querySelectorAll('#view-project-details .tab-content').forEach(c => c.style.display = 'none');
  const target = document.getElementById(tabId);
  if (target) target.style.display = 'block';
  
  if (tabId === 'proj-tab-dados' && state.map) {
    setTimeout(() => state.map.invalidateSize(), 150);
  }
};

window.koboEditForm = function() {
  if (!state.activeProjectFormId) return;
  const form = state.forms.find(f => f.id === state.activeProjectFormId);
  if (form) {
    loadFormIntoBuilder(form);
    switchTab('view-form-builder');
  }
};

window.koboPreviewForm = function() {
  if (!state.activeProjectFormId) return;
  const form = state.forms.find(f => f.id === state.activeProjectFormId);
  if (form) {
    if (form.status !== 'published') {
      showToast('warning', 'O formulário precisa ser publicado para ser pré-visualizado.');
      return;
    }
    state.simActiveForm = form;
    state.simAnswers = {};
    state.simCurrentQuestionIdx = 0;
    state.simAudioFile = null;
    state.simIsRecording = false;
    
    switchTab('view-mobile-sim');
    renderMobileScreen();
  }
};

// ===================== MAP =====================
function initMap() {
  if (state.map) return;
  state.map = L.map('map').setView([-3.1190, -60.0217], 7);
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
window.renderCharts = function() {
  const container = document.getElementById('analytics-charts-container');
  if (!container) return;

  const formId = state.activeProjectFormId;
  const form = state.forms.find(f => f.id === formId);
  const interviews = state.interviews.filter(i => i.form_id === formId);

  if (!form || !form.questions || form.questions.length === 0 || interviews.length === 0) {
    container.innerHTML = '<p class="text-muted" style="grid-column: 1 / -1; text-align: center;">Não há dados suficientes para gerar relatórios gráficos.</p>';
    return;
  }

  container.innerHTML = '';
  if (window._analyticsCharts) {
    window._analyticsCharts.forEach(c => c.destroy());
  }
  window._analyticsCharts = [];

  form.questions.forEach(q => {
    if (q.type === 'single_choice' || q.type === 'multiple_choice') {
      const counts = {};
      q.options.forEach(opt => counts[opt] = 0);
      let totalResponses = 0;

      interviews.forEach(int => {
        const val = int.data && int.data[q.id];
        if (val) {
          if (q.type === 'single_choice') {
            if (counts[val] !== undefined) counts[val]++;
            else counts[val] = 1;
            totalResponses++;
          } else if (q.type === 'multiple_choice' && Array.isArray(val)) {
            val.forEach(v => {
              if (counts[v] !== undefined) counts[v]++;
              else counts[v] = 1;
            });
            totalResponses++;
          }
        }
      });

      if (totalResponses === 0) return;

      const card = document.createElement('div');
      card.style.background = '#f8fafc';
      card.style.border = '1px solid #e2e8f0';
      card.style.borderRadius = '8px';
      card.style.padding = '1rem';
      
      const title = document.createElement('h4');
      title.style.fontSize = '0.9rem';
      title.style.marginBottom = '1rem';
      title.style.color = 'var(--text-primary)';
      title.textContent = q.text;
      card.appendChild(title);

      const canvas = document.createElement('canvas');
      canvas.style.maxHeight = '250px';
      card.appendChild(canvas);

      container.appendChild(card);

      const ctx = canvas.getContext('2d');
      const chart = new Chart(ctx, {
        type: 'pie',
        data: {
          labels: Object.keys(counts),
          datasets: [{
            data: Object.values(counts),
            backgroundColor: ['#2563eb', '#059669', '#d97706', '#dc2626', '#7c3aed', '#0284c7', '#14b8a6', '#f43f5e'],
            borderWidth: 1
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } }
          }
        }
      });
      window._analyticsCharts.push(chart);
    }
  });

  if (container.innerHTML === '') {
    container.innerHTML = '<p class="text-muted" style="grid-column: 1 / -1; text-align: center;">Nenhuma questão de múltipla escolha para gerar gráficos.</p>';
  }
};

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

window.exportProjectData = function() {
  if (!state.activeProjectFormId) return;
  const form = state.forms.find(f => f.id === state.activeProjectFormId);
  const interviews = state.interviews.filter(i => i.form_id === state.activeProjectFormId);
  if (interviews.length === 0) {
    showToast('warning', 'Não há dados para exportar.');
    return;
  }
  
  // Collect columns
  const baseCols = ['_id', '_uuid', 'start', 'end', 'deviceid', 'username'];
  const dataCols = new Set();
  interviews.forEach(int => {
    Object.keys(int.data || {}).forEach(k => dataCols.add(k));
  });
  const allCols = [...baseCols, ...Array.from(dataCols), 'audio_url', '_status'];
  
  // Build CSV
  let csv = allCols.join(',') + '\n';
  interviews.forEach(int => {
    const row = [];
    allCols.forEach(col => {
      let val = '';
      if (col === '_id') val = int.id;
      else if (col === '_uuid') val = int.id;
      else if (col === 'start') val = new Date(int.created_at).toISOString();
      else if (col === 'end') val = new Date(int.created_at).toISOString();
      else if (col === 'deviceid') val = int.device_id || 'unknown';
      else if (col === 'username') val = int.researcher_id || '';
      else if (col === 'audio_url') val = int.audio_url || '';
      else if (col === '_status') val = 'submitted_via_web';
      else val = (int.data && int.data[col] !== undefined) ? int.data[col] : '';
      
      // Escape for CSV
      if (typeof val === 'string' && (val.includes(',') || val.includes('"') || val.includes('\n'))) {
        val = '"' + val.replace(/"/g, '""') + '"';
      }
      row.push(val);
    });
    csv += row.join(',') + '\n';
  });
  
  // Download file
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `DATApesquise_${form.title.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  showToast('success', 'Download iniciado! Padrão KoboToolbox.');
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
    document.getElementById('question-type-modal').classList.add('active');
  });
  document.getElementById('btn-save-form').addEventListener('click', saveActiveForm);
}

window.addNewQuestion = function(type) {
  const qId = 'Q' + (state.activeForm.questions.length + 1);
  const q = { id:qId, text:'', type: type, options:[], required: false };
  if (type === 'select_one' || type === 'select_multiple') {
    q.options = ['Opção 1', 'Opção 2'];
  }
  state.activeForm.questions.push(q);
  renderBuilderQuestions();
  document.getElementById('question-type-modal').classList.remove('active');
  
  // Scroll to bottom
  const container = document.querySelector('.kobo-workspace-body');
  if (container) container.scrollTop = container.scrollHeight;
};

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
  // Remove form-edit-version as it's no longer in the HTML
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
    card.className = 'kobo-question-row';
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
      optionsHtml = '<div style="margin-top:0.5rem;">';
      q.options.forEach((opt, oi) => {
        const val = typeof opt === 'object' ? opt.label : opt;
        const nameVal = typeof opt === 'object' ? opt.name : val.toLowerCase().replace(/[^a-z0-9]/g,'_');
        optionsHtml += `
          <div class="kobo-choice-row">
            <button class="kobo-choice-trash" onclick="removeOption(${idx},${oi})" title="Excluir"><i class="fa-solid fa-trash"></i></button>
            <input type="text" class="kobo-choice-input" value="${val}" onchange="updateOption(${idx},${oi},this.value)" />
            <div class="kobo-choice-pill">${nameVal}</div>
          </div>
        `;
      });
      optionsHtml += `<div class="kobo-add-choice" onclick="addOption(${idx})">+ click to add another response...</div></div>`;
    }

    card.innerHTML = `
      <div class="kobo-question-left">
        <i class="kobo-question-icon fa-solid fa-circle-dot"></i>
        <div class="kobo-collapsed-title">${idx+1}. ${q.text || 'Nova Pergunta'}</div>
      </div>
      <div class="kobo-question-center">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <input type="text" class="kobo-question-text" value="${q.text}" onchange="updateQText(${idx},this.value)" placeholder="${idx+1}. Escreva a pergunta aqui..." />
          <select style="border:none; color:#64748b; font-size:0.8rem; outline:none; background:transparent; cursor:pointer;" onchange="updateQType(${idx},this.value)">
            <option value="text" ${q.type==='text'?'selected':''}>Texto Livre</option>
            <option value="number" ${q.type==='number'||q.type==='decimal'?'selected':''}>Número (Decimal)</option>
            <option value="integer" ${q.type==='integer'?'selected':''}>Número (Inteiro)</option>
            <option value="single_choice" ${q.type==='single_choice'||q.type==='select_one'?'selected':''}>Seleção Única</option>
            <option value="multiple_choice" ${q.type==='multiple_choice'||q.type==='select_multiple'?'selected':''}>Múltipla Escolha</option>
            <option value="geopoint" ${q.type==='geopoint'?'selected':''}>GPS</option>
            <option value="image" ${q.type==='image'?'selected':''}>Foto / Imagem</option>
            <option value="video" ${q.type==='video'?'selected':''}>Vídeo</option>
            <option value="audio_record" ${q.type==='audio_record'||q.type==='audio'?'selected':''}>Áudio</option>
          </select>
        </div>
        <input type="text" class="kobo-question-hint" value="Question hint" readonly />
        ${optionsHtml}
      </div>
      <div class="kobo-question-right">
        <button class="kobo-btn-gear" onclick="openQuestionSettingsModal(${idx})" title="Configurações"><i class="fa-solid fa-gear"></i></button>
        <button class="kobo-btn-trash" onclick="confirmDeleteQuestion(${idx})" title="Excluir"><i class="fa-solid fa-trash"></i></button>
        <button class="kobo-btn-copy" onclick="duplicateQuestion(${idx})" title="Duplicar"><i class="fa-solid fa-copy"></i></button>
        <button class="kobo-btn-branch" onclick="openAdvLogicModal(${idx})" title="Lógica de Pulo Avançada"><i class="fa-solid fa-code-branch"></i></button>
      </div>
    `;
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

// ===================== KOBO BUTTON HANDLERS =====================
window.closeFormBuilder = () => {
  if (state.activeProjectFormId) {
    switchTab('view-project-details');
    // Force refresh of the data just in case the form changed
    openProject(state.activeProjectFormId);
  } else {
    switchTab('view-dashboard');
  }
};

window.previewActiveForm = () => {
  if (state.activeForm.status !== 'published') {
    showToast('warning', 'Salve o projeto como Publicado para visualizar no Simulador.');
    return;
  }
  downloadTemplates();
  switchTab('view-mobile-sim');
  showToast('success', 'Projeto carregado no modo de visualização.');
};

window.toggleCollapseQuestions = () => {
  const container = document.getElementById('builder-questions-list');
  const isCollapsed = container.classList.toggle('kobo-collapsed-view');
  showToast('info', isCollapsed ? 'Perguntas recolhidas (Visão em lista).' : 'Perguntas expandidas.');
};

window.duplicateActiveForm = () => {
  if (!state.activeForm.id) {
    showToast('warning', 'Salve o projeto original primeiro antes de duplicar.');
    return;
  }
  showConfirm('Duplicar Projeto', 'Deseja criar uma cópia exata deste formulário?', () => {
    const clone = JSON.parse(JSON.stringify(state.activeForm));
    delete clone.id;
    clone.title = clone.title + ' (Cópia)';
    clone.status = 'draft';
    loadFormIntoBuilder(clone);
    saveActiveForm();
  });
};

window.showComingSoonToast = (feature) => {
  showToast('info', `A funcionalidade "${feature}" será liberada na próxima versão.`);
};

window.openFormSettings = () => {
  document.getElementById('form-settings-id').value = state.activeForm.id || 'Ainda não salvo (Rascunho)';
  document.getElementById('form-settings-modal').classList.add('active');
};

window.saveFormSettings = () => {
  document.getElementById('form-settings-modal').classList.remove('active');
  showToast('success', 'Configurações globais salvas com sucesso!');
};

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
      else if (q.type === 'number' || q.type === 'integer' || q.type === 'decimal') inputHtml = `<input type="number" id="sim-ans-${q.id}" class="form-input" style="margin-top:0.6rem;" value="${state.simAnswers[q.id]||''}" ${q.type==='integer'?'step="1"':''} placeholder="Digite um número..." />`;
      else if (q.type === 'single_choice' || q.type === 'select_one') {
        inputHtml = '<div style="margin-top:0.6rem;">';
        if(q.options) q.options.forEach(opt => { const val = typeof opt==='object'?opt.label:opt; const chk = state.simAnswers[q.id]===val?'checked':''; inputHtml += `<label style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.5rem;font-size:0.88rem;cursor:pointer;"><input type="radio" name="sim-rad-${q.id}" value="${val}" ${chk} style="transform:scale(1.15);" /> ${val}</label>`; });
        inputHtml += '</div>';
      } else if (q.type === 'multiple_choice' || q.type === 'select_multiple') {
        const arr = state.simAnswers[q.id] || [];
        inputHtml = '<div style="margin-top:0.6rem;">';
        if(q.options) q.options.forEach(opt => { const val = typeof opt==='object'?opt.label:opt; const chk = arr.includes(val)?'checked':''; inputHtml += `<label style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.5rem;font-size:0.88rem;cursor:pointer;"><input type="checkbox" name="sim-chk-${q.id}" value="${val}" ${chk} style="transform:scale(1.15);" /> ${val}</label>`; });
        inputHtml += '</div>';
      } else if (q.type === 'geopoint') {
        const val = state.simAnswers[q.id] || '';
        inputHtml = `<div style="margin-top:0.6rem;padding:1rem;background:#f3f4f6;border-radius:8px;text-align:center;"><i class="fa-solid fa-location-dot" style="font-size:2rem;color:var(--primary);margin-bottom:0.5rem;display:block;"></i><input type="hidden" id="sim-ans-${q.id}" value="${val?val:'-3.1190,-60.0217'}"><button class="btn btn-sm btn-primary" onclick="document.getElementById('sim-ans-${q.id}').value='-3.1190,-60.0217';this.innerHTML='<i class=\\'fa-solid fa-check\\'></i> Localização Capturada';this.classList.add('btn-success');"><i class="fa-solid fa-satellite-dish"></i> Obter Coordenadas GPS</button>${val?'<div style="font-size:0.75rem;margin-top:0.5rem;color:var(--success);">GPS salvo!</div>':''}</div>`;
      } else if (q.type === 'image' || q.type === 'video') {
        const val = state.simAnswers[q.id] || '';
        const icon = q.type === 'image' ? 'fa-camera' : 'fa-video';
        inputHtml = `<div style="margin-top:0.6rem;padding:1rem;background:#f3f4f6;border-radius:8px;text-align:center;"><i class="fa-solid ${icon}" style="font-size:2rem;color:var(--text-muted);margin-bottom:0.5rem;display:block;"></i><input type="hidden" id="sim-ans-${q.id}" value="${val?val:'midia_capturada.jpg'}"><button class="btn btn-sm" onclick="document.getElementById('sim-ans-${q.id}').value='arquivo_simulado.${q.type==='video'?'mp4':'jpg'}';this.innerHTML='<i class=\\'fa-solid fa-check\\'></i> Arquivo Anexado';this.classList.add('btn-success');"><i class="fa-solid fa-paperclip"></i> Capturar ou Anexar</button>${val?'<div style="font-size:0.75rem;margin-top:0.5rem;color:var(--success);">Arquivo salvo!</div>':''}</div>`;
      } else if (q.type === 'audio_record' || q.type === 'audio') {
        const isRec = state.simIsRecording;
        inputHtml = `<div class="sim-audio-widget"><p style="font-size:0.78rem;color:var(--text-secondary);margin-bottom:0.4rem;">${isRec?'Gravando... Fale no microfone.':'Pressione para iniciar.'}</p><div class="wave-container ${isRec?'recording':''}"><span class="wave-bar"></span><span class="wave-bar"></span><span class="wave-bar"></span><span class="wave-bar"></span><span class="wave-bar"></span><span class="wave-bar"></span></div><button class="record-btn ${isRec?'recording':''}" onclick="simToggleRecord()"></button><div style="font-size:0.75rem;margin-top:0.3rem;">${state.simAudioFile?`<span style="color:var(--success);"><i class="fa-solid fa-file-audio"></i> ${state.simAudioFile}</span>`:'<span style="color:var(--text-muted);">Nenhum áudio gravado</span>'}</div><input type="hidden" id="sim-ans-${q.id}" value="${state.simAudioFile||''}"></div>`;
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
function evaluateSimLogic(logicArray) {
  if (!logicArray || logicArray.length === 0) return true;
  for (let l of logicArray) {
    if (!l.targetId) continue;
    const ans = state.simAnswers[l.targetId];
    if (ans === undefined) return false;
    let numAns = parseFloat(ans);
    let numVal = parseFloat(l.val);
    let isNum = !isNaN(numAns) && !isNaN(numVal);
    
    if (l.op === '=') { if (ans != l.val) return false; }
    else if (l.op === '!=') { if (ans == l.val) return false; }
    else if (l.op === '>') { if (!isNum || numAns <= numVal) return false; }
    else if (l.op === '<') { if (!isNum || numAns >= numVal) return false; }
  }
  return true;
}

window.simPrev = function() {
  let prevIdx = state.simCurrentQuestionIdx - 1;
  while (prevIdx >= 0) {
    const q = state.simActiveForm.questions[prevIdx];
    if (evaluateSimLogic(q._logic)) {
      state.simCurrentQuestionIdx = prevIdx;
      renderMobileScreen();
      return;
    }
    prevIdx--;
  }
  state.simActiveForm = null; 
  renderMobileScreen();
};

window.simNext = function() {
  const q = state.simActiveForm.questions[state.simCurrentQuestionIdx];
  let val = '';
  if (q.type === 'text' || q.type === 'number' || q.type === 'integer' || q.type === 'decimal' || q.type === 'geopoint' || q.type === 'image' || q.type === 'video') { const el = document.getElementById(`sim-ans-${q.id}`); val = el ? el.value.trim() : ''; }
  else if (q.type === 'single_choice' || q.type === 'select_one') { const r = document.querySelector(`input[name="sim-rad-${q.id}"]:checked`); val = r ? r.value : ''; }
  else if (q.type === 'multiple_choice' || q.type === 'select_multiple') { val = Array.from(document.querySelectorAll(`input[name="sim-chk-${q.id}"]:checked`)).map(c => c.value); }
  else if (q.type === 'audio_record' || q.type === 'audio') { val = state.simAudioFile || document.getElementById(`sim-ans-${q.id}`)?.value || ''; }
  
  if (!val || (Array.isArray(val) && val.length === 0)) { showToast('warning', 'Preencha esta questão para continuar.'); return; }
  state.simAnswers[q.id] = val;
  
  // Find next visible question
  let nextIdx = state.simCurrentQuestionIdx + 1;
  while (nextIdx < state.simActiveForm.questions.length) {
    const nextQ = state.simActiveForm.questions[nextIdx];
    if (evaluateSimLogic(nextQ._logic)) {
      break;
    }
    nextIdx++;
  }
  
  state.simCurrentQuestionIdx = nextIdx;
  renderMobileScreen();
};
window.simToggleRecord = function() {
  if (state.simIsRecording) { state.simIsRecording = false; state.simAudioFile = `https://actions.google.com/sounds/v1/water/rain_on_roof.ogg`; renderMobileScreen(); }
  else { state.simIsRecording = true; renderMobileScreen(); setTimeout(() => { if (state.simIsRecording) { state.simIsRecording = false; state.simAudioFile = `https://actions.google.com/sounds/v1/water/rain_on_roof.ogg`; renderMobileScreen(); } }, 3000); }
};
window.simSubmit = async function() {
  const researcherEl = document.getElementById('sim-active-researcher');
  const researcherId = researcherEl ? researcherEl.value : state.activeUserId;
  const latEl = document.getElementById('sim-lat');
  const lngEl = document.getElementById('sim-lng');
  const lat = latEl ? parseFloat(latEl.value) : -3.1190;
  const lng = lngEl ? parseFloat(lngEl.value) : -60.0217;
  const deviceId = "Simulador Web";
  const payload = { formId:state.simActiveForm.id, formVersion:state.simActiveForm.version, data:state.simAnswers, latitude:lat, longitude:lng, audioFileName:state.simAudioFile, researcherId, deviceId };
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
    
    let csv = '_uuid;start;end;username;deviceid;_gps_latitude;_gps_longitude;audio_url;_submission_time;_status;';
    csv += dataKeys.join(';') + '\r\n';
    
    toExport.forEach(i => {
      let row = `"${i.id}";"${i.created_at}";"${i.created_at}";"${i.researcher_id}";"${i.device_id||''}";"${i.latitude||''}";"${i.longitude||''}";"${i.audio_url||''}";"${i.created_at}";"${i.approved_by?'approved':'submitted'}";`;
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

  // Authentication Check
  const savedUser = localStorage.getItem('auth_user');
  if (savedUser) {
    const u = JSON.parse(savedUser);
    state.activeRole = u.role;
    state.activeUserId = u.id;
    state.activeUserName = u.name;
    document.querySelector('.sidebar').style.display = 'flex';
    await loadServerData();
    updateUserUI();
    applyRoleRestrictions();
    renderDashboard();
    initFormBuilder();
    renderFormBuilderList();
    if (state.forms.length > 0) loadFormIntoBuilder(state.forms[0]);
    initMobileSimulator();
    initDataExporter();
    renderAudioReviewList();
  } else {
    document.querySelector('.sidebar').style.display = 'none';
    switchTab('view-login');
  }



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

window.addLibraryQuestion = function(type) {
  let q = {
    id: 'q_' + Math.random().toString(36).substr(2, 9),
    type: 'text',
    text: '',
    options: [],
    required: false,
    relevant: '',
    constraint: '',
    constraint_message: ''
  };

  if (type === 'age') {
    q.type = 'number';
    q.text = 'Qual a sua idade?';
    q.constraint = '. >= 0 and . <= 120';
    q.constraint_message = 'Idade inválida.';
  } else if (type === 'gender') {
    q.type = 'select_one';
    q.text = 'Qual o seu gênero?';
    q.options = ['Masculino', 'Feminino', 'Outro', 'Prefiro não informar'];
  } else if (type === 'income') {
    q.type = 'decimal';
    q.text = 'Qual a sua renda familiar mensal?';
    q.constraint = '. >= 0';
    q.constraint_message = 'A renda não pode ser negativa.';
  } else if (type === 'gps') {
    q.type = 'geopoint';
    q.text = 'Capturar Coordenadas GPS';
  }

  state.activeForm.questions.push(q);
  renderBuilderQuestions();
  document.getElementById('question-library-modal').classList.remove('active');
  showToast('success', 'Pergunta adicionada da biblioteca!');
};

// ===================== ADVANCED LOGIC MODAL =====================
window.openAdvLogicModal = function(idx) {
  document.getElementById('adv-logic-q-idx').value = idx;
  const q = state.activeForm.questions[idx];
  
  // Populate target questions dropdown (only questions before this one)
  const select = document.getElementById('adv-logic-target-q');
  select.innerHTML = '';
  for (let i = 0; i < idx; i++) {
    const prevQ = state.activeForm.questions[i];
    if (prevQ.text) {
      select.innerHTML += `<option value="${prevQ.id}">${prevQ.text}</option>`;
    }
  }
  
  if (idx === 0) {
    showToast('warning', 'A primeira pergunta não pode ter regras de pulo baseadas em perguntas anteriores.');
    return;
  }

  // Ensure q._logic array exists
  if (!q._logic) {
    q._logic = [];
    if (q.relevant) {
      q._logic.push({ raw: q.relevant });
    }
  }

  renderAdvLogicList(idx);
  document.getElementById('advanced-logic-modal').classList.add('active');
};

window.addAdvLogicCondition = function() {
  const idx = parseInt(document.getElementById('adv-logic-q-idx').value);
  const q = state.activeForm.questions[idx];
  const targetId = document.getElementById('adv-logic-target-q').value;
  const targetText = document.getElementById('adv-logic-target-q').options[document.getElementById('adv-logic-target-q').selectedIndex]?.text || targetId;
  const op = document.getElementById('adv-logic-op').value;
  const val = document.getElementById('adv-logic-val').value.trim();
  
  if (!targetId || !val) {
    showToast('warning', 'Preencha todos os campos da condição.');
    return;
  }

  let syntax = '';
  if (op === '=') syntax = `\${${targetId}} = '${val}'`;
  else if (op === '!=') syntax = `\${${targetId}} != '${val}'`;
  else syntax = `\${${targetId}} ${op} ${val}`;

  q._logic.push({ targetId, target: targetText, op, val, raw: syntax });
  q.relevant = q._logic.map(l => l.raw).join(' and ');
  
  document.getElementById('adv-logic-val').value = '';
  renderAdvLogicList(idx);
};

window.removeAdvLogicCondition = function(idx, logicIdx) {
  const q = state.activeForm.questions[idx];
  q._logic.splice(logicIdx, 1);
  q.relevant = q._logic.map(l => l.raw).join(' and ');
  renderAdvLogicList(idx);
};

window.renderAdvLogicList = function(idx) {
  const q = state.activeForm.questions[idx];
  const tbody = document.getElementById('adv-logic-list');
  tbody.innerHTML = '';
  
  if (!q._logic || q._logic.length === 0) {
    tbody.innerHTML = '<tr><td colspan="2" style="text-align:center;color:#64748b;">Nenhuma regra definida. A pergunta sempre será exibida.</td></tr>';
    return;
  }

  q._logic.forEach((rule, i) => {
    let display = rule.target ? `${rule.target} ${rule.op} ${rule.val}` : rule.raw;
    tbody.innerHTML += `
      <tr>
        <td style="font-family:monospace; font-size:0.85rem;">${display}</td>
        <td><button class="btn btn-sm" style="color:#dc2626;background:transparent;border:none;" onclick="removeAdvLogicCondition(${idx}, ${i})"><i class="fa-solid fa-trash"></i></button></td>
      </tr>
    `;
  });
};

window.closeAdvLogicModal = function() {
  document.getElementById('advanced-logic-modal').classList.remove('active');
  renderBuilderQuestions();
  showToast('success', 'Regras de pulo atualizadas!');
};

// ===================== DASHBOARD BULK ACTIONS =====================
window.archiveSelectedProjects = function() {
  const checkboxes = document.querySelectorAll('.proj-checkbox:checked');
  if (checkboxes.length === 0) {
    showToast('warning', 'Selecione pelo menos um projeto para arquivar.');
    return;
  }
  showConfirm('Arquivar Projetos', `Tem certeza que deseja arquivar ${checkboxes.length} projeto(s)? Eles não receberão novas coletas.`, async () => {
    try {
      for (const cb of checkboxes) {
        await apiFetch(`/api/forms/${cb.value}/archive`, { method: 'PATCH' });
      }
      showToast('success', 'Projetos arquivados com sucesso.');
      await loadServerData();
      renderDashboard();
    } catch (err) {
      showToast('error', 'Erro ao arquivar projetos: ' + err.message);
    }
  });
};

window.dashboardShareSelected = function() {
  const checkboxes = document.querySelectorAll('.proj-checkbox:checked');
  if (checkboxes.length === 0) {
    showToast('warning', 'Selecione um projeto para gerenciar acessos.');
    return;
  }
  if (checkboxes.length > 1) {
    showToast('warning', 'Selecione apenas um projeto para compartilhar.');
    return;
  }
  const formId = checkboxes[0].value;
  state.activeProjectFormId = formId;
  openRouteModal();
};

window.deleteSelectedProjects = function() {
  const checkboxes = document.querySelectorAll('.proj-checkbox:checked');
  if (checkboxes.length === 0) {
    showToast('warning', 'Selecione pelo menos um projeto para excluir.');
    return;
  }
  showConfirm('Excluir Projetos', `Tem certeza que deseja excluir ${checkboxes.length} projeto(s)? Todos os dados serão perdidos.`, async () => {
    try {
      for (const cb of checkboxes) {
        await apiFetch(`/api/forms/${cb.value}`, { method: 'DELETE' });
      }
      showToast('success', 'Projetos excluídos com sucesso.');
      await loadServerData();
      renderDashboard();
    } catch (err) {
      showToast('error', 'Erro ao excluir projetos: ' + err.message);
    }
  });
};
