const fs = require('fs');
const path = require('path');
const dir = 'public';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.html') && f !== 'index.html');
const issues = [];
for (const f of files) {
    const h = fs.readFileSync(path.join(dir, f), 'utf-8');
    if (!h.includes('app.css')) issues.push(f + ': missing app.css');
    if (/:root\s*\{/.test(h)) issues.push(f + ': still has :root block');
}
if (issues.length === 0) {
    console.log('All ' + files.length + ' pages pass checks');
} else {
    issues.forEach(i => console.log('ISSUE: ' + i));
}
