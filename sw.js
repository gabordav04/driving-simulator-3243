const CACHE_NAME='ds3243-shell-v4';
const APP_SHELL=['/','/index.html','/styles.css','/src/main.js','/manifest.webmanifest'];
self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE_NAME);
    await Promise.allSettled(APP_SHELL.map(url=>cache.add(url)));
  })());
});
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(key=>key.startsWith('ds3243-shell-')&&key!==CACHE_NAME).map(key=>caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('message',event=>{
  if(event.data==='SKIP_WAITING') self.skipWaiting();
});
self.addEventListener('fetch',event=>{
  const request=event.request;
  const url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==self.location.origin)return;
  if(request.mode==='navigate'){
    event.respondWith((async()=>{
      try{
        const response=await fetch(request,{cache:'no-store'});
        const cache=await caches.open(CACHE_NAME);
        cache.put('/index.html',response.clone());
        return response;
      }catch{
        return (await caches.match('/index.html'))||Response.error();
      }
    })());
    return;
  }
  const networkFirst=/\\.(?:js|css|json)$/.test(url.pathname);
  event.respondWith((async()=>{
    const cached=await caches.match(request);
    if(networkFirst){
      try{const response=await fetch(request,{cache:'no-store'});if(response&&response.ok){const cache=await caches.open(CACHE_NAME);await cache.put(request,response.clone());}return response;}
      catch{return cached||Response.error();}
    }
    const update=fetch(request).then(async response=>{
      if(response&&response.ok){const cache=await caches.open(CACHE_NAME);await cache.put(request,response.clone());}
      return response;
    }).catch(()=>null);
    return cached||(await update)||Response.error();
  })());
});
