import cytoscape from 'cytoscape';
import './app.css';
const g=JSON.parse(document.getElementById('graph-data').textContent);
const nodes=new Map(g.nodes.map(n=>[n.id,n])),evidence=new Map(g.evidence.map(e=>[e.id,e]));
const status={confirmed:'已由代码证实',partial:'部分实现',inferred:'推断存在',unknown:'无法确认'};
const types={ProductCapability:'产品能力',TechnicalModule:'技术模块',ArchitectureLayer:'逻辑架构层',BusinessDomain:'业务领域',BusinessFlow:'业务流程',FlowStep:'流程步骤',File:'源码文件',Function:'函数',Class:'类',API:'接口线索'};
const viewLabels={overview:'产品全景',capabilities:'能力地图',architecture:'技术架构',flows:'业务流程',dependencies:'模块依赖'};
const $=s=>document.querySelector(s);
const el=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
const button=(label,fn)=>{const b=el('button',label);b.type='button';b.onclick=fn;return b;};
const state={view:'overview',level:1,filter:'all',query:'',limit:120,expanded:new Set(),focus:null,history:[],group:'none',direction:'both',depth:1};
const app=$('#app');
app.innerHTML='<aside class="sidebar"><div class="brand">Codebase<br><strong>Insight</strong></div><p class="tagline">从产品能力，理解代码</p><nav aria-label="图谱视图"></nav><label class="search-label" for="search">查找能力或模块</label><input id="search" placeholder="输入名称、接口或技术关键词"><div id="results" aria-live="polite"></div><div class="sidebar-foot">本地分析 · 无遥测<br>结论附带代码证据</div></aside><section class="workspace"><header><div><p class="eyebrow">产品技术地图</p><h1 id="title"></h1><p id="description"></p></div><div class="exports"></div></header><div class="notice">代码实现不等于已经上线。虚线关系表示推断；架构分层不代表实际部署。</div><div class="controls"><label>理解层级 <select id="level"><option value="1">产品视角</option><option value="2">架构视角</option><option value="3">代码视角</option></select></label><label>可信状态 <select id="status"><option value="all">全部状态</option><option value="confirmed">已由代码证实</option><option value="inferred">推断存在</option><option value="partial">部分实现</option><option value="unknown">无法确认</option></select></label><label>聚合 <select id="group"><option value="none">不聚合</option><option value="layer">按逻辑层</option><option value="module">按所属模块</option></select></label></div><div class="breadcrumb"><button id="back">返回上一级</button><span id="crumb">产品全景</span></div><div class="graph-wrap"><div id="graph" aria-label="可缩放拖拽的知识图谱"></div><div id="empty" hidden></div><div class="graph-toolbar"></div><div class="legend"><i></i> 技术模块 <i class="cap"></i> 产品能力 <span>虚线：推断关系</span></div></div><footer><span id="counts"></span><button id="more" hidden>再显示 120 个节点</button><details><summary>当前节点列表（键盘可访问）</summary><div id="node-list"></div></details><details><summary>分析覆盖与限制</summary><div id="warnings"></div></details></footer></section><aside class="detail" aria-label="节点详情"><div id="detail-body"></div></aside>';
$('#title').textContent=g.project.name;$('#description').textContent=g.project.description;
const download=(name,body,type='application/json')=>{const url=URL.createObjectURL(new Blob([body],{type})),a=el('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
$('.exports').append(button('导出 JSON',()=>download('knowledge-graph.json',JSON.stringify(g,null,2))),button('导出报告',()=>download('analysis-report.md',`# ${g.project.name}\n\n${g.project.description}\n\n`+g.nodes.filter(n=>n.type==='ProductCapability').map(n=>`## ${n.name}\n\n${status[n.status]}：${n.summary}\n\n${n.mechanism||''}\n\n证据：${n.evidence.map(id=>{const e=evidence.get(id);return e.file+':'+e.line;}).join('、')}`).join('\n\n')+'\n\n'+g.warnings.join('\n'),'text/markdown')));
for(const [key,label] of Object.entries(viewLabels)){const b=button(label,()=>{state.history.push({view:state.view,id:state.focus});state.view=key;state.focus=null;render();});b.dataset.view=key;$('nav').append(b);}
for(const warning of [g.metadata.coverage,...g.warnings])$('#warnings').append(el('p',warning));
const cy=cytoscape({container:$('#graph'),minZoom:0.15,maxZoom:3,wheelSensitivity:0.22,style:[
 {selector:'node',style:{'background-color':'#2864b4','label':'data(label)','color':'#183550','font-size':12,'text-wrap':'wrap','text-max-width':140,'text-valign':'bottom','text-margin-y':10,'width':42,'height':42,'border-width':4,'border-color':'#fff'}},
 {selector:'node[type="ProductCapability"]',style:{'background-color':'#167c80','shape':'round-rectangle','width':56,'height':40}},
 {selector:'node[type="ArchitectureLayer"],node[type="Group"]',style:{'background-color':'#dbe5ef','shape':'round-rectangle','background-opacity':0.4,'border-width':1,'border-color':'#a7bbcf','text-valign':'top','padding':25}},
 {selector:'node[type="File"],node[type="Function"],node[type="Class"]',style:{'background-color':'#8599ad','width':26,'height':26}},
 {selector:'node[type="FlowStep"]',style:{'shape':'round-rectangle','background-color':'#167c80','width':44,'height':34}},
 {selector:'edge',style:{'width':1.6,'line-color':'#a2b7cb','target-arrow-color':'#a2b7cb','target-arrow-shape':'triangle','curve-style':'bezier','arrow-scale':0.8}},
 {selector:'edge[status="inferred"]',style:{'line-style':'dashed'}},
 {selector:'.dim',style:{'opacity':0.15}},{selector:'.highlight',style:{'border-color':'#e5b257','border-width':5,'line-color':'#167c80','target-arrow-color':'#167c80','width':3}},
 {selector:'node:selected',style:{'border-color':'#e5b257','border-width':5}}
]});
function viewNodes(){
 const included={overview:['ProductCapability','TechnicalModule'],capabilities:['ProductCapability','TechnicalModule'],architecture:['ArchitectureLayer','TechnicalModule'],flows:['BusinessFlow','FlowStep'],dependencies:['TechnicalModule']}[state.view];
 let list=g.nodes.filter(n=>included.includes(n.type));
 if(state.level>=2&&state.view==='overview')list.push(...g.nodes.filter(n=>n.type==='ArchitectureLayer'));
 if(state.level===3||state.expanded.size)list.push(...g.nodes.filter(n=>state.expanded.has(n.moduleId)&&['File','Function','Class','API','BusinessFlow'].includes(n.type)));
 if(state.filter!=='all')list=list.filter(n=>n.status===state.filter);
 const found=state.query?new Set(search(state.query).map(n=>n.id)):null;
 if(found)list=list.filter(n=>found.has(n.id));
 if(state.focus&&!list.some(n=>n.id===state.focus)&&nodes.has(state.focus))list.unshift(nodes.get(state.focus));
 return [...new Map(list.map(n=>[n.id,n])).values()];
}
function render(){
 const all=viewNodes(),list=all.slice(0,state.limit),ids=new Set(list.map(n=>n.id));
 const elements=list.map(n=>({data:{id:n.id,label:n.name,type:n.type,status:n.status}}));
 const groups=new Set();
 if(state.group!=='none')for(const item of elements){const n=nodes.get(item.data.id),key=state.group==='layer'?n.layer:n.moduleId?nodes.get(n.moduleId)?.name:null;if(key){const pid='group:'+key;item.data.parent=pid;groups.add(key);}}
 for(const key of groups)elements.push({data:{id:'group:'+key,label:key,type:'Group'}});
 for(const e of g.edges)if(ids.has(e.source)&&ids.has(e.target))elements.push({data:{...e}});
 cy.elements().remove();cy.add(elements);layout();
 $('nav').querySelectorAll('button').forEach(b=>{b.classList.toggle('active',b.dataset.view===state.view);b.setAttribute('aria-current',b.dataset.view===state.view?'page':'false');});
 $('#crumb').textContent=viewLabels[state.view]+(state.focus?' / '+nodes.get(state.focus)?.name:'');
 $('#counts').textContent=`显示 ${list.length} / ${all.length} 个节点 · 全图 ${g.nodes.length} 个节点`;
 $('#more').hidden=all.length<=state.limit;$('#empty').hidden=list.length>0;$('#empty').textContent='当前范围没有可展示的证据。请切换视图、清除筛选或扩大分析覆盖范围。';
 $('#node-list').replaceChildren(...list.map(n=>button(n.name,()=>select(n.id))));
 if(state.focus)highlight(state.focus);else intro();
}
function layout(){cy.layout({name:state.view==='flows'?'breadthfirst':state.group==='none'?'circle':'cose',directed:true,animate:false,padding:45,nodeRepulsion:12000,idealEdgeLength:130,numIter:600,avoidOverlap:true,nodeDimensionsIncludeLabels:true,fit:true}).run();}
function intro(){const panel=$('#detail-body');panel.replaceChildren(el('p','阅读路径','eyebrow'),el('h2','从一个能力开始'),el('p','点击图中的节点，查看它解决的问题、对应技术模块与源码证据。'),el('p','先看能力，再看架构，最后按需深入代码。','hint'));const list=g.nodes.filter(n=>n.type==='ProductCapability').slice(0,6);for(const n of list)panel.append(button(n.name,()=>select(n.id)));if(!list.length)panel.append(el('p','尚未提取产品能力。可在明确授权后使用 Harness 模型语义增强，或检查源码语言覆盖范围。'));}
function reachable(id,direction='both',depth=1){let visited=new Set([id]),front=[id];for(let i=0;i<depth;i++){const next=[];for(const e of g.edges){if(direction!=='up'&&front.includes(e.source)&&!visited.has(e.target)){visited.add(e.target);next.push(e.target);}if(direction!=='down'&&front.includes(e.target)&&!visited.has(e.source)){visited.add(e.source);next.push(e.source);}}front=next;}return visited;}
function highlight(id){const ids=reachable(id,state.direction,state.depth);cy.elements().removeClass('dim highlight');cy.nodes().filter(n=>!ids.has(n.id())).addClass('dim');cy.nodes().filter(n=>ids.has(n.id())).addClass('highlight');cy.edges().forEach(e=>e.toggleClass('dim',!ids.has(e.source().id())||!ids.has(e.target().id())));cy.getElementById(id).select();}
function select(id,push=true){const n=nodes.get(id);if(!n)return;if(push&&state.focus!==id)state.history.push({view:state.view,id:state.focus});state.focus=id;
 if(!cy.getElementById(id).length)render();
 highlight(id);const target=cy.getElementById(id);if(target.length)cy.center(target);
 $('#crumb').textContent=viewLabels[state.view]+' / '+n.name;
 const panel=$('#detail-body');panel.replaceChildren(el('p',types[n.type]||n.type,'eyebrow'),el('h2',n.name),el('span',status[n.status],'status '+n.status),el('p',n.summary));
 for(const [label,value]of [['用户问题',n.userProblem],['产品价值',n.value],['实现机制',n.mechanism],['所属逻辑层',n.layer]])if(value)panel.append(el('h3',label),el('p',value));
 if(n.type==='TechnicalModule')panel.append(button(state.expanded.has(id)?'折叠代码细节':'展开代码细节',()=>{state.expanded.has(id)?state.expanded.delete(id):state.expanded.add(id);render();select(id,false);}));
 panel.append(el('h3','关联节点'));
 const related=g.edges.filter(e=>e.source===id||e.target===id);
 for(const e of related.slice(0,35)){const other=nodes.get(e.source===id?e.target:e.source);panel.append(button(`${other.name} · ${e.type} · ${status[e.status]}`,()=>select(other.id)));}
 const actions=el('div',undefined,'relation-actions');actions.append(button('上游依赖',()=>{state.direction='up';highlight(id);}),button('下游依赖',()=>{state.direction='down';highlight(id);}),button('展开两级',()=>{state.depth=2;state.direction='both';highlight(id);}),button('隐藏无关',()=>{const ids=reachable(id,state.direction,state.depth);cy.nodes().filter(n=>!ids.has(n.id())&&!n.isParent()).hide();cy.fit(undefined,40);}));panel.append(actions);
 panel.append(el('h3','代码证据'));
 for(const ref of n.evidence){const e=evidence.get(ref),detail=el('details');detail.append(el('summary',`${e.file}:${e.line}–${e.endLine}`),el('pre',e.snippet));panel.append(detail);}
 if(!n.evidence.length)panel.append(el('p','没有代码证据，无法确认。'));
 panel.append(el('p','证据为分析时的脱敏快照；源文件变化后应重新分析。','hint'));
}
function search(query){const q=query.trim().toLowerCase();if(!q)return [];const terms=q.split(/[\s，。？?]+/).filter(Boolean);return g.nodes.map(n=>({n,score:terms.reduce((sum,t)=>sum+(JSON.stringify(n).toLowerCase().includes(t)?1:0),0)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).map(x=>x.n);}
$('#search').oninput=e=>{state.query=e.target.value;const result=search(state.query).slice(0,20);$('#results').replaceChildren(...result.map(n=>button(n.name,()=>select(n.id))));render();};
$('#level').onchange=e=>{state.level=Number(e.target.value);if(state.level===3&&state.focus){const n=nodes.get(state.focus);state.expanded.add(n.type==='TechnicalModule'?n.id:n.moduleId);}render();};
$('#status').onchange=e=>{state.filter=e.target.value;render();};$('#group').onchange=e=>{state.group=e.target.value;render();};
$('#more').onclick=()=>{state.limit+=120;render();};
$('#back').onclick=()=>{const prev=state.history.pop();if(!prev)return;state.view=prev.view;state.focus=prev.id;render();if(prev.id)select(prev.id,false);};
$('.graph-toolbar').append(button('放大',()=>cy.zoom({level:Math.min(3,cy.zoom()*1.3),renderedPosition:{x:cy.width()/2,y:cy.height()/2}})),button('缩小',()=>cy.zoom({level:Math.max(.15,cy.zoom()/1.3),renderedPosition:{x:cy.width()/2,y:cy.height()/2}})),button('自动布局',layout),button('恢复默认',()=>{state.view='overview';state.focus=null;state.query='';state.filter='all';state.group='none';state.level=1;state.limit=120;state.direction='both';state.depth=1;state.expanded.clear();state.history=[];$('#search').value='';$('#results').replaceChildren();$('#status').value='all';$('#group').value='none';$('#level').value='1';render();}));
cy.on('tap','node',e=>select(e.target.id()));
render();
