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

  // 3. Build Binds XML
  let bindsHtml = '';
  questions.forEach(q => {
    let typeAttr = 'string';
    if (q.type === 'number') typeAttr = 'decimal';
    else if (q.type === 'single_choice') typeAttr = 'select1';
    else if (q.type === 'multiple_choice') typeAttr = 'select';
    else if (q.type === 'audio_record') typeAttr = 'binary';

    const relevanceList = relevanceMap[q.id];
    const relevanceAttr = relevanceList && relevanceList.length > 0
      ? ` relevant="${relevanceList.join(' and ')}"`
      : '';

    bindsHtml += `    <bind nodeset="/data/${q.id}" type="${typeAttr}"${relevanceAttr}/>\n`;
  });

  // 4. Build Body elements
  let bodyHtml = '';
  questions.forEach(q => {
    if (q.type === 'text' || q.type === 'number') {
      bodyHtml += `    <input ref="/data/${q.id}">\n      <label>${q.text}</label>\n    </input>\n`;
    } else if (q.type === 'single_choice' || q.type === 'multiple_choice') {
      const tag = q.type === 'single_choice' ? 'select1' : 'select';
      bodyHtml += `    <${tag} ref="/data/${q.id}">\n      <label>${q.text}</label>\n`;
      (q.options || []).forEach(opt => {
        bodyHtml += `      <item>\n        <label>${opt}</label>\n        <value>${opt}</value>\n      </item>\n`;
      });
      bodyHtml += `    </${tag}>\n`;
    } else if (q.type === 'audio_record') {
      bodyHtml += `    <upload ref="/data/${q.id}" mediatype="audio/*">\n      <label>${q.text}</label>\n    </upload>\n`;
    }
  });

  // 5. Glue together the complete OpenRosa/XForms XML template
  return `<?xml version="1.0" encoding="UTF-8"?>
<h:html xmlns="http://www.w3.org/2002/xforms"
        xmlns:h="http://www.w3.org/1999/xhtml"
        xmlns:ev="http://www.w3.org/2001/xml-events"
        xmlns:xsd="http://www.w3.org/2001/XMLSchema"
        xmlns:jr="http://openrosa.org/javarosa">
  <h:head>
    <h:title>${title}</h:title>
    <model>
      <instance>
        <data id="${id}" version="${version}">
${instanceNodesHtml}        </data>
      </instance>
${bindsHtml}    </model>
  </h:head>
  <h:body>
${bodyHtml}  </h:body>
</h:html>`;
}

module.exports = {
  convertToXForm
};
