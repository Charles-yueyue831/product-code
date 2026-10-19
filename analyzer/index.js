import { z } from 'zod';
import { scan } from './scan.js';
import { structure } from './structure.js';
import { validateGraph } from '../graph/schema.js';
import { semanticPayload, mergeSemantic, systemPrompt } from './semantic.js';
export const Config=z.object({maxFiles:z.number().int().min(1).max(20000).default(2000),maxFileBytes:z.number().int().min(100).max(1048576).default(262144),maxTotalBytes:z.number().int().min(100).max(104857600).default(16777216),timeoutMs:z.number().int().min(1).max(600000).default(60000),modelInputChars:z.number().int().min(1000).max(40000).default(12000),maxOutputTokens:z.number().int().min(100).max(8000).default(4000),tokenBudget:z.number().int().min(1000).max(200000).default(50000)});
export async function analyze(root,options={}){
  const config=Config.parse(options.config||{}),signal=AbortSignal.any([AbortSignal.timeout(config.timeoutMs),...(options.signal?[options.signal]:[])]);
  const data=await scan(root,config,signal);
  // Yield so timeouts/cancellation can fire between bounded analysis stages.
  await new Promise(resolve=>setImmediate(resolve));signal.throwIfAborted();
  let graph=structure(data,signal);
  await new Promise(resolve=>setImmediate(resolve));signal.throwIfAborted();
  if(options.model){
    if(options.consentRemote!==true)throw new Error('模型分析会发送脱敏代码片段、路径与模块名，需要本次明确 consentRemote 授权');
    const input=semanticPayload(graph,config.modelInputChars);
    if(Buffer.byteLength(input+systemPrompt)+config.maxOutputTokens>config.tokenBudget)throw new Error('保守模型 token 预算不足');
    const output=await options.model(systemPrompt,input,signal,config.maxOutputTokens);
    graph=mergeSemantic(graph,output,input);
  }
  signal.throwIfAborted();return validateGraph(graph);
}
