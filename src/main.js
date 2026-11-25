window.__dsMainStarted=true;
let THREE=null;
const $ = (s) => document.querySelector(s);
if('serviceWorker' in navigator){
 let appRegistration=null,updateReloading=false,latestAppVersion=null;
 const notice=document.querySelector('#appUpdateNotice');
 const showUpdate=()=>{if(notice)notice.hidden=false;};
 const checkAppVersion=async()=>{
  try{
   const response=await fetch('/version.json?check='+Date.now(),{cache:'no-store'});
   if(!response.ok)return;
   const data=await response.json();latestAppVersion=String(data.version||'');
   if(!latestAppVersion)return;
   const saved=localStorage.getItem('ds3243.appVersion');
   if(!saved)localStorage.setItem('ds3243.appVersion',latestAppVersion);
   else if(saved!==latestAppVersion)showUpdate();
  }catch(error){console.warn('App version check failed',error);}
 };
 window.addEventListener('load',async()=>{
  try{
   appRegistration=await navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'});
   if(appRegistration.waiting&&navigator.serviceWorker.controller)showUpdate();
   appRegistration.addEventListener('updatefound',()=>{
    const worker=appRegistration.installing;
    worker?.addEventListener('statechange',()=>{
     if(worker.state==='installed'&&navigator.serviceWorker.controller)showUpdate();
    });
   });
   appRegistration.update().catch(()=>{});
   await checkAppVersion();
  }catch(error){console.warn('PWA update check failed',error);}
 });
 document.querySelector('#applyAppUpdate')?.addEventListener('click',()=>{
  if(latestAppVersion)localStorage.setItem('ds3243.appVersion',latestAppVersion);
  const waiting=appRegistration?.waiting;
  if(waiting){waiting.postMessage('SKIP_WAITING');}
  else{window.location.reload();}
 });
 navigator.serviceWorker.addEventListener('controllerchange',()=>{
  if(updateReloading)return;
  updateReloading=true;
  window.location.reload();
 });
 const checkForAppUpdate=()=>{if(document.visibilityState==='visible'){appRegistration?.update().catch(()=>{});checkAppVersion();}};
 document.addEventListener('visibilitychange',checkForAppUpdate);
 window.addEventListener('pageshow',checkForAppUpdate);
}
const pwaHint=$('#pwaInstallHint');
if(pwaHint && !localStorage.getItem('ds3243.pwaHint.dismissed') && /iPhone|iPad|iPod/i.test(navigator.userAgent) && !window.matchMedia('(display-mode: standalone)').matches && !navigator.standalone){pwaHint.hidden=false;}
$('#dismissPwaHint')?.addEventListener('click',()=>{localStorage.setItem('ds3243.pwaHint.dismissed','1');pwaHint.hidden=true;});
const routeFiles = Array.from({length:10},(_,i)=>({id:i+1,url:i===0?'https://web.testpdr.com/storage/markdown-images/N851zFQU66UmxN3nn9vVQ1vXGWTFCu15tnfZS5zY.jpg':null}));
const route=$('#route');
routeFiles.forEach(r=>{const o=document.createElement('option');o.value=r.id;o.textContent=`Маршрут №${r.id}`;route.append(o)});
function showRoute(){
 const r=routeFiles.find(x=>x.id===Number(route.value));
 const img=$('#routeImage'),box=$('.routeimg');
 img.onerror=()=>{img.style.display='none';box.classList.add('no-image');$('#routeCaption').textContent='Схему цього маршруту ще не додано.';};
 img.onload=()=>{img.style.display='block';box.classList.remove('no-image');};
 if(r?.url){img.src=r.url;$('#routeCaption').textContent='Офіційна схема маршруту №1';}
 else{img.removeAttribute('src');img.style.display='none';box.classList.add('no-image');$('#routeCaption').textContent='Схему цього маршруту ще не додано.';}
}
route.addEventListener('change',showRoute);showRoute();

