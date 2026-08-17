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

async function jsonOrError(response:Response){
  const payload=await response.json()
  if(!response.ok)throw new Error(payload.detail??'Request failed')
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
    }).catch(cause=>setError(cause instanceof Error?cause.message:'Could not load prompt libraries'))
  },[])

  const groups=useMemo(()=>{
    const map=new Map<string,{label:string;items:PromptLibrary[]}>()
    for(const library of [...libraries].sort((a,b)=>b.priority-a.priority)){
      const entry=map.get(library.group)??{label:library.group_label,items:[]}
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
    }catch(cause){setError(cause instanceof Error?cause.message:'Roll failed')}finally{setBusy(false)}
  }

  async function buildMaster(){
    setBusy(true);setError('');setCopied(false)
    try{await compile(values)}catch(cause){setError(cause instanceof Error?cause.message:'Prompt composition failed')}finally{setBusy(false)}
  }

  async function copyMaster(){
    const clean=master.trim();if(!clean)return
    try{await navigator.clipboard.writeText(clean);setCopied(true);setTimeout(()=>setCopied(false),1600)}catch(cause){setError(cause instanceof Error?cause.message:'Could not copy Master Prompt')}
  }

  function patch(key:string,value:string){setValues(current=>({...current,[key]:value}));setMaster('');setNegative('');setCopied(false)}
  function toggleLock(key:string){setLocked(current=>({...current,[key]:!current[key]}))}
  function clearUnlocked(){const next={...values};for(const library of libraries)if(!locked[library.key])next[library.key]='';setValues(next);setMaster('');setNegative('');setCopied(false)}
  function changePool(next:ContentLevel){setContentLevel(next);setMaster('');setNegative('');setCopied(false)}

  return <>
    <button className={open?'roller-launch active':'roller-launch'} onClick={()=>setOpen(true)}>
      <strong>Prompt Dice</strong>
      <span>Qwen Builder · A→F roller</span>
    </button>
    {open&&<div className="roller-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)setOpen(false)}}>
      <section className="roller-shell">
        <header className="roller-head">
          <div><span className="eyebrow">REVERSENUI / QWEN BUILDER</span><h2>A → F Visual Prompt Roller</h2></div>
          <button className="roller-close" onClick={()=>setOpen(false)}>×</button>
        </header>
        <div className="roller-toolbar">
          <label>Target profile<select value={profileId} onChange={event=>{setProfileId(event.target.value);setMaster('');setNegative('')}}>{profiles.map(profile=><option value={profile.id} key={profile.id}>{profile.label}</option>)}</select></label>
          <label>Content pool<select value={contentLevel} onChange={event=>changePool(event.target.value as ContentLevel)}><option value="sfw">SFW</option><option value="suggestive">Suggestive</option><option value="adult">Adult NSFW</option></select></label>
          <label>Last seed<input type="number" value={seed??''} placeholder="auto" onChange={event=>setSeed(event.target.value?Number(event.target.value):null)}/></label>
          <label className="roller-check"><input type="checkbox" checked={reuseSeed} onChange={event=>setReuseSeed(event.target.checked)}/><span>Reuse seed</span></label>
          <button className="primary roller-main" disabled={busy||!libraries.length} onClick={()=>void roll(libraries.map(item=>item.key))}>{busy?'ROLLING…':'🎲 ROLL ALL'}</button>
          <button className="secondary roller-clear" onClick={clearUnlocked}>CLEAR UNLOCKED</button>
        </div>
        <div className="roller-note">Pool: <b>{contentLevel.toUpperCase()}</b> · {poolStats.sfw} SFW · {poolStats.suggestive} suggestive · {poolStats.adult} adult options. Higher pools include the lower tiers. Human NSFW options are explicitly adult-only.</div>
        {error&&<div className="notice error">{error}</div>}
        <div className="roller-body">
          <div className="roller-groups">
            {groups.map(([group,entry])=><article className="roller-group" key={group}>
              <div className="roller-group-head"><div><strong>{group}</strong><span>{entry.label}</span></div><button className="secondary compact" disabled={busy} onClick={()=>void roll(entry.items.map(item=>item.key))}>ROLL {group}</button></div>
              <div className="roller-fields">
                {entry.items.map(library=>{const listId=`roller-${library.key}`;const eligible=optionsFor(library);return <div className={`roller-field ${locked[library.key]?'locked':''}`} key={library.key}>
                  <div className="roller-field-title"><span>{library.label}</span><small>P{library.priority} · {eligible.length}</small></div>
                  <div className="roller-input-row">
                    <button title="Roll this library" disabled={busy||locked[library.key]||!eligible.length} onClick={()=>void roll([library.key])}>🎲</button>
                    <input list={listId} value={values[library.key]??''} placeholder={library.placeholder} onChange={event=>patch(library.key,event.target.value)}/>
                    <button className={locked[library.key]?'lock active':'lock'} title={locked[library.key]?'Unlock':'Lock'} onClick={()=>toggleLock(library.key)}>{locked[library.key]?'🔒':'🔓'}</button>
                    <datalist id={listId}>{eligible.map((option,index)=><option value={option.value} key={`${library.key}-${index}`}/>)}</datalist>
                  </div>
                </div>})}
              </div>
            </article>)}
          </div>
          <aside className="roller-master">
            <div className="roller-master-head"><div><span className="card-label">MASTER</span><strong>{profiles.find(item=>item.id===profileId)?.label??profileId}</strong></div><span>{seed?`seed ${seed}`:'unrolled'}</span></div>
            <textarea value={master} readOnly placeholder="Only the clean compiled prompt appears here — no A→F headings, instructions, notes or commentary."/>
            {negative&&<><span className="card-label roller-negative-label">NEGATIVE</span><textarea className="roller-negative" value={negative} readOnly/></>}
            <button className="primary" disabled={busy} onClick={()=>void buildMaster()}>BUILD MASTER</button>
            <button className="secondary" disabled={!master} onClick={()=>void copyMaster()}>{copied?'COPIED ✓':'COPY MASTER'}</button>
          </aside>
        </div>
      </section>
    </div>}
  </>
}
