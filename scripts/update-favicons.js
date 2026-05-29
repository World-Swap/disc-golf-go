// One-shot script: updates favicon link tags across all HTML pages
// Adds favicon.ico, favicon-192x192, and apple-touch-icon.png references everywhere
const fs = require('fs');
const path = require('path');

const faviconBlock = `    <link rel="icon" type="image/x-icon" href="/favicon.ico">
    <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
    <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
    <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
    <link rel="icon" type="image/png" sizes="192x192" href="/favicon-192x192.png">`;

const htmlFiles = fs.readdirSync('public').filter(f => f.endsWith('.html'));
let updated = 0;

for (const file of htmlFiles) {
  const filePath = path.join('public', file);
  let content = fs.readFileSync(filePath, 'utf8');

  const hasIco = content.includes('favicon.ico');
  const has192 = content.includes('favicon-192x192.png');
  const hasAppleTouchIcon = content.includes('apple-touch-icon.png');

  if (hasIco && has192 && hasAppleTouchIcon) {
    console.log('SKIP (already complete):', file);
    continue;
  }

  const hasOld3Block = content.includes('<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">');

  if (hasOld3Block) {
    const oldBlock = `    <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
    <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
    <link rel="apple-touch-icon" sizes="180x180" href="/favicon-180x180.png">`;

    if (content.includes(oldBlock)) {
      content = content.replace(oldBlock, faviconBlock);
      fs.writeFileSync(filePath, content);
      console.log('UPDATED (replaced 3-block):', file);
      updated++;
      continue;
    }

    // Try without the manifest line variant
    const oldBlock2 = `    <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
    <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
    <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">`;

    if (content.includes(oldBlock2)) {
      // Just missing ico and 192
      content = content.replace(oldBlock2, faviconBlock);
      fs.writeFileSync(filePath, content);
      console.log('UPDATED (replaced 3-block v2):', file);
      updated++;
      continue;
    }

    console.log('WARN: has icon tags but pattern not matched for', file);
    continue;
  }

  // No favicon tags at all - insert after viewport meta or charset meta
  const viewportMatch = content.match(/(<meta name="viewport"[^>]+>)/);
  const charsetMatch = content.match(/(<meta charset[^>]+>)/);
  const insertTarget = viewportMatch ? viewportMatch[0] : (charsetMatch ? charsetMatch[0] : null);

  if (insertTarget) {
    const insertPoint = content.indexOf(insertTarget) + insertTarget.length;
    content = content.slice(0, insertPoint) + '\n' + faviconBlock + content.slice(insertPoint);
    fs.writeFileSync(filePath, content);
    console.log('UPDATED (inserted new):', file);
    updated++;
  } else {
    console.log('WARN: could not find insertion point in', file);
  }
}

console.log('\nDone. Files updated:', updated, 'of', htmlFiles.length);
