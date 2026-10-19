import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalDir, inside } from '../analyzer/safety.js';
import { validateGraph } from './schema.js';
export const labels={confirmed:'已由代码证实',partial:'部分实现',inferred:'推断存在',unknown:'无法确认'};
export function report(g){
 const escape=s=>String(s).replace(/[<>]/g,'').replace(/\r?\n/g,' ');
 return `# ${escape(g.project.name)} 产品技术认知报告\n\n${escape(g.project.description)}\n\n代码实现不等于已经上线、对外开放或生产可用。架构分层为逻辑推断。\n\n## 覆盖范围\n\n${g.project.languages.join('、')}；${g.metadata.files} 个文件。${g.metadata.coverage}\n\n## 核心模块\n\n`+g.nodes.filter(n=>n.type==='TechnicalModule').map(n=>`- ${escape(n.name)}：${escape(n.summary)}`).join('\n')+'\n\n## 产品能力\n\n'+g.nodes.filter(n=>n.type==='ProductCapability').map(n=>`### ${escape(n.name)}\n\n状态：${labels[n.status]}\n\n${escape(n.summary)}\n\n用户问题：${escape(n.userProblem||'待确认')}\n\n产品价值：${escape(n.value||'待确认')}\n\n实现机制：${escape(n.mechanism||'待确认')}\n\n证据：${n.evidence.map(id=>{const e=g.evidence.find(e=>e.id===id);return e?escape(e.file)+':'+e.line:'未确认';}).join('、')}`).join('\n\n')+'\n\n## 限制与缺口\n\n'+g.warnings.map(w=>'- '+escape(w)).join('\n')+'\n';
}
export async function html(g){
 const base=path.join(path.dirname(fileURLToPath(import.meta.url)),'../dashboard/dist');
 const [js,css]=await Promise.all([fs.readFile(path.join(base,'app.js'),'utf8'),fs.readFile(path.join(base,'app.css'),'utf8')]);
 const payload=JSON.stringify(g).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
 return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'"><title>Codebase Insight · 产品技术地图</title><style>${css}</style><body><main id="app"></main><script id="graph-data" type="application/json">${payload}</script><script>${js.replace(/<\/script/gi,'<\\/script')}</script></body></html>`;
}
export async function save(graph,outputRoot,targetRoot,signal){
 const g=validateGraph(graph),out=await canonicalDir(outputRoot),target=await canonicalDir(targetRoot);
 if(inside(target,out))throw new Error('输出目录必须在目标代码仓库之外');
 signal?.throwIfAborted();
 const folder=await fs.mkdtemp(path.join(out,'codebase-insight-'));await fs.chmod(folder,0o700);
 try{
 const files={'metadata.json':g.metadata,'knowledge-graph.json':g,'architecture.json':g.nodes.filter(n=>['TechnicalModule','ArchitectureLayer'].includes(n.type)),'capabilities.json':g.nodes.filter(n=>n.type==='ProductCapability'),'business-flows.json':{nodes:g.nodes.filter(n=>['BusinessFlow','FlowStep'].includes(n.type)),edges:g.edges.filter(e=>e.type==='FlowsTo')},'evidence.json':g.evidence,'analysis-report.md':report(g),'dashboard.html':await html(g)};
 for(const [name,value]of Object.entries(files)){signal?.throwIfAborted();await fs.writeFile(path.join(folder,name),typeof value==='string'?value:JSON.stringify(value,null,2),{mode:0o600,flag:'wx',signal});}
 return folder;
 }catch(e){await fs.rm(folder,{recursive:true,force:true});throw e;}
}
