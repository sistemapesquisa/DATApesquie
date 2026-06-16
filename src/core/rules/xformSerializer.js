/**
 * XForms XML Serializer for ODK Collect Integration.
 * Compiles our visual JSON form definition into standard ODK XForm XML.
 */

/**
 * Converts a form object into standard ODK-compliant XForms XML.
 * @param {Object} form Form database row containing id, title, version, questions.
 * @returns {string} XForm XML string.
 */
function convertToXForm(form) {
  const { id, title, version, questions } = form;

  // 1. Calculate question relevance rules (skip logic compiler)
  const relevanceMap = {};
  questions.forEach(q => { relevanceMap[q.id] = []; });

  questions.forEach((q, idx) => {
    if (q.skipRules && Array.isArray(q.skipRules)) {
      q.skipRules.forEach(rule => {
        const { conditionValue, targetQuestionId } = rule;
        if (!targetQuestionId) return;

        // Find index of target question
        const targetIdx = questions.findIndex(item => item.id === targetQuestionId);
        if (targetIdx === -1 || targetIdx <= idx) return;

        // Any question between current (exclusive) and target (exclusive) is skipped 
        // if the skip condition is met. E.g., relevant only if Q_current != conditionValue.
        for (let i = idx + 1; i < targetIdx; i++) {
          const midQ = questions[i];
          if (conditionValue) {
            // Relevant if preceding answer is NOT equal to conditionValue
            relevanceMap[midQ.id].push(`not(/data/${q.id} = '${conditionValue}')`);
          } else {
            // Unconditional jump: questions in between are never relevant!
            relevanceMap[midQ.id].push(`false()`);
          }
        }
      });
    }
  });

  // 2. Build Instance XML nodes
  let instanceNodesHtml = '';
  let stack = [];
  questions.forEach(q => {
    let indent = '      ' + '  '.repeat(stack.length);
    if (q.type === 'begin_group' || q.type === 'begin_repeat') {
      instanceNodesHtml += `${indent}<${q.id}>\n`;
      stack.push(q.id);
    } else if (q.type === 'end_group' || q.type === 'end_repeat') {
      let popped = stack.pop();
      if (popped) {
        indent = '      ' + '  '.repeat(stack.length);
        instanceNodesHtml += `${indent}</${popped}>\n`;
      }
    } else {
      instanceNodesHtml += `${indent}<${q.id}/>\n`;
    }
  });
  while (stack.length > 0) {
    let popped = stack.pop();
    let indent = '      ' + '  '.repeat(stack.length);
    instanceNodesHtml += `${indent}</${popped}>\n`;
  }
  
  // Inject internal audit nodes
  if (form.settings && form.settings.audit_audio) {
    instanceNodesHtml += `      <audit_audio/>\n`;
  }
  if (form.settings && form.settings.audit_location) {
    instanceNodesHtml += `      <audit_location/>\n`;
  }

  // 3. Build Binds XML
  let bindsHtml = '';
  let bindStack = [];
  questions.forEach(q => {
    let currentPath = '/data' + (bindStack.length > 0 ? '/' + bindStack.join('/') : '') + '/' + q.id;
    
    if (q.type === 'begin_group' || q.type === 'begin_repeat') {
      bindStack.push(q.id);
      // We still output a bind for groups if they have relevance
    } else if (q.type === 'end_group' || q.type === 'end_repeat') {
      bindStack.pop();
      return;
    }

    let typeAttr = 'string';
    if (q.type === 'number' || q.type === 'decimal') typeAttr = 'decimal';
    else if (q.type === 'integer') typeAttr = 'int';
    else if (q.type === 'single_choice' || q.type === 'select_one') typeAttr = 'select1';
    else if (q.type === 'multiple_choice' || q.type === 'select_multiple') typeAttr = 'select';
    else if (q.type === 'audio_record' || q.type === 'audio') typeAttr = 'binary';
    else if (q.type === 'image' || q.type === 'video' || q.type === 'file') typeAttr = 'binary';
    else if (q.type === 'geopoint') typeAttr = 'geopoint';
    else if (q.type === 'geotrace') typeAttr = 'geotrace';
    else if (q.type === 'geoshape') typeAttr = 'geoshape';
    else if (q.type === 'date') typeAttr = 'date';
    else if (q.type === 'time') typeAttr = 'time';
    else if (q.type === 'datetime') typeAttr = 'dateTime';
    else if (q.type === 'barcode') typeAttr = 'barcode';
    else if (q.type === 'range') typeAttr = 'int';

    // Backwards compat with skipRules
    const relevanceList = relevanceMap[q.id] || [];
    if (q.relevant) relevanceList.push(q.relevant);
    
    const relevanceAttr = relevanceList.length > 0
      ? ` relevant="${relevanceList.join(' and ')}"`
      : '';
      
    const requiredAttr = q.required ? ` required="true()"` : '';
    const constraintAttr = q.constraint ? ` constraint="${q.constraint.replace(/"/g, '&quot;')}"` : '';
    const constraintMsgAttr = q.constraint_message ? ` jr:constraintMsg="${q.constraint_message.replace(/"/g, '&quot;')}"` : '';
    const readonlyAttr = (q.type === 'note' || q.type === 'hidden') ? ` readonly="true()"` : '';
    const calcAttr = (q.type === 'calculate' && q.parameters && q.parameters.calculation) ? ` calculate="${q.parameters.calculation.replace(/"/g, '&quot;')}"` : '';

    if (q.type === 'begin_group' || q.type === 'begin_repeat') {
      if (relevanceAttr) bindsHtml += `    <bind nodeset="${currentPath}"${relevanceAttr}/>\n`;
    } else {
      bindsHtml += `    <bind nodeset="${currentPath}" type="${typeAttr}"${requiredAttr}${relevanceAttr}${constraintAttr}${constraintMsgAttr}${readonlyAttr}${calcAttr}/>\n`;
    }
  });
  
  // Bind for internal audit and mandatory geolocation
  if (form.settings && form.settings.audit_audio) {
    bindsHtml += `    <bind nodeset="/data/audit_audio" type="binary" />\n`;
  }
  if (form.settings && form.settings.audit_location) {
    bindsHtml += `    <bind nodeset="/data/audit_location" type="geopoint" />\n`;
  }

  // 4. Build Body elements
  let bodyHtml = '';
  let bodyStack = [];
  questions.forEach(q => {
    let currentPath = '/data' + (bodyStack.length > 0 ? '/' + bodyStack.join('/') : '') + '/' + q.id;
    let indent = '    ' + '  '.repeat(bodyStack.length);

    if (q.type === 'begin_group') {
      bodyHtml += `${indent}<group ref="${currentPath}">\n${indent}  <label>${q.text || 'Grupo'}</label>\n`;
      bodyStack.push(q.id);
    } else if (q.type === 'begin_repeat') {
      bodyHtml += `${indent}<group ref="${currentPath}">\n${indent}  <label>${q.text || 'Repetição'}</label>\n${indent}  <repeat nodeset="${currentPath}">\n`;
      bodyStack.push(q.id);
    } else if (q.type === 'end_group') {
      let popped = bodyStack.pop();
      indent = '    ' + '  '.repeat(bodyStack.length);
      bodyHtml += `${indent}</group>\n`;
    } else if (q.type === 'end_repeat') {
      let popped = bodyStack.pop();
      indent = '    ' + '  '.repeat(bodyStack.length);
      bodyHtml += `${indent}  </repeat>\n${indent}</group>\n`;
    } else if (q.type === 'text' || q.type === 'number' || q.type === 'decimal' || q.type === 'integer' || q.type === 'geopoint' || q.type === 'date' || q.type === 'time' || q.type === 'note') {
      bodyHtml += `${indent}<input ref="${currentPath}">\n${indent}  <label>${q.text}</label>\n${indent}</input>\n`;
    } else if (q.type === 'single_choice' || q.type === 'select_one' || q.type === 'multiple_choice' || q.type === 'select_multiple') {
      const tag = (q.type === 'single_choice' || q.type === 'select_one') ? 'select1' : 'select';
      bodyHtml += `${indent}<${tag} ref="${currentPath}">\n${indent}  <label>${q.text}</label>\n`;
      (q.options || []).forEach(opt => {
        const val = typeof opt === 'object' ? opt.name : opt;
        const lbl = typeof opt === 'object' ? opt.label : opt;
        bodyHtml += `${indent}  <item>\n${indent}    <label>${lbl}</label>\n${indent}    <value>${val}</value>\n${indent}  </item>\n`;
      });
      bodyHtml += `${indent}</${tag}>\n`;
    } else if (q.type === 'audio_record' || q.type === 'audio') {
      bodyHtml += `${indent}<upload ref="${currentPath}" mediatype="audio/*">\n${indent}  <label>${q.text}</label>\n${indent}</upload>\n`;
    } else if (q.type === 'image') {
      bodyHtml += `${indent}<upload ref="${currentPath}" mediatype="image/*">\n${indent}  <label>${q.text}</label>\n${indent}</upload>\n`;
    } else if (q.type === 'video') {
      bodyHtml += `${indent}<upload ref="${currentPath}" mediatype="video/*">\n${indent}  <label>${q.text}</label>\n${indent}</upload>\n`;
    } else if (q.type === 'file') {
      bodyHtml += `${indent}<upload ref="${currentPath}" mediatype="application/*">\n${indent}  <label>${q.text}</label>\n${indent}</upload>\n`;
    } else if (q.type === 'datetime' || q.type === 'barcode') {
      bodyHtml += `${indent}<input ref="${currentPath}">\n${indent}  <label>${q.text}</label>\n${indent}</input>\n`;
    } else if (q.type === 'geotrace' || q.type === 'geoshape') {
      bodyHtml += `${indent}<input ref="${currentPath}" appearance="maps">\n${indent}  <label>${q.text}</label>\n${indent}</input>\n`;
    } else if (q.type === 'acknowledge') {
      bodyHtml += `${indent}<trigger ref="${currentPath}">\n${indent}  <label>${q.text}</label>\n${indent}</trigger>\n`;
    } else if (q.type === 'range') {
      const start = (q.parameters && q.parameters.start) ? q.parameters.start : 1;
      const end = (q.parameters && q.parameters.end) ? q.parameters.end : 10;
      const step = (q.parameters && q.parameters.step) ? q.parameters.step : 1;
      bodyHtml += `${indent}<range ref="${currentPath}" start="${start}" end="${end}" step="${step}">\n${indent}  <label>${q.text}</label>\n${indent}</range>\n`;
    } else if (q.type === 'rank') {
      bodyHtml += `${indent}<odk:rank ref="${currentPath}">\n${indent}  <label>${q.text}</label>\n`;
      (q.options || []).forEach(opt => {
        const val = typeof opt === 'object' ? opt.name : opt;
        const lbl = typeof opt === 'object' ? opt.label : opt;
        bodyHtml += `${indent}  <item>\n${indent}    <label>${lbl}</label>\n${indent}    <value>${val}</value>\n${indent}  </item>\n`;
      });
      bodyHtml += `${indent}</odk:rank>\n`;
    }
  });

  while (bodyStack.length > 0) {
    let popped = bodyStack.pop();
    let indent = '    ' + '  '.repeat(bodyStack.length);
    // Best effort closing if unbalanced
    bodyHtml += `${indent}</group>\n`;
  }

  // Add the geopoint question at the very end of the form
  bodyHtml += `    <input ref="/data/audit_location">\n      <label>Obter localização atual (opcional)</label>\n      <hint>Localização via GPS para encerramento da pesquisa (se não pegar sinal, pode avançar)</hint>\n    </input>\n`;

  // 5. Glue together the complete OpenRosa/XForms XML template
  return `<?xml version="1.0" encoding="UTF-8"?>
<h:html xmlns="http://www.w3.org/2002/xforms"
        xmlns:h="http://www.w3.org/1999/xhtml"
        xmlns:ev="http://www.w3.org/2001/xml-events"
        xmlns:xsd="http://www.w3.org/2001/XMLSchema"
        xmlns:jr="http://openrosa.org/javarosa"
        xmlns:odk="http://www.opendatakit.org/xforms">
  <h:head>
    <h:title>${title}</h:title>
    <model>
      <instance>
        <data id="${id}" version="${version}">
${instanceNodesHtml}        </data>
      </instance>
${bindsHtml}${form.settings && form.settings.audit_audio ? '      <odk:recordaudio event="odk-instance-load" ref="/data/audit_audio" />\n' : ''}    </model>
  </h:head>
  <h:body>
${bodyHtml}  </h:body>
</h:html>`;
}

module.exports = {
  convertToXForm
};
