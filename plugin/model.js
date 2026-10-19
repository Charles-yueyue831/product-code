export function harnessModel(ctx,exec,config){
 return async(system,input,signal,maxTokens)=>{
 const selection=exec.agent?.session?.requestHeader?.()?.config;
 const provider=config.provider||selection?.provider,model=config.model||selection?.model;
 if(!provider||!model||!ctx.llm)throw new Error('请配置 Harness 已注册的 provider/model 路由');
 const prepared=await ctx.llm.prepareCall({provider,model,maxTokens},signal);const blocks=new Map();let finish;
 for await(const chunk of prepared.stream({...prepared.config,system,messages:[{role:'user',content:[{type:'text',text:input}]}],signal})){
  signal.throwIfAborted();
  if(chunk.type==='text-delta')blocks.set(chunk.index,(blocks.get(chunk.index)||'')+chunk.text);
  if(chunk.type==='block-end'&&chunk.block.type==='text')blocks.set(chunk.index,chunk.block.text);
  if(chunk.type==='finish')finish=chunk.reason?.kind;
  if([...blocks.values()].join('').length>100000)throw new Error('模型输出超过限制');
 }
 if(finish!=='stop')throw new Error('模型未完整完成，已停止语义分析');
 return [...blocks.entries()].sort((a,b)=>a[0]-b[0]).map(x=>x[1]).join('');
 };
}
