const fs = require('fs');
const path = require('path');

const workflowPath = path.join(__dirname, 'FIXED-AGENT-WORKFLOW-V15.json');
const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));

console.log('🔧 Fixing workflow issues...\n');

// ISSUE 1: Fix read_file tool - improve description and add context awareness
const readFileNode = workflow.nodes.find(n => n.name === 'read_file');
if (readFileNode) {
  console.log('✅ Updating read_file tool...');

  // Update description to be more clear
  readFileNode.parameters.description = "Read file contents from GitHub. Input: file path (e.g., src/components/Header.tsx).";

  // Update code to check if file is already in context
  readFileNode.parameters.jsCode = `const rawInput = $fromAI('query', 'File path to read', 'string') || '';
let file = rawInput.trim();

if (file.startsWith('{')) {
  try { const p = JSON.parse(file); file = p.path || p.file || ''; } catch {}
}

if (!file) return 'Error: File path required';

// Check if file is already in context
const ctx = $('Merge Files')?.item?.json || {};
if (ctx.fileContents && ctx.fileContents[file]) {
  return 'ℹ️ File already in context. Content:\\n' + ctx.fileContents[file];
}

const owner = ctx.owner;
const repo = ctx.repo;
const branch = ctx.branch || 'main';
const githubToken = ctx.githubToken;

if (!owner || !repo || !githubToken) return 'Error: No repository context';

try {
  const response = await this.helpers.httpRequest({
    method: 'GET',
    url: 'https://api.github.com/repos/' + owner + '/' + repo + '/contents/' + file + '?ref=' + branch,
    headers: {
      'Authorization': 'Bearer ' + githubToken,
      'Accept': 'application/vnd.github.v3.raw'
    },
    timeout: 15000
  });
  return typeof response === 'string' ? response : JSON.stringify(response);
} catch (e) {
  return 'Error reading file: ' + e.message;
}`;
}

// ISSUE 2: Fix search_files to be intelligent about non-file queries
const searchFilesNode = workflow.nodes.find(n => n.name === 'search_files');
if (searchFilesNode) {
  console.log('✅ Updating search_files tool with smart query detection...');

  searchFilesNode.parameters.description = "Search for text patterns in codebase. Input: search query/pattern. Searches file contents using GitHub code search.";

  searchFilesNode.parameters.jsCode = `const rawInput = $fromAI('query', 'Search pattern', 'string') || '';
let pattern = rawInput.trim();

if (pattern.startsWith('{')) {
  try { const p = JSON.parse(pattern); pattern = p.pattern || p.query || ''; } catch {}
}

if (!pattern) return 'Error: Search pattern required';

// Smart detection: Check if query is obviously not a file search
const nonFileIndicators = [
  /^(change|update|replace|modify|fix|add|create|remove|delete)/i,
  /\b(to|from|with|the|a|an|in|on|at|for)\b/i,
  /(omar|name|person|user|author|developer|company)/i
];

const isLikelyNotFileSearch = nonFileIndicators.some(regex => regex.test(pattern));

if (isLikelyNotFileSearch) {
  // Extract potential keywords for actual file search
  const words = pattern.split(/\\s+/).filter(w =>
    w.length > 3 &&
    !/^(change|update|replace|modify|to|from|with|the|a|an|in|on|at|for|omar|obeid|services)$/i.test(w)
  );

  if (words.length === 0) {
    return 'ℹ️ This appears to be a command or question, not a file search. No files to search for. If you need to find text in code, use specific technical terms or code patterns.';
  }

  // Use the extracted keywords instead
  pattern = words[0];
  console.log('🔍 Detected non-file query, searching for keyword: ' + pattern);
}

const ctx = $('Merge Files')?.item?.json || {};
const owner = ctx.owner;
const repo = ctx.repo;
const githubToken = ctx.githubToken;

if (!owner || !repo || !githubToken) return 'Error: No repository context';

try {
  const response = await this.helpers.httpRequest({
    method: 'GET',
    url: 'https://api.github.com/search/code?q=' + encodeURIComponent(pattern + ' repo:' + owner + '/' + repo),
    headers: {
      'Authorization': 'Bearer ' + githubToken,
      'Accept': 'application/vnd.github+json'
    },
    timeout: 15000
  });
  if (response.items && response.items.length > 0) {
    return response.items.slice(0, 10).map(item => item.path).join('\\n');
  }
  return 'No files found matching: ' + pattern;
} catch (e) {
  return 'Error searching: ' + e.message;
}`;
}

