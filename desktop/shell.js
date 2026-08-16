const api = window.reversenuiDesktop
let state = { layoutMode:'single', memoryProfile:'balanced', activeIds:['reversenui'], tabs:[] }
let tools = []
let statuses = {}
let memory = { totalKb:0, processCount:0, tabs:[] }
let selected = new Set(['reversenui'])
let vault = []

const $ = selector => document.querySelector(selector)
const $$ = selector => [...document.querySelectorAll(selector)]
function kb(value){ if(!value)return '—'; const mb=value/1024; return mb>1024?`${(mb/1024).toFixed(1)} GB`:`${mb.toFixed(0)} MB` }
function toast(message){ const el=document.createElement('div');el.className='error-toast';el.textContent=message;document.body.append(el);setTimeout(()=>el.remove(),4500) }
function activeLimit(mode){ return mode==='grid'?4:mode==='single'?1:2 }
function normalizedSelection(){ const ids=[...selected].filter(id=>state.tabs.some(tab=>tab.id===id)); if(!ids.length)ids.push(state.activeIds[0]||'reversenui'); return ids.slice(0,activeLimit(state.layoutMode)) }

function renderTabs(){
  const memById=new Map(memory.tabs?.map(item=>[item.id,item]))
  $('#tabs').innerHTML=''
  for(const tab of state.tabs){
    const button=document.createElement('button');button.className=`tab ${state.activeIds.includes(tab.id)?'active':''} ${selected.has(tab.id)?'selected':''} ${tab.hibernated?'sleeping':''}`
    const mem=memById.get(tab.id)
    button.innerHTML=`<span class="dot"></span><span class="title"></span><span class="mem">${mem&&!mem.sleeping?kb(mem.memoryKb):'sleep'}</span>${tab.id==='reversenui'?'':'<span class="close">×</span>'}`
    button.querySelector('.title').textContent=tab.title
    button.addEventListener('click',async event=>{
      if(event.target.classList.contains('close')){ await api.closeWorkspace(tab.id);selected.delete(tab.id);return }
      if(event.shiftKey){ selected.has(tab.id)?selected.delete(tab.id):selected.add(tab.id);renderTabs();return }
      selected=new Set([tab.id]); await api.setLayout('single',[tab.id])
    })
    $('#tabs').append(button)
  }
}
function renderMemory(){ $('#ramStat').textContent=`RAM ${kb(memory.totalKb)}`;$('#procStat').textContent=`${memory.processCount||0} proc`;renderTabs() }
function renderLayout(){
  $$('.layout-btn').forEach(btn=>btn.classList.toggle('active',btn.dataset.layout===state.layoutMode))
  $('#memoryProfile').value=state.memoryProfile||'balanced'
}
function renderTools(){
  $('#toolsList').innerHTML=''
  for(const tool of tools){
    const status=statuses[tool.id]||{running:false}
    const card=document.createElement('div');card.className='tool-card'
    card.innerHTML=`<div class="tool-top"><span class="tool-name"></span><span class="tool-status ${status.running?'running':''}">${status.running?'● RUNNING':'○ IDLE'}</span></div><div class="tool-url"></div><div class="tool-actions"><button data-action="open">Open</button><button data-action="start">Start</button><button data-action="stop">Stop</button></div>`
    card.querySelector('.tool-name').textContent=tool.name;card.querySelector('.tool-url').textContent=tool.url||tool.command||'Not configured'
    card.querySelector('[data-action=open]').onclick=()=>api.openTool(tool.id).catch(err=>toast(err.message))
    card.querySelector('[data-action=start]').onclick=()=>api.startTool(tool.id).catch(err=>toast(err.message))
    card.querySelector('[data-action=stop]').onclick=()=>api.stopTool(tool.id).catch(err=>toast(err.message))
    $('#toolsList').append(card)
  }
  $('#toolJson').value=JSON.stringify(tools,null,2)
}
function renderVault(){
  const root=$('#vaultList');root.innerHTML=''
  vault.forEach((entry,index)=>{
    const card=document.createElement('div');card.className='vault-card'
    card.innerHTML='<input data-k="label" placeholder="Label"><input data-k="username" placeholder="Username / account"><div class="row"><input data-k="secret" type="password" placeholder="Password / secret"><button data-show>Show</button></div><textarea data-k="notes" placeholder="Secure notes"></textarea><div class="row"><button data-copy>Copy secret</button><button data-remove>Remove</button></div>'
    for(const input of card.querySelectorAll('[data-k]')){ input.value=entry[input.dataset.k]||'';input.oninput=()=>{vault[index][input.dataset.k]=input.value} }
    const secret=card.querySelector('[data-k=secret]');card.querySelector('[data-show]').onclick=()=>{secret.type=secret.type==='password'?'text':'password'}
    card.querySelector('[data-copy]').onclick=()=>navigator.clipboard.writeText(secret.value)
    card.querySelector('[data-remove]').onclick=()=>{vault.splice(index,1);renderVault()}
    root.append(card)
  })
}
function randomPassword(length){
  const chars='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*()-_=+[]{}:,.?'
  const bytes=new Uint32Array(length);crypto.getRandomValues(bytes);return [...bytes].map(n=>chars[n%chars.length]).join('')
}

async function bootstrap(){
  state=await api.getWorkspace();selected=new Set(state.activeIds);renderLayout();renderTabs()
  const toolData=await api.listTools();tools=toolData.tools;statuses=toolData.statuses;renderTools()
  vault=await api.loadVault();renderVault()
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
$('#addTool').onclick=()=>{ tools.push({id:`custom-${Date.now()}`,name:'Custom Tool',type:'local-web',url:'http://127.0.0.1:3000',healthUrl:'',command:'',args:[],cwd:'',stopOnExit:false,autoStart:false});renderTools();$('#toolJson').focus() }
$('#saveTools').onclick=async()=>{try{const parsed=JSON.parse($('#toolJson').value);const result=await api.saveTools(parsed);tools=result.tools;statuses=result.statuses;renderTools()}catch(err){toast(err.message)}}
$('#generatePassword').onclick=()=>{$('#generatedPassword').value=randomPassword(Math.max(8,Math.min(128,Number($('#pwLength').value)||24)))}
$('#addVault').onclick=()=>{vault.unshift({id:crypto.randomUUID(),label:'',username:'',secret:'',notes:''});renderVault()}
$('#saveVault').onclick=()=>api.saveVault(vault).catch(err=>toast(err.message))

bootstrap().catch(err=>toast(err.message))
