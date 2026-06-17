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
  DEV: 'Gustavo Dev', Admin: 'Clara Admin', Researcher: 'Ana Pesquisadora'
};
const ROLE_LABELS = {
  DEV: 'Suporte Técnico', Admin: 'Administrador', Researcher: 'Pesquisador'
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
    const token = localStorage.getItem('auth_token');
    if (token) headers['Authorization'] = `Bearer ${token}`;
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
    if (data.token) localStorage.setItem('auth_token', data.token);
    state.activeRole = data.user.role;
    state.activeUserId = data.user.id;
    state.activeUserName = data.user.name;

    document.querySelector('.sidebar').style.display = 'flex';
    document.querySelector('.main-content').style.marginLeft = '70px';
    
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
    
    if (typeof window.initWebSocket === 'function') window.initWebSocket();

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
  localStorage.removeItem('auth_token');
  state.activeRole = null;
  state.activeUserId = null;
  state.activeUserName = null;
  document.querySelector('.sidebar').style.display = 'none';
  document.querySelector('.main-content').style.marginLeft = '0';
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
  if (targetId === 'view-roles') loadRoles();
  if (targetId === 'view-mobile-sim') {
    if (!state.simActiveForm && state.activeForm && state.activeForm.status === 'published') {
      state.simActiveForm = state.activeForm;
      state.simAnswers = {};
      state.simCurrentQuestionIdx = 0;
    }
    if (state.simActiveForm) {
      renderMobileScreen();
    } else {
      document.getElementById('phone-screen-body').innerHTML = '<div style="padding:2rem;text-align:center;color:#64748b;">Nenhum formulário publicado selecionado.<br><br>Vá até a aba de Projetos, publique um formulário e clique em Preview.</div>';
    }
  }
}

