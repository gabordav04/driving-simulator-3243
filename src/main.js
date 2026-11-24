const $ = (s) => document.querySelector(s);
const routeFiles = Array.from({length:10},(_,i)=>({id:i+1,url:`/assets/routes/route-${String(i+1).padStart(2,"0")}.jpg`}));
const route=$('#route');
routeFiles.forEach(r=>{const o=document.createElement('option');o.value=r.id;o.textContent=`Маршрут №${r.id}`;route.append(o)});
function showRoute(){const r=routeFiles.find(x=>x.id===Number(route.value));$('#routeImage').src=r.url;$('#routeCaption').textContent=`Схема маршруту №${r.id} · зображення буде підключене після додавання файлів до репозиторію`;$('#routeImage').onerror=()=>{$('#routeImage').style.display='none';$('#routeCaption').textContent='Схема №'+r.id+' вибрана. Файл схеми ще не опублікований у вебрепозиторії.'};$('#routeImage').onload=()=>{$('#routeImage').style.display='block'};}
route.addEventListener('change',showRoute);showRoute();
const PROFILE_KEY='ds3243.profile.v1',PROGRESS_KEY='ds3243.progress.v1';
function loadProfile(){try{const p=JSON.parse(localStorage.getItem(PROFILE_KEY)||'{}');$('#fullName').value=p.fullName||'';$('#phone').value=p.phone||'';}catch{}}
function renderProgress(){try{const list=JSON.parse(localStorage.getItem(PROGRESS_KEY)||'[]');$('#progressText').textContent=list.length?list.slice(-5).reverse().map(x=>`Маршрут №${x.route} · ${x.mode==='learn'?'навчання':'іспит'} · ${x.duration} хв`).join(' | '):'Поки немає завершених тренувань.';}catch{$('#progressText').textContent='Не вдалося прочитати локальну історію.'}}
loadProfile();renderProgress();
$('#saveProfile').addEventListener('click',()=>{const fullName=$('#fullName').value.trim(),phone=$('#phone').value.trim();if(!fullName){$('#profileStatus').textContent='Введіть ПІБ.';return;}if(phone&&!/^[+()\\d\\s-]{7,20}$/.test(phone)){$('#profileStatus').textContent='Перевірте формат номера телефону.';return;}localStorage.setItem(PROFILE_KEY,JSON.stringify({fullName,phone}));$('#profileStatus').textContent='Профіль збережено в цьому браузері.';});
$('#clearProgress').addEventListener('click',()=>{localStorage.removeItem(PROGRESS_KEY);renderProgress();});

