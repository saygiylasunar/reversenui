import { useEffect, useMemo, useState } from 'react'
import './roller.css'

type PromptProfile = {
  id:string; label:string; model_family:string; encoder_family:string[]; environment:string; style:string; separator:string;
  ordering:string[]; capabilities:{negative_prompt:boolean;numeric_weights:boolean}
}
type LibraryOption = { value:string; weight:number }
type PromptLibrary = { key:string;label:string;group:string;group_label:string;priority:number;placeholder:string;options:LibraryOption[] }

type RollResult = { seed:number; values:Record<string,string> }

type ComposeResult = { master_prompt:string;negative_prompt:string;ordered_drawers:string[] }

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
  const [values,setValues]=useState<Record<string,string>>({})
  const [locked,setLocked]=useState<Record<string,boolean>>({})
  const [seed,setSeed]=useState<number|null>(null)
  const [reuseSeed,setReuseSeed]=useState(false)
  const [master,setMaster]=useState('')
  const [negative,setNegative]=useState('')
  const [busy,setBusy]=useState(false)
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

  function lockedPayload(keys:string[]){
    const result:Record<string,string>={}
    for(const key of keys)if(locked[key]&&values[key]?.trim())result[key]=values[key].trim()
    return result
  }

  async function compile(nextValues:Record<string,string>){
    const drawers=libraries.map(library=>({
      key:library.key,text:nextValues[library.key]??'',enabled:Boolean((nextValues[library.key]??'').trim()),priority:library.priority,emphasis:1,
    }))
    const response=await fetch('/api/prompt/compose',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({profile_id:profileId,drawers})})
    const result:ComposeResult=await jsonOrError(response)
    setMaster(result.master_prompt);setNegative(result.negative_prompt)
  }

  async function roll(keys:string[]){
    setBusy(true);setError('')
    try{
      const response=await fetch('/api/prompt/roll',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({library_keys:keys,locked:lockedPayload(keys),seed:reuseSeed?seed:null})})
      const result:RollResult=await jsonOrError(response)
      const next={...values,...result.values};setValues(next);setSeed(result.seed);await compile(next)
    }catch(cause){setError(cause instanceof Error?cause.message:'Roll failed')}finally{setBusy(false)}
  }

  async function buildMaster(){setBusy(true);setError('');try{await compile(values)}catch(cause){setError(cause instanceof Error?cause.message:'Prompt composition failed')}finally{setBusy(false)}}
  function patch(key:string,value:string){setValues(current=>({...current,[key]:value}))}
  function toggleLock(key:string){setLocked(current=>({...current,[key]:!current[key]}))}
  function clearUnlocked(){const next={...values};for(const library of libraries)if(!locked[library.key])next[library.key]='';setValues(next);setMaster('');setNegative('')}

  return <>
    <button className="roller-launch" onClick={()=>setOpen(true)}>🎲 PROMPT DICE</button>
    {open&&<div className="roller-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)setOpen(false)}}>
      <section className="roller-shell">
        <header className="roller-head">
          <div><span className="eyebrow">REVERSENUI / PROMPT DICE</span><h2>A → F Visual Prompt Roller</h2></div>
          <button className="roller-close" onClick={()=>setOpen(false)}>×</button>
        </header>

        <div className="roller-toolbar">
          <label>Target profile<select value={profileId} onChange={event=>setProfileId(event.target.value)}>{profiles.map(profile=><option value={profile.id} key={profile.id}>{profile.label}</option>)}</select></label>
          <label>Last seed<input type="number" value={seed??''} placeholder="auto" onChange={event=>setSeed(event.target.value?Number(event.target.value):null)}/></label>
          <label className="roller-check"><input type="checkbox" checked={reuseSeed} onChange={event=>setReuseSeed(event.target.checked)}/><span>Reuse seed</span></label>
          <button className="primary roller-main" disabled={busy||!libraries.length} onClick={()=>void roll(libraries.map(item=>item.key))}>{busy?'ROLLING…':'🎲 ROLL ALL'}</button>
          <button className="secondary roller-clear" onClick={clearUnlocked}>CLEAR UNLOCKED</button>
        </div>

        {profileId==='qwen3-vl-4b-instruct'&&<div className="roller-note">Qwen3‑VL mode uses explicit natural-language A→F scene specification; numeric prompt weights are intentionally not emitted.</div>}
        {error&&<div className="notice error">{error}</div>}

        <div className="roller-body">
          <div className="roller-groups">
            {groups.map(([group,entry])=><article className="roller-group" key={group}>
              <div className="roller-group-head"><div><strong>{group}</strong><span>{entry.label}</span></div><button className="secondary compact" onClick={()=>void roll(entry.items.map(item=>item.key))}>ROLL {group}</button></div>
              <div className="roller-fields">
                {entry.items.map(library=>{
                  const listId=`roller-${library.key}`
                  return <div className={`roller-field ${locked[library.key]?'locked':''}`} key={library.key}>
                    <div className="roller-field-title"><span>{library.label}</span><small>P{library.priority}</small></div>
                    <div className="roller-input-row">
                      <button title="Roll this library" disabled={locked[library.key]} onClick={()=>void roll([library.key])}>🎲</button>
                      <input list={listId} value={values[library.key]??''} placeholder={library.placeholder} onChange={event=>patch(library.key,event.target.value)}/>
                      <button className={locked[library.key]?'lock active':'lock'} title={locked[library.key]?'Unlock':'Lock'} onClick={()=>toggleLock(library.key)}>{locked[library.key]?'🔒':'🔓'}</button>
                      <datalist id={listId}>{library.options.map((option,index)=><option value={option.value} key={`${library.key}-${index}`}/>)}</datalist>
                    </div>
                  </div>
                })}
              </div>
            </article>)}
          </div>

          <aside className="roller-master">
            <div className="roller-master-head"><div><span className="card-label">MASTER</span><strong>{profiles.find(item=>item.id===profileId)?.label??profileId}</strong></div><span>{seed?`seed ${seed}`:'unrolled'}</span></div>
            <textarea value={master} readOnly placeholder="Roll fields or type your own values, then build the Master Prompt."/>
            {negative&&<><span className="card-label roller-negative-label">NEGATIVE</span><textarea className="roller-negative" value={negative} readOnly/></>}
            <button className="primary" disabled={busy} onClick={()=>void buildMaster()}>BUILD MASTER</button>
            <button className="secondary" disabled={!master} onClick={()=>void navigator.clipboard.writeText(master)}>COPY MASTER</button>
            <p>A is treated as highest-level intent. B–E progressively specify subject, world, objects and capture. F finishes the render and constraints.</p>
          </aside>
        </div>
      </section>
    </div>}
  </>
}