// ISSUE 3: Fix fetch_stock_image tool - the $fromAI issue
const stockImageNode = workflow.nodes.find(n => n.name === 'fetch_stock_image');
if (stockImageNode) {
  console.log('✅ Fixing fetch_stock_image tool...');

  stockImageNode.parameters.jsCode = `try {
  const rawInput = $input.item.json.query || '';
  const query = (typeof rawInput === 'string' ? rawInput : JSON.stringify(rawInput)).trim();

  if (!query) return { error: 'Search query required' };

  const q = encodeURIComponent(query);
  const url = 'https://source.unsplash.com/800x600/?' + q;

  return { result: 'Stock photo: ' + url, url: url };
} catch(e) {
  return { error: 'Error: ' + e.message };
}`;
}

// ISSUE 4: Fix create_component tool - the $fromAI issue
const createComponentNode = workflow.nodes.find(n => n.name === 'create_component');
if (createComponentNode) {
  console.log('✅ Fixing create_component tool...');

  createComponentNode.parameters.jsCode = `try {
  const rawInput = $input.item.json.query || '';
  const type = (typeof rawInput === 'string' ? rawInput : JSON.stringify(rawInput)).trim().toLowerCase();

  if (!type) return { error: 'Component type required' };

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
    return { error: 'Unknown type. Available: ' + Object.keys(components).join(', ') };
  }

  return { result: 'Component code for ' + key + ':\\n' + components[key], code: components[key], type: key };
} catch(e) {
  return { error: 'Error: ' + e.message };
}`;
}

// ISSUE 5: Add intelligent system message to prevent unnecessary tool calls
const complexExecutor = workflow.nodes.find(n => n.name === 'Complex Executor');
if (complexExecutor) {
  console.log('✅ Updating Complex Executor system message...');

  // The system message is an expression, let's make it better
  const currentMsg = complexExecutor.parameters.options.systemMessage;

  // Add guidance about tool usage
  complexExecutor.parameters.options.systemMessage = "={{ 'AutoMate|' + $json.owner + '/' + $json.repo + '\\nT:' + ($json.executionPlan?.tasks ? $json.executionPlan.tasks.map(t=>t.id+'.'+t.task.slice(0,40)).join('|') : JSON.stringify($json.executionPlan||{})) + '\\nR:1tool/turn|str_replace>write|create_component(hero,card,pricing,features,cta)|run_build=last\\nX:parallel|rewrite|100+lines\\n⚠️ FILES IN CONTEXT: ' + Object.keys($json.fileContents||{}).join(',') + ' - DO NOT use read_file for these!\\n⚠️ DO NOT search_files for non-code queries (names, commands, questions)\\nM:' + ($json.memoryContext||'none').slice(0,300) }}";
}

const simpleExecutor = workflow.nodes.find(n => n.name === 'Simple Executor');
if (simpleExecutor) {
  console.log('✅ Updating Simple Executor system message...');

  simpleExecutor.parameters.options.systemMessage = "={{ 'AutoMate|Fast|' + $json.owner + '/' + $json.repo + '\\nT:' + ($json.executionPlan?.tasks ? $json.executionPlan.tasks.map(t=>t.id+'.'+t.task.slice(0,30)).join('|') : 'execute') + '\\nR:1tool/turn|str_replace>write|run_build=last\\nX:parallel|rewrite\\n⚠️ FILES IN CONTEXT: ' + Object.keys($json.fileContents||{}).join(',') + ' - DO NOT use read_file!\\nM:' + ($json.memoryContext||'-').slice(0,200) }}";
}

// Save the fixed workflow
const outputPath = path.join(__dirname, 'FIXED-AGENT-WORKFLOW-V16.json');
fs.writeFileSync(outputPath, JSON.stringify(workflow, null, 2));

console.log('\\n✅ All fixes applied!');
console.log('📁 Saved to:', outputPath);
console.log('\\n📋 Summary of fixes:');
console.log('  1. ✅ read_file now checks if file is in context before fetching');
console.log('  2. ✅ search_files intelligently detects non-file queries');
console.log('  3. ✅ fetch_stock_image fixed - no longer uses broken $fromAI');
console.log('  4. ✅ create_component fixed - no longer uses broken $fromAI');
console.log('  5. ✅ Agent system messages updated with context awareness');
console.log('\\n🚀 Import V16 into n8n to test!');
