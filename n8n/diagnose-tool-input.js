const fs = require('fs');
const path = require('path');

const v16Path = path.join(__dirname, 'FIXED-AGENT-WORKFLOW-V16.json');
const v18Path = path.join(__dirname, 'FIXED-AGENT-WORKFLOW-V18.json');

const v16 = JSON.parse(fs.readFileSync(v16Path, 'utf8'));
const v18 = JSON.parse(fs.readFileSync(v18Path, 'utf8'));

console.log('=== V16 write_file tool ===');
const v16Write = v16.nodes.find(n => n.name === 'write_file');
console.log('First 200 chars of jsCode:');
console.log(v16Write.parameters.jsCode.substring(0, 200));
console.log('\n=== V18 write_file tool ===');
const v18Write = v18.nodes.find(n => n.name === 'write_file');
console.log('First 200 chars of jsCode:');
console.log(v18Write.parameters.jsCode.substring(0, 200));

console.log('\n\n=== Checking if tools are connected to agents ===');
const v18ComplexAgent = v18.nodes.find(n => n.name === 'Complex Executor');
console.log('Complex Executor found:', !!v18ComplexAgent);

// Check connections
console.log('\n=== write_file connections ===');
const writeFileConnections = v18.connections['write_file'];
console.log('write_file has connections:', !!writeFileConnections);
if (writeFileConnections) {
  console.log(JSON.stringify(writeFileConnections, null, 2));
}

// Look for ai_tool connections
console.log('\n=== Checking if write_file is connected as ai_tool ===');
let foundConnection = false;
for (const [nodeName, conns] of Object.entries(v18.connections)) {
  if (conns.ai_tool) {
    const hasWriteFile = conns.ai_tool.some(connArray =>
      connArray.some(conn => conn.node === 'write_file')
    );
    if (hasWriteFile) {
      console.log(`Found ai_tool connection from ${nodeName} to write_file`);
      foundConnection = true;
    }
  }
}

if (!foundConnection) {
  console.log('❌ NO ai_tool connection found to write_file!');
}
