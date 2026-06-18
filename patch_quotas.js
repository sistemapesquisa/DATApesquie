const fs = require('fs');
let c = fs.readFileSync('src/interfaces/public/index.html', 'utf8');

const target = '<div style="display:flex;justify-content:flex-end;gap:1rem;">';
const replaceStr = `
            <div class="form-group">
              <label class="form-label">Controle de Cotas (JSON Array)</label>
              <textarea id="form-settings-quotas" class="form-input" rows="3" placeholder='[{"question_id":"Q1","target_value":"Masculino","limit":50}]' style="font-family:monospace;font-size:12px;"></textarea>
              <div class="form-hint">Defina metas por resposta. O servidor calculará o progresso em tempo real.</div>
            </div>
            
            <div style="display:flex;justify-content:flex-end;gap:1rem;">
`;

c = c.replace(target, replaceStr);
fs.writeFileSync('src/interfaces/public/index.html', c);
