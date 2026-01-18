const fs = require('fs');
const path = require('path');

const workflowPath = path.join(__dirname, 'FIXED-AGENT-WORKFLOW-V16.json');
const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));

console.log('🔧 Fixing ALL tools to use $input instead of $fromAI()...\n');

// FIX 1: write_file
const writeFileNode = workflow.nodes.find(n => n.name === 'write_file');
if (writeFileNode) {
  console.log('✅ Fixing write_file');

  writeFileNode.parameters.jsCode = `const rawInput = $input.item.json.query || '';
const input = (typeof rawInput === 'string' ? rawInput : JSON.stringify(rawInput)).trim();
const idx = input.indexOf('|||');
if (idx === -1) return 'Error: Invalid format. Use: filePath|||fileContent';

const filePath = input.substring(0, idx).trim();
const content = input.substring(idx + 3);
if (!filePath) return 'Error: File path required';

const ctx = $('Merge Files')?.item?.json || {};
const siteId = ctx.site?.id;
const githubToken = ctx.githubToken;
const requestId = ctx.requestId || 'req';
const siteUuid = ctx.site?.uuid || siteId;

if (!siteId) return 'Error: No site context';

// Emit progress start
try { await this.helpers.httpRequest({ method: 'POST', url: 'https://jjrbnjubjiswvxeradzw.supabase.co/rest/v1/thinking_steps', headers: { 'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpqcmJuanViamlzd3Z4ZXJhZHp3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjIzMzg1OSwiZXhwIjoyMDgxODA5ODU5fQ.DDff_1lJpQo4vdnKm84-1H8QYD0diD-n7pK7VIliNe4', 'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpqcmJuanViamlzd3Z4ZXJhZHp3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjIzMzg1OSwiZXhwIjoyMDgxODA5ODU5fQ.DDff_1lJpQo4vdnKm84-1H8QYD0diD-n7pK7VIliNe4', 'Content-Type': 'application/json', 'Prefer': 'return=minimal' }, body: JSON.stringify({ request_id: requestId, site_id: siteUuid, step_number: Date.now() % 100000, tool_name: 'write_file', status: 'running', message: 'Writing ' + filePath.split('/').pop(), details: { path: filePath, lines: content.split('\\n').length } }), timeout: 3000 }); } catch(e) {}

try {
  const response = await this.helpers.httpRequest({
    method: 'POST',
    url: 'https://preview-orchestrator.fly.dev/preview/write',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ siteId, filePath, content, githubToken }),
    timeout: 30000,
    json: true,
    ignoreHttpStatusErrors: true,
    returnFullResponse: true
  });

  const body = response.body;
  if (response.statusCode >= 400 || (body && !body.success && !body.ok)) {
     const debugInfo = { status: response.statusCode, sent: { siteId, filePath, contentLen: content?.length }, response: body };
     return 'Error: Orchestrator ' + response.statusCode + ' - ' + JSON.stringify(debugInfo);
  }

  return JSON.stringify({ success: true, file: filePath, action: 'created' });
} catch (e) {
  return 'Error: Exception - ' + e.message;
}`;
}

