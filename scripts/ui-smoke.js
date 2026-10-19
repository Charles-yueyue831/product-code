import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { analyze } from '../analyzer/index.js';
import { html } from '../graph/export.js';
import { pathToFileURL } from 'node:url';
import { serve } from '../plugin/server.js';
const executablePath=process.env.CHROME_PATH;
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{})});
const graph=await analyze(await fs.realpath(new URL('../tests/fixtures/modules',import.meta.url)));
const server=await serve(await html(graph));const errors=[],requests=[];const started=Date.now();
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
 await page.goto(server.url);await page.locator('#graph canvas').first().waitFor();
 assert.match(await page.locator('#counts').textContent(),/显示 7 \/ 7/);
 for(const view of ['capabilities','architecture','flows','dependencies','overview']){await page.locator(`[data-view="${view}"]`).click();assert.equal(await page.locator(`[data-view="${view}"]`).getAttribute('aria-current'),'page');assert(!/显示 0/.test(await page.locator('#counts').textContent()));}
 await page.locator('#search').fill('createInstance');await page.locator('#results button').first().click();assert.match(await page.locator('#detail-body').textContent(),/代码证据/);assert.match(await page.locator('#detail-body').textContent(),/推断存在|已由代码证实/);
 await page.getByRole('button',{name:'恢复默认',exact:true}).click();await page.locator('[data-view="dependencies"]').click();await page.locator('footer details').first().locator('summary').click();await page.locator('#node-list').getByRole('button',{name:'service',exact:true}).click();
 await page.getByRole('button',{name:'展开代码细节',exact:true}).click();assert(!/显示 3 \/ 3/.test(await page.locator('#counts').textContent()));await page.getByRole('button',{name:'折叠代码细节',exact:true}).click();assert.match(await page.locator('#counts').textContent(),/显示 3 \/ 3/);
 await page.locator('#detail-body button').filter({hasText:'createInstance · Implements'}).click();assert.equal(await page.locator('#detail-body h2').textContent(),'createInstance');
 await page.locator('#detail-body button').filter({hasText:'service · Implements'}).click();assert.equal(await page.locator('#detail-body h2').textContent(),'service');
 await page.getByRole('button',{name:'上游依赖',exact:true}).click();await page.getByRole('button',{name:'展开两级',exact:true}).click();await page.getByRole('button',{name:'放大',exact:true}).click();await page.getByRole('button',{name:'缩小',exact:true}).click();
 await page.locator('#group').selectOption('layer');await page.getByRole('button',{name:'自动布局',exact:true}).click();
 const box=await page.locator('#graph').boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+50,box.y+box.height/2+30,{steps:8});await page.mouse.up();
 await page.getByRole('button',{name:'恢复默认',exact:true}).click();await page.screenshot({path:process.env.SCREENSHOT_PATH||'/tmp/codebase-insight-dashboard.png',fullPage:true});
 const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'导出 JSON',exact:true}).click();const download=await downloadPromise;assert.equal(download.suggestedFilename(),'knowledge-graph.json');
 await page.setViewportSize({width:390,height:844});assert(await page.locator('body').evaluate(e=>e.scrollWidth<=window.innerWidth));
 const big=structuredClone(graph);big.nodes=Array.from({length:1000},(_,i)=>({id:'module:'+i,type:'TechnicalModule',name:'模块 '+i,summary:'规模夹具',status:'inferred',evidence:[]}));big.edges=[];
 const largeServer=await serve(await html(big));try{const tick=Date.now();await page.setViewportSize({width:1440,height:1000});await page.goto(largeServer.url);await page.locator('#graph canvas').first().waitFor();assert.match(await page.locator('#counts').textContent(),/显示 120 \/ 1000/);await page.getByRole('button',{name:'再显示 120 个节点'}).click();assert.match(await page.locator('#counts').textContent(),/显示 240 \/ 1000/);console.log(JSON.stringify({largeGraph:{nodes:1000,initialVisible:120,expandedVisible:240,durationMs:Date.now()-tick},environment:{platform:os.platform(),arch:os.arch(),node:process.version,browser:browser.version(),viewport:'1440x1000'}}));}finally{largeServer.close();}
 const offlineDir=await fs.mkdtemp(path.join(os.tmpdir(),'insight-offline-'));try{const offlineFile=path.join(offlineDir,'dashboard.html');await fs.writeFile(offlineFile,await html(graph));await page.goto(pathToFileURL(offlineFile).href);await page.locator('#graph canvas').first().waitFor();assert.match(await page.locator('#counts').textContent(),/显示 7 \/ 7/);}finally{await fs.rm(offlineDir,{recursive:true,force:true});}assert.deepEqual(errors,[]);assert(requests.every(url=>url.startsWith('http://127.0.0.1:')||url.startsWith('file:')));
 console.log(JSON.stringify({ok:true,durationMs:Date.now()-started,checks:['五视图','详情与证据','搜索定位','双向关联跳转','展开折叠','布局/缩放按钮/拖动','JSON 下载','离线 HTML 重新打开','390px 响应布局','1000节点分层渲染','无外部网络请求'],limits:'按钮和手势执行通过；未做截图像素级变换断言。未覆盖真人产品经理体验。'}));
}finally{server.close();await browser.close();}
