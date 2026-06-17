const { convertToXForm } = require('./src/core/rules/xformSerializer');

const testForms = [
  {
    name: 'Test 1: Normal Skip Logic',
    form: {
      id: 'f1', title: 'T1', version: 1,
      questions: [
        { id: 'q1', type: 'single_choice', options: ['A','B'], skipRules: [{ conditionValue: 'B', targetQuestionId: 'q3' }] },
        { id: 'q2', type: 'text' },
        { id: 'q3', type: 'text' }
      ]
    }
  },
  {
    name: 'Test 2: Infinite Loop Check (Self-targeting)',
    form: {
      id: 'f2', title: 'T2', version: 1,
      questions: [
        { id: 'q1', type: 'text', skipRules: [{ conditionValue: 'A', targetQuestionId: 'q1' }] }
      ]
    }
  },
  {
    name: 'Test 3: Unconditional Jump',
    form: {
      id: 'f3', title: 'T3', version: 1,
      questions: [
        { id: 'q1', type: 'text', skipRules: [{ conditionValue: '', targetQuestionId: 'q3' }] },
        { id: 'q2', type: 'text' },
        { id: 'q3', type: 'text' }
      ]
    }
  },
  {
    name: 'Test 4: Media Uploads',
    form: {
      id: 'f4', title: 'T4', version: 1,
      questions: [
        { id: 'q1', type: 'audio' },
        { id: 'q2', type: 'video' },
        { id: 'q3', type: 'image' },
        { id: 'q4', type: 'geopoint' },
        { id: 'q5', type: 'note' }
      ]
    }
  }
];

testForms.forEach(test => {
  console.log(`\n=== ${test.name} ===`);
  try {
    const xml = convertToXForm(test.form);
    console.log('SUCCESS. Output length:', xml.length);
    // Print the binds to verify relevance
    const binds = xml.match(/<bind[^>]+>/g);
    if (binds) console.log(binds.slice(0, 5).join('\n'));
    
    // Print bodies for media
    const bodies = xml.match(/<(upload|input|select)[^>]*>/g);
    if (bodies) console.log('Tags:', Array.from(new Set(bodies)).join(' '));
  } catch(e) {
    console.error('FAILED:', e.message);
  }
});
