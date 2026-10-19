import path from 'node:path';
import { z } from 'zod';
import { analyze,Config } from './analyzer/index.js';
import { canonicalDir,inside } from './analyzer/safety.js';
import { save,html } from './graph/export.js';
import { serve } from './plugin/server.js';
import { harnessModel } from './plugin/model.js';
export const name='codebase-insight';
export const inject=['tools','sandboxPolicy','llm'];
const argsSchema=z.object({repository:z.string().min(1),consentRemote:z.boolean().default(false),openDashboard:z.boolean().default(true)}).strict();
export function apply(ctx,options={}){
 const config=Config.parse(options),lifetime=new AbortController();let active=false;const servers=new Set();
 ctx.effect(()=>()=>{lifetime.abort();for(const server of servers)server.close();servers.clear();});
 ctx.tools.register({name:'codebase_insight_analyze',description:'只读分析工作区内仓库，生成产品能力和五视图 Dashboard。输出写到管理员配置的独立目录。默认离线；只有管理员 enableModel 且用户明确 consentRemote 时，才向配置模型发送最多 modelInputChars 个字符的脱敏代码片段、相对路径和模块名。应先向用户说明并取得同意。',parameters:JSON.parse(JSON.stringify(z.toJSONSchema(argsSchema))),output:{schema:{type:'object',additionalProperties:true},render:(_args,value)=>[{type:'text',text:JSON.stringify(value)}]},timeoutMs:660000,
 execute:async(raw,exec)=>{
  const args=argsSchema.parse(raw);if(active)throw new Error('已有分析正在运行，最大并发为 1');active=true;
  try{
   const signal=AbortSignal.any([lifetime.signal,...(exec.signal?[exec.signal]:[])]);
   const policy=ctx.sandboxPolicy.resolve(exec.agent?{session:exec.agent.session}:{});
   if(!policy?.workspaceRoot)throw new Error('无法确认授权工作区');
   if(policy.mode==='read-only')throw new Error('当前会话只读，不能写入分析产物');
   const workspace=await canonicalDir(policy.workspaceRoot),root=await canonicalDir(path.resolve(workspace,args.repository));
   if(!inside(workspace,root))throw new Error('仓库不在授权工作区内');
   if(!options.outputRoot)throw new Error('请由管理员配置已存在的 outputRoot（独立于被分析仓库）');
   const out=await canonicalDir(path.resolve(workspace,options.outputRoot));
   if(!inside(workspace,out))throw new Error('输出目录不在授权工作区内');
   const graph=await analyze(root,{config,signal,consentRemote:args.consentRemote,model:options.enableModel?harnessModel(ctx,exec,options):undefined});
   const folder=await save(graph,out,root,signal);let url;
   if(args.openDashboard){for(const previous of servers)previous.close();servers.clear();const server=await serve(await html(graph),lifetime.signal);servers.add(server);url=server.url;}
   return {folder,...(url?{url}:{}),offlineDashboard:path.join(folder,'dashboard.html'),modules:graph.nodes.filter(n=>n.type==='TechnicalModule').length,capabilities:graph.nodes.filter(n=>n.type==='ProductCapability').length,warnings:graph.warnings};
  }finally{active=false;}
 }});
 ctx.tools.register({name:'codebase_insight_stop',description:'关闭本插件启动的所有 Dashboard 服务。',parameters:{type:'object',properties:{},additionalProperties:false},output:{schema:{type:'object',additionalProperties:true},render:(_a,v)=>[{type:'text',text:JSON.stringify(v)}]},execute:async()=>{for(const server of servers)server.close();servers.clear();return {stopped:true};}});
}
