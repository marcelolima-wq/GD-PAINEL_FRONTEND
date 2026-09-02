const APP_KEY='gd-painel-state-v2';
const PLAYBACK_KEY='gd-painel-playback-v1';
const DB_NAME='gd-painel-media';
const DB_STORE='files';
const $=id=>document.getElementById(id);
const uid=()=>crypto.randomUUID?.()||`${Date.now()}-${Math.random().toString(16).slice(2)}`;
const shortCode=()=>Array.from({length:6},()=>"ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random()*32)]).join('');
const escapeHtml=value=>String(value).replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
const svgData=(bg,accent,path,label)=>`data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000"><rect width="1600" height="1000" fill="${bg}"/><circle cx="1320" cy="190" r="340" fill="${accent}" opacity=".16"/><path d="${path}" fill="${accent}"/><text x="110" y="790" fill="#f4f6ed" font-family="Arial" font-size="42" letter-spacing="8">${label}</text><text x="110" y="840" fill="${accent}" font-family="Arial" font-size="16" letter-spacing="5">GD PAINEL / CONTEÚDO DIGITAL</text></svg>`)}`;

const demoMedia=[
  {id:'demo-1',name:'Campanha institucional',type:'image',size:1450000,source:'demo',src:svgData('#163c3d','#d7f65b','M0 170 C380 30 500 800 980 470 S1320 210 1600 410 L1600 1000 L0 1000Z','CAMPANHA / 01')},
  {id:'demo-2',name:'Boas-vindas',type:'image',size:980000,source:'demo',src:svgData('#7e3e2d','#f5bf87','M0 0 L900 0 C1020 250 830 400 1100 540 C1320 650 1310 830 1600 760 L1600 1000 L0 1000Z','CAMPANHA / 02')},
  {id:'demo-3',name:'Vídeo natureza',type:'video',size:6200000,source:'demo',src:'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4'},
  {id:'demo-4',name:'Novidades da semana',type:'image',size:1100000,source:'demo',src:svgData('#3c315b','#c7b7ff','M0 760 C250 500 440 650 650 380 C910 50 1110 310 1600 0 L1600 1000 L0 1000Z','CAMPANHA / 04')}
];

const defaultState=()=>({
  library:demoMedia.map(item=>({...item})),
  playlists:[{id:'playlist-main',code:'GD2026',name:'Playlist principal',repeat:true,createdAt:Date.now(),items:demoMedia.map((media,index)=>({id:`demo-item-${index}`,mediaId:media.id,duration:media.type==='image'?[8,10,8,7][index]:0}))}],
  activePlaylistId:'playlist-main'
});

let state=loadState();
let libraryFilter='all';
let libraryQuery='';
let playlistQuery='';
let tvIndex=0;
let tvTimer=null;
let tvFrame=null;
let modalAction=null;
let playbackTimer=null;
let panelAuthenticated=false;
let remoteVersion=null;
let serverPlayback=null;
let stateSaveTimer=null;
let tvSyncTimer=null;
let tvHeartbeatTimer=null;
let tvReference=null;
let uploadInProgress=false;

function loadState(){
  try{
    const saved=JSON.parse(localStorage.getItem(APP_KEY));
    if(saved?.library&&Array.isArray(saved.playlists)&&saved.playlists.length){saved.playlists.forEach(playlist=>playlist.code||=(playlist.id==='playlist-main'?'GD2026':shortCode()));return saved}
  }catch(error){console.warn('Não foi possível carregar os dados salvos.',error)}
  return defaultState();
}

function saveState(){
  const clean={...state,library:state.library.map(media=>({...media,src:media.source==='demo'?(demoMedia.find(item=>item.id===media.id)?.src||media.src):media.src}))};
  localStorage.setItem(APP_KEY,JSON.stringify(clean));
  if(panelAuthenticated){clearTimeout(stateSaveTimer);stateSaveTimer=setTimeout(pushState,350)}
}
function loadPlayback(){
  try{return JSON.parse(localStorage.getItem(PLAYBACK_KEY))||null}catch{return null}
}
function savePlayback(playback){localStorage.setItem(PLAYBACK_KEY,JSON.stringify(playback))}
function sharedState(){return{...state,library:state.library.filter(media=>media.src&&!media.src.startsWith('blob:')).map(media=>({...media,source:media.source==='idb'?'legacy':media.source}))}}
async function pushState(){
  try{const response=await fetch('/api/state',{method:'PUT',credentials:'same-origin',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({state:sharedState()})});const data=await response.json();if(!response.ok)throw new Error(data.error||'Falha ao sincronizar.');remoteVersion=data.document?.version||remoteVersion;return true}
  catch(error){console.error('Sincronização falhou.',error);showToast('Não foi possível sincronizar com a TV.');return false}
}
async function pullState(){
  const response=await fetch('/api/state',{credentials:'same-origin',headers:{Accept:'application/json'},cache:'no-store'});const data=await response.json();if(!response.ok)throw new Error(data.error||'Falha ao carregar dados.');
  if(data.document?.state){state=data.document.state;remoteVersion=data.document.version;localStorage.setItem(APP_KEY,JSON.stringify(state));return}
  await pushState();
}
async function refreshServerPlayback(){
  if(!panelAuthenticated)return;
  try{const response=await fetch('/api/playback',{credentials:'same-origin',headers:{Accept:'application/json'},cache:'no-store'});const data=await response.json();serverPlayback=response.ok&&data.active?data.playback:null;if(!$('dashboard').hidden)renderDashboard()}
  catch{serverPlayback=null}
}
function formatElapsed(startedAt){
  const seconds=Math.max(0,Math.floor((Date.now()-startedAt)/1000));
  const hours=Math.floor(seconds/3600),minutes=Math.floor((seconds%3600)/60),rest=seconds%60;
  if(hours)return`${hours}h ${String(minutes).padStart(2,'0')}m`;
  if(minutes)return`${minutes}m ${String(rest).padStart(2,'0')}s`;
  return`${rest}s`;
}

function openDatabase(){
  return new Promise((resolve,reject)=>{const request=indexedDB.open(DB_NAME,1);request.onupgradeneeded=()=>request.result.createObjectStore(DB_STORE);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});
}
async function storeBlob(id,blob){const db=await openDatabase();return new Promise((resolve,reject)=>{const tx=db.transaction(DB_STORE,'readwrite');tx.objectStore(DB_STORE).put(blob,id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)})}
async function readBlob(id){const db=await openDatabase();return new Promise((resolve,reject)=>{const request=db.transaction(DB_STORE).objectStore(DB_STORE).get(id);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)})}
async function removeBlob(id){const db=await openDatabase();return new Promise(resolve=>{const tx=db.transaction(DB_STORE,'readwrite');tx.objectStore(DB_STORE).delete(id);tx.oncomplete=resolve;tx.onerror=resolve})}

async function hydrateLibrary(){
  await Promise.all(state.library.map(async media=>{if(media.source==='idb'&&!media.src){const blob=await readBlob(media.id).catch(()=>null);if(blob)media.src=URL.createObjectURL(blob)}}));
}

function activePlaylist(){
  let playlist=state.playlists.find(item=>item.id===state.activePlaylistId);
  if(!playlist){playlist=state.playlists[0];state.activePlaylistId=playlist.id}
  return playlist;
}
function mediaById(id){return state.library.find(item=>item.id===id)}
function playlistDuration(playlist){return playlist.items.reduce((total,item)=>total+(mediaById(item.mediaId)?.type==='video'?15:Number(item.duration)||8),0)}
function formatDuration(seconds){if(seconds<60)return`${seconds}s`;const minutes=Math.floor(seconds/60),rest=seconds%60;return rest?`${minutes}m ${rest}s`:`${minutes} min`}
function formatSize(bytes){if(!bytes)return'—';if(bytes<1e6)return`${Math.max(1,Math.round(bytes/1000))} KB`;return`${(bytes/1e6).toFixed(bytes<1e7?1:0)} MB`}
function showToast(message){const toast=$('toast');toast.textContent=message;toast.classList.add('show');clearTimeout(showToast.timer);showToast.timer=setTimeout(()=>toast.classList.remove('show'),2600)}

async function setAuthenticatedView(){
  const tvCode=new URLSearchParams(location.search).get('tv');
  if(tvCode){panelAuthenticated=false;$('loginScreen').hidden=true;$('dashboard').hidden=true;await openTv(tvCode);return}
  let authenticated=false,email='';
  try{const response=await fetch('/api/auth/session',{credentials:'same-origin',headers:{Accept:'application/json'},cache:'no-store'});const data=await response.json();authenticated=response.ok&&data.authenticated===true;email=data.email||''}catch(error){console.warn('Servidor de autenticação indisponível.',error)}
  $('loginScreen').hidden=authenticated;
  $('dashboard').hidden=!authenticated;
  panelAuthenticated=authenticated;
  if(authenticated){$('accountEmail').textContent=email||'usuario@empresa.com';$('accountAvatar').textContent=(email||'U').charAt(0).toUpperCase();try{await pullState()}catch(error){console.error(error);showToast('Usando cópia local: servidor indisponível.')}renderAll();await refreshServerPlayback()}
}

$('loginForm').addEventListener('submit',async event=>{
  event.preventDefault();
  const email=$('loginEmail').value.trim();
  const password=$('loginPassword').value;
  if(!$('loginEmail').checkValidity()){$('loginError').textContent='Informe um e-mail válido.';return}
  const submit=event.submitter||$('loginForm').querySelector('[type="submit"]');submit.disabled=true;$('loginError').textContent='Autenticando...';
  try{const response=await fetch('/api/auth/login',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({email,password})});const data=await response.json();if(!response.ok)throw new Error(data.error||'Não foi possível entrar.');$('loginPassword').value='';$('loginError').textContent='';await setAuthenticatedView()}catch(error){$('loginError').textContent=error.message;$('loginPassword').select()}finally{submit.disabled=false}
});
$('togglePassword').addEventListener('click',()=>{const field=$('loginPassword');field.type=field.type==='password'?'text':'password';$('togglePassword').setAttribute('aria-label',field.type==='password'?'Mostrar senha':'Ocultar senha')});
$('logoutButton').addEventListener('click',async()=>{try{await fetch('/api/auth/logout',{method:'POST',credentials:'same-origin'})}finally{$('loginPassword').value='';await setAuthenticatedView()}});

const pageCopy={
  panel:['Visão geral','Acompanhe sua programação e mantenha a TV no ar.'],
  library:['Biblioteca','Envie, encontre e organize os conteúdos disponíveis.'],
  playlists:['Playlists','Monte a ordem e o tempo de exibição de cada conteúdo.']
};
function navigate(view){
  document.querySelectorAll('.view').forEach(element=>element.classList.toggle('active-view',element.id===`${view}View`));
  document.querySelectorAll('[data-nav]').forEach(element=>element.classList.toggle('active',element.classList.contains('nav-item')&&element.dataset.nav===view));
  $('pageTitle').textContent=pageCopy[view][0];$('pageSubtitle').textContent=pageCopy[view][1];
  if(view==='library')renderLibrary();if(view==='playlists')renderPlaylists();
}
document.querySelectorAll('[data-nav]').forEach(button=>button.addEventListener('click',event=>{event.preventDefault();navigate(button.dataset.nav)}));

function renderAll(){
  const date=new Intl.DateTimeFormat('pt-BR',{weekday:'long',day:'2-digit',month:'long'}).format(new Date()).toUpperCase();$('todayLabel').textContent=date;
  renderDashboard();renderLibrary();renderPlaylists();
}
function renderDashboard(){
  const playlist=activePlaylist();
  const firstItem=playlist.items[0];const firstMedia=firstItem&&mediaById(firstItem.mediaId);
  $('heroSummary').textContent=`${playlist.name} · ${playlist.items.length} ${playlist.items.length===1?'item':'itens'} · ${formatDuration(playlistDuration(playlist))} · ${playlist.repeat?'loop ativado':'sem repetição'}`;
  const playback=serverPlayback;const livePlaylist=playback?.playlistId&&state.playlists.find(item=>item.id===playback.playlistId);const active=livePlaylist&&playback.startedAt;
  const status=$('activeBroadcastStatus');status.classList.toggle('is-offline',!active);status.innerHTML=active?`<i class="status-dot"></i><span><strong>${escapeHtml(livePlaylist.name)}</strong> ativa há ${formatElapsed(playback.startedAt)}</span>`:'<i class="status-dot"></i><span>TV aguardando conexão</span>';
  $('statMedia').textContent=state.library.length;$('statPlaylists').textContent=state.playlists.length;$('statDuration').textContent=formatDuration(playlistDuration(playlist));
  $('libraryBadge').textContent=state.library.length;$('playlistBadge').textContent=state.playlists.length;
  const preview=$('dashboardPreview');preview.style.backgroundImage=firstMedia?.type==='image'&&firstMedia.src?`url("${firstMedia.src}")`:'';preview.classList.toggle('is-video',firstMedia?.type==='video');
  renderMiniTv();
}
function renderMiniTv(){
  const playback=serverPlayback;const playlist=playback?.playlistId&&state.playlists.find(item=>item.id===playback.playlistId);const preview=$('dashboardPreview');const video=$('dashboardPreviewVideo');
  if(!playlist||playback.currentIndex==null){preview.style.backgroundImage='';preview.classList.remove('is-video');video.hidden=true;video.pause();return}
  const item=playlist.items[playback.currentIndex];const media=item&&mediaById(item.mediaId);if(!media){return}
  if(media.type==='video'){
    preview.style.backgroundImage='';preview.classList.add('is-video');video.hidden=false;
    if(video.src!==media.src){video.src=media.src;video.load()}
    const offset=Math.max(0,(Date.now()-(playback.itemStartedAt||Date.now()))/1000);
    if(Number.isFinite(video.duration)&&video.duration>0&&Math.abs(video.currentTime-offset)>2)video.currentTime=Math.min(offset,Math.max(0,video.duration-.1));
    video.play().catch(()=>{});
  }else{
    video.hidden=true;video.pause();preview.classList.remove('is-video');preview.style.backgroundImage=media.src?`url("${media.src}")`:'';
  }
}

function renderLibrary(){
  const filtered=state.library.filter(media=>(libraryFilter==='all'||media.type===libraryFilter)&&media.name.toLowerCase().includes(libraryQuery));
  $('countAll').textContent=state.library.length;$('countImages').textContent=state.library.filter(item=>item.type==='image').length;$('countVideos').textContent=state.library.filter(item=>item.type==='video').length;
  $('libraryBadge').textContent=state.library.length;
  $('libraryGrid').innerHTML=filtered.map(media=>`<article class="media-card"><div class="media-thumb" style="background-image:${media.type==='image'&&media.src?`url(&quot;${media.src}&quot;)`:'none'}"><span class="media-type">${media.type==='image'?'IMAGEM':'VÍDEO'}</span>${media.type==='video'?'<span class="media-video-play">▶</span>':''}</div><div class="media-body"><strong title="${escapeHtml(media.name)}">${escapeHtml(media.name)}</strong><small>${formatSize(media.size)}</small></div><div class="media-actions"><button class="add-to-playlist" data-add-media="${media.id}">＋ Playlist</button><button class="delete-media" data-delete-media="${media.id}" title="Excluir mídia">×</button></div></article>`).join('');
  $('libraryEmpty').hidden=filtered.length>0;
  document.querySelectorAll('[data-add-media]').forEach(button=>button.addEventListener('click',()=>addMediaToPlaylist(button.dataset.addMedia)));
  document.querySelectorAll('[data-delete-media]').forEach(button=>button.addEventListener('click',()=>confirmDeleteMedia(button.dataset.deleteMedia)));
}
document.querySelectorAll('#libraryFilters button').forEach(button=>button.addEventListener('click',()=>{libraryFilter=button.dataset.filter;document.querySelectorAll('#libraryFilters button').forEach(item=>item.classList.toggle('active',item===button));renderLibrary()}));
$('librarySearch').addEventListener('input',event=>{libraryQuery=event.target.value.trim().toLowerCase();renderLibrary()});

async function addFiles(files){
  const accepted=[...files].filter(file=>(file.type.startsWith('image/')||file.type.startsWith('video/'))&&file.size<=250*1024*1024);
  if(!accepted.length){showToast('Selecione imagens ou vídeos de até 250 MB.');return}
  if(uploadInProgress){showToast('Aguarde o envio atual terminar.');return}
  uploadInProgress=true;let uploaded=0;
  try{const upload=window.VercelBlobClient?.upload;if(typeof upload!=='function')throw new Error('Cliente de upload indisponível.');for(const file of accepted){const position=uploaded+1;const blob=await upload(`gd-painel/${Date.now()}-${file.name}`,file,{access:'public',handleUploadUrl:'/api/media/upload',onUploadProgress:progress=>showToast(`Enviando ${position}/${accepted.length} · ${Math.round(progress.percentage||0)}%`)});state.library.unshift({id:uid(),name:file.name,type:file.type.startsWith('video/')?'video':'image',size:file.size,source:'blob',src:blob.url});uploaded++}saveState();clearTimeout(stateSaveTimer);renderAll();const synchronized=await pushState();if(synchronized)showToast(`${uploaded} ${uploaded===1?'arquivo enviado e sincronizado.':'arquivos enviados e sincronizados.'}`)}
  catch(error){console.error(error);if(uploaded){saveState();clearTimeout(stateSaveTimer);renderAll();await pushState()}showToast(uploaded?'Envio parcial salvo. Tente novamente.':'Falha no envio. Tente novamente.')}
  finally{uploadInProgress=false}
}
$('fileInput').addEventListener('change',event=>{const files=[...event.target.files];event.target.value='';addFiles(files)});
['dragenter','dragover'].forEach(type=>$('dropZone').addEventListener(type,event=>{event.preventDefault();$('dropZone').classList.add('dragover')}));
['dragleave','drop'].forEach(type=>$('dropZone').addEventListener(type,event=>{event.preventDefault();$('dropZone').classList.remove('dragover')}));
$('dropZone').addEventListener('drop',event=>addFiles(event.dataTransfer.files));

function addMediaToPlaylist(mediaId){const playlist=activePlaylist();playlist.items.push({id:uid(),mediaId,duration:mediaById(mediaId)?.type==='image'?8:0});saveState();renderAll();showToast(`Adicionado à “${playlist.name}”.`)}
function confirmDeleteMedia(mediaId){const media=mediaById(mediaId);openModal({eyebrow:'EXCLUIR MÍDIA',title:'Remover este arquivo?',description:`“${media.name}” também será removido de todas as playlists.`,confirmText:'Excluir mídia',danger:true,showField:false,onConfirm:async()=>{state.library=state.library.filter(item=>item.id!==mediaId);state.playlists.forEach(playlist=>playlist.items=playlist.items.filter(item=>item.mediaId!==mediaId));if(media.source==='idb')await removeBlob(mediaId);if(media.source==='blob'&&media.src)fetch('/api/media/delete',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:media.src})}).catch(console.error);saveState();renderAll();showToast('Mídia excluída e programação sincronizada.')}})}

function renderPlaylists(){
  const current=activePlaylist();
  const playlists=state.playlists.filter(item=>item.name.toLowerCase().includes(playlistQuery));
  $('playlistCards').innerHTML=playlists.map(item=>`<article class="playlist-card ${item.id===current.id?'selected':''}"><button class="playlist-select" data-playlist-id="${item.id}"><span class="playlist-color">☷</span><span><strong>${escapeHtml(item.name)}</strong><small>${item.items.length} ${item.items.length===1?'item':'itens'} · ${formatDuration(playlistDuration(item))}</small></span></button></article>`).join('');
  document.querySelectorAll('[data-playlist-id]').forEach(button=>button.addEventListener('click',()=>{state.activePlaylistId=button.dataset.playlistId;saveState();renderAll()}));
  $('activePlaylistName').textContent=current.name;$('activePlaylistMeta').textContent=`${current.items.length} ${current.items.length===1?'item':'itens'} · ${formatDuration(playlistDuration(current))}`;$('repeatToggle').checked=current.repeat;$('playlistBadge').textContent=state.playlists.length;
  $('playlistItems').innerHTML=current.items.map((item,index)=>{const media=mediaById(item.mediaId);if(!media)return'';return`<article class="playlist-item" draggable="true" data-item-id="${item.id}"><span class="drag-handle">⠿</span><span class="item-order">${String(index+1).padStart(2,'0')}</span><span class="item-thumb" style="background-image:${media.type==='image'&&media.src?`url(&quot;${media.src}&quot;)`:'none'}">${media.type==='video'?'▶':''}</span><span class="item-copy"><strong>${escapeHtml(media.name)}</strong><small>${media.type==='image'?'Imagem':'Vídeo · duração original'}</small></span><label class="duration-control">${media.type==='image'?'Exibir':'Automático'} <input data-duration="${item.id}" type="number" min="1" max="3600" value="${media.type==='image'?item.duration:''}" ${media.type==='video'?'disabled':''}> ${media.type==='image'?'s':''}</label><button class="item-remove" data-remove-item="${item.id}" title="Remover da playlist">×</button></article>`}).join('');
  $('playlistEmpty').hidden=current.items.length>0;
  bindPlaylistItemEvents();renderDashboard();
}
function bindPlaylistItemEvents(){
  document.querySelectorAll('[data-duration]').forEach(input=>input.addEventListener('change',()=>{const item=activePlaylist().items.find(entry=>entry.id===input.dataset.duration);item.duration=Math.max(1,Number(input.value)||8);saveState();renderAll()}));
  document.querySelectorAll('[data-remove-item]').forEach(button=>button.addEventListener('click',()=>{const playlist=activePlaylist();playlist.items=playlist.items.filter(item=>item.id!==button.dataset.removeItem);saveState();renderAll();showToast('Item removido da playlist.')}));
  document.querySelectorAll('.playlist-item').forEach(row=>{row.addEventListener('dragstart',()=>row.classList.add('dragging'));row.addEventListener('dragend',()=>row.classList.remove('dragging'));row.addEventListener('dragover',event=>event.preventDefault());row.addEventListener('drop',()=>{const dragging=document.querySelector('.playlist-item.dragging');if(!dragging||dragging===row)return;const playlist=activePlaylist();const from=playlist.items.findIndex(item=>item.id===dragging.dataset.itemId);const to=playlist.items.findIndex(item=>item.id===row.dataset.itemId);playlist.items.splice(to,0,playlist.items.splice(from,1)[0]);saveState();renderAll()})});
}
$('playlistSearch').addEventListener('input',event=>{playlistQuery=event.target.value.trim().toLowerCase();renderPlaylists()});
$('repeatToggle').addEventListener('change',event=>{activePlaylist().repeat=event.target.checked;saveState();renderDashboard();showToast(event.target.checked?'Repetição ativada.':'Repetição desativada.')});
$('newPlaylistButton').addEventListener('click',()=>openModal({eyebrow:'NOVA PLAYLIST',title:'Crie uma nova programação',description:'Use um nome fácil de reconhecer, como Recepção ou Promoções.',confirmText:'Criar playlist',value:'',onConfirm:name=>{const playlist={id:uid(),code:shortCode(),name,repeat:true,createdAt:Date.now(),items:[]};state.playlists.unshift(playlist);state.activePlaylistId=playlist.id;saveState();renderAll();showToast('Playlist criada.')}}));
$('renamePlaylistButton').addEventListener('click',()=>{const playlist=activePlaylist();openModal({eyebrow:'EDITAR PLAYLIST',title:'Renomear playlist',description:'O link da TV continuará funcionando normalmente.',confirmText:'Salvar nome',value:playlist.name,onConfirm:name=>{playlist.name=name;saveState();renderAll();showToast('Nome atualizado.')}})});
$('deletePlaylistButton').addEventListener('click',()=>{const playlist=activePlaylist();if(state.playlists.length===1){showToast('Crie outra playlist antes de excluir esta.');return}openModal({eyebrow:'EXCLUIR PLAYLIST',title:'Excluir esta playlist?',description:`“${playlist.name}” será removida, mas os arquivos continuarão na Biblioteca.`,confirmText:'Excluir playlist',danger:true,showField:false,onConfirm:()=>{state.playlists=state.playlists.filter(item=>item.id!==playlist.id);state.activePlaylistId=state.playlists[0].id;saveState();renderAll();showToast('Playlist excluída.')}})});

function openModal(options){
  modalAction=options.onConfirm;$('modalEyebrow').textContent=options.eyebrow;$('modalTitle').textContent=options.title;$('modalDescription').textContent=options.description;$('modalConfirm').textContent=options.confirmText||'Salvar';$('modalConfirm').className=`button ${options.danger?'button-danger':'button-primary'}`;$('modalField').hidden=options.showField===false;$('modalInput').value=options.value||'';$('modalBackdrop').hidden=false;
  if(options.showField!==false)setTimeout(()=>$('modalInput').select(),40);
}
function closeModal(){$('modalBackdrop').hidden=true;modalAction=null}
$('modalClose').addEventListener('click',closeModal);$('modalCancel').addEventListener('click',closeModal);$('modalBackdrop').addEventListener('click',event=>{if(event.target===$('modalBackdrop'))closeModal()});
$('modalConfirm').addEventListener('click',async()=>{const value=$('modalInput').value.trim();if(!$('modalField').hidden&&!value){$('modalInput').focus();return}const action=modalAction;closeModal();if(action)await action(value)});
$('modalInput').addEventListener('keydown',event=>{if(event.key==='Enter')$('modalConfirm').click();if(event.key==='Escape')closeModal()});

function tvLink(){const url=new URL(location.href);url.search='';url.hash='';url.searchParams.set('tv',activePlaylist().code);return url.toString()}
async function copyText(value){try{await navigator.clipboard.writeText(value)}catch{const area=document.createElement('textarea');area.value=value;document.body.appendChild(area);area.select();document.execCommand('copy');area.remove()}}
async function copyCurrentTvLink(){await copyText(tvLink());showToast(`Link curto copiado · código ${activePlaylist().code}`)}
$('copyTvLinkHero').addEventListener('click',copyCurrentTvLink);$('generateLinkQuick').addEventListener('click',copyCurrentTvLink);$('generateLinkButton').addEventListener('click',copyCurrentTvLink);
$('openTvButton').addEventListener('click',()=>openTv(activePlaylist().code));

async function fetchTvState(reference){
  const response=await fetch(`/api/tv?code=${encodeURIComponent(reference)}`,{headers:{Accept:'application/json'},cache:'no-store'});const data=await response.json();if(!response.ok)throw new Error(data.error||'Programação indisponível.');return data
}
function showInvalidTv(message){
  clearTimeout(tvTimer);cancelAnimationFrame(tvFrame);$('tvImage').hidden=true;$('tvVideo').hidden=true;$('tvVideo').pause();$('tvEmpty').hidden=false;$('tvCounter').textContent='';$('tvMediaName').textContent=message||'Este link de TV não é mais válido.';$('tvProgress').style.width='0%'
}
async function openTv(playlistReference){
  tvReference=playlistReference;clearTimeout(tvSyncTimer);clearTimeout(tvHeartbeatTimer);$('loginScreen').hidden=true;$('dashboard').hidden=true;$('tvPlayer').hidden=false;
  try{const data=await fetchTvState(playlistReference);state=data.state;remoteVersion=data.version;tvReference=state.playlists[0].code;tvIndex=0;playTv();scheduleTvSync()}
  catch(error){showInvalidTv(error.message);scheduleTvSync()}
}
async function reportPlayback(){
  clearTimeout(tvHeartbeatTimer);if(!tvReference||$('tvPlayer').hidden)return;
  try{const local=loadPlayback();await fetch('/api/playback',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:tvReference,currentIndex:tvIndex,startedAt:Number(local?.startedAt)||Date.now(),itemStartedAt:Number(local?.itemStartedAt)||Date.now()})})}catch(error){console.warn('Status da TV não atualizado.',error)}
  tvHeartbeatTimer=setTimeout(reportPlayback,30000)
}
function scheduleTvSync(){clearTimeout(tvSyncTimer);tvSyncTimer=setTimeout(syncTvState,10000)}
async function syncTvState(){
  if(!tvReference||$('tvPlayer').hidden)return;
  try{const currentMedia=activePlaylist()?.items?.[tvIndex]?.mediaId;const data=await fetchTvState(tvReference);if(data.version!==remoteVersion){state=data.state;remoteVersion=data.version;const nextIndex=state.playlists[0].items.findIndex(item=>item.mediaId===currentMedia);tvIndex=nextIndex>=0?nextIndex:0;playTv()}}
  catch(error){showInvalidTv(error.message)}finally{scheduleTvSync()}
}
function playTv(){
  clearTimeout(tvTimer);cancelAnimationFrame(tvFrame);const playlist=activePlaylist();const item=playlist.items[tvIndex];const image=$('tvImage'),video=$('tvVideo');video.pause();video.removeAttribute('src');video.load();$('tvProgress').style.width='0%';
  if(!item){image.hidden=true;video.hidden=true;$('tvEmpty').hidden=false;$('tvCounter').textContent='';$('tvMediaName').textContent=playlist.name;return}
  const media=mediaById(item.mediaId);if(!media){advanceTv();return}const playback=loadPlayback();savePlayback({playlistId:playlist.id,startedAt:playback?.playlistId===playlist.id&&playback.startedAt?playback.startedAt:Date.now(),currentIndex:tvIndex,itemStartedAt:Date.now()});reportPlayback();$('tvEmpty').hidden=true;$('tvCounter').textContent=`${String(tvIndex+1).padStart(2,'0')} / ${String(playlist.items.length).padStart(2,'0')}`;$('tvMediaName').textContent=media.name;
  if(media.type==='video'){image.hidden=true;video.hidden=false;video.src=media.src;video.muted=true;video.currentTime=0;video.play().catch(()=>{});video.onended=advanceTv;video.ontimeupdate=()=>{if(video.duration)$('tvProgress').style.width=`${video.currentTime/video.duration*100}%`}}
  else{video.hidden=true;image.hidden=false;image.style.backgroundImage=`url("${media.src}")`;const duration=Math.max(1,Number(item.duration)||8)*1000,start=performance.now();const tick=now=>{const progress=Math.min(1,(now-start)/duration);$('tvProgress').style.width=`${progress*100}%`;if(progress<1)tvFrame=requestAnimationFrame(tick);else advanceTv()};tvFrame=requestAnimationFrame(tick)}
}
function advanceTv(){const playlist=activePlaylist();if(!playlist.items.length)return;if(tvIndex>=playlist.items.length-1&&!playlist.repeat)return;tvIndex=(tvIndex+1)%playlist.items.length;playTv()}
function fullscreenElement(){return document.fullscreenElement||document.webkitFullscreenElement||null}
function updateFullscreenButton(){const active=Boolean(fullscreenElement());const button=$('fullscreenTvButton');button.textContent=active?'⤢ Sair da tela cheia':'⛶ Tela cheia';button.setAttribute('aria-label',active?'Sair da tela cheia':'Ativar tela cheia')}
async function toggleTvFullscreen(){
  try{
    if(fullscreenElement()){const exit=document.exitFullscreen||document.webkitExitFullscreen;if(exit)await exit.call(document)}
    else{const player=$('tvPlayer');const request=player.requestFullscreen||player.webkitRequestFullscreen;if(!request)throw new Error('Tela cheia não suportada neste navegador.');await request.call(player)}
  }catch(error){console.warn('Não foi possível alterar a tela cheia.',error);showToast(error.message||'Não foi possível ativar a tela cheia.')}
  updateFullscreenButton()
}
$('fullscreenTvButton').addEventListener('click',toggleTvFullscreen);
document.addEventListener('fullscreenchange',updateFullscreenButton);document.addEventListener('webkitfullscreenchange',updateFullscreenButton);
$('exitTvButton').addEventListener('click',async()=>{clearTimeout(tvTimer);clearTimeout(tvSyncTimer);clearTimeout(tvHeartbeatTimer);cancelAnimationFrame(tvFrame);tvReference=null;$('tvVideo').pause();$('tvPlayer').hidden=true;if(fullscreenElement()){const exit=document.exitFullscreen||document.webkitExitFullscreen;if(exit)await exit.call(document)}const direct=new URLSearchParams(location.search).has('tv');if(direct){const url=new URL(location.href);url.search='';history.replaceState({},'',url);setAuthenticatedView()}else{$('dashboard').hidden=false;renderAll()}});
window.addEventListener('storage',event=>{if(event.key===APP_KEY){const next=loadState();if(next){state=next;renderAll()}}if(event.key===PLAYBACK_KEY&&!$('dashboard').hidden)renderDashboard()});
function refreshPlaybackStatus(){if(!$('dashboard').hidden){renderDashboard();refreshServerPlayback()}playbackTimer=setTimeout(refreshPlaybackStatus,10000)}
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!$('modalBackdrop').hidden)closeModal();if(event.key==='ArrowRight'&&!$('tvPlayer').hidden)advanceTv()});

(async function init(){await hydrateLibrary();await setAuthenticatedView();refreshPlaybackStatus()})();
