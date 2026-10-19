import ts from 'typescript';
import path from 'node:path';
import { createHash } from 'node:crypto';
export const id=(prefix,value)=>prefix+':'+createHash('sha256').update(value).digest('hex').slice(0,16);
const moduleFor=p=>{const a=p.split('/');return a.length===1?'根模块':a[0]==='src'&&a.length>2?a.slice(0,2).join('/'):a[0];};
const layerFor=p=>/\/|^/.test(p)&&/(api|route|controller)/i.test(p)?'接口层':/(storage|database|repo|persist)/i.test(p)?'数据层':/(ui|client|view|dashboard|component)/i.test(p)?'交互层':/(runtime|infra|deploy|scheduler)/i.test(p)?'基础设施层':'业务与共享逻辑';
export function structure(scan,signal) {
  const g={schemaVersion:1,project:scan.project,nodes:[],edges:[],evidence:[],warnings:[],metadata:{analyzedAt:new Date().toISOString(),files:scan.files.length,bytes:scan.bytes,truncated:scan.truncated,skipped:scan.skipped,analysisMode:'local',coverage:'JS/TS AST；其余语言仅文件结构。调用顺序不是完整控制流，逻辑分层不是部署拓扑。'}};
  const nodes=new Map(), edges=new Map(), evidence=new Map(), parsed=new Map();
  const node=n=>{if(!nodes.has(n.id))nodes.set(n.id,n);return nodes.get(n.id);};
  const edge=(source,target,type,ev,status='confirmed',basis='源码静态结构')=>{if(source===target)return;const key=id('edge',source+type+target);if(!edges.has(key))edges.set(key,{id:key,source,target,type,evidence:ev,status,basis});};
  const ev=(f,start,end=start)=>{
    const lines=f.text.split('\n'),line=Math.max(1,start),endLine=Math.max(line,Math.min(end,lines.length,line+12));
    const key=id('evidence',f.path+':'+line+':'+endLine);
    if(!evidence.has(key))evidence.set(key,{id:key,file:f.path,line,endLine,snippet:lines.slice(line-1,endLine).join('\n').slice(0,3000),hash:f.hash});return key;
  };
  for(const f of scan.files){
    signal?.throwIfAborted();
    const module=moduleFor(f.path), mid=id('module',module),layer=layerFor(module), lid=id('layer',layer),fid=id('file',f.path),e=[ev(f,1)];
    node({id:lid,type:'ArchitectureLayer',name:layer,summary:'根据目录职责推断的逻辑分组；不是已验证部署架构。',status:'inferred',evidence:e});
    node({id:mid,type:'TechnicalModule',name:module,summary:`源码目录 ${module}；职责需结合关联能力和文件验证。`,status:'confirmed',evidence:e,layer});
    edge(mid,lid,'BelongsTo',e,'inferred','目录命名启发式分层');
    node({id:fid,type:'File',name:f.path,summary:`${f.language} 文件`,status:'confirmed',evidence:e,moduleId:mid,layer});edge(mid,fid,'Contains',e);
    if(!['JavaScript','TypeScript'].includes(f.language))continue;
    const sf=ts.createSourceFile(f.path,f.text,ts.ScriptTarget.Latest,true,f.path.endsWith('x')?ts.ScriptKind.TSX:f.language==='TypeScript'?ts.ScriptKind.TS:ts.ScriptKind.JS);
    if(sf.parseDiagnostics.length){g.warnings.push(`${f.path} 存在语法解析错误；未提取符号和调用。`);continue;}
    const record={f,sf,mid,fid,layer,imports:[],symbols:new Map(),functions:[],routes:[]};parsed.set(f.path,record);
    const loc=n=>sf.getLineAndCharacterOfPosition(n.getStart(sf)).line+1;
    const visit=n=>{
      signal?.throwIfAborted();
      if(ts.isImportDeclaration(n)&&ts.isStringLiteral(n.moduleSpecifier)){
        const bindings=[];const clause=n.importClause;
        if(clause?.name)bindings.push([clause.name.text,'default']);
        if(clause?.namedBindings&&ts.isNamedImports(clause.namedBindings))for(const el of clause.namedBindings.elements)bindings.push([el.name.text,el.propertyName?.text||el.name.text]);
        record.imports.push({source:n.moduleSpecifier.text,bindings,e:[ev(f,loc(n))]});
      }
      let name,kind,body;
      if(ts.isFunctionDeclaration(n)&&n.name){name=n.name.text;kind='Function';body=n.body;}
      if(ts.isClassDeclaration(n)&&n.name){name=n.name.text;kind='Class';}
      if(ts.isVariableDeclaration(n)&&ts.isIdentifier(n.name)&&n.initializer&&(ts.isArrowFunction(n.initializer)||ts.isFunctionExpression(n.initializer))){name=n.name.text;kind='Function';body=n.initializer.body;}
      if(name){
        const sid=id(kind,f.path+':'+name+':'+loc(n)),se=[ev(f,loc(n),loc(n)+4)];
        node({id:sid,type:kind,name,summary:`${f.path} 定义的${kind==='Function'?'函数':'类'}；存在声明不代表已上线。`,status:'confirmed',evidence:se,moduleId:mid,layer});edge(fid,sid,'Contains',se);
        const top=ts.isFunctionDeclaration(n)?n.parent===sf:ts.isVariableDeclaration(n)?n.parent?.parent?.parent===sf:false;
        if(top)record.symbols.set(name,{id:sid,exported:!!(ts.getCombinedModifierFlags(ts.isVariableDeclaration(n)?n.parent.parent:n)&ts.ModifierFlags.Export)});
        if(body&&top)record.functions.push({name,id:sid,body,loc});
      }
      if(ts.isCallExpression(n)&&ts.isPropertyAccessExpression(n.expression)&&/^(get|post|put|patch|delete|use)$/.test(n.expression.name.text)&&n.arguments[0]&&ts.isStringLiteral(n.arguments[0])&&n.arguments[0].text.startsWith('/')){
        const route=n.expression.name.text.toUpperCase()+' '+n.arguments[0].text,aid=id('api',f.path+':'+loc(n)),ae=[ev(f,loc(n),loc(n)+4)];
        node({id:aid,type:'API',name:route,summary:'检测到路由形态的调用语法；框架绑定及对外可用性需要确认。',status:'inferred',evidence:ae,moduleId:mid,layer});edge(mid,aid,'Contains',ae);
        record.routes.push({id:aid,name:route,e:ae});
      }
      ts.forEachChild(n,visit);
    };visit(sf);
  }
  const resolve=(from,spec)=>{
    if(!spec.startsWith('.'))return null;
    const base=path.posix.normalize(path.posix.join(path.posix.dirname(from),spec));
    const candidates=[base,...['.ts','.tsx','.js','.jsx','.mjs','.cjs','/index.ts','/index.js'].map(e=>base+e)];
    if(/\.js$/.test(base))candidates.push(base.slice(0,-3)+'.ts');
    return candidates.find(p=>parsed.has(p))||null;
  };
  for(const [file,r] of parsed){
    const imported=new Map();
    for(const imp of r.imports){const target=resolve(file,imp.source);if(!target){if(imp.source.startsWith('.'))g.warnings.push(`${file}: 未解析导入 ${imp.source}`);continue;}
      const t=parsed.get(target);edge(r.fid,t.fid,'DependsOn',imp.e);edge(r.mid,t.mid,'DependsOn',imp.e);
      for(const [local,remote]of imp.bindings){const symbol=t.symbols.get(remote);if(symbol?.exported)imported.set(local,symbol);}
    }
    for(const fn of r.functions){
      const calls=[];
      const walk=(n,conditional=false)=>{
        if(n!==fn.body&&(ts.isFunctionDeclaration(n)||ts.isFunctionExpression(n)||ts.isArrowFunction(n)))return;
        const branch=conditional||ts.isIfStatement(n)||ts.isConditionalExpression(n)||ts.isSwitchStatement(n)||ts.isTryStatement(n)||ts.isIterationStatement(n,false);
        if(ts.isCallExpression(n)&&ts.isIdentifier(n.expression)){
          const name=n.expression.text,target=r.symbols.get(name)||imported.get(name),e=[ev(r.f,fn.loc(n))];
          if(target){edge(fn.id,target.id,'Calls',e,'inferred','标识符静态匹配；可能被局部变量遮蔽，不证明运行时调用');calls.push({name,target:target.id,e,branch});}
        }
        ts.forEachChild(n,c=>walk(c,branch));
      };walk(fn.body);
      if(calls.length){
        const flow=id('flow',fn.id);node({id:flow,type:'BusinessFlow',name:fn.name+' 调用路径',summary:'静态可见调用的源码顺序；条件、循环和异常会改变实际执行。',status:'inferred',evidence:nodes.get(fn.id).evidence,moduleId:r.mid});edge(fn.id,flow,'Supports',nodes.get(fn.id).evidence,'inferred','从函数体提取');
        let previous;
        calls.slice(0,30).forEach((call,i)=>{const sid=id('step',flow+':'+i);node({id:sid,type:'FlowStep',name:call.name+(call.branch?'（条件/异常路径）':''),summary:call.branch?'此调用位于条件、循环或异常处理结构中；需验证实际执行条件。':'静态调用位置；不保证运行时执行。',status:'inferred',evidence:call.e,moduleId:r.mid,parent:flow});edge(flow,sid,'Contains',call.e,'inferred','函数内调用');edge(sid,call.target,'RelatedTo',call.e,'inferred','静态名称匹配');if(previous)edge(previous,sid,'FlowsTo',call.e,'inferred','源码顺序，不是已验证控制流');previous=sid;});
      }
    }
    const candidates=[...r.routes,...r.functions.filter(fn=>r.symbols.get(fn.name)?.exported).map(fn=>({id:fn.id,name:fn.name,e:nodes.get(fn.id).evidence}))];
    for(const c of candidates){
      const cap=id('cap',c.id);node({id:cap,type:'ProductCapability',name:c.name,summary:'从接口或导出函数提取的产品能力候选；需确认用户场景和实际开放状态。',status:'inferred',evidence:c.e,moduleId:r.mid,layer:r.layer,userProblem:'仅凭静态入口无法确认用户问题。',value:'需要产品经理结合实际使用场景确认。',mechanism:`由 ${r.f.path} 中的 ${c.name} 入口提供实现线索。`});edge(r.mid,cap,'Implements',c.e,'inferred','入口到产品能力的候选映射');edge(cap,c.id,'RelatedTo',c.e,'inferred','源码入口证据');
    }
  }
  if(scan.truncated)g.warnings.push('扫描达到资源上限，当前结果不覆盖全仓库。');
  if(scan.files.some(f=>!['JavaScript','TypeScript','Metadata'].includes(f.language)))g.warnings.push('非 JS/TS 文件目前仅提供模块和文件结构，未证明符号、调用或产品能力。');
  g.nodes=[...nodes.values()];g.edges=[...edges.values()];g.evidence=[...evidence.values()];return g;
}