// Google Maps: the browser key is stored locally and is never committed to GitHub.
const MAPS_KEY='ds3243.googlemaps.key.v1';
let googleMap=null, mapsLoaded=false, mapVisible=false;
const mapInput=$('#mapsKey'), mapStatus=$('#mapsKeyStatus');
mapInput.value=localStorage.getItem(MAPS_KEY)||'';
function setMapMessage(message){$('#mapMessage').textContent=message;}
async function loadGoogleMap(apiKey){
  if(!apiKey){setMapMessage('Спочатку встав API-ключ Google Maps у лівій панелі.');return;}
  if(!mapsLoaded){
    setMapMessage('Завантажуємо Google Maps…');
    const script=document.createElement('script');
    script.src='https://maps.googleapis.com/maps/api/js?key='+encodeURIComponent(apiKey)+'&v=weekly&language=uk&region=UA';
    script.async=true;
    script.onerror=()=>setMapMessage('Не вдалося завантажити Google Maps. Перевір ключ, обмеження Websites та Maps JavaScript API.');
    document.head.appendChild(script);
    try{
      await new Promise((resolve,reject)=>{script.onload=resolve;script.onerror=()=>reject(new Error('Maps script failed'));});
      mapsLoaded=true;
    }catch{return;}
  }
  try{
    const {Map}=await google.maps.importLibrary('maps');
    if(!googleMap){
      googleMap=new Map($('#googleMap'),{
        center:{lat:50.51097,lng:30.79106},
        zoom:14,
        mapTypeControl:true,
        streetViewControl:true,
        fullscreenControl:true,
        clickableIcons:true
      });
      new google.maps.Marker({map:googleMap,position:{lat:50.51097,lng:30.79106},title:'Бровари'});
    }
    setMapMessage('Google Maps завантажено. Центр карти — Бровари. Маршрути ігрового автомобіля ще не прив’язані до дорожньої геометрії.');
    setTimeout(()=>google.maps.event.trigger(googleMap,'resize'),100);
  }catch(error){
    setMapMessage('Помилка ініціалізації карти. Перевір налаштування ключа в Google Cloud.');
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
  mapVisible=showMap;
  $('#googleMap').style.display=showMap?'block':'none';
  canvas.style.display=showMap?'none':'block';
  $('#mapMessage').style.display=showMap?'block':'none';
  $('#showMap').classList.toggle('active',showMap);
  $('#showSim').classList.toggle('active',!showMap);
  if(showMap){
    const key=localStorage.getItem(MAPS_KEY);
    if(key)loadGoogleMap(key);
    else setMapMessage('Введи API-ключ Google Maps у лівій панелі та натисни «Зберегти ключ».');
  }
}
$('#showMap').addEventListener('click',()=>setView(true));
$('#showSim').addEventListener('click',()=>setView(false));


const canvas=$('#scene'),ctx=canvas.getContext('2d');
let mode='learn',gearbox='manual',gear='1',camera='cockpit',started=false,speed=0,elapsed=0,distance=0,steering=0,signal='—',lights=false,keys={},last=performance.now(),turnClock=0,lessonShown=false;
const scenarios={
 intersection:{title:'Наближення до перехрестя',text:'Завчасно зменш швидкість. Оціни знаки пріоритету, оглянь обидва напрямки та переконайся, що маневр безпечний.'},
 pedestrian:{title:'Пішохідний перехід',text:'Зменш швидкість і стеж за тротуарами з обох боків. Будь готовий зупинитися, щоб пропустити пішохода.'},
 lights:{title:'Регульоване перехрестя',text:'Орієнтуйся на сигнали світлофора. На заборонний сигнал зупинися перед стоп-лінією.'},
 turn:{title:'Підготовка до повороту',text:'Завчасно увімкни покажчик, перевір дзеркала та сліпу зону, займи належне положення на проїзній частині.'},
 parking:{title:'Зупинка біля узбіччя',text:'Оціни обстановку позаду, подай сигнал, плавно знизь швидкість і зупинись у дозволеному безпечному місці.'}
};
function say(title,text){$('#coachTitle').textContent=title;$('#coachText').textContent=text;$('#scenarioHint').textContent=text;}
function resize(){const r=canvas.getBoundingClientRect(),dpr=Math.min(window.devicePixelRatio||1,2);canvas.width=Math.max(1,Math.round(r.width*dpr));canvas.height=Math.max(1,Math.round(r.height*dpr));ctx.setTransform(dpr,0,0,dpr,0,0);}
new ResizeObserver(resize).observe(canvas);window.addEventListener('resize',resize);resize();
function path(points,color){ctx.fillStyle=color;ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.closePath();ctx.fill();}
function draw(){
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
function updateStatus(){$('#signalValue').textContent=signal;$('#carState').textContent=(started?'Двигун працює':'Двигун зупинений')+' · '+(lights?'світло увімкнено':'світло вимкнено')+' · '+(signal==='—'?'поворотник вимкнено':'сигнал '+signal);}
function setSignal(value){signal=signal===value?'—':value;$('#leftSignal').classList.toggle('active',signal==='←');$('#rightSignal').classList.toggle('active',signal==='→');updateStatus();}
$('#leftSignal').addEventListener('click',()=>setSignal('←'));$('#rightSignal').addEventListener('click',()=>setSignal('→'));
$('#lights').addEventListener('click',()=>{lights=!lights;$('#lights').textContent='Світло: '+(lights?'увімкнено':'вимкнено');$('#lights').classList.toggle('active',lights);updateStatus();});
$('#horn').addEventListener('click',()=>say('Звуковий сигнал','Сигнал активовано в симуляції. Використовуй його лише за необхідності.'));
$('#scenario').addEventListener('change',()=>{const s=scenarios[$('#scenario').value];say('Обрана ситуація: '+s.title,'Натисніть «Почати заїзд» або запитайте інструктора.');});
$('#start').addEventListener('click',()=>{started=true;updateStatus();const s=scenarios[$('#scenario').value];say(mode==='learn'?s.title:'Екзамен розпочато',mode==='learn'?s.text:'Підказки вимкнено. Дотримуйтеся правил дорожнього руху. Демонстраційна версія ще не має офіційного оцінювання.');});
$('#reset').addEventListener('click',()=>{if(started&&elapsed>=5){const list=JSON.parse(localStorage.getItem(PROGRESS_KEY)||'[]');list.push({route:Number(route.value),mode,duration:Number((elapsed/60).toFixed(1)),savedAt:new Date().toISOString()});localStorage.setItem(PROGRESS_KEY,JSON.stringify(list.slice(-50)));renderProgress();}speed=0;started=false;elapsed=0;distance=0;steering=0;signal='—';updateStatus();$('#elapsed').textContent='00:00';say('Автомобіль скинуто','Натисніть «Почати заїзд», щоб почати знову.');});
document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>{mode=b.dataset.mode;document.querySelectorAll('[data-mode]').forEach(x=>x.classList.toggle('active',x===b));$('#modeName').textContent=mode==='learn'?'Навчальний режим':'Екзаменаційний режим';$('#assessment').textContent=mode==='learn'?'Навчання з поясненнями':'Без підказок · демонстраційне оцінювання';say(mode==='learn'?'Інструктор готовий':'Екзаменаційний режим',mode==='learn'?'Оберіть навчальну ситуацію та почніть рух.':'Підказки вимкнено. Офіційні штрафні бали ще не реалізовані.');}));
document.querySelectorAll('[data-box]').forEach(b=>b.addEventListener('click',()=>{gearbox=b.dataset.box;document.querySelectorAll('[data-box]').forEach(x=>x.classList.toggle('active',x===b));$('#manualGears').hidden=gearbox!=='manual';$('#autoGears').hidden=gearbox!=='auto';gear=gearbox==='manual'?'1':'D';$('#gearValue').textContent=gear;}));
document.querySelectorAll('[data-camera]').forEach(b=>b.addEventListener('click',()=>{camera=b.dataset.camera;document.querySelectorAll('[data-camera]').forEach(x=>x.classList.toggle('active',x===b));}));
document.querySelectorAll('[data-gear]').forEach(b=>b.addEventListener('click',()=>{gear=b.dataset.gear;document.querySelectorAll('[data-gear]').forEach(x=>x.classList.toggle('chosen',x===b));$('#gearValue').textContent=gear;}));
window.addEventListener('keydown',e=>{const k=e.key.toLowerCase();keys[k]=true;if(['arrowup','arrowdown','arrowleft','arrowright',' '].includes(e.key))e.preventDefault();if(k==='q')setSignal('←');if(k==='e')setSignal('→');if(k==='l'){lights=!lights;$('#lights').textContent='Світло: '+(lights?'увімкнено':'вимкнено');updateStatus();}if(k==='c'){camera=camera==='cockpit'?'chase':'cockpit';document.querySelectorAll('[data-camera]').forEach(x=>x.classList.toggle('active',x.dataset.camera===camera));}});
window.addEventListener('keyup',e=>{keys[e.key.toLowerCase()]=false;});
document.querySelectorAll('[data-touch]').forEach(b=>{const k=b.dataset.touch;b.addEventListener('pointerdown',e=>{e.preventDefault();keys[k]=true;});['pointerup','pointerleave','pointercancel'].forEach(ev=>b.addEventListener(ev,()=>keys[k]=false));});
function animate(now){const dt=Math.min((now-last)/1000,.04);last=now;if(started){if(keys.w||keys.arrowup)speed=Math.min(speed+8*dt,gearbox==='auto'?20:Math.max(5,Number(gear)||1)*5);else speed=Math.max(0,speed-2.4*dt);if(keys.s||keys.arrowdown)speed=Math.max(0,speed-14*dt);const steerTarget=(keys.d||keys.arrowright?1:0)-(keys.a||keys.arrowleft?1:0);steering+=(steerTarget-steering)*Math.min(1,dt*4);distance+=speed*dt*12;elapsed+=dt;turnClock+=dt;$('#elapsed').textContent=new Date(elapsed*1000).toISOString().slice(14,19);}$('#speed').textContent=Math.round(speed*3.6);draw();requestAnimationFrame(animate);}
requestAnimationFrame(animate);