import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import * as Plugin from '../index.js';
const root=process.env.DSH_TEST_ROOT;if(!root)throw new Error('设置 DSH_TEST_ROOT 为实际 @deepseek-ai/dsh 安装目录');
const require=createRequire(path.join(root,'package.json'));
const fromHost=name=>import(pathToFileURL(require.resolve(name)).href);
const {Context,Service}=await fromHost('@deepseek-ai/cordis');
const {default:Tools}=await fromHost('@deepseek-ai/dsh-tools');
const {default:Llm,LlmAdapter}=await fromHost('@deepseek-ai/dsh-llm');
const {default:SystemPrompt}=await fromHost('@deepseek-ai/dsh-system-prompt');
const dir=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'insight-host-')));await fs.mkdir(path.join(dir,'repo'));await fs.mkdir(path.join(dir,'output'));await fs.writeFile(path.join(dir,'repo','a.js'),'export function createOrder() {return 1;}');
let mode='workspace-write';class Policy extends Service{constructor(ctx){super(ctx,'sandboxPolicy');}resolve(){return {mode,workspaceRoot:dir};}}
let modelCalls=0;
class FixtureModel extends LlmAdapter { async *stream(options){modelCalls++;const p=JSON.parse(options.messages[0].content[0].text);yield {type:'text-delta',index:0,text:JSON.stringify({capabilities:[{name:'创建订单',summary:'根据示例证据推断',userProblem:'提交订单',value:'保存订单',mechanism:'调用创建入口',moduleIds:[p.modules[0].id],evidence:[p.evidence[0].id]}]})};yield {type:'finish',reason:{kind:'stop'}};} }
const ctx=new Context();try{
 await ctx.plugin(SystemPrompt);await ctx.plugin(Tools);await ctx.plugin(Policy);await ctx.plugin(Llm);ctx.llm.registerAdapter(['fixture'],new FixtureModel());const fiber=await ctx.plugin(Plugin,{outputRoot:'output'});
 assert.equal(ctx.tools.schemas().filter(t=>t.name.startsWith('codebase_insight_')).length,2);
 const signal=new AbortController().signal;const run=args=>ctx.tools.execute({signal,callId:'insight-host',name:'codebase_insight_analyze',arguments:args});
 const result=await run({repository:'repo',openDashboard:true});assert.equal(result.isError,false,JSON.stringify(result));assert.equal((await fetch(result.value.url)).status,200);assert.equal(result.value.capabilities,1);
 mode='read-only';assert.equal((await run({repository:'repo'})).isError,true);mode='workspace-write';assert.equal((await run({repository:'../'})).isError,true);assert.equal((await run({repository:'repo',unknown:true})).isError,true);
 await fiber.dispose();assert.equal(ctx.tools.schemas().filter(t=>t.name.startsWith('codebase_insight_')).length,0);await assert.rejects(()=>fetch(result.value.url));
 const modelFiber=await ctx.plugin(Plugin,{outputRoot:'output',enableModel:true,provider:'fixture',model:'synthetic'});assert.equal((await run({repository:'repo'})).isError,true);assert.equal(modelCalls,0);const semantic=await run({repository:'repo',consentRemote:true,openDashboard:false});assert.equal(semantic.isError,false,JSON.stringify(semantic));assert.equal(modelCalls,1);assert.equal(semantic.value.capabilities,2);await modelFiber.dispose();
 console.log(JSON.stringify({ok:true,checks:['真实 Cordis 加载/卸载','真实 tools 参数与执行管线','只读策略拒绝','工作区越界拒绝','本地 Dashboard','卸载清理服务','真实 LLM runtime + 合成适配器','模型逐次授权'],note:'策略为测试服务，未修改用户 profile；没有远程模型请求'}));
}finally{await ctx.fiber.dispose();await fs.rm(dir,{recursive:true,force:true});}