// Google Maps: the browser key is stored locally and is never committed to GitHub.
const MAPS_KEY='ds3243.googlemaps.key.v1';
let googleMap=null, mapsLoaded=false, mapVisible=false, driverVisible=false, streetPanorama=null, streetService=null, lastPanoRequest=0, lastPanoMeters=-100;
const ROUTE1_POINTS_KEY='ds3243.route1.controlPoints.v1';
let routeEditEnabled=false, routePoints=[], routePointMarkers=[], routeLine=null;
let selectedRoutePointIndex=-1;
let insertRoutePointAfterSelected=false;
let routePath=[], routeCar=null, routePathMeters=[], routeProgressMeters=0, mapDriving=false;
const ROUTE1_PATH_KEY='ds3243.route1.roadPath.v1';
const ROUTE1_PREVIEW_CLEANUP_KEY='ds3243.route1.removeOldPreview.v1';
if(!localStorage.getItem(ROUTE1_PREVIEW_CLEANUP_KEY)){
  localStorage.removeItem(ROUTE1_PATH_KEY);
  localStorage.setItem(ROUTE1_PREVIEW_CLEANUP_KEY,'1');
}
function haversine(a,b){const R=6371000,rad=x=>x*Math.PI/180,dLat=rad(b.lat-a.lat),dLng=rad(b.lng-a.lng),x=Math.sin(dLat/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dLng/2)**2;return 2*R*Math.asin(Math.sqrt(x));}
function carMapIcon(){return null;}
function ensureMapCar(position){
  if(!googleMap||!google.maps?.Marker)return;
  const point=position||googleMap.getCenter()?.toJSON()||{lat:50.503529,lng:30.841481};
  const carLabel={text:'🚗',fontSize:'34px',fontWeight:'normal'};
  if(!routeCar)routeCar=new google.maps.Marker({map:googleMap,position:point,title:'Навчальний автомобіль',zIndex:10000,label:carLabel,optimized:false});
  else {routeCar.setMap(googleMap);routeCar.setPosition(point);routeCar.setIcon(null);routeCar.setLabel(carLabel);}
}
function prepareRoutePath(path){
  routePath=path.map(p=>({lat:typeof p.lat==='function'?p.lat():p.lat,lng:typeof p.lng==='function'?p.lng():p.lng}));
  routePathMeters=[0];for(let i=1;i<routePath.length;i++)routePathMeters[i]=routePathMeters[i-1]+haversine(routePath[i-1],routePath[i]);
  routeProgressMeters=0;localStorage.setItem(ROUTE1_PATH_KEY,JSON.stringify(routePath));
  if(routeCar)routeCar.setMap(null);
  if(routeLine)routeLine.setMap(null);
  if(routePath.length){
    routeLine=new google.maps.Polyline({map:googleMap,path:routePath,strokeColor:'#075de5',strokeOpacity:.95,strokeWeight:7,zIndex:10});
    ensureMapCar(routePath[0]);
  }
}
function positionOnRoute(meters){
  if(!routePath.length)return null;
  const total=routePathMeters[routePathMeters.length-1]||0;meters=Math.max(0,Math.min(meters,total));
  let i=1;while(i<routePathMeters.length&&routePathMeters[i]<meters)i++;
  if(i>=routePath.length)return routePath[routePath.length-1];
  const a=routePath[i-1],b=routePath[i],span=routePathMeters[i]-routePathMeters[i-1],t=span?(meters-routePathMeters[i-1])/span:0;
  return {lat:a.lat+(b.lat-a.lat)*t,lng:a.lng+(b.lng-a.lng)*t};
}
function advanceMapCar(dt){
  if(!mapDriving||!routeCar||!routePathMeters.length)return;
  const total=routePathMeters[routePathMeters.length-1];
  routeProgressMeters=Math.max(0,Math.min(total,routeProgressMeters+speed*dt));
  routeLateralOffset=Math.max(-2.2,Math.min(2.2,routeLateralOffset+steering*1.25*dt));
  const base=positionOnRoute(routeProgressMeters);
  if(base){
    const heading=routeHeadingAt(routeProgressMeters),rad=heading*Math.PI/180;
    const latOffset=(routeLateralOffset/111320)*Math.cos(rad);
    const lngOffset=(routeLateralOffset/(111320*Math.max(.2,Math.cos(base.lat*Math.PI/180))))*-Math.sin(rad);
    routeCar.setPosition({lat:base.lat+latOffset,lng:base.lng+lngOffset});
  }
  if((speed>=0&&routeProgressMeters>=total)||(speed<0&&routeProgressMeters<=0)){
    if(speed>=0&&routeProgressMeters>=total){mapDriving=false;started=false;speed=0;say('Маршрут завершено','Ти доїхав до кінцевої точки прокладеної траєкторії.');}
  }
}
function renderRoutePointCount(){const el=$('#routePointCount');if(el)el.textContent='Точок: '+routePoints.length;}
function clearRouteMarkers(){routePointMarkers.forEach(m=>m.setMap(null));routePointMarkers=[];}
function drawRouteMarkers(){
  if(!googleMap||!google.maps?.Marker)return;
  clearRouteMarkers();
  routePoints.forEach((p,i)=>{
    const selected=i===selectedRoutePointIndex;
    const marker=new google.maps.Marker({
      map:googleMap,position:p,label:{text:String(i+1),color:selected?'#ffffff':'#17212b',fontWeight:'800'},
      title:'Точка '+(i+1)+' · натисни, щоб вибрати для видалення',
      zIndex:selected?2000:1000,
      icon:selected?{path:google.maps.SymbolPath.CIRCLE,scale:13,fillColor:'#e53935',fillOpacity:1,strokeColor:'#ffffff',strokeWeight:3}:undefined
    });
    marker.addListener('click',()=>{
      selectedRoutePointIndex=i;
      drawRouteMarkers();
      const del=$('#deleteSelectedRoutePoint');if(del)del.disabled=false;
      const insert=$('#insertRoutePointAfter');if(insert)insert.disabled=false;
      setRouteEditStatus('Вибрано точку №'+(i+1)+' із '+routePoints.length+'. Натисни «Видалити вибрану точку», якщо вона зайва.');
    });
    routePointMarkers.push(marker);
  });
  const del=$('#deleteSelectedRoutePoint');
  if(del)del.disabled=selectedRoutePointIndex<0||selectedRoutePointIndex>=routePoints.length;
  renderRoutePointCount();
}
function setRouteEditStatus(t){$('#routeEditStatus').textContent=t;}
function saveRoutePoints(){localStorage.setItem(ROUTE1_POINTS_KEY,JSON.stringify(routePoints));renderRoutePointCount();}
function addRoutePoint(latLng){
  const point={lat:latLng.lat(),lng:latLng.lng()};
  let addedIndex;
  if(insertRoutePointAfterSelected&&selectedRoutePointIndex>=0&&selectedRoutePointIndex<routePoints.length){
    addedIndex=selectedRoutePointIndex+1;
    routePoints.splice(addedIndex,0,point);
    selectedRoutePointIndex=addedIndex;
  }else{
    routePoints.push(point);
    addedIndex=routePoints.length-1;
  }
  saveRoutePoints();drawRouteMarkers();
  const insertButton=$('#insertRoutePointAfter');if(insertRoutePointAfterSelected&&insertButton)insertButton.textContent='✓ Додавати після точки №'+(selectedRoutePointIndex+1);
  setRouteEditStatus('Додано точку №'+(addedIndex+1)+(insertRoutePointAfterSelected?' після вибраної. Усі наступні точки перенумеровано.':' в кінець маршруту.')+' Натисни «Побудувати дорогу».');
}
const mapInput=$('#mapsKey'), mapStatus=$('#mapsKeyStatus');
const googleDiagMessages=[];
function recordGoogleDiag(kind,message){
 const line='['+new Date().toISOString()+'] '+kind+': '+String(message);
 if(/google|maps|routes?|api key|billing|referrer|quota|network|script/i.test(line)){
  googleDiagMessages.push(line);
  if(googleDiagMessages.length>30)googleDiagMessages.shift();
 }
}
const originalConsoleError=console.error.bind(console),originalConsoleWarn=console.warn.bind(console);
console.error=(...args)=>{recordGoogleDiag('console.error',args.map(x=>{try{return typeof x==='string'?x:JSON.stringify(x);}catch{return String(x);}}).join(' '));originalConsoleError(...args);};
console.warn=(...args)=>{recordGoogleDiag('console.warn',args.map(x=>typeof x==='string'?x:JSON.stringify(x)).join(' '));originalConsoleWarn(...args);};
window.addEventListener('error',e=>recordGoogleDiag('window.error',(e.message||'unknown')+' '+(e.filename||'')+':'+(e.lineno||'')));
window.addEventListener('error',e=>{
 if(e.target&&e.target.tagName==='SCRIPT'&&/googleapis|gstatic/i.test(e.target.src||''))recordGoogleDiag('Google script resource error',(e.target.src||'').split('?')[0]);
},true);
window.addEventListener('unhandledrejection',e=>recordGoogleDiag('unhandledrejection',e.reason?.message||e.reason||'unknown'));
function buildGoogleDiagReport(){
 const key=localStorage.getItem(MAPS_KEY)||'';
 const script=document.querySelector('script[data-ds-google-maps]');
 const mapEl=$('#googleMap');
 const rect=mapEl?.getBoundingClientRect();
 const info=[
 'DS3243 Google Maps diagnostic',
 'URL: '+location.href,
 'Time: '+new Date().toISOString(),
 'API key saved in this browser: '+(key?'YES (value hidden)':'NO'),
 'Google script element: '+(script?'present':'missing'),
 'Google script status: '+(script?.readyState|| (script?.dataset.loaded||'unknown')),
 'window.google.maps: '+(!!window.google?.maps),
 'google.maps.importLibrary: '+(!!window.google?.maps?.importLibrary),
 'Map instance created: '+(!!googleMap),
 'Map container size: '+(rect?Math.round(rect.width)+'x'+Math.round(rect.height):'missing'),
 'Map container display: '+(mapEl?getComputedStyle(mapEl).display:'missing'),
 'Map data-ready: '+(mapEl?.dataset.mapReady||'no'),
 'Map data-error: '+(mapEl?.dataset.mapError||'none'),
 'Auth failure callback: '+(mapsAuthFailed?'FIRED':'not fired'),
 'Main module started: '+(window.__dsMainStarted?'YES':'NO'),
 'Main module reached map initialization: '+(window.__dsMainReachedMapInit?'YES':'NO'),
 'Map view state: '+(mapVisible?'visible':'hidden'),
 'Early JavaScript errors (captured before app startup):',
 ...((window.__dsEarlyErrors&&window.__dsEarlyErrors.length)?window.__dsEarlyErrors:['None captured']),
 'Current map type: '+(googleMap?.getMapTypeId?.()||'not available'),
 'Current zoom: '+(googleMap?.getZoom?.()??'not available'),
 'Captured Google/browser errors:',
 ...(googleDiagMessages.length?googleDiagMessages:['No matching console errors captured'])
 ];
 return info.join('\n');
}
function refreshGoogleDiag(){const pre=$('#googleDiagReport');if(pre)pre.textContent=buildGoogleDiagReport();}
$('#googleDiagToggle')?.addEventListener('click',()=>{const box=$('#googleDiagDetails');box.hidden=!box.hidden;if(!box.hidden)refreshGoogleDiag();});
$('#googleDiagCopy')?.addEventListener('click',async()=>{refreshGoogleDiag();try{await navigator.clipboard.writeText($('#googleDiagReport').textContent);$('#googleDiagCopy').textContent='Звіт скопійовано';}catch{$('#googleDiagCopy').textContent='Виділи звіт і скопіюй вручну';}});