// FIX 2: str_replace_file
const strReplaceNode = workflow.nodes.find(n => n.name === 'str_replace_file');
if (strReplaceNode) {
  console.log('✅ Fixing str_replace_file');

  strReplaceNode.parameters.jsCode = `const rawInput = $input.item.json.query || '';
const input = (typeof rawInput === 'string' ? rawInput : JSON.stringify(rawInput)).trim();

const firstSep = input.indexOf('|||');
if (firstSep === -1) return 'Error: Invalid format. Use: filePath|||searchText|||replaceText';
const secondSep = input.indexOf('|||', firstSep + 3);
if (secondSep === -1) return 'Error: Invalid format. Use: filePath|||searchText|||replaceText';

const filePath = input.substring(0, firstSep).trim();
const search = input.substring(firstSep + 3, secondSep);
const replace = input.substring(secondSep + 3);

if (!filePath || !search) return 'Error: File path and search text required';

const ctx = $('Merge Files')?.item?.json || {};
const siteId = ctx.site?.id;
const githubToken = ctx.githubToken;
const requestId = ctx.requestId || 'req';
const siteUuid = ctx.site?.uuid || siteId;

if (!siteId) return 'Error: No site context';

// Emit progress
try { await this.helpers.httpRequest({ method: 'POST', url: 'https://jjrbnjubjiswvxeradzw.supabase.co/rest/v1/thinking_steps', headers: { 'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpqcmJuanViamlzd3Z4ZXJhZHp3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjIzMzg1OSwiZXhwIjoyMDgxODA5ODU5fQ.DDff_1lJpQo4vdnKm84-1H8QYD0diD-n7pK7VIliNe4', 'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpqcmJuanViamlzd3Z4ZXJhZHp3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjIzMzg1OSwiZXhwIjoyMDgxODA5ODU5fQ.DDff_1lJpQo4vdnKm84-1H8QYD0diD-n7pK7VIliNe4', 'Content-Type': 'application/json', 'Prefer': 'return=minimal' }, body: JSON.stringify({ request_id: requestId, site_id: siteUuid, step_number: Date.now() % 100000, tool_name: 'str_replace', status: 'running', message: 'Editing ' + filePath.split('/').pop(), details: { path: filePath, searchLen: search.length, replaceLen: replace.length } }), timeout: 3000 }); } catch(e) {}

try {
  const response = await this.helpers.httpRequest({
    method: 'POST',
    url: 'https://preview-orchestrator.fly.dev/preview/replace',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ siteId, filePath, search, replace, githubToken }),
    timeout: 30000,
    json: true,
    ignoreHttpStatusErrors: true,
    returnFullResponse: true
  });

  const body = response.body;
  if (response.statusCode >= 400 || (body && !body.success && !body.ok)) {
     const debugInfo = { status: response.statusCode, sent: { siteId, filePath, searchLen: search?.length, replaceLen: replace?.length }, response: body };
     return 'Error: Orchestrator ' + response.statusCode + ' - ' + JSON.stringify(debugInfo);
  }

  return JSON.stringify({ success: true, file: filePath, action: 'replaced' });
} catch (e) {
  return 'Error: Exception - ' + e.message;
}`;
}

// FIX 3: delete_file
const deleteFileNode = workflow.nodes.find(n => n.name === 'delete_file');
if (deleteFileNode) {
  console.log('✅ Fixing delete_file');

  deleteFileNode.parameters.jsCode = `const rawInput = $input.item.json.query || '';
let file = (typeof rawInput === 'string' ? rawInput : JSON.stringify(rawInput)).trim();

if (file.startsWith('{')) {
  try { const p = JSON.parse(file); file = p.path || p.file || ''; } catch {}
}

if (!file) return 'Error: File path required';

const ctx = $('Merge Files')?.item?.json || {};
const siteId = ctx.site?.id;
const githubToken = ctx.githubToken;

if (!siteId || !githubToken) return 'Error: No site context';

try {
  const response = await this.helpers.httpRequest({
    method: 'DELETE',
    url: 'https://preview-orchestrator.fly.dev/preview/file',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ siteId, file, githubToken }),
    timeout: 30000
  });
  return JSON.stringify({ success: true, deleted: file });
} catch (e) {
  return 'Error: ' + e.message;
}`;
}

// FIX 4: read_file (already fixed in V16, but ensure it's using $input not $fromAI)
const readFileNode = workflow.nodes.find(n => n.name === 'read_file');
if (readFileNode && readFileNode.parameters.jsCode.includes('$fromAI')) {
  console.log('✅ Fixing read_file');

  readFileNode.parameters.jsCode = `const rawInput = $input.item.json.query || '';
let file = (typeof rawInput === 'string' ? rawInput : JSON.stringify(rawInput)).trim();

if (file.startsWith('{')) {
  try { const p = JSON.parse(file); file = p.path || p.file || ''; } catch {}
}

if (!file) return 'Error: File path required';

// Check if file is already in context
const ctx = $('Merge Files')?.item?.json || {};
if (ctx.fileContents && ctx.fileContents[file]) {
  return 'ℹ️ File already in context. Content:\\n\\n' + ctx.fileContents[file];
}

const owner = ctx.owner;
const repo = ctx.repo;
const branch = ctx.branch || 'main';
const githubToken = ctx.githubToken;

if (!owner || !repo || !githubToken) return 'Error: Missing GitHub info';

try {
  const response = await this.helpers.httpRequest({
    method: 'GET',
    url: 'https://api.github.com/repos/' + owner + '/' + repo + '/contents/' + file + '?ref=' + branch,
    headers: {
      'Authorization': 'Bearer ' + githubToken,
      'Accept': 'application/vnd.github.v3.raw'
    },
    timeout: 10000
  });
  const content = typeof response === 'string' ? response : JSON.stringify(response);
  return 'File: ' + file + '\\n\\n' + (content.length > 3000 ? content.substring(0, 3000) + '\\n// ...truncated' : content);
} catch (e) {
  return 'Error: File not found or inaccessible - ' + e.message;
}`;
}

