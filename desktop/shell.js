const api = window.reversenuiDesktop
let state = { layoutMode:'single', memoryProfile:'balanced', activeIds:['reversenui'], tabs:[] }
let tools = []
let statuses = {}
let memory = { totalKb:0, processCount:0, tabs:[] }
let selected = new Set(['reversenui'])
let vault = []
let vaultDirty = false
let vaultLocked = false
let vaultStatus = null

const $ = selector => document.querySelector(selector)
const $$ = selector => [...document.querySelectorAll(selector)]
function kb(value){ if(!value)return '—'; const mb=value/1024; return mb>1024?`${(mb/1024).toFixed(1)} GB`:`${mb.toFixed(0)} MB` }
function toast(message,kind='error'){ const el=document.createElement('div');el.className=kind==='ok'?'status-toast':'error-toast';el.textContent=message;document.body.append(el);setTimeout(()=>el.remove(),4500) }
function activeLimit(mode){ return mode==='grid'?4:mode==='single'?1:2 }
function normalizedSelection(){ const ids=[...selected].filter(id=>state.tabs.some(tab=>tab.id===id)); if(!ids.length)ids.push(state.activeIds[0]||'reversenui'); return ids.slice(0,activeLimit(state.layoutMode)) }

function renderTabs(){
  const memById=new Map(memory.tabs?.map(item=>[item.id,item]))
  $('#tabs').innerHTML=''
  for(const tab of state.tabs){
    const button=document.createElement('button');button.className=`tab ${state.activeIds.includes(tab.id)?'active':''} ${selected.has(tab.id)?'selected':''} ${tab.hibernated?'sleeping':''}`
    const mem=memById.get(tab.id)
    button.innerHTML=`<span class="dot"></span><span class="title"></span><span class="mem">${mem&&!mem.sleeping?kb(mem.memoryKb):'uyku'}</span>${tab.id==='reversenui'?'':'<span class="close">×</span>'}`
    button.querySelector('.title').textContent=tab.title
    button.addEventListener('click',async event=>{
      if(event.target.classList.contains('close')){ await api.closeWorkspace(tab.id);selected.delete(tab.id);return }
      if(event.shiftKey){ selected.has(tab.id)?selected.delete(tab.id):selected.add(tab.id);renderTabs();return }
      selected=new Set([tab.id]); await api.setLayout('single',[tab.id])
    })
    $('#tabs').append(button)
  }
}
function renderMemory(){ $('#ramStat').textContent=`RAM ${kb(memory.totalKb)}`;$('#procStat').textContent=`${memory.processCount||0} süreç`;renderTabs() }
function renderLayout(){
  $$('.layout-btn').forEach(btn=>btn.classList.toggle('active',btn.dataset.layout===state.layoutMode))
  $('#memoryProfile').value=state.memoryProfile||'balanced'
}
function renderTools(){
  $('#toolsList').innerHTML=''
  for(const tool of tools){
    const status=statuses[tool.id]||{running:false}
    const card=document.createElement('div');card.className='tool-card'
    card.innerHTML=`<div class="tool-top"><span class="tool-name"></span><span class="tool-status ${status.running?'running':''}">${status.running?'● ÇALIŞIYOR':'○ BOŞTA'}</span></div><div class="tool-url"></div><div class="tool-actions"><button data-action="open">Aç</button><button data-action="start">Başlat</button><button data-action="stop">Durdur</button></div>`
    card.querySelector('.tool-name').textContent=tool.name;card.querySelector('.tool-url').textContent=tool.url||tool.command||'Yapılandırılmadı'
    card.querySelector('[data-action=open]').onclick=()=>api.openTool(tool.id).catch(err=>toast(err.message))
    card.querySelector('[data-action=start]').onclick=()=>api.startTool(tool.id).catch(err=>toast(err.message))
    card.querySelector('[data-action=stop]').onclick=()=>api.stopTool(tool.id).catch(err=>toast(err.message))
    $('#toolsList').append(card)
  }
  $('#toolJson').value=JSON.stringify(tools,null,2)
}
function vaultTypeLabel(type){
  return ({'password':'Parola','crypto-wallet':'Kripto Cüzdanı','api-key':'API Anahtarı','secure-note':'Güvenli Not'})[type]||'Güvenli Not'
}
function markVaultDirty(){
  vaultDirty=true
  const state=$('#vaultSaveState')
  if(state){state.textContent='Kaydedilmemiş yerel değişiklikler';state.classList.add('dirty')}
}
function updateVaultSecurity(){
  const box=$('#vaultSecurity')
  if(!box)return
  if(!vaultStatus){box.textContent='İşletim sistemi şifreleme durumu alınamadı';box.className='vault-security warning';return}
  box.textContent=vaultStatus.available?'● Şifreli · '+vaultStatus.storage:'● İşletim sistemi şifrelemesi kullanılamıyor'
  box.className=vaultStatus.available?'vault-security ok':'vault-security warning'
}
function vaultMatches(entry){
  const filter=$('#vaultFilter')?.value||'all'
  if(filter!=='all'&&entry.type!==filter)return false
  const q=($('#vaultSearch')?.value||'').trim().toLowerCase()
  if(!q)return true
  return [entry.label,entry.username,entry.website,entry.network,entry.address,entry.tags,entry.notes].some(value=>String(value||'').toLowerCase().includes(q))
}
function bindVaultValue(element,entry,key,index){
  element.value=entry[key]||''
  element.oninput=()=>{vault[index][key]=element.value;markVaultDirty()}
}
function vaultInput(label,key,entry,index,options={}){
  const placeholder=options.placeholder||''
  const type=options.type||'text'
  const copy=Boolean(options.copy)
  const wrap=document.createElement('label');wrap.className='vault-field'
  const caption=document.createElement('span');caption.textContent=label;wrap.append(caption)
  const row=document.createElement('div');row.className='vault-value-row'
  const input=document.createElement('input');input.type=type;input.placeholder=placeholder;input.autocomplete='off';input.dataset.k=key
  bindVaultValue(input,entry,key,index);row.append(input)
  if(copy){
    const button=document.createElement('button');button.type='button';button.textContent='Kopyala'
    button.onclick=async()=>{const result=await api.copyVaultText(input.value);if(result?.copied)toast('Kopyalandı · pano 30 saniye sonra temizlenir','ok')}
    row.append(button)
  }
  wrap.append(row);return wrap
}
function vaultSecretField(label,key,entry,index,options={}){
  const textarea=Boolean(options.textarea)
  const placeholder=options.placeholder||''
  const wrap=document.createElement('label');wrap.className='vault-field'
  const caption=document.createElement('span');caption.textContent=label;wrap.append(caption)
  const row=document.createElement('div');row.className='vault-value-row secret-row'
  const input=document.createElement(textarea?'textarea':'input')
  if(!textarea)input.type='password'
  else input.className='masked-secret'
  input.placeholder=placeholder;input.autocomplete='off';input.dataset.k=key
  bindVaultValue(input,entry,key,index);row.append(input)
  const show=document.createElement('button');show.type='button';show.textContent='Göster'
  show.onclick=()=>{
    if(textarea){input.classList.toggle('masked-secret');show.textContent=input.classList.contains('masked-secret')?'Göster':'Gizle'}
    else{input.type=input.type==='password'?'text':'password';show.textContent=input.type==='password'?'Göster':'Gizle'}
  }
  const copy=document.createElement('button');copy.type='button';copy.textContent='Kopyala'
  copy.onclick=async()=>{const result=await api.copyVaultText(input.value);if(result?.copied)toast('Sır kopyalandı · pano 30 saniye sonra temizlenir','ok')}
  row.append(show,copy);wrap.append(row);return wrap
}
function renderVault(){
  updateVaultSecurity()
  const root=$('#vaultList');root.innerHTML=''
  $('#vaultLockedMessage').hidden=!vaultLocked
  $('#saveVault').disabled=vaultLocked
  $('#addVault').disabled=vaultLocked
  $('#lockVault').disabled=vaultLocked
  if(vaultLocked)return

  const visible=vault.map((entry,index)=>({entry,index})).filter(item=>vaultMatches(item.entry))
  visible.sort((a,b)=>Number(b.entry.favorite)-Number(a.entry.favorite))
  if(!visible.length){
    const empty=document.createElement('div');empty.className='vault-empty'
    empty.textContent=vault.length?'Bu filtreyle eşleşen kasa kaydı yok.':'Kasa boş. Parola, cüzdan, API anahtarı veya güvenli not ekle.'
    root.append(empty)
    return
  }

  for(const item of visible){
    const entry=item.entry,index=item.index
    const card=document.createElement('article');card.className='vault-card'
    const head=document.createElement('div');head.className='vault-card-head'
    const meta=document.createElement('div');meta.className='vault-card-meta'
    const badge=document.createElement('span');badge.className='vault-type '+entry.type;badge.textContent=vaultTypeLabel(entry.type)
    const favorite=document.createElement('button');favorite.className=entry.favorite?'vault-star active':'vault-star';favorite.textContent=entry.favorite?'★':'☆';favorite.title='Favori'
    favorite.onclick=()=>{vault[index].favorite=!vault[index].favorite;markVaultDirty();renderVault()}
    meta.append(badge,favorite)
    const remove=document.createElement('button');remove.className='vault-remove';remove.textContent='Sil'
    remove.onclick=()=>{vault.splice(index,1);markVaultDirty();renderVault()}
    head.append(meta,remove);card.append(head)

    const typeWrap=document.createElement('label');typeWrap.className='vault-field'
    const typeCaption=document.createElement('span');typeCaption.textContent='Tür'
    const typeSelect=document.createElement('select')
    for(const pair of [['password','Parola'],['crypto-wallet','Kripto Cüzdanı'],['api-key','API Anahtarı'],['secure-note','Güvenli Not']]){
      const option=document.createElement('option');option.value=pair[0];option.textContent=pair[1];typeSelect.append(option)
    }
    typeSelect.value=entry.type
    typeSelect.onchange=()=>{vault[index].type=typeSelect.value;markVaultDirty();renderVault()}
    typeWrap.append(typeCaption,typeSelect);card.append(typeWrap)
    card.append(vaultInput('Etiket','label',entry,index,{placeholder:'örn. Binance TR, MetaMask, Gmail'}))

    if(entry.type==='password'){
      card.append(vaultInput('Kullanıcı adı / hesap','username',entry,index,{placeholder:'e-posta veya kullanıcı adı'}))
      card.append(vaultInput('Web sitesi','website',entry,index,{placeholder:'https://…'}))
      card.append(vaultSecretField('Parola','secret',entry,index,{placeholder:'parola'}))
    }else if(entry.type==='crypto-wallet'){
      card.append(vaultInput('Ağ','network',entry,index,{placeholder:'Ethereum, Solana, Zcash…'}))
      card.append(vaultInput('Açık adres','address',entry,index,{placeholder:'cüzdan adresi',copy:true}))
      card.append(vaultInput('Cüzdan / hesap etiketi','username',entry,index,{placeholder:'MetaMask hesabı, donanım cüzdanı…'}))
      card.append(vaultSecretField('Özel anahtar / cüzdan sırrı','secret',entry,index,{placeholder:'isteğe bağlı hassas anahtar'}))
      card.append(vaultSecretField('Seed / kurtarma ifadesi','recovery',entry,index,{textarea:true,placeholder:'kurtarma ifadesi'}))
    }else if(entry.type==='api-key'){
      card.append(vaultInput('Servis / hesap','username',entry,index,{placeholder:'servis hesabı'}))
      card.append(vaultInput('Panel / URL','website',entry,index,{placeholder:'https://…'}))
      card.append(vaultSecretField('API anahtarı / token','secret',entry,index,{placeholder:'gizli token'}))
    }else{
      card.append(vaultSecretField('Hassas değer','secret',entry,index,{placeholder:'isteğe bağlı sır'}))
    }

    card.append(vaultInput('Etiketler','tags',entry,index,{placeholder:'finans, borsa, kişisel…'}))
    const notes=document.createElement('label');notes.className='vault-field'
    const notesCaption=document.createElement('span');notesCaption.textContent='Güvenli notlar'
    const area=document.createElement('textarea');area.placeholder='Yerel şifreli notlar';bindVaultValue(area,entry,'notes',index)
    notes.append(notesCaption,area);card.append(notes)
    root.append(card)
  }
}
async function saveVaultNow(){
  if(vaultLocked)return false
  try{
    const result=await api.saveVault(vault)
    vaultDirty=false
    $('#vaultSaveState').textContent='Kaydedildi · '+(result?.count??vault.length)+' kayıt'
    $('#vaultSaveState').classList.remove('dirty')
    toast('Kasa yerel olarak şifreli biçimde kaydedildi','ok')
    return true
  }catch(err){toast(err.message);return false}
}
async function lockVaultNow(){
  if(vaultLocked)return
  if(vaultDirty&&!(await saveVaultNow()))return
  vault=[]
  vaultLocked=true
  renderVault()
}
async function unlockVaultNow(){
  try{
    vault=await api.loadVault()
    vaultLocked=false
    vaultDirty=false
    $('#vaultSaveState').textContent='Şifreli yerel depolama'
    renderVault()
  }catch(err){toast(err.message)}
}
function randomPassword(length){
  const chars='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*()-_=+[]{}:,.?'
  const bytes=new Uint32Array(length);crypto.getRandomValues(bytes);return [...bytes].map(n=>chars[n%chars.length]).join('')
}

