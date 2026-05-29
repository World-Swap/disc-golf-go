#!/usr/bin/env node
/**
 * unify-styles.js — Strips duplicated design tokens and shared component
 * styles from each app page's inline <style>, adding a <link> to /app.css.
 * Skips index.html (landing page — standalone dark-only design).
 */
const fs = require('fs');
const path = require('path');

const PUBLIC = path.join(__dirname, '..', 'public');
const SKIP = new Set(['index.html']); // landing page has its own design

// Files to process
const htmlFiles = fs.readdirSync(PUBLIC)
    .filter(f => f.endsWith('.html') && !SKIP.has(f));

const APP_CSS_LINK = '<link rel="stylesheet" href="/app.css">';

// Patterns to remove from inline <style> blocks.
// These are the common blocks that are now in app.css.
// Each pattern removes a specific CSS rule block.
const REMOVE_PATTERNS = [
    // :root token block (various formats)
    /\/\*[^*]*?DESIGN TOKENS[^*]*?\*\/\s*/gi,
    /\/\*[^*]*?Design tokens[^*]*?\*\/\s*/gi,
    /\/\*[^*]*?COLOR PALETTE[^*]*?\*\/\s*/gi,
    // :root { ... } block
    /:root\s*\{[^}]*\}\s*/g,
    // [data-theme="dark"] { ... } block
    /\[data-theme="dark"\]\s*\{[^}]*\}\s*/g,
    // CSS reset
    /\/\*[^*]*?Reset[^*]*?\*\/\s*/gi,
    /\/\*[^*]*?reset & base[^*]*?\*\/\s*/gi,
    /\*,\s*\*::before,\s*\*::after\s*\{[^}]*\}\s*/g,
    /html\s*\{[^}]*-webkit-text-size-adjust[^}]*\}\s*/g,
    // Body base (be careful — some pages add extra body props)
    // We'll handle body specially below
    // Top header comment
    /\/\*\s*─+\s*TOP HEADER\s*─*\s*\*\/\s*/gi,
    /\/\*\s*─+\n\s+TOP HEADER\n\s*─+\s*\*\/\s*/gi,
    /\/\*\s*──\s*TOP HEADER\s*──\s*\*\/\s*/gi,
    // Common top-header styles
    /\.top-header\s*\{[^}]*\}\s*/g,
    // header-logo styles
    /\.header-logo\s*\{[^}]*\}\s*/g,
    /\.header-logo\s+img\s*\{[^}]*\}\s*/g,
    /\.header-logo\s+\.go\s*\{[^}]*\}\s*/g,
    // header-actions
    /\.header-actions\s*\{[^}]*\}\s*/g,
    // Theme button
    /\/\*\s*Theme toggle\s*\*\/\s*/gi,
    /\.theme-btn\s*\{[^}]*\}\s*/g,
    /\.theme-btn:hover,\s*\.theme-btn:active\s*\{[^}]*\}\s*/g,
    /\.theme-btn:hover,\n\s*\.theme-btn:active\s*\{[^}]*\}\s*/g,
    // Bottom tab bar
    /\/\*\s*Bottom tab bar\s*\*\/\s*/gi,
    /\.bottom-tab-bar\s*\{[^}]*\}\s*/g,
    /\.tab-item\s*\{[^}]*\}\s*/g,
    /\.tab-item:focus,[\s\S]*?color:\s*var\(--text3\);\s*\}\s*/g,
    /\.tab-item\.active,[\s\S]*?color:\s*var\(--green\);\s*\}\s*/g,
    /\.tab-icon\s*\{[^}]*\}\s*/g,
    /\.tab-badge\s*\{[^}]*\}\s*/g,
    /\.tab-badge\.show\s*\{[^}]*\}\s*/g,
    /\.tab-label\s*\{[^}]*\}\s*/g,
    // Footer
    /\/\*\s*Footer\s*\*\/\s*/gi,
    /\.page-footer\s*\{[^}]*\}\s*/g,
    /\.page-footer\s+p\s*\{[^}]*\}\s*/g,
    /\.page-footer\s+a\s*\{[^}]*\}\s*/g,
    // Loading / spinner
    /\.loading\s*\{[^}]*\}\s*/g,
    /\.spinner\s*\{[^}]*\}\s*/g,
    /@keyframes\s+spin\s*\{[^}]*\{[^}]*\}\s*\}\s*/g,
    // btn-icon
    /\.btn-icon\s*\{[^}]*\}\s*/g,
    /\.btn-icon:hover\s*\{[^}]*\}\s*/g,
    // Section comments that are now irrelevant
    /\/\*\s*═+\s*\n\s*DESIGN TOKENS[^*]*?\*\/\s*/gi,
    /\/\*\s*═+\s*\n\s*design tokens[^*]*?\*\/\s*/gi,
];