// ===================== RBAC =====================
const NAV_PERMISSIONS = {
  'nav-team': ['DEV','Admin'],
  'nav-roles': ['DEV','Admin'],
  'nav-form-builder': ['DEV','Admin'],
  'nav-logs': ['DEV'],
  'nav-ai': ['DEV','Admin'],
  'nav-reports': ['DEV','Admin'],
};
const SECTION_PERMISSIONS = {
  'financial-dashboard-section': ['DEV','Admin'],
  'supervisor-validation-panel': ['DEV','Admin'],
  'audio-review-panel': ['DEV','Admin'],
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

  const publishedForms = state.forms;
  
  if (publishedForms.length === 0) {
    grid.innerHTML = '<div style="grid-column: 1 / -1; text-align:center; padding: 4rem; color: #64748b; background: white; border-radius: var(--radius-lg); border: 2px dashed var(--border);"><h3>Nenhum projeto encontrado</h3><p>Clique em <b>NOVO</b> no menu lateral para começar.</p></div>';
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
      statusBadge = '<span class="sys-status-badge" style="background:#475569;color:#f8fafc; font-size:0.7rem;"><i class="fa-solid fa-box-archive"></i> Arquivado</span>';
    } else if (isPub) {
      statusBadge = '<span class="sys-status-badge" style="font-size:0.7rem;"><i class="fa-solid fa-satellite-dish"></i> Ativo (Coleta)</span>';
    } else {
      statusBadge = '<span class="sys-status-badge" style="background:#f1f5f9;color:#64748b; font-size:0.7rem;"><i class="fa-solid fa-pen"></i> Rascunho</span>';
    }
    
    const modDateStr = form.updated_at ? new Date(form.updated_at).toLocaleDateString('pt-BR') : new Date().toLocaleDateString('pt-BR');

    grid.innerHTML += `
      <div class="project-list-item" style="background: white; border: 1px solid var(--border); border-radius: 8px; padding: 1rem 1.5rem; display: flex; align-items: center; justify-content: space-between; gap: 1rem; transition: transform 0.1s, box-shadow 0.1s; cursor: pointer;" onmouseover="this.style.boxShadow='var(--shadow-sm)'; this.style.borderColor='#cbd5e1'" onmouseout="this.style.boxShadow='none'; this.style.borderColor='var(--border)'" onclick="openProject('${form.id}')">
        
        <div style="display: flex; align-items: center; gap: 1rem; flex: 2; min-width: 0;">
          <input type="checkbox" class="proj-checkbox" value="${form.id}" onclick="event.stopPropagation()" style="width: 16px; height: 16px; cursor: pointer;">
          
          <div style="display: flex; flex-direction: column; min-width: 0;">
            <div style="display: flex; align-items: center; gap: 0.75rem;">
              <h3 style="margin: 0; font-size: 1.1rem; font-weight: 600; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${form.title}</h3>
              ${statusBadge}
            </div>
            <p style="margin: 0.25rem 0 0 0; font-size: 0.8rem; color: var(--text-secondary);"><i class="fa-regular fa-clock"></i> Modificado: ${modDateStr}</p>
          </div>
        </div>

        <div style="display: flex; align-items: center; gap: 2rem; flex: 1; justify-content: flex-end;">
          <div class="sys-owner-badge" style="margin: 0;" title="Autor: ${name}">
            <div class="sys-owner-circle" style="width:24px;height:24px;font-size:0.7rem;">${initial}</div> 
            <span style="font-size:0.85rem;">${name.split(' ')[0]}</span>
          </div>
          
          <div style="display: flex; flex-direction: column; align-items: flex-end;">
            <div style="font-weight: 700; color: var(--primary); font-size: 1.1rem;">${ints.length}</div>
            <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase;">Envios</div>
          </div>
          
          <button class="btn btn-sm" style="background:#f8fafc; border:1px solid #e2e8f0; color:#334155;"><i class="fa-solid fa-arrow-right"></i></button>
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

  const ints = state.interviews.filter(i => i.form_id === formId);
  const isPub = form.status === 'published';
  const isArchived = form.status === 'archived';

  document.getElementById('project-details-title-top').textContent = form.title;
  
  // Populate Resumo Info
  let statusBadgeHtml = '';
  if (isArchived) {
    statusBadgeHtml = '<span class="sys-status-badge" style="background:#475569;color:#f8fafc;"><i class="fa-solid fa-box-archive"></i> Arquivado</span>';
  } else if (isPub) {
    statusBadgeHtml = '<span class="sys-status-badge">Disponibilizado</span>';
  } else {
    statusBadgeHtml = '<span class="sys-status-badge" style="background:#f1f5f9;color:#64748b;"><i class="fa-solid fa-pen"></i> Rascunho</span>';
  }
  
  const elStatusBadge = document.getElementById('pd-status-badge');
  if(elStatusBadge) elStatusBadge.innerHTML = statusBadgeHtml;
  
  const elQCount = document.getElementById('pd-questions-count');
  if(elQCount) elQCount.textContent = `${form.questions.length} perguntas cadastradas`;
  
  const name = state.activeUserName || MOCK_USER_NAMES[state.activeRole] || state.activeRole || 'Usuário';
  const initial = name.charAt(0).toUpperCase();
  const shortName = name.split(' ')[0];

  const elOwnerInit = document.getElementById('pd-owner-initial');
  if(elOwnerInit) elOwnerInit.textContent = initial;
  const elOwnerName = document.getElementById('pd-owner-name');
  if(elOwnerName) elOwnerName.textContent = shortName;

  const elTotalSubs = document.getElementById('pd-total-submissions');
  if(elTotalSubs) elTotalSubs.textContent = ints.length;

  const modDateStr = form.updated_at ? new Date(form.updated_at).toLocaleDateString('pt-BR') : new Date().toLocaleDateString('pt-BR');
  const elLastMod = document.getElementById('pd-last-mod');
  if(elLastMod) elLastMod.textContent = modDateStr;

  const pubDateStr = isPub ? modDateStr : '-';
  const elLastPub = document.getElementById('pd-last-pub');
  if(elLastPub) elLastPub.textContent = pubDateStr;

  switchTab('view-project-details');
  loadProjectAccess();

  // Reset to default tab (RESUMO)
  sysSwitchTab('proj-tab-resumo');

  renderQuotasProgress(formId);
  renderReportsTable();
  renderCharts();
  renderAudioReviewList();
};

async function renderQuotasProgress(formId) {
  const container = document.getElementById('quota-progress-container');
  const card = document.getElementById('quota-progress-card');
  if (!container || !card) return;

  try {
    const headers = { 'x-user-id': state.activeUserId, 'x-user-role': state.activeRole };
    const token = localStorage.getItem('auth_token');
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`/api/forms/${formId}/quotas/progress`, { headers });
    if (!res.ok) throw new Error('Erro ao carregar cotas');
    
    const data = await res.json();
    if (!data.quotas || data.quotas.length === 0) {
      card.style.display = 'none';
      return;
    }

    card.style.display = 'block';
    let html = '';
    
    data.quotas.forEach(q => {
      const pct = Math.min(100, Math.round((q.count / q.limit) * 100));
      const color = pct >= 100 ? '#10b981' : (pct >= 50 ? '#f59e0b' : '#3b82f6');
      
      html += `
        <div style="margin-bottom:1rem;">
          <div style="display:flex; justify-content:space-between; font-size:0.85rem; margin-bottom:4px;">
            <strong>${q.question_id}: ${q.target_value}</strong>
            <span>${q.count} / ${q.limit} (${pct}%)</span>
          </div>
          <div style="width:100%; height:8px; background:#e2e8f0; border-radius:4px; overflow:hidden;">
            <div style="height:100%; width:${pct}%; background:${color}; border-radius:4px;"></div>
          </div>
        </div>
      `;
    });
    
    container.innerHTML = html;
  } catch (e) {
    console.error(e);
    card.style.display = 'none';
  }
}

window.sysSwitchTab = function(tabId) {
  document.querySelectorAll('.sys-proj-tab').forEach(t => {
    t.classList.remove('active');
    if (t.dataset.tab === tabId) t.classList.add('active');
  });
  document.querySelectorAll('#view-project-details .tab-content').forEach(c => c.style.display = 'none');
  const target = document.getElementById(tabId);
  if (target) target.style.display = 'block';
  
  if (tabId === 'proj-tab-mapa') {
    if (!state.map) {
      setTimeout(() => initMap(), 100);
    } else {
      setTimeout(() => {
        state.map.invalidateSize();
        renderMapMarkers();
      }, 150);
    }
  }
};

window.sysEditForm = function() {
  if (!state.activeProjectFormId) return;
  const form = state.forms.find(f => f.id === state.activeProjectFormId);
  if (form) {
    loadFormIntoBuilder(form);
    switchTab('view-form-builder');
  }
};

window.exportCurrentFormXLS = async function() {
  if (state.activeForm.questions.length === 0) return showToast('warning', 'O formulário está vazio.');
  showToast('info', 'Gerando XLSForm...');
  try {
    const url = `/api/forms/${state.activeForm.id}/export-xlsform`;
    const token = localStorage.getItem('auth_token');
    
    const res = await fetch(url, {
      method: 'GET',
      headers: token ? { 'Authorization': `Bearer ${token}` } : {}
    });
    
    if (!res.ok) throw new Error('Erro ao exportar XLSForm');
    
    const blob = await res.blob();
    const blobUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = `${state.activeForm.title || 'formulario'}_xlsform.xlsx`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(blobUrl);
    a.remove();
    showToast('success', 'Exportação concluída!');
  } catch (err) {
    showToast('error', err.message);
  }
};

window.sysPreviewForm = function() {
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
function getStringColor(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
  return '#' + '00000'.substring(0, 6 - c.length) + c;
}

window.toggleMap3D = function() {
  const mapDiv = document.getElementById('map');
  const btn = document.getElementById('btn-map-3d');
  state.isMap3D = !state.isMap3D;
  
  if (state.isMap3D) {
    btn.innerHTML = '<i class="fa-solid fa-map"></i> Voltar para Mapa 2D';
    btn.style.background = '#0f172a';
    if(state.tileLayer) state.map.removeLayer(state.tileLayer);
    state.tileLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 18, attribution: 'Esri Satellite' }).addTo(state.map);
  } else {
    btn.innerHTML = '<i class="fa-solid fa-satellite"></i> Visão Satélite';
    btn.style.background = 'var(--primary)';
    if(state.tileLayer) state.map.removeLayer(state.tileLayer);
    state.tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenStreetMap' }).addTo(state.map);
  }
};

function initMap() {
  if (state.map) return;
  state.map = L.map('map').setView([-3.1190, -60.0217], 7);
  state.tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap', maxZoom: 18 }).addTo(state.map);
  
  state.markerCluster = L.markerClusterGroup({
    chunkedLoading: true,
    maxClusterRadius: 50,
    spiderfyOnMaxZoom: true // Expands when zoomed in on same coords
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
    const researcher = state.users.find(u => u.id === item.researcher_id);
    const researcherName = researcher ? researcher.name : item.researcher_id;
    const color = getStringColor(researcherName); // dynamic color by researcher
    const form = state.forms.find(f => f.id === item.form_id);
    const formTitle = form ? form.title : item.form_id;
    
    // Beautiful dynamic teardrop marker
    const iconHtml = `<div style="width:24px;height:24px;background:${color};border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid #fff;box-shadow:0 4px 8px rgba(0,0,0,0.4);"><div style="width:8px;height:8px;background:#fff;border-radius:50%;margin:5px auto;transform:rotate(45deg);"></div></div>`;
    const icon = L.divIcon({ className:'custom-marker', html: iconHtml, iconSize:[24,24], iconAnchor:[12,24] });
    
    const popup = `<div style="font-family:Inter,sans-serif;min-width:200px;"><strong style="font-size:0.9rem;">${formTitle}</strong><br><span style="font-size:0.78rem;color:#64748b;">Pesquisador: ${researcherName}</span><br><span style="font-size:0.78rem;color:#64748b;">Data: ${new Date(item.created_at).toLocaleDateString('pt-BR')}</span><br><span style="font-size:0.78rem;color:#64748b;">Dispositivo: ${item.device_id || 'unknown'}</span><br><div style="margin-top:8px;"><button class="btn btn-sm btn-primary" onclick="openInterviewDetails('${item.id}')" style="width:100%;font-size:0.75rem;">Ver Dados</button></div></div>`;
    
    const tooltipText = `<div style="font-weight:bold; color:${color};"><i class="fa-solid fa-user"></i> ${researcherName}</div><div style="font-size:10px; color:#666;">${new Date(item.created_at).toLocaleTimeString('pt-BR')}</div>`;

    const marker = L.marker([item.latitude, item.longitude], { icon })
      .bindTooltip(tooltipText, { direction: 'top', offset: [0, -20] })
      .bindPopup(popup);
      
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

function formatDeviceId(deviceId) {
  if (!deviceId) return 'N/A';
  if (deviceId.startsWith('collect:')) return 'Aplicativo Mobile (Android)';
  if (deviceId === 'Simulador Web' || deviceId.startsWith('enketo')) return 'Formulário Web';
  return deviceId;
}

window.renderReportsTable = function() {
  const thead = document.getElementById('reports-thead');
  const tbody = document.getElementById('reports-tbody');
  const searchInput = document.getElementById('reports-search');
  if (!tbody || !thead) return;
  
  const form = state.activeForm || { questions: [] };
  const questions = form.questions || [];

  let filtered = [...state.interviews].reverse(); // newest first
  if (state.activeProjectFormId) {
    filtered = filtered.filter(i => i.form_id === state.activeProjectFormId);
  }

  // Search filter
  const term = searchInput ? searchInput.value.toLowerCase() : '';
  if (term) {
    filtered = filtered.filter(int => {
      const r = state.users.find(u => u.id === int.researcher_id) || {name: int.researcher_id};
      if (int.id.toLowerCase().includes(term) || r.name.toLowerCase().includes(term)) return true;
      if (int.data) {
        return Object.values(int.data).some(v => String(v).toLowerCase().includes(term));
      }
      return false;
    });
  }

  // Generate Headers
  let headHtml = `<tr><th style="width:40px;"><input type="checkbox" id="check-all-interviews"></th><th>ID</th><th>Pesquisador</th><th>Data/Hora</th>`;
  questions.forEach(q => {
    headHtml += `<th>${q.text || q.id}</th>`;
  });
  headHtml += `<th>Ações</th></tr>`;
  thead.innerHTML = headHtml;

  // Check all listener
  setTimeout(() => {
    const cbAll = document.getElementById('check-all-interviews');
    if (cbAll) {
      cbAll.addEventListener('change', (e) => {
        document.querySelectorAll('.cb-interview-select').forEach(cb => cb.checked = e.target.checked);
      });
    }
  }, 50);

  tbody.innerHTML = '';
  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${questions.length + 5}" style="text-align:center;padding:2rem;">Nenhuma coleta encontrada.</td></tr>`;
    return;
  }

  filtered.forEach(int => {
    const researcher = state.users.find(u => u.id === int.researcher_id) || {name: int.researcher_id};
    const date = new Date(int.created_at).toLocaleString('pt-BR');
    
    let trHtml = `
      <td><input type="checkbox" class="cb-interview-select" value="${int.id}"></td>
      <td>${int.id.substring(0,8)}</td>
      <td>${researcher.name}</td>
      <td>${date}</td>
    `;

    // Fill answers
    questions.forEach(q => {
      let val = (int.data && int.data[q.id]) ? int.data[q.id] : '-';
      
      // If it's the audio url attached directly, or answered via question
      if ((q.type === 'audio' && val !== '-') || (val && typeof val === 'string' && val.endsWith('.webm'))) {
        val = `<a href="#" style="color:var(--primary); text-decoration:none; display:inline-flex; align-items:center; gap:0.4rem; font-weight:600;" onclick="openAudioModal('${val}'); return false;"><i class="fa-solid fa-play"></i> Ouvir</a>`;
      } else if (int.audio_url && q.type === 'audio') { // Fallback if general audio_url is present and matches an audio question
        val = `<a href="#" style="color:var(--primary); text-decoration:none; display:inline-flex; align-items:center; gap:0.4rem; font-weight:600;" onclick="openAudioModal('${int.audio_url}'); return false;"><i class="fa-solid fa-play"></i> Ouvir</a>`;
      }
      
      trHtml += `<td>${val}</td>`;
    });

    trHtml += `<td><button class="btn btn-sm btn-outline" style="border-color:var(--border); color:var(--text-secondary);" onclick="openInterviewDetails('${int.id}')"><i class="fa-solid fa-eye"></i> Detalhes</button></td>`;
    
    const tr = document.createElement('tr');
    tr.innerHTML = trHtml;
    tbody.appendChild(tr);
  });
};