// FIX 5: search_files (already fixed in V16, but ensure it's using $input)
const searchFilesNode = workflow.nodes.find(n => n.name === 'search_files');
if (searchFilesNode && searchFilesNode.parameters.jsCode.includes('$fromAI')) {
  console.log('✅ Fixing search_files');

  searchFilesNode.parameters.jsCode = `const rawInput = $input.item.json.query || '';
const query = (typeof rawInput === 'string' ? rawInput : JSON.stringify(rawInput)).trim();

if (!query) return 'Error: Search query required';

// Smart detection: Don't search GitHub if this is clearly not a file search
const nonFileIndicators = [
  /^(change|update|replace|modify|fix|add|create|remove|delete)/i,
  /\\b(to|from|with|the|a|an|in|on|at|for)\\b/i,
  /(omar|name|person|user|author|developer|company)/i,
  /\\b(color|theme|style|text|content|message|title)\\b/i
];

if (nonFileIndicators.some(pattern => pattern.test(query))) {
  return 'ℹ️ This appears to be a content change request, not a file search. No file search needed.';
}

const ctx = $('Merge Files')?.item?.json || {};
const owner = ctx.owner;
const repo = ctx.repo;
const githubToken = ctx.githubToken;

if (!owner || !repo || !githubToken) return 'Error: Missing GitHub info';

try {
  const response = await this.helpers.httpRequest({
    method: 'GET',
    url: 'https://api.github.com/search/code?q=' + encodeURIComponent(query + ' repo:' + owner + '/' + repo),
    headers: {
      'Authorization': 'Bearer ' + githubToken,
      'Accept': 'application/vnd.github.v3+json'
    },
    timeout: 10000
  });

  if (!response.items || response.items.length === 0) {
    return 'No files found matching: ' + query;
  }

  const results = response.items.slice(0, 5).map(item => ({
    path: item.path,
    url: item.html_url
  }));

  return 'Found ' + response.total_count + ' matches. Top results:\\n' + results.map(r => '- ' + r.path).join('\\n');
} catch (e) {
  return 'Error: Search failed - ' + e.message;
}`;
}

