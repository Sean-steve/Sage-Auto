import ts from 'typescript';
import {readdirSync,readFileSync} from 'node:fs';
import {join,relative} from 'node:path';
// Runtime call sites, not table presence, determine remaining compatibility coverage.
const files=[];
function walk(dir){for(const entry of readdirSync(dir,{withFileTypes:true})){if(['node_modules','dist','test','tests','scripts','__tests__'].includes(entry.name))continue;const file=join(dir,entry.name);if(entry.isDirectory())walk(file);else if(/\.tsx?$/.test(file)&&!file.endsWith('.d.ts'))files.push(file);}}
for(const root of ['apps','packages','src'])walk(root);
const calls=[];
for(const file of files){const ast=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);function visit(node){if(ts.isCallExpression(node)&&ts.isIdentifier(node.expression)&&['createRecordStore','claimRecord'].includes(node.expression.text)){const arg=node.arguments[0];calls.push({file,line:ast.getLineAndCharacterOfPosition(node.getStart(ast)).line+1,operation:node.expression.text,namespace:arg&&(ts.isStringLiteral(arg)||ts.isNoSubstitutionTemplateLiteral(arg))?arg.text:null,expression:arg?.getText(ast)});}ts.forEachChild(node,visit);}visit(ast);}
const namespaces=[...new Set(calls.filter(c=>c.namespace).map(c=>c.namespace))].sort().map(namespace=>({namespace,locations:calls.filter(c=>c.namespace===namespace)}));
const unresolvedCalls=calls.filter(c=>!c.namespace&&!['packages/database/src/record-store.ts','packages/database/src/legacy-record-store.ts'].includes(c.file));
const report={scope:'Runtime TypeScript under apps/packages/src, excluding tests/scripts/build dependencies',filesInspected:files.length,compatibilityNamespaceCount:namespaces.length,namespaces,unresolvedCalls,normalizedCutoverComplete:namespaces.length===0&&unresolvedCalls.length===0,workflowCertification:'NOT_ASSESSED',launchCertification:'NOT_ASSESSED'};
console.log(JSON.stringify(report,null,2));
if(process.argv.includes('--require-complete')&&!report.normalizedCutoverComplete)process.exitCode=1;
