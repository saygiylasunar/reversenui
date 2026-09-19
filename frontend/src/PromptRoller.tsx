import { useEffect, useMemo, useState } from 'react'
import './roller.css'

type ContentLevel = 'sfw' | 'suggestive' | 'adult'
type PromptProfile = {
  id:string; label:string; model_family:string; encoder_family:string[]; environment:string; style:string; separator:string;
  ordering:string[]; capabilities:{negative_prompt:boolean;numeric_weights:boolean}
}
type LibraryOption = { value:string; weight:number; maturity:ContentLevel }
type PromptLibrary = { key:string;label:string;group:string;group_label:string;priority:number;placeholder:string;options:LibraryOption[] }
type RollResult = { seed:number; values:Record<string,string> }
type ComposeResult = { master_prompt:string;negative_prompt:string;ordered_drawers:string[] }

const levelRank:Record<ContentLevel,number>={sfw:0,suggestive:1,adult:2}

const groupLabels:Record<string,string>={
  A:'Sahne & Niyet',
  B:'Kişi / Özne',
  C:'Ortam',
  D:'Nesneler & Sahne Detayı',
  E:'Kompozisyon & Çekim',
  F:'Son Dokunuş & Kısıtlar',
}

const fieldLabels:Record<string,string>={
  intent:'Niyet',
  activity:'Eylem / Olay',
  narrative:'Anlatı Vuruşu',
  subject:'Özne',
  identity:'Kimlik / Duruş',
  physical:'Fiziksel Detay',
  expression:'İfade',
  pose:'Poz / Beden Dili',
  wardrobe:'Giyim',
  environment:'Ortam',
  background:'Arka Plan Yapısı',
  weather_time:'Zaman / Hava',
  primary_prop:'Ana Nesne',
  secondary_prop:'İkincil Nesne',
  foreground:'Ön Plan Vurgusu',
  framing:'Kadraj',
  camera:'Kamera / Lens / Açı',
  composition:'Kompozisyon',
  lighting:'Işık',
  texture:'Doku / Malzeme',
  mood:'Atmosfer',
  color:'Renk Paleti',
  style:'Görsel Stil',
  technical:'Teknik Son Dokunuş',
  constraints:'Kaçın / Kısıtlar',
}

const fieldPlaceholders:Record<string,string>={
  intent:'Nasıl bir görsel olmalı?',
  activity:'Ne oluyor?',
  narrative:'An nasıl hissettirmeli?',
  subject:'Ana özne kim veya ne?',
  identity:'Yaş, karakter, duruş…',
  physical:'Saç, beden, ten, ayırt edici özellikler…',
  expression:'İfade / bakış…',
  pose:'Poz ve beden dili…',
  wardrobe:'Giyim ve aksesuarlar…',
  environment:'Ana konum…',
  background:'Mimari, derinlik katmanları, arka plan…',
  weather_time:'Günün saati, mevsim, hava…',
  primary_prop:'Ana prop / nesne…',
  secondary_prop:'Destekleyici nesne…',
  foreground:'Ön plan derinlik öğesi…',
  framing:'Çekim ölçeği…',
  camera:'Açı ve lens karakteri…',
  composition:'Yerleşim, denge, derinlik…',
  lighting:'Ana ışık, dolgu, pratik ışıklar…',
  texture:'Yüzey işleme…',
  mood:'Duygusal son dokunuş…',
  color:'Palet / kontrast…',
  style:'Görsel işleme stili…',
  technical:'Derinlik, detay, render davranışı…',
  constraints:'Sonuç nelerden kaçınmalı?',
}

function uiProfileLabel(profile:PromptProfile){
  if(profile.id==='qwen3-vl-4b-instruct')return 'Qwen3-VL 4B Instruct · Prompt Planlayıcı'
  return profile.label
}

async function jsonOrError(response:Response){
  const payload=await response.json()
  if(!response.ok)throw new Error(payload.detail??'İstek başarısız oldu')
  return payload
}

