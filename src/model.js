// Calendar arithmetic uses local dates so DST never shifts a day on the wall display.
export const dateKey = date => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
export function localDate(value) {
  if (value instanceof Date) return new Date(value);
  const raw = typeof value === 'object' ? value.dateTime || value.date : value;
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T00:00:00`) : new Date(raw);
}
export function addDays(date, n) { const d=localDate(date); d.setDate(d.getDate()+n); return d; }
export function midnight(date) { const d=localDate(date); d.setHours(0,0,0,0); return d; }
export function weekStart(date) { const d=midnight(date); return addDays(d,-d.getDay()); }
export function rangeFor(view,date) {
  let start=midnight(date), count=1;
  if (view==='month') {start=new Date(date.getFullYear(),date.getMonth(),1);start=weekStart(start);count=42;}
  if (view==='week') {start=weekStart(date);count=7;}
  if (view==='schedule') count=7;
  return {start,end:addDays(start,count),days:Array.from({length:count},(_,i)=>addDays(start,i))};
}
export const escapeHTML = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function normalizeEvent(event,calendar) {
  const raw=event.start?.dateTime || event.start?.date || event.start;
  return {...event,calendar,allDay:/^\d{4}-\d{2}-\d{2}$/.test(raw),start:localDate(event.start),end:localDate(event.end),title:event.summary||'Untitled event'};
}
export function eventsOn(events,date) {
  const start=midnight(date),end=addDays(start,1);
  return events.filter(e=>e.start<end&&e.end>start).sort((a,b)=>Number(b.allDay)-Number(a.allDay)||a.start-b.start||a.title.localeCompare(b.title));
}
export function uniqueEvents(events) {
  const seen=new Set();
  return events.filter(e=>{
    const key=[e.title.trim().toLowerCase(),e.start.toISOString(),e.end.toISOString()].join('|');
    if(seen.has(key))return false;seen.add(key);return true;
  });
}
function metadata(value) {
  try { const data=JSON.parse(value.description||'{}')?.hearthglance;
    return data && typeof data==='object' && !Array.isArray(data) ? data : {};
  } catch { return {}; }
}
export const taskMeta = metadata;
export const mealMeta = metadata;
export function dueToday(item,today=new Date()) {
  const key=dateKey(today);
  if(item.status==='completed')return (taskMeta(item).completed_on||String(item.due||'').slice(0,10))===key;
  return !item.due||String(item.due).slice(0,10)<=key;
}

// One segment per event per week; lanes keep multi-day bars joined in month view.
export function monthWeekLayout(events, start, maxLanes=3) {
  const days=Array.from({length:7},(_,i)=>addDays(start,i));
  const occupied=[],segments=[],overflow=Array(7).fill(0);
  const candidates=events.filter(e=>e.start<addDays(start,7)&&e.end>start)
    .sort((a,b)=>Number(b.allDay)-Number(a.allDay)||a.start-b.start||b.end-a.end);
  for(const event of candidates){
    const indices=days.map((day,i)=>event.start<addDays(day,1)&&event.end>day?i:-1).filter(i=>i>=0);
    if(!indices.length)continue;
    const first=indices[0],last=indices.at(-1);
    let lane=occupied.findIndex(row=>indices.every(i=>!row[i]));
    if(lane<0){lane=occupied.length;occupied.push(Array(7).fill(false));}
    indices.forEach(i=>{occupied[lane][i]=true;});
    if(lane<maxLanes)segments.push({event,column:first+1,span:last-first+1,lane:lane+1});
    else indices.forEach(i=>overflow[i]++);
  }
  return {segments,overflow};
}

// Clip timed events to a local day and assign overlapping events separate columns.
export function scheduleLayout(events,date) {
  const start=midnight(date),end=addDays(start,1);
  const minutes=d=>d.getHours()*60+d.getMinutes();
  const rows=eventsOn(events,date).filter(e=>!e.allDay).map(event=>({
    event,start:event.start<start?0:minutes(event.start),
    end:event.end>=end?1440:minutes(event.end),
  })).map(row=>({...row,end:Math.max(row.start+1,row.end)})).sort((a,b)=>a.start-b.start||b.end-a.end);
  let group=[],active=[],groupEnd=-1;
  const finish=()=>{const columns=Math.max(1,...group.map(row=>row.column+1));group.forEach(row=>{row.columns=columns;});};
  for(const row of rows){
    if(row.start>=groupEnd){finish();group=[];active=[];}
    let column=active.findIndex(until=>until<=row.start);
    if(column<0)column=active.length;
    active[column]=row.end;row.column=column;group.push(row);groupEnd=Math.max(...active);
  }
  finish();return rows;
}
