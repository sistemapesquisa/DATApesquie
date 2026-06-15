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
  questions.forEach(q => {
    instanceNodesHtml += `      <${q.id}/>\n`;
  });
  
  // Inject internal audit nodes
  instanceNodesHtml += `      <audit_audio/>\n`;
  instanceNodesHtml += `      <audit_location/>\n`;

  // 3. Build Binds XML
  let bindsHtml = '';
  questions.forEach(q => {
    let typeAttr = 'string';
    if (q.type === 'number' || q.type === 'decimal') typeAttr = 'decimal';
    else if (q.type === 'integer') typeAttr = 'int';
    else if (q.type === 'single_choice' || q.type === 'select_one') typeAttr = 'select1';
    else if (q.type === 'multiple_choice' || q.type === 'select_multiple') typeAttr = 'select';
    else if (q.type === 'audio_record' || q.type === 'audio') typeAttr = 'binary';
    else if (q.type === 'image' || q.type === 'video') typeAttr = 'binary';
    else if (q.type === 'geopoint') typeAttr = 'geopoint';

    // Backwards compat with skipRules
    const relevanceList = relevanceMap[q.id] || [];
    if (q.relevant) relevanceList.push(q.relevant);
    
    const relevanceAttr = relevanceList.length > 0
      ? ` relevant="${relevanceList.join(' and ')}"`
      : '';
      
    const requiredAttr = q.required ? ` required="true()"` : '';
    const constraintAttr = q.constraint ? ` constraint="${q.constraint.replace(/"/g, '&quot;')}"` : '';
    const constraintMsgAttr = q.constraint_message ? ` jr:constraintMsg="${q.constraint_message.replace(/"/g, '&quot;')}"` : '';

    bindsHtml += `    <bind nodeset="/data/${q.id}" type="${typeAttr}"${requiredAttr}${relevanceAttr}${constraintAttr}${constraintMsgAttr}/>\n`;
  });
  
  // Bind for internal audit and mandatory geolocation
  bindsHtml += `    <bind nodeset="/data/audit_audio" type="binary" />\n`;
  bindsHtml += `    <bind nodeset="/data/audit_location" type="geopoint" required="true()" />\n`;

  // 4. Build Body elements
  let bodyHtml = '';
  questions.forEach(q => {
    if (q.type === 'text' || q.type === 'number' || q.type === 'decimal' || q.type === 'integer' || q.type === 'geopoint') {
      bodyHtml += `    <input ref="/data/${q.id}">\n      <label>${q.text}</label>\n    </input>\n`;
    } else if (q.type === 'single_choice' || q.type === 'select_one' || q.type === 'multiple_choice' || q.type === 'select_multiple') {
      const tag = (q.type === 'single_choice' || q.type === 'select_one') ? 'select1' : 'select';
      bodyHtml += `    <${tag} ref="/data/${q.id}">\n      <label>${q.text}</label>\n`;
      (q.options || []).forEach(opt => {
        const val = typeof opt === 'object' ? opt.name : opt;
        const lbl = typeof opt === 'object' ? opt.label : opt;
        bodyHtml += `      <item>\n        <label>${lbl}</label>\n        <value>${val}</value>\n      </item>\n`;
      });
      bodyHtml += `    </${tag}>\n`;
    } else if (q.type === 'audio_record' || q.type === 'audio') {
      bodyHtml += `    <upload ref="/data/${q.id}" mediatype="audio/*">\n      <label>${q.text}</label>\n    </upload>\n`;
    } else if (q.type === 'image') {
      bodyHtml += `    <upload ref="/data/${q.id}" mediatype="image/*">\n      <label>${q.text}</label>\n    </upload>\n`;
    } else if (q.type === 'video') {
      bodyHtml += `    <upload ref="/data/${q.id}" mediatype="video/*">\n      <label>${q.text}</label>\n    </upload>\n`;
    }
  });

  // Add the geopoint question at the very end of the form
  bodyHtml += `    <input ref="/data/audit_location">\n      <label>Obter localização atual (obrigatório)</label>\n      <hint>Localização via GPS para encerramento da pesquisa</hint>\n    </input>\n`;

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
${bindsHtml}      <odk:recordaudio event="odk-instance-load" ref="/data/audit_audio" />
    </model>
  </h:head>
  <h:body>
${bodyHtml}  </h:body>
</h:html>`;
}

module.exports = {
  convertToXForm
};