// FIX 6: create_component (from V17)
const createComponentNode = workflow.nodes.find(n => n.name === 'create_component');
if (createComponentNode) {
  console.log('✅ Fixing create_component');

  createComponentNode.parameters.jsCode = `try {
  const rawInput = $input.item.json.query || '';
  const type = (typeof rawInput === 'string' ? rawInput : JSON.stringify(rawInput)).trim().toLowerCase();

  if (!type) return 'Error: Component type required';

  const components = {
    hero: 'export default function Hero() { return <section className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 to-purple-900"><div className="text-center max-w-4xl px-4"><h1 className="text-5xl md:text-7xl font-bold text-white mb-6">Build Something Amazing</h1><p className="text-xl text-gray-300 mb-8">Create stunning experiences with our platform</p><div className="flex gap-4 justify-center"><button className="px-8 py-4 bg-purple-600 text-white rounded-full font-bold hover:bg-purple-700">Get Started</button><button className="px-8 py-4 border border-white text-white rounded-full hover:bg-white/10">Learn More</button></div></div></section>; }',
    navbar: 'export default function Navbar() { return <nav className="fixed top-0 w-full bg-white/80 backdrop-blur-lg z-50 border-b"><div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between"><a href="/" className="font-bold text-xl">Logo</a><div className="hidden md:flex gap-8">{["Home","Features","Pricing","Contact"].map(l=><a key={l} href={"#"+l.toLowerCase()} className="hover:text-purple-600">{l}</a>)}</div><button className="px-4 py-2 bg-purple-600 text-white rounded-lg">Sign Up</button></div></nav>; }',
    footer: 'export default function Footer() { return <footer className="bg-gray-900 text-gray-300 py-12"><div className="max-w-6xl mx-auto px-4 grid md:grid-cols-4 gap-8"><div><h3 className="font-bold text-white mb-4">Company</h3><p className="text-sm">Building the future</p></div>{[{t:"Product",l:["Features","Pricing","API"]},{t:"Company",l:["About","Blog","Careers"]},{t:"Legal",l:["Privacy","Terms"]}].map(({t,l})=><div key={t}><h4 className="font-bold text-white mb-4">{t}</h4>{l.map(i=><a key={i} href="#" className="block text-sm hover:text-white mb-2">{i}</a>)}</div>)}</div><div className="border-t border-gray-800 mt-8 pt-8 text-center text-sm">© 2024 Company. All rights reserved.</div></footer>; }',
    card: 'export default function Card({title,desc,image}:{title:string,desc:string,image?:string}) { return <div className="bg-white rounded-2xl shadow-lg overflow-hidden hover:shadow-xl transition-all hover:-translate-y-1">{image && <img src={image} alt={title} className="w-full h-48 object-cover"/>}<div className="p-6"><h3 className="text-xl font-bold mb-2">{title}</h3><p className="text-gray-600">{desc}</p></div></div>; }',
    pricing: 'export default function Pricing() { const p=[{n:"Starter",pr:"$9",f:["5 projects","10GB","Email support"]},{n:"Pro",pr:"$29",f:["Unlimited","100GB","Priority support"],pop:true},{n:"Enterprise",pr:"$99",f:["Everything","Dedicated","24/7 support"]}]; return <section className="py-20 bg-gray-50"><div className="max-w-5xl mx-auto px-4"><h2 className="text-4xl font-bold text-center mb-12">Simple Pricing</h2><div className="grid md:grid-cols-3 gap-8">{p.map(({n,pr,f,pop})=><div key={n} className={"p-8 rounded-2xl "+(pop?"bg-purple-600 text-white scale-105":"bg-white shadow-lg")}><h3 className="text-2xl font-bold">{n}</h3><p className="text-4xl font-bold my-4">{pr}<span className="text-lg">/mo</span></p><ul className="space-y-2 mb-6">{f.map(x=><li key={x}>✓ {x}</li>)}</ul><button className={"w-full py-3 rounded-full font-bold "+(pop?"bg-white text-purple-600":"bg-purple-600 text-white")}>Get Started</button></div>)}</div></div></section>; }',
    features: 'export default function Features() { const f=[{i:"⚡",t:"Lightning Fast",d:"Optimized performance"},{i:"🔒",t:"Secure",d:"Enterprise security"},{i:"🎨",t:"Beautiful",d:"Stunning designs"},{i:"📱",t:"Responsive",d:"Perfect on all devices"}]; return <section className="py-20"><div className="max-w-6xl mx-auto px-4"><h2 className="text-4xl font-bold text-center mb-12">Why Choose Us</h2><div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">{f.map(({i,t,d})=><div key={t} className="text-center p-6 rounded-xl hover:bg-gray-50"><div className="text-4xl mb-4">{i}</div><h3 className="text-xl font-bold mb-2">{t}</h3><p className="text-gray-600">{d}</p></div>)}</div></div></section>; }',
    testimonials: 'export default function Testimonials() { const t=[{n:"Sarah J.",r:"CEO",q:"Amazing product!"},{n:"Mike T.",r:"Developer",q:"Best tool ever."},{n:"Lisa M.",r:"Designer",q:"Love it!"}]; return <section className="py-20 bg-gray-50"><div className="max-w-6xl mx-auto px-4"><h2 className="text-4xl font-bold text-center mb-12">What People Say</h2><div className="grid md:grid-cols-3 gap-8">{t.map(({n,r,q})=><div key={n} className="bg-white p-6 rounded-xl shadow-lg"><p className="text-lg mb-4">"{q}"</p><div className="font-bold">{n}</div><div className="text-gray-500 text-sm">{r}</div></div>)}</div></div></section>; }',
    faq: 'export default function FAQ() { const q=[{q:"How does it work?",a:"Simply sign up and start."},{q:"Is there a free trial?",a:"Yes, 14 days free."},{q:"Can I cancel anytime?",a:"Absolutely, no questions."}]; return <section className="py-20"><div className="max-w-3xl mx-auto px-4"><h2 className="text-4xl font-bold text-center mb-12">FAQ</h2><div className="space-y-4">{q.map(({q,a})=><details key={q} className="bg-gray-50 p-4 rounded-lg"><summary className="font-bold cursor-pointer">{q}</summary><p className="mt-2 text-gray-600">{a}</p></details>)}</div></div></section>; }',
    cta: 'export default function CTA() { return <section className="py-20 bg-gradient-to-r from-purple-600 to-pink-600"><div className="max-w-4xl mx-auto text-center px-4"><h2 className="text-4xl font-bold text-white mb-4">Ready to Get Started?</h2><p className="text-xl text-purple-100 mb-8">Join thousands of happy customers today.</p><button className="px-8 py-4 bg-white text-purple-600 font-bold rounded-full hover:scale-105 transition-transform">Start Free Trial</button></div></section>; }',
    contact: 'export default function Contact() { return <section className="py-20"><div className="max-w-2xl mx-auto px-4"><h2 className="text-4xl font-bold text-center mb-8">Contact Us</h2><form className="space-y-4"><input type="text" placeholder="Name" className="w-full p-3 border rounded-lg"/><input type="email" placeholder="Email" className="w-full p-3 border rounded-lg"/><textarea placeholder="Message" rows={4} className="w-full p-3 border rounded-lg"/><button className="w-full py-3 bg-purple-600 text-white rounded-lg font-bold">Send Message</button></form></div></section>; }',
    newsletter: 'export default function Newsletter() { return <section className="py-16 bg-gray-100"><div className="max-w-xl mx-auto text-center px-4"><h2 className="text-2xl font-bold mb-4">Subscribe to our newsletter</h2><form className="flex gap-2"><input type="email" placeholder="Enter your email" className="flex-1 p-3 rounded-lg border"/><button className="px-6 py-3 bg-purple-600 text-white rounded-lg font-bold">Subscribe</button></form></div></section>; }',
    stats: 'export default function Stats() { const s=[{n:"10K+",l:"Users"},{n:"99.9%",l:"Uptime"},{n:"50M+",l:"Requests"},{n:"24/7",l:"Support"}]; return <section className="py-16 bg-purple-600 text-white"><div className="max-w-6xl mx-auto px-4 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">{s.map(({n,l})=><div key={l}><div className="text-4xl font-bold">{n}</div><div className="text-purple-200">{l}</div></div>)}</div></section>; }'
  };

  const key = Object.keys(components).find(k => type.includes(k));
  if (!key) {
    return 'Error: Unknown type. Available: ' + Object.keys(components).join(', ');
  }

  // RETURN STRING NOT OBJECT!
  return 'Component code for ' + key + ':\\n\\n' + components[key];
} catch(e) {
  return 'Error: ' + e.message;
}`;
}