mapInput.value=localStorage.getItem(MAPS_KEY)||'';
function setMapMessage(message){$('#mapMessage').textContent=message;}
let mapsAuthFailed=false;
window.gm_authFailure=function(){
  mapsAuthFailed=true;
  recordGoogleDiag('Google Maps auth failure','gm_authFailure callback fired; API key, billing, referrer or API restrictions may be invalid.');
  setMapMessage('Google відхилив авторизацію. Відкрий «Діагностика Google» для точного звіту.');
  mapStatus.textContent='Google не авторизував ключ. Діагностику записано.';
  refreshGoogleDiag();
};
async function loadGoogleMap(apiKey){
  if(!apiKey){
    setMapMessage('Немає збереженого Google Maps API-ключа. Відкрий «Ключ Google Maps» і збережи ключ.');
    return false;
  }
  try{
    if(!window.google?.maps?.importLibrary){
      mapsAuthFailed=false;
      setMapMessage('Підключаємо Google Maps…');
      let script=document.querySelector('script[data-ds-google-maps]');
      if(!window.__dsMapsLoadPromise){
        window.__dsMapsLoadPromise=new Promise((resolve,reject)=>{
          const timeout=setTimeout(()=>reject(new Error('Час очікування Google Maps вичерпано')),15000);
          const finish=()=>{clearTimeout(timeout);resolve();};
          const fail=()=>{clearTimeout(timeout);recordGoogleDiag('Google Maps script load','browser emitted script error');reject(new Error('Не вдалося завантажити скрипт Google Maps'));};
          if(window.google?.maps?.importLibrary){finish();return;}
          if(!script){
            script=document.createElement('script');
            script.dataset.dsGoogleMaps='1';
            script.async=true;
            script.defer=true;
            script.src='https://maps.googleapis.com/maps/api/js?key='+encodeURIComponent(apiKey)+'&v=weekly&language=uk&region=UA';
            script.addEventListener('load',finish,{once:true});
            script.addEventListener('error',fail,{once:true});
            document.head.appendChild(script);
          }else{
            script.addEventListener('load',finish,{once:true});
            script.addEventListener('error',fail,{once:true});
            const poll=setInterval(()=>{
              if(window.google?.maps?.importLibrary){clearInterval(poll);finish();}
            },150);
            setTimeout(()=>clearInterval(poll),15000);
          }
        }).catch(error=>{window.__dsMapsLoadPromise=null;throw error;});
      }
      await window.__dsMapsLoadPromise;
      if(!window.google?.maps?.importLibrary)throw new Error('Google Maps скрипт завантажився, але API не ініціалізувався');
      mapsLoaded=true;
      recordGoogleDiag('Google Maps script','loaded successfully');
    }else{mapsLoaded=true;recordGoogleDiag('Google Maps script','already available in window.google.maps');}
    if(mapsAuthFailed)throw new Error('Google відхилив API-ключ. Перевір доступ Maps JavaScript API, Billing та HTTP referrer.');
    const {Map}=await google.maps.importLibrary('maps');
    const mapElement=$('#googleMap');
    if(!mapElement)throw new Error('Не знайдено контейнер карти');
    if(!googleMap){
      googleMap=new Map(mapElement,{
        center:{lat:50.50336903085713,lng:30.84229163764248},
        zoom:17,minZoom:12,maxZoom:21,mapTypeId:'roadmap',
        mapTypeControl:false,zoomControl:false,streetViewControl:false,
        fullscreenControl:true,clickableIcons:true,
        gestureHandling:'greedy',scrollwheel:true,
        disableDoubleClickZoom:false,keyboardShortcuts:true
      });
      googleMap.addListener('idle',()=>{
        mapElement.dataset.mapReady='true';
        mapElement.dataset.mapError='';
        setMapMessage('Карта завантажена. Перетягуй її пальцем, масштабуй двома пальцями або кнопками +/−.');
      });
      googleMap.addListener('maptypeid_changed',updateMapLayerButtons);
    }else{
      googleMap.setOptions({gestureHandling:'greedy',scrollwheel:true,disableDoubleClickZoom:false});
    }
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    google.maps.event.trigger(googleMap,'resize');
    googleMap.setCenter(googleMap.getCenter()||{lat:50.50336903085713,lng:30.84229163764248});
    ensureMapCar(routePath.length?routePath[0]:googleMap.getCenter()?.toJSON());
    try{routePoints=JSON.parse(localStorage.getItem(ROUTE1_POINTS_KEY)||'[]');}catch{routePoints=[];}
    let hasSavedRoute=false;
    try{const savedPath=JSON.parse(localStorage.getItem(ROUTE1_PATH_KEY)||'[]');if(savedPath.length>1){prepareRoutePath(savedPath);hasSavedRoute=true;}}catch{}
    drawRouteMarkers();
    if(!googleMap.__routeEditorBound){
      googleMap.addListener('click',e=>{if(routeEditEnabled&&e.latLng){addRoutePoint(e.latLng);setRouteEditStatus('Точка '+routePoints.length+' збережена. Перемісти карту та познач наступний поворот або ділянку дороги.');}});
      googleMap.__routeEditorBound=true;
    }
    if(!mapsAuthFailed){
      if(hasSavedRoute)setMapMessage('Карта готова. Завантажено збережений маршрут, який ти проклав у редакторі.');
      else setMapMessage('Карта готова. Попередній автоматично намальований маршрут прибрано. Проклади свій маршрут у редакторі.');
    }
    updateMapLayerButtons();
    return true;
  }catch(error){
    recordGoogleDiag('DS3243 map initialization failed',error?.stack||error?.message||error);
    console.error('DS3243 Google Maps initialization failed:',error);
    const message=error?.message||'невідома помилка';
    refreshGoogleDiag();
    $('#googleMap').dataset.mapError=message;
    showMapFailure('Карта не завантажилася: '+message+'. Перевір інтернет та Google Maps API-ключ.');
    return false;
  }
}
$('#saveMapsKey').addEventListener('click',()=>{
  const value=mapInput.value.trim();
  if(!value){mapStatus.textContent='Встав API-ключ перед збереженням.';return;}
  localStorage.setItem(MAPS_KEY,value);
  mapStatus.textContent='Ключ збережено локально в цьому браузері.';
  loadGoogleMap(value);
});
function showMapFailure(message){
 const el=$('#mapMessage');el.style.display='block';
 el.innerHTML='';
 const text=document.createElement('span');text.textContent=message;el.appendChild(text);
 const retry=document.createElement('button');retry.type='button';retry.textContent='Повторити';retry.style.marginLeft='10px';
 retry.addEventListener('click',()=>{window.__dsMapsLoadPromise=null;const key=localStorage.getItem(MAPS_KEY);loadGoogleMap(key);});
 el.appendChild(retry);
}
function setView(showMap){
  mapVisible=showMap;driverVisible=false;
  $('#driverView').style.display='none';
  threeCanvas.style.display='none';
  $('.sim').classList.remove('view-clean');
  $('.sim').classList.toggle('map-active',showMap);
  $('#googleMap').style.display=showMap?'block':'none';
  $('#routeEditor').style.display=showMap?'block':'none';
  canvas.style.display=showMap?'none':'block';
  $('#mapMessage').style.display=showMap?'block':'none';
  $('#showMap').classList.toggle('active',showMap);
  $('#showDriver').classList.remove('active');
  $('.sim').classList.remove('view-clean');
  if(showMap){
    const key=localStorage.getItem(MAPS_KEY);
    if(key){recordGoogleDiag('Map initialization requested','setView(true) called; API loader scheduled');requestAnimationFrame(()=>{loadGoogleMap(key);});}
    else setMapMessage('Введи API-ключ Google Maps у лівій панелі та натисни «Зберегти ключ».');
  }
}
$('#showMap').addEventListener('click',()=>setView(true));
$('#routeEditorToggle')?.addEventListener('click',()=>{
 if(!mapVisible)setView(true);
 const editor=$('#routeEditor');
 editor.open=!editor.open;
 if(editor.open){
  setRouteEditStatus('Прокладання маршруту №1: обери «Додати точки», потім торкайся карти вздовж дороги. Перемикай «Карта / Супутник» для точнішої розмітки.');
  editor.scrollIntoView({block:'nearest',behavior:'smooth'});
 }
});
$('#exportRoutePoints')?.addEventListener('click',async()=>{
 const payload={route:1,source:'user-traced-on-ipad',createdAt:new Date().toISOString(),points:routePoints,path:routePath};
 const json=JSON.stringify(payload,null,2);
 try{await navigator.clipboard.writeText(json);setRouteEditStatus('Координати скопійовано. Встав їх сюди в чат — я зможу перевірити та перенести маршрут.');}
 catch{setRouteEditStatus('Не вдалося скопіювати автоматично. Точки збережені в цьому браузері; спробуй кнопку ще раз.');}
});

function updateMapLayerButtons(){
 const type=googleMap?.getMapTypeId?.()||'roadmap';
 $('#mapRoad')?.classList.toggle('active',type==='roadmap');
 $('#mapSatellite')?.classList.toggle('active',type==='satellite'||type==='hybrid');
}
function setMapLayer(type){
 if(!googleMap){setMapMessage('Спочатку дочекайся завантаження карти.');return;}
 googleMap.setMapTypeId(type);
 updateMapLayerButtons();
 setMapMessage(type==='roadmap'?'Звичайна карта активна.':'Супутниковий режим активний.');
}
$('#mapRoad')?.addEventListener('click',()=>setMapLayer('roadmap'));
$('#mapSatellite')?.addEventListener('click',()=>setMapLayer('hybrid'));
$('#mapZoomIn')?.addEventListener('click',()=>{if(googleMap)googleMap.setZoom(Math.min(21,(googleMap.getZoom()||17)+1));});
$('#mapZoomOut')?.addEventListener('click',()=>{if(googleMap)googleMap.setZoom(Math.max(12,(googleMap.getZoom()||17)-1));});