export default function PromptRoller(){
  const [open,setOpen]=useState(false)
  const [profiles,setProfiles]=useState<PromptProfile[]>([])
  const [profileId,setProfileId]=useState('qwen3-vl-4b-instruct')
  const [libraries,setLibraries]=useState<PromptLibrary[]>([])
  const [contentLevel,setContentLevel]=useState<ContentLevel>('sfw')
  const [values,setValues]=useState<Record<string,string>>({})
  const [locked,setLocked]=useState<Record<string,boolean>>({})
  const [seed,setSeed]=useState<number|null>(null)
  const [reuseSeed,setReuseSeed]=useState(false)
  const [master,setMaster]=useState('')
  const [negative,setNegative]=useState('')
  const [busy,setBusy]=useState(false)
  const [copied,setCopied]=useState(false)
  const [error,setError]=useState('')

  useEffect(()=>{
    Promise.all([
      fetch('/api/prompt/profiles').then(jsonOrError),
      fetch('/api/prompt/libraries').then(jsonOrError),
    ]).then(([profileData,libraryData]:[PromptProfile[],PromptLibrary[]])=>{
      setProfiles(profileData)
      setLibraries(libraryData)
      if(!profileData.some(item=>item.id==='qwen3-vl-4b-instruct')&&profileData.length)setProfileId(profileData[0].id)
    }).catch(cause=>setError(cause instanceof Error?cause.message:'Prompt kütüphaneleri yüklenemedi'))
  },[])

  const groups=useMemo(()=>{
    const map=new Map<string,{label:string;items:PromptLibrary[]}>()
    for(const library of [...libraries].sort((a,b)=>b.priority-a.priority)){
      const entry=map.get(library.group)??{label:groupLabels[library.group]??library.group_label,items:[]}
      entry.items.push(library);map.set(library.group,entry)
    }
    return [...map.entries()].sort(([a],[b])=>a.localeCompare(b))
  },[libraries])

  const poolStats=useMemo(()=>{
    const result={sfw:0,suggestive:0,adult:0}
    for(const library of libraries)for(const option of library.options)result[option.maturity]++
    return result
  },[libraries])

  function optionsFor(library:PromptLibrary){return library.options.filter(option=>levelRank[option.maturity]<=levelRank[contentLevel])}

  function lockedPayload(keys:string[]){
    const result:Record<string,string>={}
    for(const key of keys)if(locked[key]&&values[key]?.trim())result[key]=values[key].trim()
    return result
  }

  async function compile(nextValues:Record<string,string>){
    const drawers=libraries.map(library=>({key:library.key,text:nextValues[library.key]??'',enabled:Boolean((nextValues[library.key]??'').trim()),priority:library.priority,emphasis:1}))
    const response=await fetch('/api/prompt/compose',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({profile_id:profileId,drawers})})
    const result:ComposeResult=await jsonOrError(response)
    setMaster(result.master_prompt.trim());setNegative(result.negative_prompt.trim());setCopied(false)
  }

  async function roll(keys:string[]){
    setBusy(true);setError('');setCopied(false)
    try{
      const response=await fetch('/api/prompt/roll',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({library_keys:keys,locked:lockedPayload(keys),seed:reuseSeed?seed:null,content_level:contentLevel})})
      const result:RollResult=await jsonOrError(response)
      const next={...values,...result.values};setValues(next);setSeed(result.seed);await compile(next)
    }catch(cause){setError(cause instanceof Error?cause.message:'Zarlama başarısız oldu')}finally{setBusy(false)}
  }

  async function buildMaster(){
    setBusy(true);setError('');setCopied(false)
    try{await compile(values)}catch(cause){setError(cause instanceof Error?cause.message:'Prompt oluşturma başarısız oldu')}finally{setBusy(false)}
  }

  async function copyMaster(){
    const clean=master.trim();if(!clean)return
    try{await navigator.clipboard.writeText(clean);setCopied(true);setTimeout(()=>setCopied(false),1600)}catch(cause){setError(cause instanceof Error?cause.message:'Ana prompt kopyalanamadı')}
  }

  function patch(key:string,value:string){setValues(current=>({...current,[key]:value}));setMaster('');setNegative('');setCopied(false)}
  function toggleLock(key:string){setLocked(current=>({...current,[key]:!current[key]}))}
  function clearUnlocked(){const next={...values};for(const library of libraries)if(!locked[library.key])next[library.key]='';setValues(next);setMaster('');setNegative('');setCopied(false)}
  function changePool(next:ContentLevel){setContentLevel(next);setMaster('');setNegative('');setCopied(false)}

  return <>
    <button className={open?'roller-launch active':'roller-launch'} onClick={()=>setOpen(true)}>
      <strong>Prompt Zarı</strong>
      <span>Qwen Oluşturucu · A→F zar sistemi</span>
    </button>
    {open&&<div className="roller-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)setOpen(false)}}>
      <section className="roller-shell">
        <header className="roller-head">
          <div><span className="eyebrow">REVERSENUI / QWEN OLUŞTURUCU</span><h2>A → F Görsel Prompt Zarı</h2></div>
          <button className="roller-close" onClick={()=>setOpen(false)}>×</button>
        </header>
        <div className="roller-toolbar">
          <label>Hedef profil<select value={profileId} onChange={event=>{setProfileId(event.target.value);setMaster('');setNegative('')}}>{profiles.map(profile=><option value={profile.id} key={profile.id}>{uiProfileLabel(profile)}</option>)}</select></label>
          <label>İçerik havuzu<select value={contentLevel} onChange={event=>changePool(event.target.value as ContentLevel)}><option value="sfw">SFW</option><option value="suggestive">İmalı</option><option value="adult">Yetişkin NSFW</option></select></label>
          <label>Son seed<input type="number" value={seed??''} placeholder="otomatik" onChange={event=>setSeed(event.target.value?Number(event.target.value):null)}/></label>
          <label className="roller-check"><input type="checkbox" checked={reuseSeed} onChange={event=>setReuseSeed(event.target.checked)}/><span>Seed'i yeniden kullan</span></label>
          <button className="primary roller-main" disabled={busy||!libraries.length} onClick={()=>void roll(libraries.map(item=>item.key))}>{busy?'ZARLANIYOR…':'🎲 TÜMÜNÜ ZARLA'}</button>
          <button className="secondary roller-clear" onClick={clearUnlocked}>KİLİTSİZLERİ TEMİZLE</button>
        </div>
        <div className="roller-note">Havuz: <b>{contentLevel.toUpperCase()}</b> · {poolStats.sfw} SFW · {poolStats.suggestive} imalı · {poolStats.adult} yetişkin seçeneği. Üst havuzlar alt seviyeleri de içerir. İnsan NSFW seçenekleri yalnızca açıkça yetişkin özneler içindir.</div>
        {error&&<div className="notice error">{error}</div>}
        <div className="roller-body">
          <div className="roller-groups">
            {groups.map(([group,entry])=><article className="roller-group" key={group}>
              <div className="roller-group-head"><div><strong>{group}</strong><span>{entry.label}</span></div><button className="secondary compact" disabled={busy} onClick={()=>void roll(entry.items.map(item=>item.key))}>{group}'Yİ ZARLA</button></div>
              <div className="roller-fields">
                {entry.items.map(library=>{const listId=`roller-${library.key}`;const eligible=optionsFor(library);return <div className={`roller-field ${locked[library.key]?'locked':''}`} key={library.key}>
                  <div className="roller-field-title"><span>{fieldLabels[library.key]??library.label}</span><small>P{library.priority} · {eligible.length}</small></div>
                  <div className="roller-input-row">
                    <button title="Bu kütüphaneyi zarla" disabled={busy||locked[library.key]||!eligible.length} onClick={()=>void roll([library.key])}>🎲</button>
                    <input list={listId} value={values[library.key]??''} placeholder={fieldPlaceholders[library.key]??library.placeholder} onChange={event=>patch(library.key,event.target.value)}/>
                    <button className={locked[library.key]?'lock active':'lock'} title={locked[library.key]?'Kilidi Aç':'Kilitle'} onClick={()=>toggleLock(library.key)}>{locked[library.key]?'🔒':'🔓'}</button>
                    <datalist id={listId}>{eligible.map((option,index)=><option value={option.value} key={`${library.key}-${index}`}/>)}</datalist>
                  </div>
                </div>})}
              </div>
            </article>)}
          </div>
          <aside className="roller-master">
            <div className="roller-master-head"><div><span className="card-label">ANA PROMPT</span><strong>{profiles.find(item=>item.id===profileId)?uiProfileLabel(profiles.find(item=>item.id===profileId)!):profileId}</strong></div><span>{seed?`seed ${seed}`:'zarlanmadı'}</span></div>
            <textarea value={master} readOnly placeholder="Burada yalnızca arınmış derlenmiş prompt görünür — A→F başlıkları, talimat, not veya yorum eklenmez."/>
            {negative&&<><span className="card-label roller-negative-label">NEGATİF</span><textarea className="roller-negative" value={negative} readOnly/></>}
            <button className="primary" disabled={busy} onClick={()=>void buildMaster()}>ANA PROMPTU OLUŞTUR</button>
            <button className="secondary" disabled={!master} onClick={()=>void copyMaster()}>{copied?'KOPYALANDI ✓':'ANA PROMPTU KOPYALA'}</button>
          </aside>
        </div>
      </section>
    </div>}
  </>
}
