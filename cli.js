#!/usr/bin/env node
import path from 'node:path';
import { analyze } from './analyzer/index.js';
import { canonicalDir } from './analyzer/safety.js';
import { save,html } from './graph/export.js';
import { serve } from './plugin/server.js';
const [command,repository,output,...flags]=process.argv.slice(2);
if(command!=='analyze'||!repository||!output||flags.some(f=>f!=='--serve')){console.error('用法：dsh-codebase-insight analyze <仓库目录> <已存在的独立输出目录> [--serve]');process.exitCode=1;}
else{
 const controller=new AbortController();process.once('SIGINT',()=>controller.abort());process.once('SIGTERM',()=>controller.abort());
 try{const root=await canonicalDir(path.resolve(repository)),out=await canonicalDir(path.resolve(output));const graph=await analyze(root,{signal:controller.signal});const folder=await save(graph,out,root,controller.signal);console.log(JSON.stringify({folder,modules:graph.nodes.filter(n=>n.type==='TechnicalModule').length,capabilities:graph.nodes.filter(n=>n.type==='ProductCapability').length,warnings:graph.warnings},null,2));if(flags.includes('--serve')){const server=await serve(await html(graph),controller.signal);console.log(server.url);}}
 catch(e){console.error(e.message);process.exitCode=1;}
}