async function openDriverView(){
  driverVisible=true;mapVisible=false;
  $('#googleMap').style.display='none';$('#routeEditor').style.display='none';
  $('#mapMessage').style.display='none';canvas.style.display='none';
  $('#driverView').style.display='block';$('.sim').classList.remove('map-active');$('.sim').classList.add('view-clean');
  const show3DFallback=(message)=>{if(threeReady){$('#streetPanorama').style.display='none';threeCanvas.style.display='block';camera='cockpit';$('.sim').classList.remove('view-clean');$('#streetMessage').textContent=message+' Показано локальну 3D-сцену як резервний режим.';}else{$('#streetMessage').textContent=message;}};
  $('#showMap').classList.remove('active');$('#showDriver').classList.add('active');
  const key=localStorage.getItem(MAPS_KEY);
  if(!key){show3DFallback('Немає API-ключа Google Maps.');return;}
  const ready=await loadGoogleMap(key);
  if(ready&&!routePath.length){
    try{const saved=JSON.parse(localStorage.getItem(ROUTE1_PATH_KEY)||'[]');if(saved.length>1)prepareRoutePath(saved);}catch(error){console.warn('Could not restore saved road path for Street View',error);}
  }
  if(!ready||!window.google?.maps?.importLibrary){
    show3DFallback(mapsAuthFailed
      ?'Google відхилив API-ключ. Перевір обмеження ключа та Billing.'
      :'Google Maps не завантажився.');
    return;
  }
  try{
    const {StreetViewPanorama,StreetViewService}=await google.maps.importLibrary('streetView');
    if(!streetPanorama){
      streetPanorama=new StreetViewPanorama($('#streetPanorama'),{
        visible:false,pov:{heading:0,pitch:0},addressControl:true,fullscreenControl:true,
        linksControl:true,panControl:true,zoomControl:true,motionTracking:false
      });
      streetPanorama.addListener('status_changed',()=>{
        if(streetPanorama.getStatus?.()!=='OK')$('#streetMessage').textContent='Панорама не завантажилась. Перевір доступність Street View у цій місцевості.';
      });
    }
    if(!streetService)streetService=new StreetViewService();
    const target=routePath.length?positionOnRoute(routeProgressMeters):(googleMap?.getCenter()?.toJSON()||{lat:50.503529,lng:30.841481});
    $('#streetMessage').textContent='Шукаю найближчу панораму Street View…';
    let result=null,lastStatus='UNKNOWN_ERROR',lastError=null,checkedRadius=0;
    for(const radius of [80,250,1000]){
      checkedRadius=radius;
      try{
        const response=await new Promise((resolve,reject)=>{
          streetService.getPanorama({location:target,radius,preference:'NEAREST'},(data,status)=>{
            if(status==='OK'&&data)resolve({data,status});
            else resolve({data:null,status:status||'UNKNOWN_ERROR'});
          });
        });
        lastStatus=response.status;
        if(response.data?.location?.pano){result=response;break;}
      }catch(error){lastError=error;lastStatus=error?.code||error?.message||'UNKNOWN_ERROR';}
    }
    if(!result?.data?.location?.pano){
      const detail=lastError?String(lastError.message||lastError):lastStatus;
      const explanation=lastStatus==='ZERO_RESULTS'
        ?'Google не знайшов панорам поблизу цієї точки.'
        :lastStatus==='REQUEST_DENIED'
          ?'Google відхилив запит. Перевір дозволи API та Billing у Google Cloud.'
          :lastStatus==='OVER_QUERY_LIMIT'
            ?'Перевищено ліміт запитів Street View.'
            :'Google не зміг обробити запит Street View.';
      console.error('Street View lookup failed',{status:lastStatus,error:detail,target,radius:checkedRadius});
      show3DFallback(explanation+' Статус: '+lastStatus+'. Радіус перевірки: '+checkedRadius+' м.');
      return;
    }
    console.info('Street View panorama found',{status:lastStatus,target,panorama:result.data.location.description,position:result.data.location.latLng?.toJSON?.()});
    streetPanorama.setPosition(result.data.location.latLng||target);
    streetPanorama.setPano(result.data.location.pano);
    lastStreetPanoId=result.data.location.pano;lastPanoMeters=routeProgressMeters;lastPanoRequest=performance.now();
    streetPanorama.setPov({heading:routePath.length?routeHeadingAt(routeProgressMeters):0,pitch:0});
    streetPanorama.setVisible(true);
    threeCanvas.style.display='none';$('#streetPanorama').style.display='block';
    setTimeout(()=>google.maps.event.trigger(streetPanorama,'resize'),100);
    $('#streetMessage').textContent='Вид з авто · панорама Google Street View. Огляд 360° доступний; рух між панорамами залежить від покриття.';
  }catch(error){
    show3DFallback('Не вдалося запустити Street View: '+(error?.message||'невідома помилка')+'.');
  }
}
function routeHeadingAt(meters){
  const a=positionOnRoute(meters),b=positionOnRoute(Math.min((routePathMeters.at(-1)||0),meters+12));
  if(!a||!b)return 0;
  const rad=x=>x*Math.PI/180,y=Math.sin(rad(b.lng-a.lng))*Math.cos(rad(b.lat)),x=Math.cos(rad(a.lat))*Math.sin(rad(b.lat))-Math.sin(rad(a.lat))*Math.cos(rad(b.lat))*Math.cos(rad(b.lng-a.lng));
  return (Math.atan2(y,x)*180/Math.PI+360)%360;
}
let streetPanoPending=false,streetPanoRequestId=0,lastStreetPanoId='';
async function syncStreetViewToRoute(force=false){
  if(!driverVisible||!mapDriving||!streetPanorama||!streetService||!routePathMeters.length||streetPanoPending)return;
  const now=performance.now();
  if(!force&&(Math.abs(routeProgressMeters-lastPanoMeters)<18||now-lastPanoRequest<1100))return;
  const requestedMeters=routeProgressMeters;
  const lookAhead=Math.min(routePathMeters.at(-1)||0,requestedMeters+Math.max(4,Math.min(12,speed*0.65)));
  const target=positionOnRoute(lookAhead);
  if(!target)return;
  const requestId=++streetPanoRequestId;
  streetPanoPending=true;lastPanoRequest=now;lastPanoMeters=requestedMeters;
  const heading=(routeHeadingAt(lookAhead)+(speed<0?180:0))%360;
  try{
    let found=null,lastStatus='ZERO_RESULTS';
    for(const radius of [80,140,220]){
      const response=await new Promise(resolve=>{
        streetService.getPanorama({location:target,radius,preference:'NEAREST'},(data,status)=>resolve({data,status:status||'UNKNOWN_ERROR'}));
      });
      lastStatus=response.status;
      if(lastStatus==='OK'&&response.data?.location?.pano){found=response.data;break;}
      if(lastStatus==='REQUEST_DENIED'||lastStatus==='OVER_QUERY_LIMIT')break;
    }
    if(requestId!==streetPanoRequestId||!driverVisible||!streetPanorama)return;
    if(found?.location?.pano){
      const panoId=found.location.pano;
      if(panoId!==lastStreetPanoId){
        streetPanorama.setPano(panoId);
        lastStreetPanoId=panoId;
      }
      streetPanorama.setPov({heading,pitch:0});
      $('#streetMessage').textContent='Вид з авто · рух уздовж маршруту. Натисни ▲, щоб їхати; панорами перемикаються за напрямком дороги.';
    }else if(lastStatus!=='ZERO_RESULTS'){
      console.warn('Street View route-following lookup failed',{status:lastStatus,meters:requestedMeters,target});
      $('#streetMessage').textContent='Street View: '+lastStatus+'. Продовжую рух за маршрутом; на цій ділянці панорами можуть бути відсутні.';
    }
  }catch(error){
    console.warn('Street View route-following error',error);
  }finally{
    if(requestId===streetPanoRequestId)streetPanoPending=false;
  }
}
$('#showDriver').addEventListener('click',openDriverView);
// Initial map activation is deferred until canvas and Three.js elements are initialized.
$('#setRouteStart').addEventListener('click',()=>{
  if(!googleMap){setRouteEditStatus('Спочатку завантаж карту Google Maps.');return;}
  const start={lat:50.50336903085713,lng:30.84229163764248};
  routePoints=[start];saveRoutePoints();drawRouteMarkers();
  googleMap.panTo(start);googleMap.setZoom(18);
  setRouteEditStatus('Старт задано біля ТСЦ №3243. Увімкни «Додати точки» та познач наступні точки вздовж дороги.');
});
$('#editRoutePoints').addEventListener('click',()=>{
  routeEditEnabled=!routeEditEnabled;
  $('#editRoutePoints').classList.toggle('active',routeEditEnabled);
  $('#editRoutePoints').textContent=routeEditEnabled?'✓ Додавання увімкнено':'＋ Додати точки';
  setRouteEditStatus(routeEditEnabled?'Клацай по карті в порядку проходження маршруту №1, починаючи біля ТСЦ 3243.':'Додавання точок призупинено.');
});
$('#insertRoutePointAfter').addEventListener('click',()=>{
  if(selectedRoutePointIndex<0||selectedRoutePointIndex>=routePoints.length){setRouteEditStatus('Спочатку вибери червоний маркер точки, після якої потрібно вставити нову.');return;}
  insertRoutePointAfterSelected=!insertRoutePointAfterSelected;
  const button=$('#insertRoutePointAfter');
  button.classList.toggle('active',insertRoutePointAfterSelected);
  button.textContent=insertRoutePointAfterSelected?'✓ Додавати після точки №'+(selectedRoutePointIndex+1):'↳ Додавати після вибраної точки';
  setRouteEditStatus(insertRoutePointAfterSelected?'Режим вставлення увімкнено. Наступний клік по карті вставить точку ПІСЛЯ вибраної, а не в кінець маршруту.':'Режим вставлення вимкнено. Нові точки знову додаються в кінець.');
});
$('#undoRoutePoint').addEventListener('click',()=>{if(!routePoints.length)return;routePoints.pop();selectedRoutePointIndex=-1;insertRoutePointAfterSelected=false;$('#insertRoutePointAfter').disabled=true;$('#insertRoutePointAfter').classList.remove('active');$('#insertRoutePointAfter').textContent='↳ Додавати після вибраної точки';saveRoutePoints();drawRouteMarkers();setRouteEditStatus('Останню точку скасовано.');});
$('#deleteSelectedRoutePoint').addEventListener('click',()=>{if(selectedRoutePointIndex<0||selectedRoutePointIndex>=routePoints.length){setRouteEditStatus('Спочатку натисни маркер точки, яку потрібно видалити.');return;}const removed=selectedRoutePointIndex+1;routePoints.splice(selectedRoutePointIndex,1);selectedRoutePointIndex=-1;insertRoutePointAfterSelected=false;$('#insertRoutePointAfter').disabled=true;$('#insertRoutePointAfter').classList.remove('active');$('#insertRoutePointAfter').textContent='↳ Додавати після вибраної точки';if(routeLine){routeLine.setMap(null);routeLine=null;}routePath=[];routePathMeters=[];localStorage.removeItem(ROUTE1_PATH_KEY);if(routeCar)routeCar.setMap(null);mapDriving=false;saveRoutePoints();drawRouteMarkers();setRouteEditStatus('Точку №'+removed+' видалено. Решту точок перенумеровано. Стару дорожню лінію прибрано — побудуй маршрут повторно.');});
$('#clearRoutePoints').addEventListener('click',()=>{routePoints=[];selectedRoutePointIndex=-1;saveRoutePoints();drawRouteMarkers();setRouteEditStatus('Контрольні точки очищено.');});
$('#buildRoute').addEventListener('click',async()=>{
  if(routePoints.length<2){setRouteEditStatus('Потрібно щонайменше 2 точки: старт і фініш. Для точного маршруту додавай точки на кожному повороті.');return;}
  try{
    const {Route}=await google.maps.importLibrary('routes');
    // Routes API allows at most 25 intermediate waypoints per request.
    // Split longer user-drawn routes into segments of up to 27 points,
    // sharing the previous segment's final point as the next segment's origin.
    const MAX_POINTS_PER_REQUEST=27;
    const combinedPath=[];
    let totalDistanceMeters=0;
    const segmentCount=Math.ceil((routePoints.length-1)/(MAX_POINTS_PER_REQUEST-1));
    for(let startIndex=0,segment=1;startIndex<routePoints.length-1;startIndex+=MAX_POINTS_PER_REQUEST-1,segment++){
      const segmentPoints=routePoints.slice(startIndex,Math.min(startIndex+MAX_POINTS_PER_REQUEST,routePoints.length));
      setRouteEditStatus('Google прокладає ділянку '+segment+' із '+segmentCount+'… ('+segmentPoints.length+' контрольних точок)');
      const req={
        origin:segmentPoints[0],
        destination:segmentPoints[segmentPoints.length-1],
        intermediates:segmentPoints.slice(1,-1).map(location=>({location,via:true})),
        travelMode:'DRIVING',
        optimizeWaypointOrder:false,
        language:'uk',
        fields:['path','legs','distanceMeters','durationMillis']
      };
      const result=await Route.computeRoutes(req);
      if(!result.routes?.length)throw new Error('Google не знайшов дорожню траєкторію для ділянки '+segment+' із '+segmentCount+'. Перевір контрольні точки цієї ділянки.');
      const route=result.routes[0];
      const segmentPath=(route.path||[]).map(p=>({lat:typeof p.lat==='function'?p.lat():p.lat,lng:typeof p.lng==='function'?p.lng():p.lng}));
      if(!segmentPath.length)throw new Error('Google повернув порожню траєкторію для ділянки '+segment+'.');
      if(combinedPath.length&&segmentPath.length){
        const last=combinedPath[combinedPath.length-1],first=segmentPath[0];
        if(Math.abs(last.lat-first.lat)<1e-7&&Math.abs(last.lng-first.lng)<1e-7)segmentPath.shift();
      }
      combinedPath.push(...segmentPath);
      totalDistanceMeters+=route.distanceMeters||0;
    }
    if(combinedPath.length<2)throw new Error('Google повернув недостатньо координат для маршруту.');
    prepareRoutePath(combinedPath);
    const bounds=new google.maps.LatLngBounds();
    combinedPath.forEach(p=>bounds.extend(p));
    googleMap.fitBounds(bounds);
    const km=(totalDistanceMeters/1000).toFixed(2);
    setRouteEditStatus('Дорожню траєкторію побудовано повністю: '+km+' км, '+routePoints.length+' контрольних точок, '+segmentCount+' запит(и) до Google. Натисни «Почати заїзд», щоб перевірити рух автомобіля.');
  }catch(err){
    const detail={
      name:err?.name||'Error',
      message:err?.message||String(err),
      code:err?.code??'n/a',
      endpoint:err?.endpoint??'n/a',
      status:err?.status??'n/a',
      stack:err?.stack||'n/a'
    };
    const report='ROUTE COMPUTE ERROR\\n'+JSON.stringify(detail,null,2);
    recordGoogleDiag('Routes API computeRoutes failed',report);
    console.error('DS3243 Routes API computeRoutes failed:',detail,err);
    setRouteEditStatus('Google відхилив побудову маршруту: '+detail.name+(detail.code!=='n/a'?' ['+detail.code+']':'')+'. '+detail.message+' Деталі додано до «Діагностика Google».');
    refreshGoogleDiag();
  }
});