// FIX 7: fetch_stock_image (from V17)
const fetchStockNode = workflow.nodes.find(n => n.name === 'fetch_stock_image');
if (fetchStockNode) {
  console.log('✅ Fixing fetch_stock_image');

  fetchStockNode.parameters.jsCode = `try {
  const rawInput = $input.item.json.query || '';
  const query = (typeof rawInput === 'string' ? rawInput : JSON.stringify(rawInput)).trim();

  if (!query) return 'Error: Search query required';

  const q = encodeURIComponent(query);
  const url = 'https://source.unsplash.com/800x600/?' + q;

  // RETURN STRING NOT OBJECT!
  return 'Stock photo: ' + url;
} catch(e) {
  return 'Error: ' + e.message;
}`;
}

// Save
const outputPath = path.join(__dirname, 'FIXED-AGENT-WORKFLOW-V18.json');
fs.writeFileSync(outputPath, JSON.stringify(workflow, null, 2));

console.log('\n✅ All tools fixed to use $input.item.json.query instead of $fromAI()!');
console.log('📁 Saved to:', outputPath);
console.log('\n📋 Fixed tools:');
console.log('  1. ✅ write_file');
console.log('  2. ✅ str_replace_file');
console.log('  3. ✅ delete_file');
console.log('  4. ✅ read_file');
console.log('  5. ✅ search_files');
console.log('  6. ✅ create_component');
console.log('  7. ✅ fetch_stock_image');
console.log('\n🚀 Import V18 into n8n and test again!');
console.log('\n💡 All tools now use: $input.item.json.query instead of broken $fromAI()');
