const fs = require('fs');

const files = [
  'src/interfaces/public/index.html',
  'src/interfaces/public/js/app.js',
  'src/interfaces/public/css/styles.css'
];

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  
  // Replace standard prefix and function names
  content = content.replace(/kobo-/gi, 'sys-');
  content = content.replace(/koboSwitchTab/gi, 'sysSwitchTab');
  content = content.replace(/koboEditForm/gi, 'sysEditForm');
  content = content.replace(/koboPreviewForm/gi, 'sysPreviewForm');
  
  // Replace the exact word "Kobo"
  content = content.replace(/\bKobo\b/g, 'Sistema');
  
  // Replace any leftover "kobo"
  content = content.replace(/kobo/gi, 'sys');
  
  fs.writeFileSync(file, content, 'utf8');
  console.log(`Replaced kobo in ${file}`);
});
