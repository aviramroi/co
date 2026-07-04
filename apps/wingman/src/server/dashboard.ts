// Self-contained dashboard page (no external assets — CSP/offline friendly).
export const DASHBOARD_HTML = /* html */ `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Wingman</title>
<style>
  :root { color-scheme: light dark; --bg:#0f1115; --card:#171a21; --line:#262b36; --fg:#e7e9ee; --mut:#9aa3b2; --accent:#7c5cff; --ok:#2ecc71; --warn:#f1c40f; --bad:#e74c3c; }
  @media (prefers-color-scheme: light){ :root{ --bg:#f6f7f9; --card:#fff; --line:#e6e8ec; --fg:#1a1d24; --mut:#5b6472; } }
  *{box-sizing:border-box} body{margin:0;font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:var(--bg);color:var(--fg)}
  header{padding:16px 22px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:14px;position:sticky;top:0;background:var(--bg);z-index:2}
  header h1{font-size:16px;margin:0;letter-spacing:.3px}
  .pill{font-size:11px;padding:2px 8px;border-radius:999px;background:var(--card);border:1px solid var(--line);color:var(--mut)}
  main{max-width:1100px;margin:0 auto;padding:22px;display:grid;grid-template-columns:1fr;gap:22px}
  h2{font-size:13px;text-transform:uppercase;letter-spacing:.6px;color:var(--mut);margin:0 0 10px}
  .cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px}
  .stat{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px}
  .stat .n{font-size:22px;font-weight:600} .stat .l{font-size:11px;color:var(--mut)}
  .card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px;margin-bottom:10px}
  .row{display:flex;justify-content:space-between;gap:10px;align-items:baseline}
  .meta{font-size:12px;color:var(--mut)}
  .tag{font-size:10px;padding:1px 7px;border-radius:999px;border:1px solid var(--line);color:var(--mut)}
  .tag.tinder{color:#ff6b6b} .tag.marketplace{color:#4dabf7} .tag.groups{color:#69db7c}
  .draft{margin-top:8px;padding:10px;border-radius:10px;background:rgba(124,92,255,.08);border:1px solid var(--line)}
  textarea{width:100%;background:var(--bg);color:var(--fg);border:1px solid var(--line);border-radius:8px;padding:8px;font:inherit;min-height:56px}
  button{font:inherit;border:1px solid var(--line);background:var(--card);color:var(--fg);padding:6px 12px;border-radius:8px;cursor:pointer}
  button.ok{background:var(--accent);border-color:var(--accent);color:#fff} button.bad{color:var(--bad)}
  .msgs{margin-top:8px;display:flex;flex-direction:column;gap:4px}
  .msg{font-size:13px;padding:5px 9px;border-radius:9px;max-width:80%}
  .msg.inbound{align-self:flex-start;background:var(--bg);border:1px solid var(--line)}
  .msg.outbound{align-self:flex-end;background:rgba(124,92,255,.14)}
  .empty{color:var(--mut);font-size:13px;padding:8px 0}
  .actions{display:flex;gap:8px;margin-top:8px}
</style>
</head>
<body>
<header>
  <h1>🪽 Wingman</h1>
  <span class="pill" id="brain">brain: …</span>
  <span class="pill" id="clock"></span>
  <span class="pill" id="autos"></span>
</header>
<main>
  <section>
    <div class="cards" id="stats"></div>
  </section>
  <section>
    <h2>Pending approvals</h2>
    <div id="approvals"><div class="empty">Nothing awaiting approval.</div></div>
  </section>
  <section>
    <h2>Conversations</h2>
    <div id="threads"></div>
  </section>
</main>
<script>
const esc = (s)=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
async function refresh(){
  const r = await fetch('/api/state'); const s = await r.json();
  document.getElementById('brain').textContent = 'brain: '+s.brain;
  document.getElementById('clock').textContent = new Date().toLocaleTimeString();
  document.getElementById('autos').textContent = s.pending.length+' queued to send';
  const st = s.stats;
  document.getElementById('stats').innerHTML = Object.entries(st).map(([k,v])=>
    '<div class="stat"><div class="n">'+v+'</div><div class="l">'+k+'</div></div>').join('');
  document.getElementById('approvals').innerHTML = s.approvals.length ? s.approvals.map(a=>
    '<div class="card"><div class="row"><b>'+esc(a.counterpart)+'</b>'+
    '<span class="tag '+a.platform+'">'+a.platform+'</span></div>'+
    '<div class="meta">'+esc(a.reason)+'</div>'+
    '<div class="draft"><textarea id="t_'+a.id+'">'+esc(a.proposedText)+'</textarea>'+
    '<div class="actions"><button class="ok" onclick="decide(\\''+a.id+'\\',\\'approve\\')">Approve &amp; send</button>'+
    '<button class="bad" onclick="decide(\\''+a.id+'\\',\\'reject\\')">Reject</button></div></div></div>'
  ).join('') : '<div class="empty">Nothing awaiting approval.</div>';
  document.getElementById('threads').innerHTML = s.conversations.map(c=>
    '<div class="card"><div class="row"><b>'+esc(c.counterpart)+' · '+esc(c.title)+'</b>'+
    '<span class="tag '+c.platform+'">'+c.platform+'</span></div>'+
    '<div class="meta">'+esc(c.status)+' · '+new Date(c.updatedAt).toLocaleString()+'</div>'+
    '<div class="msgs">'+c.messages.slice(-6).map(m=>
      '<div class="msg '+m.direction+'">'+esc(m.text)+'</div>').join('')+'</div></div>'
  ).join('') || '<div class="empty">No conversations yet.</div>';
}
async function decide(id, decision){
  const text = document.getElementById('t_'+id).value;
  await fetch('/api/approvals/'+id, {method:'POST',headers:{'content-type':'application/json'},
    body: JSON.stringify({decision, text})});
  refresh();
}
refresh(); setInterval(refresh, 4000);
</script>
</body>
</html>`;