const canvas=$('#scene'),ctx=canvas.getContext('2d');
const threeCanvas=$('#scene3d');
let threeRenderer=null,threeScene=null,threeCamera=null,threeCar=null,threeWheels=[],threeRoadGroup=null,threeReady=false,threeLastGuide=0;
async function initThreeSimulator(){
 try{
  THREE=await import('three');
  threeRenderer=new THREE.WebGLRenderer({canvas:threeCanvas,antialias:true,alpha:false,powerPreference:'high-performance'});
  threeRenderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));
  threeRenderer.setSize(Math.max(1,$('.sim').clientWidth),Math.max(1,$('.sim').clientHeight),false);
  threeRenderer.shadowMap.enabled=true;
  threeRenderer.shadowMap.type=THREE.PCFSoftShadowMap;
  threeRenderer.outputColorSpace=THREE.SRGBColorSpace;
  threeScene=new THREE.Scene();
  threeScene.background=new THREE.Color(0x9fc4d4);
  threeScene.fog=new THREE.Fog(0x9fc4d4,34,150);
  threeCamera=new THREE.PerspectiveCamera(66,Math.max(1,$('.sim').clientWidth)/Math.max(1,$('.sim').clientHeight),.1,220);
  threeScene.add(new THREE.HemisphereLight(0xeaf5ff,0x59664a,2.1));
  const sun=new THREE.DirectionalLight(0xfff1d8,2.6);sun.position.set(-12,22,-8);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);threeScene.add(sun);
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(240,240),new THREE.MeshStandardMaterial({color:0x68845c,roughness:1}));
  ground.rotation.x=-Math.PI/2;ground.position.y=-.08;ground.receiveShadow=true;threeScene.add(ground);
  threeRoadGroup=new THREE.Group();threeScene.add(threeRoadGroup);
  const asphalt=new THREE.Mesh(new THREE.PlaneGeometry(9.2,220),new THREE.MeshStandardMaterial({color:0x343b40,roughness:.96}));
  asphalt.rotation.x=-Math.PI/2;asphalt.position.set(0,0,-70);asphalt.receiveShadow=true;threeRoadGroup.add(asphalt);
  const edgeMat=new THREE.MeshStandardMaterial({color:0xe9e4d5});
  for(const x of [-4.35,4.35]){const edge=new THREE.Mesh(new THREE.BoxGeometry(.12,.025,220),edgeMat);edge.position.set(x,.025,-70);threeRoadGroup.add(edge);}
  const dashMat=new THREE.MeshStandardMaterial({color:0xf4f0dc,emissive:0x242116});
  for(let z=-170;z<35;z+=12){const dash=new THREE.Mesh(new THREE.BoxGeometry(.13,.035,5.5),dashMat);dash.position.set(0,.035,z);threeRoadGroup.add(dash);}
  const curbMat=new THREE.MeshStandardMaterial({color:0xb9b8aa});
  for(const x of [-5.05,5.05]){const curb=new THREE.Mesh(new THREE.BoxGeometry(.45,.18,220),curbMat);curb.position.set(x,.02,-70);threeRoadGroup.add(curb);}
  const buildingMats=[0xc7c0ae,0xb9c6c4,0xd3c8b6,0x9eafb0].map(color=>new THREE.MeshStandardMaterial({color,roughness:1}));
  const treeMat=new THREE.MeshStandardMaterial({color:0x376b43,roughness:1}),trunkMat=new THREE.MeshStandardMaterial({color:0x72563d});
  for(let i=0;i<24;i++){
   const side=i%2?1:-1,z=-8-i*7.5,x=side*(8+(i%3)*2);
   const w=3+(i%3)*1.3,h=3.5+(i%4)*1.5,d=3.5;
   const building=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),buildingMats[i%buildingMats.length]);building.position.set(x,h/2,z);building.castShadow=true;building.receiveShadow=true;threeScene.add(building);
   for(let floor=0;floor<2;floor++)for(let win=0;win<2;win++){const windowMesh=new THREE.Mesh(new THREE.BoxGeometry(.55,.65,.035),new THREE.MeshStandardMaterial({color:0x557887,metalness:.25,roughness:.35}));windowMesh.position.set(x-w*.22+win*w*.44,1.1+floor*1.35,z+d/2+.025);threeScene.add(windowMesh);}
   const tx=side*(6.4+(i%2)*1.1),ty=.9;
   const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.12,.18,1.8,7),trunkMat);trunk.position.set(tx,ty,z);trunk.castShadow=true;threeScene.add(trunk);
   const crown=new THREE.Mesh(new THREE.SphereGeometry(.9+(i%3)*.12,9,7),treeMat);crown.position.set(tx,2.25,z);crown.castShadow=true;threeScene.add(crown);
  }
  threeCar=new THREE.Group();threeScene.add(threeCar);
  const paint=new THREE.MeshStandardMaterial({color:0x126db0,metalness:.68,roughness:.28});
  const glass=new THREE.MeshStandardMaterial({color:0x173747,metalness:.35,roughness:.18});
  const rubber=new THREE.MeshStandardMaterial({color:0x111418,roughness:.92});
  const alloy=new THREE.MeshStandardMaterial({color:0xaeb9c1,metalness:.85,roughness:.24});
  const lamp=new THREE.MeshStandardMaterial({color:0xfff1c2,emissive:0xffd879,emissiveIntensity:.7});
  const redLamp=new THREE.MeshStandardMaterial({color:0xc92e24,emissive:0x6b0804});
  function part(geometry,material,pos,parent=threeCar){const mesh=new THREE.Mesh(geometry,material);mesh.position.set(...pos);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;}
  part(new THREE.BoxGeometry(2.02,.58,4.35),paint,[0,.78,0]);
  part(new THREE.BoxGeometry(1.72,.72,2.12),glass,[0,1.38,-.22]);
  part(new THREE.BoxGeometry(1.83,.12,1.18),paint,[0,1.79,-.25]);
  part(new THREE.BoxGeometry(1.84,.1,.12),paint,[0,1.02,1.03]);
  part(new THREE.BoxGeometry(1.35,.2,.12),new THREE.MeshStandardMaterial({color:0x101820}),[0,.67,2.2]);
  part(new THREE.BoxGeometry(.55,.22,.08),lamp,[-.66,.88,2.2]);part(new THREE.BoxGeometry(.55,.22,.08),lamp,[.66,.88,2.2]);
  part(new THREE.BoxGeometry(.48,.2,.08),redLamp,[-.68,.88,-2.2]);part(new THREE.BoxGeometry(.48,.2,.08),redLamp,[.68,.88,-2.2]);
  for(const x of [-1.04,1.04])for(const z of [-1.42,1.42]){
   const wheel=new THREE.Group();wheel.position.set(x,.42,z);threeCar.add(wheel);
   const tire=new THREE.Mesh(new THREE.CylinderGeometry(.42,.42,.28,24),rubber);tire.rotation.z=Math.PI/2;tire.castShadow=true;wheel.add(tire);
   const hub=new THREE.Mesh(new THREE.CylinderGeometry(.22,.22,.295,20),alloy);hub.rotation.z=Math.PI/2;wheel.add(hub);
   for(let k=0;k<5;k++){const spoke=new THREE.Mesh(new THREE.BoxGeometry(.045,.34,.055),alloy);spoke.position.set(0,0,0);spoke.rotation.z=k*Math.PI/5;hub.add(spoke);}
   threeWheels.push(wheel);
  }
  for(const x of [-1.15,1.15]){part(new THREE.BoxGeometry(.24,.13,.34),paint,[x,1.17,.85]);part(new THREE.BoxGeometry(.12,.1,.18),glass,[x*1.06,1.19,.88]);}
  const shadow=new THREE.Mesh(new THREE.PlaneGeometry(2.8,5.3),new THREE.MeshBasicMaterial({color:0x071019,transparent:true,opacity:.2}));shadow.rotation.x=-Math.PI/2;shadow.position.y=.025;threeCar.add(shadow);
  threeReady=true;canvas.style.display='none';threeCanvas.style.display='block';
  resizeThreeSimulator();
  return true;
 }catch(error){console.error('3D simulator initialization failed; using 2D fallback',error);threeReady=false;threeCanvas.style.display='none';canvas.style.display='block';return false;}
}
function resizeThreeSimulator(){
 if(!threeRenderer||!threeCamera)return;
 const w=Math.max(1,$('.sim').clientWidth),h=Math.max(1,$('.sim').clientHeight);
 threeRenderer.setSize(w,h,false);threeCamera.aspect=w/h;threeCamera.updateProjectionMatrix();
}
function renderThreeSimulator(){
 if(!threeReady)return;
 const dt=Math.min((performance.now()-last)/1000,.04);
 threeCar.position.x+=(steering*2.35-threeCar.position.x)*Math.min(1,dt*2.8);
 threeCar.rotation.y=-steering*.12;
 const wheelSpin=distance*.18;threeWheels.forEach(w=>{w.rotation.x=wheelSpin;});
 if(camera==='chase'){
  threeCamera.position.lerp(new THREE.Vector3(0,4.2,-8.4),.09);
  threeCamera.lookAt(threeCar.position.x*.35,.75,4.8);
 }else{
  threeCamera.position.lerp(new THREE.Vector3(0,1.55,1.12),.14);
  threeCamera.lookAt(threeCar.position.x*.35,1.38,22);
 }
 threeRoadGroup.position.z=(distance*1.5)%12;
 threeRenderer.render(threeScene,threeCamera);
}