// Additional body-only cleanup: remove the base body rule IF it only contains
// standard properties (font-family, background, color, min-height, overflow-x, transition, padding-bottom)
function cleanBodyRule(css) {
    // Match body { ... } blocks
    return css.replace(/body\s*\{([^}]*)\}/g, (match, inner) => {
        const props = inner.split(';').map(s => s.trim()).filter(Boolean);
        const standardProps = [
            'font-family', 'background', 'color', 'min-height', 'overflow-x',
            'transition', 'padding-bottom'
        ];
        const remaining = props.filter(prop => {
            const propName = prop.split(':')[0].trim();
            return !standardProps.some(sp => propName === sp || propName.startsWith(sp));
        });
        if (remaining.length === 0) {
            // All props are standard — remove the whole block
            return '';
        }
        // Keep only the non-standard props, re-add standard ones app.css doesn't cover
        // Actually, we need to keep padding-bottom since it varies per page
        const keepProps = props.filter(prop => {
            const propName = prop.split(':')[0].trim();
            // Keep padding-bottom (varies), display/flex-direction (login page)
            return ['padding-bottom', 'display', 'flex-direction', 'padding-top'].some(
                sp => propName === sp || propName.startsWith(sp)
            );
        });
        if (keepProps.length === 0) return '';
        return `body { ${keepProps.join('; ')}; }`;
    });
}

let processed = 0;
let errors = [];

for (const file of htmlFiles) {
    const filePath = path.join(PUBLIC, file);
    let html = fs.readFileSync(filePath, 'utf-8');

    // 1. Add <link rel="stylesheet" href="/app.css"> if not already present
    if (!html.includes('app.css')) {
        // Insert after the Google Fonts <link> or after the last <link> in <head>
        const fontLinkMatch = html.match(/<link\s+href="https:\/\/fonts\.googleapis\.com[^>]*>/);
        if (fontLinkMatch) {
            html = html.replace(
                fontLinkMatch[0],
                fontLinkMatch[0] + '\n    ' + APP_CSS_LINK
            );
        } else {
            // Fallback: insert before <style>
            html = html.replace('<style>', APP_CSS_LINK + '\n    <style>');
        }
    }

    // 2. Find the <style> block and clean it
    const styleMatch = html.match(/<style>([\s\S]*?)<\/style>/);
    if (styleMatch) {
        let css = styleMatch[1];

        // Apply removal patterns
        for (const pattern of REMOVE_PATTERNS) {
            css = css.replace(pattern, '');
        }

        // Clean body rule
        css = cleanBodyRule(css);

        // Clean up excessive whitespace (collapse 3+ newlines to 2)
        css = css.replace(/\n{3,}/g, '\n\n');

        // Remove leading whitespace-only lines
        css = css.replace(/^\s*\n/, '');

        html = html.replace(styleMatch[0], '<style>' + css + '</style>');
    }

    fs.writeFileSync(filePath, html);
    processed++;
    console.log(`  [OK] ${file}`);
}

console.log(`\nProcessed ${processed} files.`);
if (errors.length) {
    console.log('Errors:', errors);
}
