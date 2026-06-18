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