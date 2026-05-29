#!/usr/bin/env node
// One-off script: remove Reddit social links from all HTML pages
const fs = require('fs');
const path = require('path');

const htmlDir = path.join(__dirname, '..', 'public');
const files = fs.readdirSync(htmlDir).filter(f => f.endsWith('.html')).sort();

// Matches Reddit mini-footer link block (including leading whitespace)
const redditFooterPattern = /[ \t]*<a href="https:\/\/www\.reddit\.com\/r\/discgolfgo"[^>]*>[\s\S]*?<\/a>/g;

// Matches Reddit contact-row block in contact.html
const redditContactRowPattern = /[ \t]*<a href="https:\/\/www\.reddit\.com\/user\/discgolfgo"[^>]*class="contact-row"[\s\S]*?<\/a>/g;
const redditContactRowAlt = /[ \t]*<a href="https:\/\/www\.reddit\.com\/user\/discgolfgo"[^>]*>[\s\S]*?<\/a>/g;

// Matches Reddit CSS class in contact.html
const redditCssPattern = /[ \t]*\.contact-icon\.reddit-icon[^}]*\}[ \t]*\n/g;

let changed = 0;
for (const fname of files) {
  const filePath = path.join(htmlDir, fname);
  let content = fs.readFileSync(filePath, 'utf8');
  let original = content;

  // Remove mini-footer Reddit link
  content = content.replace(redditFooterPattern, '');

  // For contact.html specifically: remove contact-row Reddit block
  if (fname === 'contact.html') {
    content = content.replace(redditContactRowPattern, '');
    content = content.replace(redditContactRowAlt, '');
    content = content.replace(redditCssPattern, '');
  }

  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('  OK ' + fname);
    changed++;
  } else {
    console.log('  -- ' + fname + ' (no change)');
  }
}
console.log('\nFiles changed: ' + changed);