let mode='exam',gearbox='auto',gear='D',camera='cockpit',started=false,speed=0,elapsed=0,distance=0,steering=0,signal='—',lights=false,keys={},last=performance.now(),turnClock=0,lessonShown=false,routeLateralOffset=0;
let examActive=false,examFinished=false,examMistakes=[],examCommandIndex=0;
const EXAM_DURATION_SECONDS=20*60;
const examinerCommands=[
 'Розпочніть рух. Будьте уважні та дотримуйтеся вимог дорожніх знаків.',
 'На найближчому перехресті виконайте поворот праворуч, коли це буде безпечно.',
 'На найближчій можливості виконайте поворот ліворуч.',
 'Продовжуйте рух прямо. Контролюйте швидкість та дорожню обстановку.',
 'Підготуйтеся до зупинки у безпечному дозволеному місці.',
 'Продовжуйте рух за маршрутом. Слідкуйте за пішоходами та іншими учасниками руху.'
];
const scenarios={
 intersection:{title:'Наближення до перехрестя',text:'Завчасно зменш швидкість. Оціни знаки пріоритету, оглянь обидва напрямки та переконайся, що маневр безпечний.'},
 pedestrian:{title:'Пішохідний перехід',text:'Зменш швидкість і стеж за тротуарами з обох боків. Будь готовий зупинитися, щоб пропустити пішохода.'},
 lights:{title:'Регульоване перехрестя',text:'Орієнтуйся на сигнали світлофора. На заборонний сигнал зупинися перед стоп-лінією.'},
 turn:{title:'Підготовка до повороту',text:'Завчасно увімкни покажчик, перевір дзеркала та сліпу зону, займи належне положення на проїзній частині.'},
 parking:{title:'Зупинка біля узбіччя',text:'Оціни обстановку позаду, подай сигнал, плавно знизь швидкість і зупинись у дозволеному безпечному місці.'}
};
function say(title,text){$('#coachTitle').textContent=title;$('#coachText').textContent=text;}
function examinerSpeak(text){
 say('Екзаменатор',text);
 if('speechSynthesis' in window){
  window.speechSynthesis.cancel();
  const utterance=new SpeechSynthesisUtterance(text);
  utterance.lang='uk-UA';utterance.rate=.92;utterance.pitch=1;
  window.speechSynthesis.speak(utterance);
 }
}
function formatExamTime(seconds){
 const safe=Math.max(0,Math.ceil(seconds));
 return String(Math.floor(safe/60)).padStart(2,'0')+':'+String(safe%60).padStart(2,'0');
}
function updateExamPanel(){
 const remaining=Math.max(0,EXAM_DURATION_SECONDS-elapsed);
 const timer=$('#examTimer');if(timer)timer.textContent=formatExamTime(remaining);
 const count=$('#mistakes');if(count)count.textContent=String(examMistakes.length);
 const log=$('#examMistakeLog');
 if(log)log.innerHTML=examMistakes.length?examMistakes.map((item,i)=>'<li><b>'+(i+1)+'.</b> '+item.text+' <small>'+formatExamTime(item.at)+'</small></li>').join(''):'<li>Помилок поки немає</li>';
 const active=examActive&&!examFinished;
 ['nextExamCommand','recordExamMistake','dangerExamStop'].forEach(id=>{const el=$('#'+id);if(el)el.disabled=!active;});
 const state=$('#examState');if(state)state.textContent=examFinished?($('#assessment').textContent||'Іспит завершено'):active?'Іспит триває · залишилося '+formatExamTime(remaining):'Очікування початку іспиту';
}
function finishExam(result,reason){
 if(examFinished)return;
 examFinished=true;examActive=false;started=false;mapDriving=false;speed=0;keys={};
 const passed=result==='passed';
 $('#modeName').textContent=passed?'Іспит складено':'Іспит не складено';
 $('#assessment').textContent=reason;
 $('#examState').textContent=reason;
 $('#start').textContent='↻ Повторити іспит';
 updateExamPanel();
 examinerSpeak(passed?'Іспит завершено. Вітаю, іспит складено.':'Іспит припинено. '+reason);
}
function registerExamMistake(text){
 if(!examActive||examFinished)return;
 examMistakes.push({text,at:elapsed});
 updateExamPanel();
 if(examMistakes.length>3){
  finishExam('failed','Іспит не складено: зареєстровано більше трьох типових помилок.');
 }else{
  const left=3-examMistakes.length;
  examinerSpeak('Зафіксовано типову помилку. '+(left? 'Залишилося допустимих помилок: '+left+'.':'Це третя типова помилка. Наступна типова помилка означатиме нескладений іспит.'));
 }
}
function startPracticalExam(){
 examActive=true;examFinished=false;examMistakes=[];examCommandIndex=0;elapsed=0;distance=0;
 $('#modeName').textContent='Практичний іспит';
 $('#assessment').textContent='Іспит триває. Допускається не більше трьох типових помилок.';
 $('#start').textContent='▶ Іспит триває';
 updateExamPanel();
 examinerSpeak('Іспит розпочато. Тривалість двадцять хвилин. Допускається не більше трьох типових помилок. У разі створення небезпечної ситуації іспит буде припинено. Розпочніть рух.');
}
$('#nextExamCommand')?.addEventListener('click',()=>{
 if(!examActive||examFinished)return;
 const command=examinerCommands[examCommandIndex%examinerCommands.length];examCommandIndex++;
 examinerSpeak(command);
});
$('#recordExamMistake')?.addEventListener('click',()=>{
 const text=$('#examMistakeType').value;
 registerExamMistake(text);
});
$('#dangerExamStop')?.addEventListener('click',()=>{
 if(!examActive||examFinished)return;
 finishExam('failed','Іспит негайно припинено через створення небезпечної ситуації.');
});
updateExamPanel();
function updateGuide(now){
 if(!started||now-threeLastGuide<2200)return;
 threeLastGuide=now;
 let advice='Тримай смугу та контролюй швидкість. Дивись далеко вперед і перевіряй дзеркала.';
 if(signal==='—'&&Math.abs(steering)>.28)advice='Перед поворотом завчасно ввімкни покажчик повороту та перевір дзеркала.';
 else if(signal!=='—')advice='Покажчик увімкнений. Переконайся, що маневр безпечний, і вимкни його після завершення.';
 else if(speed>13)advice='Контролюй швидкість і дистанцію. Будь готовий плавно загальмувати.';
 else if(speed<1)advice='Автомобіль зупинений. Перед початком руху перевір обстановку та дзеркала.';
 if(lights)advice+=' Світло увімкнене.';
 $('#coachTitle').textContent='Гід · підказка водієві';
 $('#coachText').textContent=advice;
}
function resize(){const r=canvas.getBoundingClientRect(),dpr=Math.min(window.devicePixelRatio||1,2);canvas.width=Math.max(1,Math.round(r.width*dpr));canvas.height=Math.max(1,Math.round(r.height*dpr));ctx.setTransform(dpr,0,0,dpr,0,0);}
new ResizeObserver(()=>{resize();resizeThreeSimulator();}).observe($('.sim'));window.addEventListener('resize',()=>{resize();resizeThreeSimulator();});resize();initThreeSimulator();
setView(true);
window.__dsMainReachedMapInit=true;
function path(points,color){ctx.fillStyle=color;ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.closePath();ctx.fill();}
function drawFallback(){
 const w=canvas.clientWidth,h=canvas.clientHeight,hor=h*.39;
 ctx.clearRect(0,0,w,h);
 const sky=ctx.createLinearGradient(0,0,0,hor);sky.addColorStop(0,'#6f9db4');sky.addColorStop(1,'#d1ddd7');ctx.fillStyle=sky;ctx.fillRect(0,0,w,hor);
 ctx.fillStyle='#819b7b';ctx.fillRect(0,hor,w,h-hor);
 // distant blocks and roadside trees moving with distance
 for(let i=0;i<20;i++){const depth=((i*.071+distance*.0007)%1),scale=.12+depth*.95,x=(i*97)%w,y=hor+depth*80;ctx.fillStyle=i%2?'#477653':'#527e5a';ctx.beginPath();ctx.arc(x,y,scale*15,0,Math.PI*2);ctx.fill();ctx.fillStyle='#88745c';ctx.fillRect(x-scale*3,y+scale*9,scale*6,scale*18);}
 for(let i=0;i<12;i++){const depth=((i/12+distance*.00035)%1),scale=.18+depth*.9,x=i%2?w*.12+depth*w*.14:w*.88-depth*w*.14,y=hor+depth*76,bw=8+depth*36,bh=14+depth*68;ctx.fillStyle=['#c4bca9','#b6c1b8','#d0c7b5'][i%3];ctx.fillRect(x-bw/2,y-bh,bw,bh);ctx.fillStyle='#74888a';for(let k=0;k<3;k++)ctx.fillRect(x-bw*.34+k*bw*.28,y-bh*.74,bw*.12,bh*.15);}
 // roadway perspective with gentle steering offset
 const offset=steering*35;
 path([[w*.465+offset*.1,hor],[w*.535+offset*.1,hor],[w*.94,h],[w*.06,h]],'#343c41');
 path([[w*.445+offset*.1,hor],[w*.465+offset*.1,hor],[w*.06,h],[0,h]],'#b5b9a9');
 path([[w*.535+offset*.1,hor],[w*.555+offset*.1,hor],[w,h],[w*.94,h]],'#b5b9a9');
 ctx.strokeStyle='#eee9d9';ctx.lineWidth=1.8;ctx.beginPath();ctx.moveTo(w*.465+offset*.1,hor);ctx.lineTo(w*.06,h);ctx.moveTo(w*.535+offset*.1,hor);ctx.lineTo(w*.94,h);ctx.stroke();
 for(let i=0;i<13;i++){const depth=((i/13+distance*.0009)%1),y=hor+depth*(h-hor),sw=1+depth*4,len=4+depth*28;ctx.fillStyle='#e9e5d7';ctx.fillRect(w/2+offset*depth-sw/2,y,sw,len);}
 // distant crossing/stop line landmark for lesson visual cues
 const landmark=(distance%460)/460;if(landmark>.78){const f=(landmark-.78)/.22,y=hor+f*f*(h-hor)*.64;ctx.strokeStyle='#f5f3e7';ctx.lineWidth=1+f*5;ctx.beginPath();ctx.moveTo(w*(.5-.28*f),y);ctx.lineTo(w*(.5+.28*f),y);ctx.stroke();}
 // vehicle hood or third-person vehicle
 if(camera==='chase'){const x=w/2,y=h*.81;path([[x-w*.11,y],[x-w*.09,y-47],[x-w*.06,y-67],[x+w*.06,y-67],[x+w*.09,y-47],[x+w*.11,y]],'#2474ae');path([[x-w*.055,y-59],[x+w*.055,y-59],[x+w*.074,y-43],[x-w*.074,y-43]],'#203d4d');ctx.fillStyle='#111';ctx.fillRect(x-w*.115,y-28,w*.025,32);ctx.fillRect(x+w*.09,y-28,w*.025,32);}
 else {path([[w*.24,h],[w*.34,h*.87],[w*.66,h*.87],[w*.76,h]],'#1d2a33');path([[w*.34,h],[w*.39,h*.9],[w*.61,h*.9],[w*.66,h]],'#314a58');}
 // headlights and turn indicators, placed over the simulated dash
 if(lights){ctx.fillStyle='#ffe9a8';ctx.globalAlpha=.18;path([[w*.27,h],[w*.45,hor],[w*.55,hor],[w*.73,h]],'#fff0bd');ctx.globalAlpha=1;}
 if(signal!=='—'&&Math.floor(turnClock*2)%2===0){ctx.fillStyle='#ffc34d';ctx.font='bold 27px sans-serif';ctx.fillText(signal==='←'?'◀':'▶',signal==='←'?18:w-46,h*.68);}
 const shade=ctx.createRadialGradient(w/2,h*.52,Math.min(w,h)*.2,w/2,h*.52,Math.max(w,h)*.72);shade.addColorStop(0,'transparent');shade.addColorStop(1,'#07101955');ctx.fillStyle=shade;ctx.fillRect(0,0,w,h);
}
function draw(){if(threeReady&&threeCanvas.style.display!=='none')renderThreeSimulator();else if(canvas.style.display!=='none')drawFallback();}
function updateStatus(){$('#signalValue').textContent=signal;$('#carState').textContent=(started?'Двигун працює':'Двигун зупинений')+' · '+(lights?'світло увімкнено':'світло вимкнено')+' · '+(signal==='—'?'поворотник вимкнено':'сигнал '+signal);}
function setSignal(value){signal=signal===value?'—':value;$('#leftSignal').classList.toggle('active',signal==='←');$('#rightSignal').classList.toggle('active',signal==='→');updateStatus();}
$('#leftSignal').addEventListener('click',()=>setSignal('←'));$('#rightSignal').addEventListener('click',()=>setSignal('→'));
$('#lights').addEventListener('click',()=>{lights=!lights;$('#lights').textContent='Світло: '+(lights?'увімкнено':'вимкнено');$('#lights').classList.toggle('active',lights);updateStatus();});
$('#horn').addEventListener('click',()=>say('Звуковий сигнал','Сигнал активовано в симуляції. Використовуй його лише за необхідності.'));
$('#start').addEventListener('click',()=>{
  if(!routePath.length){
    try{const saved=JSON.parse(localStorage.getItem(ROUTE1_PATH_KEY)||'[]');if(saved.length>1&&googleMap)prepareRoutePath(saved);}catch(error){console.warn('Saved route restore failed',error);}
  }
  started=true;speed=0;
  startPracticalExam();
  if(mapVisible||driverVisible){
    if(routePath.length){
      mapDriving=true;routeProgressMeters=0;routeLateralOffset=0;lastPanoMeters=-100;lastPanoRequest=0;streetPanoPending=false;
      const p=positionOnRoute(0);if(p){if(googleMap)ensureMapCar(p);else if(routeCar)routeCar.setPosition(p);}
      if(driverVisible)syncStreetViewToRoute(true);
      setRouteEditStatus('Заїзд розпочато. Натисни ▲ або утримуй W/↑ для газу. Автомобіль рухається по побудованій дорозі.');
    }else{
      mapDriving=false;
      $('#streetMessage').textContent='Заїзд запущено. Щоб їхати саме прокладеним маршрутом, спочатку побудуй дорожню траєкторію.';
    }
  }
  updateStatus();$('#modeName').textContent='Екзаменаційний режим';$('#assessment').textContent='Фіксація помилок та оцінювання';say('Іспит розпочато','Натисни ▲ на екрані або утримуй W/↑ для руху.');});