async function bootstrap(){
  state=await api.getWorkspace();selected=new Set(state.activeIds);renderLayout();renderTabs()
  const toolData=await api.listTools();tools=toolData.tools;statuses=toolData.statuses;renderTools()
  try{vaultStatus=await api.getVaultStatus()}catch{vaultStatus=null}
  try{vault=await api.loadVault();vaultLocked=false}catch(err){vault=[];vaultLocked=true;toast(err.message)}
  renderVault()
  memory=await api.getMemorySnapshot();renderMemory()
}

api.onWorkspaceState(next=>{state=next;for(const id of next.activeIds)selected.add(id);renderLayout();renderTabs()})
api.onToolStatus(next=>{statuses=next;renderTools()})
api.onMemorySnapshot(next=>{memory=next;renderMemory()})

$$('.layout-btn').forEach(btn=>btn.onclick=async()=>{
  const mode=btn.dataset.layout;state.layoutMode=mode
  const ids=normalizedSelection(); if(mode!=='single'&&ids.length<2){ const fallback=state.tabs.find(tab=>!ids.includes(tab.id));if(fallback)ids.push(fallback.id) }
  state=await api.setLayout(mode,ids);renderLayout();renderTabs()
})
$('#memoryProfile').onchange=event=>api.setMemoryProfile(event.target.value).catch(err=>toast(err.message))
$('#newLocal').onclick=()=>$('#localDialog').showModal()
$('#confirmLocal').onclick=event=>{event.preventDefault();api.openLocalUrl($('#localTitle').value,$('#localUrl').value).then(()=>$('#localDialog').close()).catch(err=>toast(err.message))}
$$('.side-tab').forEach(btn=>btn.onclick=()=>{ $$('.side-tab').forEach(x=>x.classList.toggle('active',x===btn)); $$('.side-pane').forEach(pane=>pane.classList.toggle('active',pane.id===`${btn.dataset.side}Pane`)) })
$('#addTool').onclick=()=>{ tools.push({id:`custom-${Date.now()}`,name:'Özel Araç',type:'local-web',url:'http://127.0.0.1:3000',healthUrl:'',command:'',args:[],cwd:'',stopOnExit:false,autoStart:false});renderTools();$('#toolJson').focus() }
$('#saveTools').onclick=async()=>{try{const parsed=JSON.parse($('#toolJson').value);const result=await api.saveTools(parsed);tools=result.tools;statuses=result.statuses;renderTools()}catch(err){toast(err.message)}}
$('#generatePassword').onclick=()=>{$('#generatedPassword').value=randomPassword(Math.max(8,Math.min(128,Number($('#pwLength').value)||24)))}
$('#copyGeneratedPassword').onclick=async()=>{const result=await api.copyVaultText($('#generatedPassword').value);if(result?.copied)toast('Üretilen parola kopyalandı · pano 30 saniye sonra temizlenir','ok')}
$('#vaultSearch').oninput=()=>renderVault()
$('#vaultFilter').onchange=()=>renderVault()
$('#addVault').onclick=()=>{
  const type=$('#newVaultType').value
  vault.unshift({id:crypto.randomUUID(),type,label:'',username:'',website:'',network:'',address:'',secret:'',recovery:'',notes:'',tags:'',favorite:false})
  markVaultDirty();renderVault()
}
$('#saveVault').onclick=()=>void saveVaultNow()
$('#lockVault').onclick=()=>void lockVaultNow()
$('#unlockVault').onclick=()=>void unlockVaultNow()

bootstrap().catch(err=>toast(err.message))
