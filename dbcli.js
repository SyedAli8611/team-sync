const Database = require('better-sqlite3');
const readline = require('readline');

const db = new Database('./teamsync.db');
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

console.log('\n🗄️  TeamSync DB Console');
console.log('   Type any SQL command and press Enter');
console.log('   Type .tables to see all tables');
console.log('   Type .exit to quit\n');

function prompt() {
  rl.question('sql> ', (input) => {
    const cmd = input.trim();
    if (!cmd) return prompt();

    if (cmd === '.exit' || cmd === '.quit') {
      console.log('Bye!');
      process.exit(0);
    }

    if (cmd === '.tables') {
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
      tables.forEach(t => console.log(' •', t.name));
      return prompt();
    }

    try {
      if (cmd.toLowerCase().startsWith('select')) {
        const rows = db.prepare(cmd).all();
        if (rows.length === 0) return console.log('  (no rows)\n'), prompt();
        console.table(rows);
      } else {
        const info = db.prepare(cmd).run();
        console.log(`  ✅ Done — ${info.changes} row(s) affected\n`);
      }
    } catch (e) {
      console.log('  ❌ Error:', e.message, '\n');
    }

    prompt();
  });
}

prompt();
