/**
 * Clean up empty/orphaned CSS comments left after stripping shared styles
 */
const fs = require('fs');
const path = require('path');

const PUBLIC = path.join(__dirname, '..', 'public');
const SKIP = new Set(['index.html']);

const files = fs.readdirSync(PUBLIC).filter(f => f.endsWith('.html') && !SKIP.has(f));

// Comments to remove: empty section labels that now have no content after them
const EMPTY_COMMENTS = [
    /\/\*\s*Base\s*\*\/\s*\n?/gi,
    /\/\*\s*Top header\s*\*\/\s*\n?/gi,
    /\/\*\s*─+\s*\n\s*TOP HEADER\s*\n\s*─+\s*\*\/\s*\n?/gi,
    /\/\*\s*──+\s*\n\s*PAGE CONTENT WRAPPER\s*\n\s*──+\s*\*\/\s*\n?/gi,
    /\/\*\s*Loading state\s*\*\/\s*\n?/gi,
    /\/\*\s*Base \*\/\s*\n/g,
    /\/\*\s*Top header \*\/\s*\n/g,
    /\/\*\s*──\s*TOP HEADER\s*──\s*\*\/\s*\n?/gi,
    /\/\*\s*──\s*RESET & BASE\s*──+\s*\*\/\s*\n?/gi,
    /\/\*\s*──\s*Reset & base\s*──+\s*\*\/\s*\n?/gi,
    /\/\*\s*──\s*Design tokens\s*──+\s*\*\/\s*\n?/gi,
    /\/\*\s*──\s*Top header\s*──+\s*\*\/\s*\n?/gi,
    /\/\*\s*═+\s*\n\s*\*\/\s*\n?/g,
];

let count = 0;
for (const file of files) {
    const filePath = path.join(PUBLIC, file);
    let html = fs.readFileSync(filePath, 'utf-8');
    const original = html;

    for (const pattern of EMPTY_COMMENTS) {
        html = html.replace(pattern, '');
    }

    // Clean up multiple consecutive newlines in style blocks
    html = html.replace(/(<style>[\s\S]*?<\/style>)/g, (match) => {
        return match.replace(/\n{3,}/g, '\n\n');
    });

    if (html !== original) {
        fs.writeFileSync(filePath, html);
        count++;
    }
}

console.log(`Cleaned up ${count} files`);