$('#reset').addEventListener('click',()=>{speed=0;started=false;examActive=false;examFinished=false;examMistakes=[];examCommandIndex=0;mapDriving=false;routeProgressMeters=0;routeLateralOffset=0;if(routeCar&&routePath.length)routeCar.setPosition(routePath[0]);elapsed=0;distance=0;steering=0;signal='—';updateStatus();$('#elapsed').textContent='00:00';$('#modeName').textContent='Екзаменаційний режим';$('#assessment').textContent='Фіксація помилок та оцінювання';$('#start').textContent='▶ Почати заїзд';updateExamPanel();say('Іспит скинуто','Натисніть «Почати заїзд», щоб почати новий іспит.');});
document.querySelectorAll('[data-box]').forEach(b=>b.addEventListener('click',()=>{gearbox=b.dataset.box;document.querySelectorAll('[data-box]').forEach(x=>x.classList.toggle('active',x===b));$('#manualGears').hidden=gearbox!=='manual';$('#autoGears').hidden=gearbox!=='auto';gear=gearbox==='manual'?'1':'D';$('#gearValue').textContent=gear;}));
document.querySelectorAll('[data-camera]').forEach(b=>b.addEventListener('click',()=>{camera=b.dataset.camera;document.querySelectorAll('[data-camera]').forEach(x=>x.classList.toggle('active',x===b));}));
document.querySelectorAll('[data-gear]').forEach(b=>b.addEventListener('click',()=>{gear=b.dataset.gear;document.querySelectorAll('[data-gear]').forEach(x=>x.classList.toggle('chosen',x===b));$('#gearValue').textContent=gear;}));
window.addEventListener('keydown',e=>{const k=e.key.toLowerCase();keys[k]=true;if(['arrowup','arrowdown','arrowleft','arrowright',' '].includes(e.key))e.preventDefault();if(k==='q')setSignal('←');if(k==='e')setSignal('→');if(k==='l'){lights=!lights;$('#lights').textContent='Світло: '+(lights?'увімкнено':'вимкнено');updateStatus();}if(k==='c'){camera=camera==='cockpit'?'chase':'cockpit';document.querySelectorAll('[data-camera]').forEach(x=>x.classList.toggle('active',x.dataset.camera===camera));}});
window.addEventListener('keyup',e=>{keys[e.key.toLowerCase()]=false;});
document.querySelectorAll('[data-touch]').forEach(b=>{const k=b.dataset.touch;b.addEventListener('pointerdown',e=>{e.preventDefault();keys[k]=true;});['pointerup','pointerleave','pointercancel'].forEach(ev=>b.addEventListener(ev,()=>keys[k]=false));});
function animate(now){
 const dt=Math.min((now-last)/1000,.04);last=now;
 if(started){
  const forward=keys.w||keys.arrowup,reverse=keys.s||keys.arrowdown;
  if(forward)speed=Math.min(12,speed+5*dt);
  else if(reverse)speed=Math.max(-6,speed-5*dt);
  else speed=Math.abs(speed)<.12?0:speed-Math.sign(speed)*Math.min(Math.abs(speed),3.5*dt);
  const steerTarget=(keys.d||keys.arrowright?1:0)-(keys.a||keys.arrowleft?1:0);
  steering+=(steerTarget-steering)*Math.min(1,dt*3.5);
  distance+=Math.abs(speed)*dt*12;
  if(mapVisible||driverVisible)advanceMapCar(dt);
  if(driverVisible&&mapDriving&&Math.abs(speed)>.2)syncStreetViewToRoute(false);
  elapsed+=dt;turnClock+=dt;updateGuide(now);$('#elapsed').textContent=new Date(elapsed*1000).toISOString().slice(14,19);if(examActive){updateExamPanel();if(elapsed>=EXAM_DURATION_SECONDS)finishExam('passed','20 хвилин завершено. Іспит складено за кількістю типових помилок: '+examMistakes.length+'.');}
 }else{steering*=.9;speed=0;}
 $('#speed').textContent=Math.round(speed*3.6);draw();
 requestAnimationFrame(animate);
}
requestAnimationFrame(animate);