import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { analyze } from '../analyzer/index.js';
import { validateGraph } from '../graph/schema.js';
import { html,save } from '../graph/export.js';
import { safeRead } from '../analyzer/safety.js';
import { serve } from '../plugin/server.js';
const expected=JSON.parse(await fs.readFile(new URL('./fixtures/expected.json',import.meta.url),'utf8'));
for(const [name,reference] of Object.entries(expected))test(`参考答案：${name} 模块、能力、依赖、流程、证据`,async()=>{
 const root=await fs.realpath(new URL('./fixtures/'+name,import.meta.url));const before=await snapshot(root);
 const g=await analyze(root);assert.deepEqual(await snapshot(root),before);
 const modules=g.nodes.filter(n=>n.type==='TechnicalModule');assert.deepEqual(modules.map(n=>n.name).sort(),reference.modules.sort());
 const capabilities=g.nodes.filter(n=>n.type==='ProductCapability');assert.deepEqual(capabilities.map(n=>n.name).sort(),reference.capabilities.sort());
 const moduleIds=new Map(modules.map(n=>[n.id,n.name]));const dependencies=g.edges.filter(e=>e.type==='DependsOn'&&moduleIds.has(e.source)).map(e=>[moduleIds.get(e.source),moduleIds.get(e.target)]);assert.deepEqual(dependencies.sort(),reference.dependencies.sort());
 assert(g.nodes.some(n=>n.type==='BusinessFlow'&&n.name===reference.flow));
 for(const e of g.evidence){const text=await fs.readFile(path.join(root,e.file),'utf8');assert(text.includes(e.snippet));}
 assert(capabilities.every(n=>n.status==='inferred'&&n.evidence.length));validateGraph(g);
});
async function snapshot(dir){const result={};for(const ent of await fs.readdir(dir,{withFileTypes:true})){if(ent.isDirectory())Object.assign(result,Object.fromEntries(Object.entries(await snapshot(path.join(dir,ent.name))).map(([k,v])=>[ent.name+'/'+k,v])));else result[ent.name]=await fs.readFile(path.join(dir,ent.name),'utf8');}return result;}
async function temporary(t){const dir=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'insight-test-')));t.after(()=>fs.rm(dir,{recursive:true,force:true}));return dir;}
test('拒绝符号链接、敏感文件、gitignore 与敏感行外泄',async t=>{
 const dir=await temporary(t),root=path.join(dir,'repo');await fs.mkdir(root);await fs.writeFile(path.join(dir,'outside.js'),'export const privateData=1');
 await fs.writeFile(path.join(root,'.env'),'SECRET=sentinel-secret');await fs.writeFile(path.join(root,'secret.key'),'sentinel-secret');await fs.symlink(path.join(dir,'outside.js'),path.join(root,'linked.js'));
 await fs.writeFile(path.join(root,'.gitignore'),'ignored.js\n');await fs.writeFile(path.join(root,'ignored.js'),'sentinel-secret');await fs.writeFile(path.join(root,'app.js'),'const apiKey = "sentinel-secret";\nexport function safe() { return 1; }');
 const g=await analyze(root);assert.equal(g.metadata.files,1);assert(!JSON.stringify(g).includes('sentinel-secret'));assert(!JSON.stringify(g).includes('outside.js'));await assert.rejects(()=>safeRead(root,'../outside.js',1024));
 const linked=path.join(dir,'alias');await fs.symlink(root,linked);await assert.rejects(()=>analyze(linked));
});
test('资源限制、取消、空仓库不会伪造能力',async t=>{
 const dir=await temporary(t);let g=await analyze(dir);assert.equal(g.nodes.length,0);
 await fs.writeFile(path.join(dir,'a.js'),'export function a() {return 1;}');await fs.writeFile(path.join(dir,'b.js'),'export function b() {return 2;}');
 g=await analyze(dir,{config:{maxFiles:1}});assert.equal(g.metadata.files,1);assert.equal(g.metadata.truncated,true);
 const c=new AbortController();c.abort();await assert.rejects(()=>analyze(dir,{signal:c.signal}));
 await assert.rejects(()=>analyze(dir,{config:{maxFiles:0}}));
});
test('模型必须逐次授权，校验引用且不会升级为 confirmed',async()=>{
 const root=await fs.realpath(new URL('./fixtures/monolith',import.meta.url));let calls=0;
 const model=async(_system,input)=>{calls++;const p=JSON.parse(input);return JSON.stringify({capabilities:[{name:'创建订单',summary:'订单保存能力',userProblem:'提交订单',value:'记录订单',mechanism:'验证后保存',moduleIds:[p.modules[0].id],evidence:[p.evidence[0].id]}]});};
 await assert.rejects(()=>analyze(root,{model}),/consentRemote/);assert.equal(calls,0);
 const g=await analyze(root,{model,consentRemote:true});assert.equal(calls,1);assert.equal(g.nodes.find(n=>n.name==='创建订单').status,'inferred');
 await assert.rejects(()=>analyze(root,{model:async()=>'{"capabilities":[{"name":"虚构","summary":"","userProblem":"","value":"","mechanism":"","moduleIds":["bad"],"evidence":["fake"]}]}',consentRemote:true}),/未发送/);
 await assert.rejects(()=>analyze(root,{model,consentRemote:true,config:{tokenBudget:1000}}),/预算/);
});
test('图谱拒绝重复节点、断链和无证据确认',async()=>{
 const g=await analyze(await fs.realpath(new URL('./fixtures/monolith',import.meta.url)));let bad=structuredClone(g);bad.nodes.push(bad.nodes[0]);assert.throws(()=>validateGraph(bad));bad=structuredClone(g);bad.edges[0].target='bad';assert.throws(()=>validateGraph(bad));bad=structuredClone(g);bad.nodes[0].status='confirmed';bad.nodes[0].evidence=[];assert.throws(()=>validateGraph(bad));
});
test('导出可重载、HTML 安全编码、不覆盖目标',async t=>{
 const dir=await temporary(t),root=await fs.realpath(new URL('./fixtures/monolith',import.meta.url));const g=await analyze(root);g.project.description='</script><img src=x onerror=alert(1)>';
 const page=await html(g);assert(!page.includes('</script><img'));assert(page.includes('\\u003c/script>'));
 const folder=await save(g,dir,root);const loaded=validateGraph(JSON.parse(await fs.readFile(path.join(folder,'knowledge-graph.json'),'utf8')));assert.equal(loaded.project.name,g.project.name);assert((await fs.stat(path.join(folder,'dashboard.html'))).size>10000);
 await assert.rejects(()=>save(g,root,root),/目标代码仓库之外/);
});
test('HTTP 仅回环、随机路径、Host 校验、取消关闭',async t=>{
 const controller=new AbortController(),server=await serve('<h1>local</h1>',controller.signal);
 t.after(()=>server.close());const url=new URL(server.url);assert.equal(url.hostname,'127.0.0.1');assert.equal((await fetch(server.url)).status,200);assert.equal((await fetch(url.origin+'/')).status,404);assert.equal(await new Promise((resolve,reject)=>{const r=http.get(server.url,{headers:{host:'attacker.example'}},res=>{res.resume();resolve(res.statusCode);});r.on('error',reject);}),404);controller.abort();await assert.rejects(()=>fetch(server.url));
});
test('条件/异常分支标为推断，未解析导入不编造依赖',async t=>{
 const dir=await temporary(t);await fs.writeFile(path.join(dir,'a.js'),"import { missing } from './absent.js';\nfunction rescue(){ return 1; }\nexport function run(){try {missing();}catch(e){rescue();}}\n");const g=await analyze(dir);assert(g.warnings.some(w=>w.includes('未解析导入')));assert(g.nodes.some(n=>n.type==='FlowStep'&&n.name.includes('条件/异常')));assert(!g.edges.some(e=>e.type==='DependsOn'));assert(g.edges.filter(e=>e.type==='FlowsTo').every(e=>e.status==='inferred'));
});
test('私钥块多行脱敏，注释不生成虚构能力',async t=>{
 const dir=await temporary(t);await fs.writeFile(path.join(dir,'a.js'),'/* export function invented() {} */\nconst data = `-----BEGIN PRIVATE KEY-----\nprivate-body-sentinel\n-----END PRIVATE KEY-----`;\nexport function actual(){ return 1; }');
 const g=await analyze(dir);assert(!JSON.stringify(g).includes('private-body-sentinel'));assert(!g.nodes.some(n=>n.name==='invented'));assert(g.nodes.some(n=>n.name==='actual'));
});
