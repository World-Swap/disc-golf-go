const fs = require('fs');
const files = ['battles.html','challenges.html','checkin.html','course.html','crew-create.html','crew-join.html','crew-me.html','crews.html','home.html','leaderboard.html','map.html','missions.html','profile.html','progress.html','rounds.html','scorecard.html','story.html','training.html','vault.html'];
let ok = 0;
files.forEach(f => {
  const c = fs.readFileSync('public/'+f,'utf8');
  const navIdx = c.indexOf('<nav class="bottom-tab-bar">') > -1 ? c.indexOf('<nav class="bottom-tab-bar">') : c.indexOf('<nav class="tab-bar">');
  const endIdx = c.indexOf('</nav>', navIdx);
  const block = c.slice(navIdx, endIdx+6);
  const tabCount = (block.match(/tab-item/g) || []).length;
  const hasPlayEmoji = block.includes('🥏');
  const hasWrongEmoji = block.includes('🧯');
  if (tabCount === 3 && hasPlayEmoji && (hasWrongEmoji === false)) { ok++; }
  else { console.log('ISSUE: '+f+' — tabs:'+tabCount+', playEmoji:'+hasPlayEmoji+', wrongEmoji:'+hasWrongEmoji); }
});
console.log('Static files OK: '+ok+'/'+files.length);
const cw = fs.readFileSync('public/crew-wars.html','utf8');
const cwTabs = cw.match(/label: '(Training|Play|Profile)'/g);
console.log('crew-wars.html: '+(cwTabs ? cwTabs.join(', ') : 'none') + ' — ' + (cwTabs && cwTabs.length === 3 ? 'PASS' : 'FAIL'));