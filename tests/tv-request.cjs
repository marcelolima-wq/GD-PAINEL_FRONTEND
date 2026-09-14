const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(require('node:path').join(__dirname,'../js/app.js'),'utf8');
const context={AbortController,setTimeout,clearTimeout};
vm.createContext(context);
vm.runInContext(source.slice(source.indexOf('async function tvRequest('),source.indexOf('async function fetchTvState(')),context);
(async()=>{
  context.fetch=async()=>({ok:true,json:async()=>({version:'ok'})});
  assert.equal((await context.tvRequest('/api/tv')).version,'ok');
  context.fetch=async()=>({ok:false,status:404,json:async()=>({error:'Deleted'})});
  await assert.rejects(context.tvRequest('/api/tv'),e=>e.status===404);
  context.fetch=(_url,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('aborted'))));
  await assert.rejects(context.tvRequest('/api/tv',{},10),/aborted/);
  context.fetch=async(_url,{signal})=>({ok:true,json:()=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('body aborted'))))});
  await assert.rejects(context.tvRequest('/api/tv',{},10),/body aborted/);
  console.log('PASS: success, HTTP errors, connection timeout, response-body timeout');
})().catch(error=>{console.error(error);process.exitCode=1});
