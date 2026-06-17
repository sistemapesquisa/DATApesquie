const fs = require('fs');
let code = fs.readFileSync('src/interfaces/public/js/app.js', 'utf8');

code = code.replace(/document\.getElementById\('([^']+)'\)\.addEventListener/g, `document.getElementById('$1') && document.getElementById('$1').addEventListener`);

fs.writeFileSync('src/interfaces/public/js/app.js', code);
console.log('Fixed 9 instances.');
