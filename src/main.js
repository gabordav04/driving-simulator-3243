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
let routePath=[], routeCar=null, routePathMeters=[], routeProgressMeters=0, mapDriving=false;
const ROUTE1_PATH_KEY='ds3243.route1.roadPath.v1';
function haversine(a,b){const R=6371000,rad=x=>x*Math.PI/180,dLat=rad(b.lat-a.lat),dLng=rad(b.lng-a.lng),x=Math.sin(dLat/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dLng/2)**2;return 2*R*Math.asin(Math.sqrt(x));}
function carMapIcon(){
  const svg='<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><ellipse cx="32" cy="34" rx="25" ry="27" fill="#06111b" opacity=".28"/><path d="M17 17Q19 10 25 9h14q6 1 8 8l5 13v17q0 5-5 5h-4v-4H21v4h-4q-5 0-5-5V30z" fill="#1687d9" stroke="#fff" stroke-width="3"/><path d="M22 16h20l5 14H17z" fill="#bce9fa" stroke="#0c4770" stroke-width="2"/><path d="M17 34h30v12H17z" fill="#0866aa"/><path d="M13 27h5v8h-5zm33 0h5v8h-5z" fill="#ffe28a"/><path d="M21 49h22" stroke="#082f4d" stroke-width="3" stroke-linecap="round"/></svg>';
  return {url:'data:image/svg+xml;charset=UTF-8,'+encodeURIComponent(svg),scaledSize:new google.maps.Size(48,48),anchor:new google.maps.Point(24,24)};
}
function ensureMapCar(position){
  if(!googleMap||!google.maps?.Marker)return;
  const point=position||googleMap.getCenter()?.toJSON()||{lat:50.503529,lng:30.841481};
  if(!routeCar)routeCar=new google.maps.Marker({map:googleMap,position:point,title:'Навчальний автомобіль · стартова позиція',zIndex:1000,icon:carMapIcon()});
  else {routeCar.setMap(googleMap);routeCar.setPosition(point);routeCar.setIcon(carMapIcon());}
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
// Route 1 provisional georeference: traced approximately from the official scheme image.
// These via-points are a first-pass approximation and must be visually checked against the roads.
const ROUTE1_PREVIEW_WAYPOINTS=[
 {lat:50.50336903085713,lng:30.84229163764248},
 {lat:50.50425,lng:30.84205},
 {lat:50.50535,lng:30.84105},
 {lat:50.50605,lng:30.83895},
 {lat:50.50485,lng:30.83715},
 {lat:50.50595,lng:30.83475},
 {lat:50.50515,lng:30.83185},
 {lat:50.50535,lng:30.82675},
 {lat:50.50515,lng:30.82485}
];
async function buildRoute1Preview(){
 if(!googleMap||routePath.length>1)return false;
 try{
  const {Route}=await google.maps.importLibrary('routes');
  setMapMessage('Будую попередню геоприв’язку маршруту №1 за офіційною схемою…');
  const {routes}=await Route.computeRoutes({
   origin:ROUTE1_PREVIEW_WAYPOINTS[0],destination:ROUTE1_PREVIEW_WAYPOINTS.at(-1),
   intermediates:ROUTE1_PREVIEW_WAYPOINTS.slice(1,-1).map(location=>({location,via:true})),
   travelMode:'DRIVING',optimizeWaypointOrder:false,language:'uk',
   fields:['path','distanceMeters','durationMillis']
  });
  if(!routes?.[0]?.path?.length)throw new Error('Google Routes не повернув дорожню геометрію');
  prepareRoutePath(routes[0].path);
  const bounds=new google.maps.LatLngBounds();routePath.forEach(p=>bounds.extend(p));googleMap.fitBounds(bounds,{top:70,right:40,bottom:40,left:40});
  setMapMessage('Маршрут №1 нанесено попередньо за офіційною схемою. Геоприв’язка експериментальна — перевір відповідність кожного повороту перед тренуванням.');
  return true;
 }catch(error){
  console.warn('Route 1 provisional georeference failed',error);
  setMapMessage('Не вдалося автоматично побудувати попередній маршрут №1. Перевір доступ до Routes API.');
  return false;
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
  routeProgressMeters=Math.min(total,routeProgressMeters+Math.max(0,speed)*dt);
  const pos=positionOnRoute(routeProgressMeters);if(pos)routeCar.setPosition(pos);
  if(routeProgressMeters>=total){mapDriving=false;started=false;speed=0;say('Маршрут завершено','Ти доїхав до кінцевої точки прокладеної траєкторії.');}
}
function renderRoutePointCount(){const el=$('#routePointCount');if(el)el.textContent='Точок: '+routePoints.length;}
function clearRouteMarkers(){routePointMarkers.forEach(m=>m.setMap(null));routePointMarkers=[];}
function drawRouteMarkers(){
  if(!googleMap||!google.maps?.Marker)return;
  clearRouteMarkers();
  routePoints.forEach((p,i)=>routePointMarkers.push(new google.maps.Marker({map:googleMap,position:p,label:String(i+1),title:'Контрольна точка '+(i+1)})));
  renderRoutePointCount();
}
function setRouteEditStatus(t){$('#routeEditStatus').textContent=t;}
function saveRoutePoints(){localStorage.setItem(ROUTE1_POINTS_KEY,JSON.stringify(routePoints));renderRoutePointCount();}
function addRoutePoint(latLng){
  routePoints.push({lat:latLng.lat(),lng:latLng.lng()});
  saveRoutePoints();drawRouteMarkers();
  setRouteEditStatus('Додано точку '+routePoints.length+'. Продовжуй уздовж синьої лінії за червоними стрілками.');
}
const mapInput=$('#mapsKey'), mapStatus=$('#mapsKeyStatus');
mapInput.value=localStorage.getItem(MAPS_KEY)||'';
function setMapMessage(message){$('#mapMessage').textContent=message;}
let mapsAuthFailed=false;
window.gm_authFailure=function(){
  mapsAuthFailed=true;
  setMapMessage('Google відхилив API-ключ. Перевір Billing, Maps JavaScript API та HTTP referrer: https://driving-simulator-3243.onrender.com/* у Google Cloud.');
  mapStatus.textContent='Google не авторизував ключ. Відкрий Google Cloud → APIs & Services → Credentials.';
};
async function loadGoogleMap(apiKey){
  if(!apiKey){setMapMessage('Спочатку збережи Google Maps API-ключ у налаштуваннях.');return false;}
  if(!window.google?.maps?.importLibrary){
    mapsAuthFailed=false;
    setMapMessage('Завантажуємо Google Maps…');
    let script=document.querySelector('script[data-ds-google-maps]');
    if(!script){
      script=document.createElement('script');
      script.dataset.dsGoogleMaps='1';
      script.src='https://maps.googleapis.com/maps/api/js?key='+encodeURIComponent(apiKey)+'&v=weekly&language=uk&region=UA';
      script.async=true;
      script.onerror=()=>setMapMessage('Не вдалося завантажити Google Maps. Перевір інтернет і API-ключ.');
      document.head.appendChild(script);
    }
    try{
      await new Promise((resolve,reject)=>{
        if(window.google?.maps?.importLibrary){resolve();return;}
        script.addEventListener('load',resolve,{once:true});
        script.addEventListener('error',()=>reject(new Error('Maps script failed')),{once:true});
      });
      mapsLoaded=true;
      await new Promise(resolve=>setTimeout(resolve,350));
    }catch(error){
      setMapMessage('Google Maps не завантажився: '+(error?.message||'перевір API-ключ та доступ до Maps JavaScript API.'));
      return false;
    }
  }else mapsLoaded=true;
  if(mapsAuthFailed)return false;
  try{
    const {Map}=await google.maps.importLibrary('maps');
    if(!googleMap){
      googleMap=new Map($('#googleMap'),{
        center:{lat:50.50336903085713,lng:30.84229163764248},
        zoom:17,mapTypeControl:true,streetViewControl:false,fullscreenControl:true,clickableIcons:true
      });
    }
    ensureMapCar(routePath.length?routePath[0]:googleMap.getCenter()?.toJSON());
    setTimeout(()=>google.maps.event.trigger(googleMap,'resize'),100);
    try{routePoints=JSON.parse(localStorage.getItem(ROUTE1_POINTS_KEY)||'[]');}catch{routePoints=[];}
    let hasSavedRoute=false;try{const savedPath=JSON.parse(localStorage.getItem(ROUTE1_PATH_KEY)||'[]');if(savedPath.length>1){prepareRoutePath(savedPath);hasSavedRoute=true;}}catch{}
    drawRouteMarkers();
    if(!googleMap.__routeEditorBound){
      googleMap.addListener('click',e=>{if(routeEditEnabled&&e.latLng)addRoutePoint(e.latLng);});
      googleMap.__routeEditorBound=true;
    }
    if(!mapsAuthFailed){if(hasSavedRoute)setMapMessage('Карта готова. Маршрут №1 завантажено зі збережених дорожніх координат.');else await buildRoute1Preview();}
    return !mapsAuthFailed;
  }catch(error){
    setMapMessage('Помилка ініціалізації Google Maps: '+(error?.message||'невідома помилка')+'.');
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
function setView(showMap){
  mapVisible=showMap;driverVisible=false;
  $('#driverView').style.display='none';
  threeCanvas.style.display='none';
  $('.sim').classList.remove('view-clean');
  $('.sim').classList.toggle('map-active',showMap);
  $('#googleMap').style.display=showMap?'block':'none';
  $('#routeEditor').style.display='none';
  canvas.style.display=showMap?'none':'block';
  $('#mapMessage').style.display=showMap?'block':'none';
  $('#showMap').classList.toggle('active',showMap);
  $('#showDriver').classList.remove('active');
  $('.sim').classList.remove('view-clean');
  if(showMap){
    const key=localStorage.getItem(MAPS_KEY);
    if(key)loadGoogleMap(key);
    else setMapMessage('Введи API-ключ Google Maps у лівій панелі та натисни «Зберегти ключ».');
  }
}
$('#showMap').addEventListener('click',()=>setView(true));
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
$('#showDriver').addEventListener('click',openDriverView);
setView(true);
$('#setRouteStart').addEventListener('click',()=>{
  if(!googleMap){setRouteEditStatus('Спочатку завантаж карту Google Maps.');return;}
  const center=googleMap.getCenter();
  if(!center){setRouteEditStatus('Карта ще завантажується. Спробуй за мить.');return;}
  routePoints=[{lat:center.lat(),lng:center.lng()}];
  saveRoutePoints();drawRouteMarkers();googleMap.setZoom(Math.max(googleMap.getZoom()||15,17));
  setRouteEditStatus('Стартову контрольну точку встановлено в центрі карти. Перемісти карту до входу ТСЦ 3243, якщо потрібно, та уточни точку перед додаванням решти маршруту.');
});
$('#editRoutePoints').addEventListener('click',()=>{
  routeEditEnabled=!routeEditEnabled;
  $('#editRoutePoints').classList.toggle('active',routeEditEnabled);
  $('#editRoutePoints').textContent=routeEditEnabled?'✓ Додавання увімкнено':'＋ Додати точки';
  setRouteEditStatus(routeEditEnabled?'Клацай по карті в порядку проходження маршруту №1, починаючи біля ТСЦ 3243.':'Додавання точок призупинено.');
});
$('#undoRoutePoint').addEventListener('click',()=>{routePoints.pop();saveRoutePoints();drawRouteMarkers();setRouteEditStatus('Останню точку скасовано.');});
$('#clearRoutePoints').addEventListener('click',()=>{routePoints=[];saveRoutePoints();drawRouteMarkers();setRouteEditStatus('Контрольні точки очищено.');});
$('#buildRoute').addEventListener('click',async()=>{
  if(routePoints.length<2){setRouteEditStatus('Потрібно щонайменше 2 точки: старт і фініш.');return;}
  try{
    const {Route}=await google.maps.importLibrary('routes');
    setRouteEditStatus('Google Maps прокладає дорогу між контрольними точками…');
    const req={origin:routePoints[0],destination:routePoints[routePoints.length-1],
      intermediates:routePoints.slice(1,-1).map(location=>({location, via:true})),
      travelMode:'DRIVING',optimizeWaypointOrder:false,language:'uk',
      fields:['path','legs','distanceMeters','durationMillis']};
    const {routes}=await Route.computeRoutes(req);
    if(!routes?.length){setRouteEditStatus('Google не знайшов дорожню траєкторію для цих точок. Перевір їх розташування.');return;}
    if(routeLine)routeLine.setMap(null);
    const lines=routes[0].createPolylines({polylineOptions:{strokeColor:'#075de5',strokeOpacity:0.95,strokeWeight:7}});
    lines.forEach(line=>line.setMap(null));
    if(routes[0].path?.length){const bounds=new google.maps.LatLngBounds();routes[0].path.forEach(p=>bounds.extend(p));googleMap.fitBounds(bounds);}
    const km=(routes[0].distanceMeters/1000).toFixed(2);
    prepareRoutePath(routes[0].path||[]);
    setRouteEditStatus('Дорожню траєкторію побудовано ('+km+' км). Натисни «Почати заїзд», щоб рухати автомобіль по цій лінії. Перевір відповідність офіційній схемі №1.');
  }catch(err){setRouteEditStatus('Помилка побудови маршруту. Перевір, чи увімкнено Routes API для цього ключа.');}
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

let mode='exam',gearbox='manual',gear='1',camera='cockpit',started=false,speed=0,elapsed=0,distance=0,steering=0,signal='—',lights=false,keys={},last=performance.now(),turnClock=0,lessonShown=false;
const scenarios={
 intersection:{title:'Наближення до перехрестя',text:'Завчасно зменш швидкість. Оціни знаки пріоритету, оглянь обидва напрямки та переконайся, що маневр безпечний.'},
 pedestrian:{title:'Пішохідний перехід',text:'Зменш швидкість і стеж за тротуарами з обох боків. Будь готовий зупинитися, щоб пропустити пішохода.'},
 lights:{title:'Регульоване перехрестя',text:'Орієнтуйся на сигнали світлофора. На заборонний сигнал зупинися перед стоп-лінією.'},
 turn:{title:'Підготовка до повороту',text:'Завчасно увімкни покажчик, перевір дзеркала та сліпу зону, займи належне положення на проїзній частині.'},
 parking:{title:'Зупинка біля узбіччя',text:'Оціни обстановку позаду, подай сигнал, плавно знизь швидкість і зупинись у дозволеному безпечному місці.'}
};
function say(title,text){$('#coachTitle').textContent=title;$('#coachText').textContent=text;}
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
$('#start').addEventListener('click',()=>{started=true;
  if(mapVisible||driverVisible){
    if(!routePath.length){started=false;setRouteEditStatus('Спочатку нанеси контрольні точки та натисни «Побудувати дорогу».');return;}
    mapDriving=true;routeProgressMeters=0;speed=0;const p=positionOnRoute(0);if(p&&routeCar)routeCar.setPosition(p);
    setRouteEditStatus('Заїзд розпочато. W/↑ — газ, S/↓ або пробіл — гальмо. Автомобіль рухається по побудованій траєкторії.');
  }
  updateStatus();$('#modeName').textContent='Екзаменаційний режим';$('#assessment').textContent='Фіксація помилок та оцінювання';say('Іспит розпочато','Підказки вимкнено. Дотримуйтеся правил дорожнього руху.');});
$('#reset').addEventListener('click',()=>{speed=0;started=false;mapDriving=false;routeProgressMeters=0;if(routeCar&&routePath.length)routeCar.setPosition(routePath[0]);elapsed=0;distance=0;steering=0;signal='—';updateStatus();$('#elapsed').textContent='00:00';say('Автомобіль скинуто','Натисніть «Почати заїзд», щоб почати знову.');});
document.querySelectorAll('[data-box]').forEach(b=>b.addEventListener('click',()=>{gearbox=b.dataset.box;document.querySelectorAll('[data-box]').forEach(x=>x.classList.toggle('active',x===b));$('#manualGears').hidden=gearbox!=='manual';$('#autoGears').hidden=gearbox!=='auto';gear=gearbox==='manual'?'1':'D';$('#gearValue').textContent=gear;}));
document.querySelectorAll('[data-camera]').forEach(b=>b.addEventListener('click',()=>{camera=b.dataset.camera;document.querySelectorAll('[data-camera]').forEach(x=>x.classList.toggle('active',x===b));}));
document.querySelectorAll('[data-gear]').forEach(b=>b.addEventListener('click',()=>{gear=b.dataset.gear;document.querySelectorAll('[data-gear]').forEach(x=>x.classList.toggle('chosen',x===b));$('#gearValue').textContent=gear;}));
window.addEventListener('keydown',e=>{const k=e.key.toLowerCase();keys[k]=true;if(['arrowup','arrowdown','arrowleft','arrowright',' '].includes(e.key))e.preventDefault();if(k==='q')setSignal('←');if(k==='e')setSignal('→');if(k==='l'){lights=!lights;$('#lights').textContent='Світло: '+(lights?'увімкнено':'вимкнено');updateStatus();}if(k==='c'){camera=camera==='cockpit'?'chase':'cockpit';document.querySelectorAll('[data-camera]').forEach(x=>x.classList.toggle('active',x.dataset.camera===camera));}});
window.addEventListener('keyup',e=>{keys[e.key.toLowerCase()]=false;});
document.querySelectorAll('[data-touch]').forEach(b=>{const k=b.dataset.touch;b.addEventListener('pointerdown',e=>{e.preventDefault();keys[k]=true;});['pointerup','pointerleave','pointercancel'].forEach(ev=>b.addEventListener(ev,()=>keys[k]=false));});
function animate(now){const dt=Math.min((now-last)/1000,.04);last=now;if(started){if(keys.w||keys.arrowup)speed=Math.min(speed+8*dt,gearbox==='auto'?20:Math.max(5,Number(gear)||1)*5);else speed=Math.max(0,speed-2.4*dt);if(keys.s||keys.arrowdown||keys[' '])speed=Math.max(0,speed-14*dt);const steerTarget=(keys.d||keys.arrowright?1:0)-(keys.a||keys.arrowleft?1:0);steering+=(steerTarget-steering)*Math.min(1,dt*4);distance+=speed*dt*12;if(mapVisible||driverVisible)advanceMapCar(dt);
if(driverVisible&&mapDriving&&streetPanorama&&routePathMeters.length&&Math.abs(routeProgressMeters-lastPanoMeters)>35&&performance.now()-lastPanoRequest>2500){
 lastPanoMeters=routeProgressMeters;lastPanoRequest=performance.now();
 const pos=positionOnRoute(routeProgressMeters);
 streetService.getPanorama({location:pos,radius:80,preference:'NEAREST'},(data,status)=>{
   if(status==='OK'&&data?.location?.pano&&driverVisible&&streetPanorama){
     streetPanorama.setPano(data.location.pano);
     streetPanorama.setPov({heading:routeHeadingAt(routeProgressMeters),pitch:0});
   }else if(status&&status!=='ZERO_RESULTS'){
     console.warn('Street View next-panorama lookup failed',{status,position:pos});
   }
 });
}
elapsed+=dt;turnClock+=dt;updateGuide(now);$('#elapsed').textContent=new Date(elapsed*1000).toISOString().slice(14,19);}$('#speed').textContent=Math.round(speed*3.6);draw();
requestAnimationFrame(animate);}
requestAnimationFrame(animate);