window.openAudioModal = function(url) {
  const modal = document.getElementById('audio-modal');
  const player = document.getElementById('audio-player-element');
  if (modal && player) {
    player.src = url;
    
    // Fix for 0:00 duration issue (missing metadata in WebM/AMR)
    player.onloadedmetadata = function() {
      if (player.duration === Infinity || isNaN(player.duration)) {
        player.currentTime = 1e101;
        player.ontimeupdate = function() {
          player.ontimeupdate = null;
          player.currentTime = 0;
        };
      }
    };

    modal.classList.add('active');
    player.play().catch(e => console.log("Auto-play blocked", e));
  }
};

window.closeAudioModal = function() {
  const modal = document.getElementById('audio-modal');
  const player = document.getElementById('audio-player-element');
  if (modal && player) {
    player.pause();
    player.currentTime = 0;
    modal.classList.remove('active');
  }
};

window.openInterviewDetails = function(id) {
  const int = state.interviews.find(i => i.id === id);
  if (!int) return;
  const researcher = state.users.find(u => u.id === int.researcher_id) || {name: int.researcher_id};
  const form = state.forms.find(f => f.id === int.form_id) || {title: int.form_id, questions: []};
  
  document.getElementById('interview-modal-form').textContent = form.title;
  document.getElementById('interview-modal-researcher').textContent = researcher.name;
  document.getElementById('interview-modal-date').textContent = new Date(int.created_at).toLocaleString('pt-BR');
  document.getElementById('interview-modal-device').textContent = formatDeviceId(int.device_id);
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

window.exportProjectData = async function() {
  if (!state.activeProjectFormId) return;
  const formId = state.activeProjectFormId;
  const form = state.forms.find(f => f.id === formId);
  
  showToast('info', 'Gerando arquivo CSV no servidor...');
  
  try {
    const headers = {
      'x-user-id': state.activeUserId,
      'x-user-role': state.activeRole
    };
    const token = localStorage.getItem('auth_token');
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const response = await fetch(`/api/export/${formId}`, {
      headers
    });
    
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || 'Erro na exportação');
    }
    
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `DATApesquise_${form ? form.title.replace(/\s+/g, '_') : formId}_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();
    showToast('success', 'Download concluído!');
  } catch (err) {
    showToast('error', err.message);
  }
};

window.exportXLSForm = async function() {
  const formId = state.activeForm.id;
  if (!formId) return showToast("error", "Salve o formulário antes de baixar o XLSForm.");
  showToast("info", "Gerando arquivo XLSForm...");
  try {
    const headers = { "x-user-id": state.activeUserId, "x-user-role": state.activeRole };
    const token = localStorage.getItem("auth_token");
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const response = await fetch(`/api/forms/${formId}/export-xlsform`, { headers });
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || "Erro na exportação");
    }
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.style.display = "none";
    a.href = url;
    a.download = `form_${formId}.xlsx`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
  } catch (err) {
    showToast("error", err.message);
  }
};

window.exportProjectDataXLSX = async function() {
  if (!state.activeProjectFormId) return;
  const formId = state.activeProjectFormId;
  const form = state.forms.find(f => f.id === formId);
  
  showToast('info', 'Gerando arquivo XLSX no servidor...');
  
  try {
    const headers = {
      'x-user-id': state.activeUserId,
      'x-user-role': state.activeRole
    };
    const token = localStorage.getItem('auth_token');
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const response = await fetch(`/api/export/${formId}/xlsx`, { headers });
    
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || 'Erro na exportação');
    }
    
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `DATApesquise_${form ? form.title.replace(/\\s+/g, '_') : formId}_${new Date().toISOString().split('T')[0]}.xlsx`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();
    showToast('success', 'Download concluído!');
  } catch (err) {
    showToast('error', err.message);
  }
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
  if (!document.getElementById('btn-new-form')) return;
  document.getElementById('btn-new-form') && document.getElementById('btn-new-form').addEventListener('click', () => {
    loadFormIntoBuilder({ id:'', title:'Novo Formulário', status:'draft', version:1, questions:[] });
  });
  document.getElementById('btn-add-question') && document.getElementById('btn-add-question').addEventListener('click', () => {
    document.getElementById('question-type-modal').classList.add('active');
  });
  document.getElementById('btn-save-form') && document.getElementById('btn-save-form').addEventListener('click', saveActiveForm);
  
  const importInput = document.getElementById('import-xlsform-input');
  if (importInput) {
    importInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      const formData = new FormData();
      formData.append('file', file);
      
      showToast('info', 'Processando arquivo XLSForm...');
      try {
        const token = localStorage.getItem('auth_token');
        const headers = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;
        if (state.activeRole) headers['x-user-role'] = state.activeRole;
        
        const res = await fetch('/api/forms/upload-xlsform', {
          method: 'POST',
          headers,
          body: formData
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erro na importação.');
        
        showToast('success', 'Formulário importado com sucesso!');
        await loadServerData();
        renderFormBuilderList();
        loadFormIntoBuilder(data.form || state.forms.find(f => f.id === data.id) || state.forms[0]);
      } catch (err) {
        showToast('error', err.message);
      } finally {
        e.target.value = '';
      }
    });
  }

  const importBuilder = document.getElementById('import-builder-xls');
  if (importBuilder) {
    importBuilder.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const formData = new FormData();
      formData.append('file', file);
      showToast('info', 'Importando perguntas...');
      try {
        const token = localStorage.getItem('auth_token');
        const headers = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;
        if (state.activeRole) headers['x-user-role'] = state.activeRole;
        const res = await fetch('/api/forms/parse-xlsform', { method: 'POST', headers, body: formData });
        const data = await res.json();
        if (data.error) showToast('error', data.error);
        else {
          state.activeForm.questions = data.questions;
          renderBuilderQuestions();
          showToast('success', 'Perguntas substituídas com sucesso!');
        }
      } catch (err) { showToast('error', 'Erro: ' + err.message); }
      e.target.value = '';
    });
  }
}

window.addNewQuestion = function(type) {
  const qId = 'Q' + (state.activeForm.questions.length + 1);
  const q = { id:qId, text:'', type: type, options:[], required: false };
  if (type === 'select_one' || type === 'select_multiple' || type === 'rank') {
    q.options = [{ name: 'opt_1', label: 'Opção 1' }, { name: 'opt_2', label: 'Opção 2' }];
  }
  state.activeForm.questions.push(q);
  renderBuilderQuestions();
  document.getElementById('question-type-modal').classList.remove('active');
  
  // Scroll to bottom
  const container = document.querySelector('.sys-workspace-body');
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
  let depth = 0;
  state.activeForm.questions.forEach((q, idx) => {
    if (q.type === 'end_group' || q.type === 'end_repeat') {
      depth = Math.max(0, depth - 1);
    }
    const currentDepth = depth;
    if (q.type === 'begin_group' || q.type === 'begin_repeat') {
      depth++;
    }

    const card = document.createElement('div');
    card.className = 'sys-question-row';
    card.draggable = true;
    card.dataset.index = idx;
    card.style.marginLeft = (currentDepth * 40) + 'px';
    if (q.type.startsWith('begin_') || q.type.startsWith('end_')) {
      card.style.borderLeft = '4px solid var(--primary)';
      card.style.backgroundColor = '#f8fafc';
    }
    
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
          <div class="sys-choice-row">
            <button class="sys-choice-trash" onclick="removeOption(${idx},${oi})" title="Excluir"><i class="fa-solid fa-trash"></i></button>
            <input type="text" class="sys-choice-input" value="${val}" onchange="updateOption(${idx},${oi},this.value)" placeholder="Texto da Opção" />
            <input type="text" class="sys-choice-pill" value="${nameVal}" onchange="updateOptionName(${idx},${oi},this.value)" style="border:none; outline:none; font-family:var(--font-mono); cursor:text; width:150px;" title="Editar Nome Interno (ID)" />
          </div>
        `;
      });
      optionsHtml += `<div class="sys-add-choice" onclick="addOption(${idx})" title="Clique aqui para adicionar mais uma linha de opção à lista">+ Adicionar nova opção de resposta...</div></div>`;
    }

    card.innerHTML = `
      <div class="sys-question-left">
        <i class="sys-question-icon fa-solid fa-circle-dot"></i>
        <div class="sys-collapsed-title">${idx+1}. ${q.text || 'Nova Pergunta'}</div>
      </div>
      <div class="sys-question-center">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div style="display:flex; align-items:center; flex:1;">
            <div style="background: var(--primary-light); color: var(--primary); font-weight: bold; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-right: 10px; font-size: 0.9rem; flex-shrink: 0;">${idx+1}</div>
            ${(q.type === 'end_group' || q.type === 'end_repeat') ? 
              `<div style="flex:1; font-weight:bold; color:var(--text-muted);">${q.type === 'end_group' ? 'Fim do Grupo' : 'Fim da Repetição'}</div>` : 
              `<input type="text" class="sys-question-text" value="${q.text}" onchange="updateQText(${idx},this.value)" placeholder="${q.type === 'begin_group' || q.type === 'begin_repeat' ? 'Nome do Grupo/Repetição...' : 'Escreva a pergunta aqui...'}" style="flex:1;" title="Digite o texto que será lido pelo pesquisador" />
               <button class="sys-btn-piping" onclick="openPipingModal(${idx})" title="Inserir Variável (Piping): Puxar a resposta de uma pergunta anterior para dentro do texto." style="background:transparent; border:none; color:var(--primary); cursor:pointer; padding:5px;"><i class="fa-solid fa-wand-magic-sparkles"></i></button>`
            }
          </div>
          <select style="border:none; color:#64748b; font-size:0.8rem; outline:none; background:transparent; cursor:pointer; margin-left: 10px;" onchange="updateQType(${idx},this.value)">
            <option value="text" ${q.type==='text'?'selected':''}>Texto Livre</option>
            <option value="number" ${q.type==='number'?'selected':''}>Número</option>
            <option value="decimal" ${q.type==='decimal'?'selected':''}>Decimal</option>
            <option value="integer" ${q.type==='integer'?'selected':''}>Número (Inteiro)</option>
            <option value="single_choice" ${q.type==='single_choice'||q.type==='select_one'?'selected':''}>Seleção Única</option>
            <option value="multiple_choice" ${q.type==='multiple_choice'||q.type==='select_multiple'?'selected':''}>Múltipla Escolha</option>
            <option value="geopoint" ${q.type==='geopoint'?'selected':''}>Ponto (GPS)</option>
            <option value="geotrace" ${q.type==='geotrace'?'selected':''}>Linha</option>
            <option value="geoshape" ${q.type==='geoshape'?'selected':''}>Área</option>
            <option value="image" ${q.type==='image'?'selected':''}>Foto / Imagem</option>
            <option value="video" ${q.type==='video'?'selected':''}>Vídeo</option>
            <option value="audio_record" ${q.type==='audio_record'||q.type==='audio'?'selected':''}>Áudio</option>
            <option value="date" ${q.type==='date'?'selected':''}>Data</option>
            <option value="time" ${q.type==='time'?'selected':''}>Hora</option>
            <option value="datetime" ${q.type==='datetime'?'selected':''}>Data e Horário</option>
            <option value="note" ${q.type==='note'?'selected':''}>Nota / Aviso</option>
            <option value="barcode" ${q.type==='barcode'?'selected':''}>Cód. Barras</option>
            <option value="acknowledge" ${q.type==='acknowledge'?'selected':''}>Reconhece</option>
            <option value="rank" ${q.type==='rank'?'selected':''}>Classificação</option>
            <option value="calculate" ${q.type==='calculate'?'selected':''}>Calcular</option>
            <option value="hidden" ${q.type==='hidden'?'selected':''}>Oculto</option>
            <option value="file" ${q.type==='file'?'selected':''}>Arquivo</option>
            <option value="range" ${q.type==='range'?'selected':''}>Intervalo</option>
            <option value="begin_group" ${q.type==='begin_group'?'selected':''}>Abrir Grupo</option>
            <option value="end_group" ${q.type==='end_group'?'selected':''}>Fechar Grupo</option>
            <option value="begin_repeat" ${q.type==='begin_repeat'?'selected':''}>Abrir Repetição</option>
            <option value="end_repeat" ${q.type==='end_repeat'?'selected':''}>Fechar Repetição</option>
          </select>
        </div>
        ${(q.type === 'end_group' || q.type === 'end_repeat') ? '' : `<input type="text" class="sys-question-hint" value="${q.hint || ''}" onchange="updateQHint(${idx},this.value)" placeholder="Dica de preenchimento (opcional)..." style="margin-left: 40px; width: calc(100% - 40px);" />`}
        <div style="margin-left: 40px;">
          ${optionsHtml}
        </div>
      </div>
      <div class="sys-question-right">
        <button class="sys-btn-required ${q.required ? 'active' : ''}" onclick="toggleQRequired(${idx})" title="Obrigatória: O usuário do aplicativo não poderá avançar sem responder esta pergunta" style="color: ${q.required ? 'var(--danger)' : '#cbd5e1'};"><i class="fa-solid fa-asterisk"></i></button>
        <button class="sys-btn-gear" onclick="openQuestionSettingsModal(${idx})" title="Configurações Avançadas: Definir limites, validações, dicas extras e filtros em cascata"><i class="fa-solid fa-gear"></i></button>
        <button class="sys-btn-trash" onclick="confirmDeleteQuestion(${idx})" title="Excluir Pergunta: Remove permanentemente do questionário"><i class="fa-solid fa-trash"></i></button>
        <button class="sys-btn-copy" onclick="duplicateQuestion(${idx})" title="Duplicar Pergunta: Cria uma cópia exata logo abaixo desta"><i class="fa-solid fa-copy"></i></button>
        <button class="sys-btn-branch" onclick="openAdvLogicModal(${idx})" title="Lógica de Pulo (Skip Logic): Define regras para esconder ou mostrar esta pergunta baseado em respostas anteriores"><i class="fa-solid fa-code-branch"></i></button>
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
window.updateOptionName = (idx, oi, val) => { 
  const q = state.activeForm.questions[idx];
  let opt = q.options[oi];
  let safeVal = val.toLowerCase().replace(/[^a-z0-9_]/g, '_');
  
  const isDuplicate = q.options.some((o, i) => i !== oi && (typeof o === 'string' ? o : o.name) === safeVal);
  if (isDuplicate) {
    showToast('error', 'Este ID de opção já existe nesta pergunta.');
    renderBuilderQuestions();
    return;
  }

  if(typeof opt === 'string') q.options[oi] = { name: safeVal, label: opt };
  else opt.name = safeVal; 
};
window.updateQHint = (idx, val) => { state.activeForm.questions[idx].hint = val; };
window.toggleQRequired = (idx) => { 
  state.activeForm.questions[idx].required = !state.activeForm.questions[idx].required; 
  renderBuilderQuestions(); 
};
window.confirmDeleteQuestion = (idx) => {
  showConfirm('Excluir Pergunta', 'Tem certeza?', () => { state.activeForm.questions.splice(idx,1); renderBuilderQuestions(); });
};

window.openQuestionSettingsModal = (idx) => {
  const q = state.activeForm.questions[idx];
  document.getElementById('q-settings-id').value = idx;
  
  const match = (q.constraint || '').match(/^\.\s*(=|!=|>|<|>=|<=)\s*([^ ]+)$/);
  if (match) {
    document.getElementById('q-settings-constraint-op').value = match[1];
    document.getElementById('q-settings-constraint-val').value = match[2];
  } else {
    document.getElementById('q-settings-constraint-op').value = '';
    document.getElementById('q-settings-constraint-val').value = '';
  }
  
  document.getElementById('q-settings-constraint-msg').value = q.constraint_message || '';

  const limitDiv = document.getElementById('q-settings-select-limits');
  const cfDiv = document.getElementById('q-settings-choice-filter');
  const rangeDiv = document.getElementById('q-settings-range-params');
  const calcDiv = document.getElementById('q-settings-calc-params');
  
  if (limitDiv) {
    if (q.type === 'select_multiple') {
      limitDiv.style.display = 'block';
      document.getElementById('q-settings-min-sel').value = q.min_selections || '';
      document.getElementById('q-settings-max-sel').value = q.max_selections || '';
    } else {
      limitDiv.style.display = 'none';
    }
  }

  if (cfDiv) {
    if (q.type === 'select_one' || q.type === 'select_multiple') {
      cfDiv.style.display = 'block';
      document.getElementById('q-settings-cf-formula').value = q.choice_filter || '';
    } else {
      cfDiv.style.display = 'none';
    }
  }
  
  if (rangeDiv) {
    if (q.type === 'range') {
      rangeDiv.style.display = 'block';
      document.getElementById('q-settings-range-start').value = q.parameters?.start || 1;
      document.getElementById('q-settings-range-end').value = q.parameters?.end || 10;
      document.getElementById('q-settings-range-step').value = q.parameters?.step || 1;
    } else {
      rangeDiv.style.display = 'none';
    }
  }

  if (calcDiv) {
    if (q.type === 'calculate') {
      calcDiv.style.display = 'block';
      document.getElementById('q-settings-calc-formula').value = q.parameters?.calculation || '';
    } else {
      calcDiv.style.display = 'none';
    }
  }

  document.getElementById('question-settings-modal').classList.add('active');
};

window.closeQuestionSettingsModal = () => {
  document.getElementById('question-settings-modal').classList.remove('active');
};

window.saveQuestionSettings = () => {
  const idx = parseInt(document.getElementById('q-settings-id').value, 10);
  const q = state.activeForm.questions[idx];
  
  const op = document.getElementById('q-settings-constraint-op').value;
  const val = document.getElementById('q-settings-constraint-val').value;
  if (op && val) q.constraint = `. ${op} ${val}`;
  else delete q.constraint;
  
  const constraintMsgVal = document.getElementById('q-settings-constraint-msg').value.trim();
  if (constraintMsgVal) q.constraint_message = constraintMsgVal; else delete q.constraint_message;
  
  if (q.type === 'select_multiple') {
    const minSel = parseInt(document.getElementById('q-settings-min-sel').value, 10);
    const maxSel = parseInt(document.getElementById('q-settings-max-sel').value, 10);
    if (!isNaN(minSel)) q.min_selections = minSel; else delete q.min_selections;
    if (!isNaN(maxSel)) q.max_selections = maxSel; else delete q.max_selections;
    
    // Auto-generate constraint for select_multiple limits
    let conds = [];
    if (!isNaN(minSel)) conds.push(`count-selected(.) >= ${minSel}`);
    if (!isNaN(maxSel)) conds.push(`count-selected(.) <= ${maxSel}`);
    if (conds.length > 0) {
      q.constraint = conds.join(' and ');
      if (!q.constraint_message) q.constraint_message = 'A quantidade de opções selecionadas é inválida.';
    }
  }

  if (q.type === 'select_one' || q.type === 'select_multiple') {
    const cfVal = document.getElementById('q-settings-cf-formula').value.trim();
    if (cfVal) q.choice_filter = cfVal; else delete q.choice_filter;
  }

  if (q.type === 'range') {
    if (!q.parameters) q.parameters = {};
    q.parameters.start = parseInt(document.getElementById('q-settings-range-start').value, 10) || 1;
    q.parameters.end = parseInt(document.getElementById('q-settings-range-end').value, 10) || 10;
    q.parameters.step = parseFloat(document.getElementById('q-settings-range-step').value) || 1;
  }

  if (q.type === 'calculate') {
    if (!q.parameters) q.parameters = {};
    q.parameters.calculation = document.getElementById('q-settings-calc-formula').value.trim();
  }

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
    state.activeForm.questions.forEach(q => {
      if (q.constraint && (!q.constraint_message || q.constraint_message.trim() === '')) {
        q.constraint_message = 'Valor inválido de acordo com as regras.';
      }
    });
    const payload = { id:state.activeForm.id||undefined, title, status, questions:state.activeForm.questions, settings:state.activeForm.settings||{} };
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

// ===================== sys BUTTON HANDLERS =====================
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
  const isCollapsed = container.classList.toggle('sys-collapsed-view');
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
  
  if (state.activeForm.settings) {
    document.getElementById('form-settings-audit-audio').checked = !!state.activeForm.settings.audit_audio;
    document.getElementById('form-settings-audit-location').checked = !!state.activeForm.settings.audit_location;
    document.getElementById('form-settings-quotas').value = state.activeForm.settings.quotas ? JSON.stringify(state.activeForm.settings.quotas, null, 2) : '';
  } else {
    document.getElementById('form-settings-audit-audio').checked = false;
    document.getElementById('form-settings-audit-location').checked = false;
    document.getElementById('form-settings-quotas').value = '';
  }
  
  document.getElementById('form-settings-modal').classList.add('active');
};

window.saveFormSettings = () => {
  if (!state.activeForm.settings) state.activeForm.settings = {};
  state.activeForm.settings.audit_audio = document.getElementById('form-settings-audit-audio').checked;
  state.activeForm.settings.audit_location = document.getElementById('form-settings-audit-location').checked;
  
  try {
    const qVal = document.getElementById('form-settings-quotas').value.trim();
    if (qVal) {
      state.activeForm.settings.quotas = JSON.parse(qVal);
    } else {
      delete state.activeForm.settings.quotas;
    }
  } catch(e) {
    showToast('error', 'Formato JSON inválido para Cotas. Verifique a sintaxe.');
    return;
  }
  
  document.getElementById('form-settings-modal').classList.remove('active');
  showToast('success', 'Configurações globais salvas com sucesso!');
};

// ===================== MOBILE SIMULATOR =====================
function initMobileSimulator() {
  if (!document.getElementById('sim-toggle-network')) return;
  document.getElementById('sim-toggle-network') && document.getElementById('sim-toggle-network').addEventListener('change', (e) => {
    state.simIsOnline = e.target.checked;
    const badge = document.getElementById('net-status-text');
    badge.textContent = state.simIsOnline ? 'Conectado (Online)' : 'Desconectado (Offline)';
    if (state.simIsOnline) syncOfflineQueue();
    renderMobileScreen();
  });
  document.getElementById('sim-btn-download-templates') && document.getElementById('sim-btn-download-templates').addEventListener('click', downloadTemplates);
  document.getElementById('sim-btn-sync-queue') && document.getElementById('sim-btn-sync-queue').addEventListener('click', syncOfflineQueue);
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
  header.innerHTML = `<span style="font-weight:700;font-size:0.78rem;"><i class="fa-solid fa-chart-pie" style="color:var(--primary);"></i> DATApesquise</span><span class="network-badge-online">Preview</span>`;
  screen.innerHTML = '';

  if (!state.simActiveForm) {
    // Form selection view
    let opts = '<option value="">-- Selecione o formulário --</option>';
    state.forms.forEach(t => { opts += `<option value="${t.id}">${t.title} (V${t.version})</option>`; });
    const warn = state.forms.length === 0 ? '<div style="margin-top:1rem;padding:0.7rem;background:var(--warning-light);border-radius:8px;font-size:0.75rem;color:var(--warning);text-align:center;"><i class="fa-solid fa-circle-exclamation"></i> Nenhum formulário disponível.</div>' : '';
    screen.innerHTML = `<div style="flex:1;display:flex;flex-direction:column;justify-content:center;padding:0.5rem;"><div style="text-align:center;margin-bottom:1.5rem;"><i class="fa-solid fa-clipboard-question" style="font-size:2.5rem;color:var(--primary);margin-bottom:0.5rem;display:block;"></i><h4 style="font-size:1rem;">Iniciar Preview</h4><p style="font-size:0.78rem;color:var(--text-secondary);margin-top:0.3rem;">Selecione um formulário para testar.</p></div><select class="form-select" id="sim-select-form" style="margin-bottom:0.75rem;">${opts}</select><button class="btn btn-primary" style="width:100%;" onclick="simStartInterview()"><i class="fa-solid fa-play"></i> Testar Formulário</button>${warn}</div>`;
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
        inputHtml = `<div style="margin-top:0.6rem;padding:1rem;background:#f3f4f6;border-radius:8px;text-align:center;"><i class="fa-solid fa-location-dot" style="font-size:2rem;color:var(--primary);margin-bottom:0.5rem;display:block;"></i><input type="hidden" id="sim-ans-${q.id}" value="${val?val:'-3.1190,-60.0217'}"><button class="btn btn-sm btn-primary" onclick="document.getElementById('sim-ans-${q.id}').value='-3.1190,-60.0217';this.innerHTML='<i class=\\'fa-solid fa-check\\'></i> Localização Simulada';this.classList.add('btn-success');"><i class="fa-solid fa-satellite-dish"></i> Obter Coordenadas GPS</button>${val?'<div style="font-size:0.75rem;margin-top:0.5rem;color:var(--success);">GPS salvo!</div>':''}</div>`;
      } else if (q.type === 'image' || q.type === 'video') {
        const val = state.simAnswers[q.id] || '';
        const icon = q.type === 'image' ? 'fa-camera' : 'fa-video';
        inputHtml = `<div style="margin-top:0.6rem;padding:1rem;background:#f3f4f6;border-radius:8px;text-align:center;"><i class="fa-solid ${icon}" style="font-size:2rem;color:var(--text-muted);margin-bottom:0.5rem;display:block;"></i><input type="hidden" id="sim-ans-${q.id}" value="${val?val:'midia_capturada.jpg'}"><button class="btn btn-sm" onclick="document.getElementById('sim-ans-${q.id}').value='arquivo_simulado.${q.type==='video'?'mp4':'jpg'}';this.innerHTML='<i class=\\'fa-solid fa-check\\'></i> Arquivo Anexado';this.classList.add('btn-success');"><i class="fa-solid fa-paperclip"></i> Capturar ou Anexar</button>${val?'<div style="font-size:0.75rem;margin-top:0.5rem;color:var(--success);">Arquivo salvo!</div>':''}</div>`;
      } else if (q.type === 'audio_record' || q.type === 'audio') {
        const isRec = state.simIsRecording;
        inputHtml = `<div class="sim-audio-widget"><p style="font-size:0.78rem;color:var(--text-secondary);margin-bottom:0.4rem;">${isRec?'Gravando... Fale no microfone.':'Pressione para iniciar.'}</p><div class="wave-container ${isRec?'recording':''}"><span class="wave-bar"></span><span class="wave-bar"></span><span class="wave-bar"></span><span class="wave-bar"></span><span class="wave-bar"></span><span class="wave-bar"></span></div><button class="record-btn ${isRec?'recording':''}" onclick="simToggleRecord()"></button><div style="font-size:0.75rem;margin-top:0.3rem;">${state.simAudioFile?`<span style="color:var(--success);"><i class="fa-solid fa-file-audio"></i> ${state.simAudioFile}</span>`:'<span style="color:var(--text-muted);">Nenhum áudio gravado</span>'}</div><input type="hidden" id="sim-ans-${q.id}" value="${state.simAudioFile||''}"></div>`;
      }
      screen.innerHTML = `<div style="flex:1;display:flex;flex-direction:column;padding:0.25rem;"><div style="font-size:0.7rem;color:var(--primary);font-weight:700;margin-bottom:0.15rem;">Questão ${ci+1} de ${qList.length}</div><div class="progress-bar" style="margin-bottom:0.75rem;"><div class="progress-fill blue" style="width:${((ci+1)/qList.length*100).toFixed(0)}%;"></div></div><h4 style="font-size:1rem;line-height:1.4;margin-bottom:0.25rem;">${q.text}</h4>${inputHtml}<div style="display:flex;gap:0.5rem;margin-top:auto;padding-top:1rem;"><button class="btn" style="flex:1;" onclick="simPrev()"><i class="fa-solid fa-arrow-left"></i> Voltar</button><button class="btn btn-primary" style="flex:2;" onclick="simNext()">${isLast?'<i class="fa-solid fa-circle-check"></i> Finalizar':'Avançar <i class="fa-solid fa-arrow-right"></i>'}</button></div><button class="btn btn-sm" style="margin-top:0.5rem;width:100%;border:none;color:var(--danger);font-size:0.75rem;" onclick="simAbort()"><i class="fa-solid fa-ban"></i> Cancelar Preview</button></div>`;
    } else {
      // Confirmation view
      screen.innerHTML = `<div style="flex:1;display:flex;flex-direction:column;justify-content:center;padding:0.5rem;text-align:center;"><i class="fa-solid fa-circle-check" style="font-size:3rem;color:var(--success);margin-bottom:0.75rem;"></i><h3 style="margin-bottom:0.3rem;">Teste Concluído!</h3><p style="font-size:0.82rem;color:var(--text-secondary);margin-bottom:1rem;">O formulário funciona corretamente.</p><div style="background:var(--bg-page);padding:0.6rem;border-radius:8px;margin-bottom:1rem;font-size:0.75rem;text-align:left;max-height:110px;overflow-y:auto;">${Object.entries(state.simAnswers).map(([k,v])=>`<div><strong>${k}:</strong> ${v}</div>`).join('')}${state.simAudioFile?`<div><strong>Áudio:</strong> ${state.simAudioFile}</div>`:''}</div><button class="btn btn-success" style="width:100%;margin-bottom:0.5rem;" onclick="simSubmit()"><i class="fa-solid fa-check-double"></i> Concluir Preview</button><button class="btn" style="width:100%;" onclick="simReset()">Testar Novamente</button></div>`;
    }
  }
}

window.simStartInterview = function() {
  const select = document.getElementById('sim-select-form');
  if (!select || !select.value) { showToast('warning', 'Selecione um formulário para testar.'); return; }
  const form = state.forms.find(f => f.id === select.value);
  if (form) { state.simActiveForm = form; state.simAnswers = {}; state.simCurrentQuestionIdx = 0; state.simAudioFile = null; state.simIsRecording = false; renderMobileScreen(); }
};
window.simAbort = function() { showConfirm('Cancelar Preview', 'Tem certeza que deseja sair do simulador?', () => simReset(), { type:'danger', confirmText:'Sim, sair' }); };
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
  showToast('info', 'Isto é apenas um preview. Nenhuma pesquisa foi enviada ao banco de dados.');
  simReset();
};


// ===================== AI ANALYSIS =====================
window.runAiAnalysis = async function() {
  const formId = state.activeProjectFormId;
  if (!formId) {
    showToast('warning', 'Selecione um projeto na aba Projetos primeiro.');
    return;
  }

  const status = document.getElementById('ai-status');
  const container = document.getElementById('ai-results-container');
  status.innerHTML = '<span style="color:var(--primary);"><i class="fa-solid fa-spinner fa-spin"></i> Analisando dados...</span>';
  container.innerHTML = '<div class="empty-state"><i class="fa-solid fa-spinner fa-spin" style="opacity:1;"></i><h4>Processando verificação...</h4><p>Analisando metadados, consistência de GPS e velocidade de coleta.</p></div>';
  
  try {
    const res = await apiFetch(`/api/analytics/quality/${formId}`);
    status.innerHTML = '<span style="color:var(--success);"><i class="fa-solid fa-check"></i> Verificação concluída.</span>';
    
    container.innerHTML = '';
    if (!res.results || res.results.length === 0) {
      container.innerHTML = '<div class="empty-state"><p>Nenhuma coleta encontrada para análise.</p></div>';
      return;
    }
    
    res.results.forEach(r => {
      let cssClass = r.type === 'danger' ? 'anomaly' : (r.type === 'warning' ? 'warning' : 'ok');
      let color = `var(--${r.type === 'ok' ? 'success' : r.type})`;
      container.innerHTML += `
        <div class="ai-result-card ${cssClass}">
          <h4 style="color:${color};"><i class="${r.icon}"></i> ${r.title}</h4>
          <p>${r.message}</p>
        </div>
      `;
    });
    
    showToast('success', 'Verificação de qualidade finalizada.');
  } catch (err) {
    status.innerHTML = '<span style="color:var(--danger);"><i class="fa-solid fa-xmark"></i> Falha na análise.</span>';
    container.innerHTML = `<div class="empty-state" style="color:var(--danger);"><p>Erro: ${err.message}</p></div>`;
  }
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
  if (!document.getElementById('btn-export-data')) return;
  document.getElementById('btn-export-data') && document.getElementById('btn-export-data').addEventListener('click', () => {
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

window.openRouteModal = async function() {
  if (!state.activeProjectFormId) {
    showToast('error', 'Nenhum projeto selecionado.');
    return;
  }
  document.getElementById('route-modal').classList.add('active');
  await renderAssignedResearchers();
};

window.renderAssignedResearchers = async function() {
  const container = document.getElementById('assigned-researchers-list');
  if(!container) return;
  container.innerHTML = '<div style="text-align:center;color:#64748b;"><i class="fa-solid fa-spinner fa-spin"></i> Carregando acessos...</div>';
  try {
     const routes = await apiFetch('/api/routes');
     const projectRoutes = routes.filter(r => r.form_id === state.activeProjectFormId);
     if (projectRoutes.length === 0) {
        container.innerHTML = '<div style="font-size:0.85rem;color:#64748b;text-align:center;">Nenhum pesquisador atribuído a este projeto ainda.</div>';
     } else {
        container.innerHTML = '<div style="font-size:0.85rem;margin-bottom:0.75rem;font-weight:600;color:var(--text-secondary);">Pesquisadores com Acesso:</div><div style="display:flex;flex-wrap:wrap;gap:0.5rem;">' + 
           projectRoutes.map(r => `<span class="badge badge-info" style="font-size:0.75rem;padding:0.4rem 0.6rem;"><i class="fa-solid fa-user"></i> ${r.researcher_name || r.researcher_id} (${r.city || 'Sem local'}) <i class="fa-solid fa-xmark" style="cursor:pointer;margin-left:8px;font-size:0.9rem;" onclick="removeRoute('${r.id}')" title="Remover Acesso"></i></span>`).join('') +
        '</div>';
     }
  } catch(e) {
     container.innerHTML = '<div style="color:red;font-size:0.8rem;">Erro ao carregar atribuições.</div>';
  }
};

window.removeRoute = function(routeId) {
  showConfirm('Remover Acesso', 'Tem certeza que deseja remover o acesso deste pesquisador ao projeto?', async () => {
    try {
      await apiFetch(`/api/routes/${routeId}`, { method: 'DELETE' });
      showToast('success', 'Acesso removido com sucesso.');
      await renderAssignedResearchers();
    } catch (err) {
      showToast('error', 'Erro ao remover acesso: ' + err.message);
    }
  });
};

window.closeRouteModal = function() { document.getElementById('route-modal').classList.remove('active'); };

window.saveRoute = async function() {
  const researcher_id = document.getElementById('route-form-researcher').value;
  const city = document.getElementById('route-form-city').value;
  const form_id = state.activeProjectFormId;
  
  if(!researcher_id || !form_id) { showToast('warning', 'Selecione o pesquisador.'); return; }
  if(!city) { showToast('warning', 'Informe a cidade/localidade.'); return; }
  
  try {
    const btn = event ? event.currentTarget : null;
    if (btn) setButtonLoading(btn, true);
    await apiFetch('/api/routes', { method: 'POST', body: JSON.stringify({ researcher_id, form_id, city }) });
    showToast('success', 'Acesso habilitado para o projeto!');
    document.getElementById('route-form-city').value = '';
    await renderAssignedResearchers();
  } catch(err) {
    showToast('error', 'Erro ao atribuir: ' + err.message);
  } finally {
    const btn = event ? event.currentTarget : null;
    if (btn) setButtonLoading(btn, false);
  }
};

window.deleteRoute = function(id) {
  showConfirm('Remover Acesso', 'O pesquisador não terá mais acesso a este projeto no aplicativo. Continuar?', async () => {
    try {
      await apiFetch(`/api/routes/${id}`, { method: 'DELETE' });
      showToast('success', 'Acesso removido com sucesso.');
      loadProjectAccess();
    } catch(err) { showToast('error', err.message); }
  }, { type: 'danger' });
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
      const permsArray = Array.isArray(role.permissions) ? role.permissions : String(role.permissions || '').split(',');
      const perms = permsArray.filter(p=>p).map(p => `<span class="badge badge-info" style="margin:2px;">${p}</span>`).join('');
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
  document.getElementById('sidebar-toggle-mobile') && document.getElementById('sidebar-toggle-mobile').addEventListener('click', () => {
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
    if (typeof window.initWebSocket === 'function') window.initWebSocket();
  } else {
    document.querySelector('.sidebar').style.display = 'none';
    document.querySelector('.main-content').style.marginLeft = '0';
    switchTab('view-login');
  }



  // Refresh logs button
  document.getElementById('btn-refresh-logs') && document.getElementById('btn-refresh-logs').addEventListener('click', fetchLogs);

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

// ===================== PIPING MODAL =====================
window.openPipingModal = function(idx) {
  document.getElementById('piping-target-idx').value = idx;
  const select = document.getElementById('piping-source-q');
  select.innerHTML = '';
  
  let hasValidQuestions = false;
  for (let i = 0; i < idx; i++) {
    const prevQ = state.activeForm.questions[i];
    if (prevQ.text && !prevQ.type.startsWith('begin_') && !prevQ.type.startsWith('end_') && prevQ.type !== 'note') {
      select.innerHTML += `<option value="${prevQ.id}">${i+1}. ${prevQ.text}</option>`;
      hasValidQuestions = true;
    }
  }
  
  if (!hasValidQuestions) {
    showToast('warning', 'Não há perguntas válidas anteriores para inserir.');
    return;
  }
  
  document.getElementById('piping-modal').classList.add('active');
};

window.applyPiping = function() {
  const targetIdx = parseInt(document.getElementById('piping-target-idx').value, 10);
  const sourceId = document.getElementById('piping-source-q').value;
  
  if (!sourceId) return;
  
  const q = state.activeForm.questions[targetIdx];
  q.text = (q.text || '') + ' ${' + sourceId + '}';
  
  document.getElementById('piping-modal').classList.remove('active');
  renderBuilderQuestions();
  showToast('success', 'Variável inserida com sucesso!');
};

// ===================== ADVANCED LOGIC MODAL =====================
window.openAdvLogicModal = function(idx) {
  document.getElementById('adv-logic-q-idx').value = idx;
  const q = state.activeForm.questions[idx];
  const subtitleEl = document.getElementById('adv-logic-modal-subtitle');
  if (subtitleEl) subtitleEl.textContent = `Configurando lógica para: ${idx+1}. ${q.text || 'Pergunta Sem Título'}`;
  
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

  if (!q._logic) {
    q._logic = [];
    if (q.relevant) {
      q._logic.push({ raw: q.relevant });
    }
  }

  document.getElementById('adv-logic-join').value = 'and';
  window.updateAdvLogicOperatorsAndValues();
  renderAdvLogicList(idx);
  document.getElementById('advanced-logic-modal').classList.add('active');
};

window.updateAdvLogicOperatorsAndValues = function() {
  const targetId = document.getElementById('adv-logic-target-q').value;
  const opSelect = document.getElementById('adv-logic-op');
  const valContainer = document.getElementById('adv-logic-val-container');
  
  if (!targetId) return;
  const targetQ = state.activeForm.questions.find(q => q.id === targetId);
  if (!targetQ) return;
  
  const isSelect = targetQ.type === 'select_one' || targetQ.type === 'select_multiple';
  const isNumber = targetQ.type === 'integer' || targetQ.type === 'decimal';
  
  // Filter operators
  if (isSelect || targetQ.type === 'text') {
    Array.from(opSelect.options).forEach(opt => {
      opt.style.display = (opt.value === '=' || opt.value === '!=') ? 'block' : 'none';
    });
    if (opSelect.value === '>' || opSelect.value === '<') opSelect.value = '=';
  } else {
    Array.from(opSelect.options).forEach(opt => { opt.style.display = 'block'; });
  }
  
  // Dynamic Input
  if (isSelect) {
    let optionsHtml = targetQ.options.map(o => `<option value="${o.name}">${o.label}</option>`).join('');
    valContainer.innerHTML = `<select class="form-select" id="adv-logic-val" style="width:100%;">${optionsHtml}</select>`;
  } else if (isNumber) {
    valContainer.innerHTML = `<input type="number" class="form-input" id="adv-logic-val" placeholder="Valor numérico" style="width:100%;" />`;
  } else {
    valContainer.innerHTML = `<input type="text" class="form-input" id="adv-logic-val" placeholder="Texto livre" style="width:100%;" />`;
  }
};

window.addAdvLogicCondition = function() {
  const idx = parseInt(document.getElementById('adv-logic-q-idx').value);
  const q = state.activeForm.questions[idx];
  const targetId = document.getElementById('adv-logic-target-q').value;
  const targetQ = state.activeForm.questions.find(que => que.id === targetId);
  const targetText = targetQ ? targetQ.text : targetId;
  const join = document.getElementById('adv-logic-join').value;
  const op = document.getElementById('adv-logic-op').value;
  
  const valElement = document.getElementById('adv-logic-val');
  const val = valElement.value.trim();
  let valLabel = val;
  if (valElement.tagName === 'SELECT') {
    valLabel = valElement.options[valElement.selectedIndex]?.text || val;
  }
  
  if (!targetId || !val) {
    showToast('warning', 'Preencha todos os campos da condição.');
    return;
  }

  let syntax = '';
  if (op === '=') syntax = `\${${targetId}} = '${val}'`;
  else if (op === '!=') syntax = `\${${targetId}} != '${val}'`;
  else syntax = `\${${targetId}} ${op} ${val}`;

  q._logic.push({ targetId, target: targetText, op, val, valLabel, join, raw: syntax });
  
  // Build relevant string
  let relevantStr = '';
  q._logic.forEach((rule, i) => {
    if (i === 0) {
      relevantStr = `(${rule.raw})`;
    } else {
      relevantStr += ` ${rule.join || 'and'} (${rule.raw})`;
    }
  });
  q.relevant = relevantStr;
  
  if (valElement.tagName === 'INPUT') valElement.value = '';
  renderAdvLogicList(idx);
};

window.removeAdvLogicCondition = function(idx, logicIdx) {
  const q = state.activeForm.questions[idx];
  q._logic.splice(logicIdx, 1);
  let relevantStr = '';
  q._logic.forEach((rule, i) => {
    if (i === 0) {
      relevantStr = `(${rule.raw})`;
    } else {
      relevantStr += ` ${rule.join || 'and'} (${rule.raw})`;
    }
  });
  q.relevant = relevantStr;
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
    let joinBadge = i === 0 ? '' : `<span class="badge badge-info" style="margin-right:0.5rem;">${rule.join === 'or' ? 'OU' : 'E'}</span>`;
    let display = rule.target ? `${joinBadge}<span style="font-weight:600;">[${rule.target}]</span> ${rule.op} <span style="font-weight:600; color:var(--primary);">${rule.valLabel || rule.val}</span>` : `${joinBadge}${rule.raw}`;
    
    tbody.innerHTML += `
      <tr>
        <td style="font-size:0.85rem;">${display}</td>
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

// ===================== WEBSOCKETS =====================
let wsClient = null;
window.initWebSocket = function() {
  if (wsClient) return;
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws`;
  
  wsClient = new WebSocket(wsUrl);
  
  wsClient.onmessage = async (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.topic === 'new_submission') {
        const payload = data.payload;
        if (state.activeProjectFormId === payload.form_id) {
          showToast('info', 'Nova coleta recebida! Atualizando painel...');
          
          // Soft reload data
          const [users, forms, interviews] = await Promise.all([
            apiFetch('/api/users'), apiFetch('/api/forms'), apiFetch('/api/interviews')
          ]);
          state.users = users || [];
          state.forms = forms || [];
          state.interviews = interviews || [];
          
          // Re-render project components silently
          if (state.map) renderMapMarkers();
          renderCharts();
          renderReportsTable();
          renderAudioReviewList();
          
          // Refresh dashboard stats if viewing dashboard
          if (document.getElementById('view-dashboard').classList.contains('active')) {
            renderDashboard();
          }
        }
      }
    } catch(err) {
      console.error('WS parse error', err);
    }
  };
  
  wsClient.onclose = () => {
    wsClient = null;
    setTimeout(window.initWebSocket, 5000);
  };
};
