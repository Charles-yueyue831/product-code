import http from 'node:http';
import { randomBytes } from 'node:crypto';
export async function serve(page,signal){
 signal?.throwIfAborted();const token=randomBytes(24).toString('hex');
 const server=http.createServer((req,res)=>{
   const address=server.address(),host=`127.0.0.1:${address.port}`;
   if(req.headers.host!==host||!['GET','HEAD'].includes(req.method)||req.url!==`/${token}/`){res.writeHead(404);res.end();return;}
   res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','X-Content-Type-Options':'nosniff','Cache-Control':'no-store','Referrer-Policy':'no-referrer','Content-Security-Policy':"frame-ancestors 'none'"});res.end(req.method==='HEAD'?'':page);
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 const close=()=>{server.closeAllConnections();server.close();signal?.removeEventListener('abort',close);};
 signal?.addEventListener('abort',close,{once:true});if(signal?.aborted)close();
 return {url:`http://127.0.0.1:${server.address()?.port}/${token}/`,close};
}
