import {dateKey,localDate,addDays,midnight,weekStart,rangeFor,escapeHTML as esc,eventsOn,monthWeekLayout,scheduleLayout,taskMeta,dueToday,mealMeta} from './model.js';

// Phone rendering reuses the same HA subscriptions, forms, and save actions as the wall card.
export function mobileMethods({icon,button,format,time,personStyle,weatherGlyph}) {
 return {
  _calendarRange(){
   if(this._mobile&&this._page==='home')return rangeFor('schedule',new Date());
   if(this._mobile&&this._page==='calendar'&&this._view==='schedule'){
    const start=midnight(this._date),count=this._scheduleDays();
    return {start,end:addDays(start,count),days:Array.from({length:count},(_,i)=>addDays(start,i))};
   }
   return rangeFor(this._page==='meals'?'week':this._view,this._date);
  },
  _scheduleDays(){return [1,2,3].includes(Number(this._prefs.scheduleDays))?Number(this._prefs.scheduleDays):2;},
  _phoneEvent(event,compact=false){
   const index=this._eventIndex.push(event)-1,person=this._person(event.calendar.person);
   const label=event.allDay?'All day':`${time(event.start)} – ${time(event.end)}`;
   return button(`<span class="phone-event-copy"><strong>${esc(event.title)}</strong>${compact?'':`<small>${esc(label)}</small>`}</span>${compact?'':`<span class="avatar" aria-label="${esc(person.name)}">${esc(person.initial)}</span>`}`,'event',`phone-event ${event.end<new Date()?'past':''}`,`data-index="${index}" style="${personStyle(person)}"`);
  },
  _renderMobileMain(){
   const main=this.shadowRoot.querySelector('.main');if(!main)return;
   const oldScroll=main.querySelector('.phone-scroll'),oldTimeline=main.querySelector('.phone-timeline-scroll');
   const key=`${this._page}:${this._view}:${dateKey(this._date)}:${this._taskPerson}:${this._taskMode}:${this._mobileListOpen}:${this._list}`;
   main.dataset.view=this._page==='calendar'&&!this._mobileQuery?this._view:'';
   const same=this._phoneRenderKey===key,scroll=same?(oldScroll?.scrollTop||0):0,timelineScroll=same?oldTimeline?.scrollTop:null;
   this._phoneRenderKey=key;
   const titles={home:this._config.household||'Our family',calendar:format(this._date,{month:'long',year:'numeric'}),tasks:'Tasks',list:this._mobileListOpen?this._config.lists[this._list].name:'Lists',meals:'Meal planner',recipes:'Recipes'};
   const header=`<header class="phone-header">${this._page==='home'?'<a class="phone-icon phone-home-mark ha-home" href="/lovelace" title="Back to Home Assistant" aria-label="Back to Home Assistant">'+icon('ha')+'</a>':button(icon('left'),'phone-back','phone-icon','aria-label="Back"')}<h1>${esc(titles[this._page]||'Family')}</h1>${button(icon('settings'),'settings','phone-icon','aria-label="Dashboard settings"')}</header>`;
   const error=this._errors.size?`<div class="error-banner" role="alert"><span>${esc([...new Set(this._errors.values())].join(' '))}</span>${button('Retry','refresh','text-link')}</div>`:'';
   const content=this._page==='home'?this._phoneHome():this._page==='calendar'?this._phoneCalendar():this._page==='tasks'?this._phoneTasks():this._page==='list'?this._phoneLists():this._page==='recipes'?this._phoneRecipes():this._phoneMeals();
   const toolbar=this._page==='calendar'?this._phoneCalendarTools():'';
   const canAdd=this._page!=='list'||this._mobileListOpen;
   const labels={home:'Add to your family',calendar:'Add event',tasks:'Add chore',list:'Add item',meals:'Plan a meal',recipes:'Add recipe'};
   main.innerHTML=header+toolbar+`<div class="phone-scroll">${error}${content}</div>`+(canAdd?button(icon('plus'),'phone-add','phone-fab',`aria-label="${labels[this._page]}"`):'');
   main.querySelector('.phone-scroll').scrollTop=scroll;
   const timeline=main.querySelector('.phone-timeline-scroll');
   if(timeline)timeline.scrollTop=timelineScroll??(dateKey(this._date)===dateKey(new Date())?Math.max(0,new Date().getHours()-1):8)*64;
   if(this._pendingFocusDate&&!this._loading){
    const target=this._view==='month'?main.querySelector(`.phone-month-date[data-date="${this._pendingFocusDate}"]`):main.querySelector(`[data-agenda-date="${this._pendingFocusDate}"]`);
    target?.scrollIntoView({block:this._view==='month'?'center':'start'});this._pendingFocusDate=null;
   }
   this._updatePhoneNow();
  },
  _phoneHome(){
   const features=[['calendar','Calendar','calendar','#f9dfd7','#df795e'],['tasks','Tasks','check','#e8eed8','#88a55a'],['list','Lists','list','#f5efd0','#b49b38'],['meals','Meals','meals','#f2e4cf','#b8884c'],['recipes','Recipes','book','#dfedf0','#76a1af'],['settings','Settings','settings','#ece7f2','#a186bd']];
   const events=this._visibleEvents().filter(e=>e.end>new Date()).sort((a,b)=>a.start-b.start).slice(0,5);
   return `<section class="phone-weather-strip" aria-label="Weather and solar forecast">${this._weatherHTML()}</section><div class="phone-feature-grid">${features.filter(([page])=>this._pages.includes(page)).map(([page,label,glyph,pale,color])=>button(`<span class="phone-feature-icon" style="--tile-bg:${pale};--tile-ink:${color}">${icon(glyph)}</span><span>${label}</span>`,page==='settings'?'settings':'phone-page','phone-feature',`data-page="${page}"`)).join('')}</div><section class="phone-home-preview"><div class="phone-preview-head"><div><small>${format(new Date(),{weekday:'long'})}</small><h2>${format(new Date(),{month:'long',day:'numeric'})}</h2></div></div><div class="phone-section-heading"><h3>Coming up</h3>${button('View calendar','phone-page','text-link','data-page="calendar"')}</div>${events.length?events.map(e=>`<div class="phone-upcoming"><span>${format(e.start,{month:'short',day:'numeric'})}</span>${this._phoneEvent(e)}</div>`).join(''):`<div class="empty">${icon('sun')}A little room to breathe.<br>No events in the next seven days.</div>`}</section>`;
  },
  _phoneCalendarTools(){
   return `<div class="phone-calendar-tools" aria-label="Calendar controls">${button('Today','today','phone-tool')}<label class="phone-view-picker"><span class="sr-only">Calendar view</span><select name="phone_view" aria-label="Calendar view"><option value="week" ${this._view==='week'?'selected':''}>Week</option><option value="month" ${this._view==='month'?'selected':''}>Month</option><option value="schedule" ${this._view==='schedule'?'selected':''}>Schedule</option></select></label>${button(icon('filter')+'<span>Filter</span>','phone-filters','phone-tool')}${button(icon('meals'),'phone-toggle-meals',`phone-tool ${this._prefs.showMeals!==false?'selected':''}`,`aria-label="Show meals on calendar" aria-pressed="${this._prefs.showMeals!==false}"`)}${button(icon('search'),'phone-search','phone-tool','aria-label="Search calendar"')}</div>`;
  },
  _phonePeriod(view=this._view){
   const range=view==='schedule'?this._calendarRange():rangeFor(view,this._date),end=addDays(range.end,-1);
   const label=view==='schedule'&&this._scheduleDays()===1?format(range.start,{month:'short',day:'numeric'}):view==='month'?format(this._date,{month:'long',year:'numeric'}):`${format(range.start,{month:'short',day:'numeric'})} – ${format(end,{month:range.start.getMonth()===end.getMonth()?undefined:'short',day:'numeric'})}`;
   return `<div class="phone-period">${button(icon('left'),'previous','phone-icon','aria-label="Previous period"')}<span>${esc(label)}</span>${button(icon('right'),'next','phone-icon','aria-label="Next period"')}</div>`;
  },
  _phoneCalendar(){
   const events=this._visibleEvents();
   if(this._mobileQuery){
    const q=this._mobileQuery.toLocaleLowerCase(),found=events.filter(e=>[e.title,e.location,e.description].some(s=>String(s||'').toLocaleLowerCase().includes(q)));
    return `${this._phonePeriod()}<div class="phone-search-results"><div class="phone-section-heading"><h2>“${esc(this._mobileQuery)}”</h2>${button('Clear','phone-clear-search','text-link')}</div><p class="section-note">${found.length} ${found.length===1?'match':'matches'} in these displayed dates.</p>${found.map(e=>`<div class="phone-upcoming"><span>${format(e.start,{month:'short',day:'numeric'})}</span>${this._phoneEvent(e)}</div>`).join('')||'<div class="empty">No matching events.</div>'}</div>`;
   }
   if(this._view==='month')return this._phoneMonth(events);
   if(this._view==='schedule')return this._phoneSchedule(events);
   const days=rangeFor('week',this._date).days;
   return `${this._phonePeriod()}<div class="phone-agenda" data-swipe-calendar>${days.map(date=>{
    const dayEvents=eventsOn(events,date),today=dateKey(date)===dateKey(new Date());
    return `<section class="phone-agenda-day" data-agenda-date="${dateKey(date)}"><div class="phone-agenda-date ${today?'today':''}"><span>${format(date,{weekday:'short'})}</span><b>${date.getDate()}</b></div><div class="phone-agenda-events">${dayEvents.length?dayEvents.map(e=>this._phoneEvent(e)).join(''):`<div class="phone-empty-day">${this._loading?'Loading…':'No events'}</div>`}</div></section>`;
   }).join('')}</div>`;
  },
  _phoneMonth(events){
   const days=rangeFor('month',this._date).days;
   return `${this._phonePeriod()}<div class="phone-month" data-swipe-calendar><div class="phone-month-labels">${['S','M','T','W','T','F','S'].map(d=>`<span>${d}</span>`).join('')}</div>${Array.from({length:6},(_,row)=>{
    const week=days.slice(row*7,row*7+7),layout=monthWeekLayout(events,week[0]);
    return `<div class="phone-month-week"><div class="phone-month-dates">${week.map(date=>button(`<span>${date.getDate()}</span>`,'day',`phone-month-date ${dateKey(date)===dateKey(new Date())?'today':''} ${date.getMonth()!==this._date.getMonth()?'other':''}`,`data-date="${dateKey(date)}" aria-label="Show ${format(date,{month:'long',day:'numeric'})}"`)).join('')}</div><div class="phone-month-bars">${layout.segments.map(({event,column,span,lane})=>{const index=this._eventIndex.push(event)-1;return button(esc(event.title),'event','phone-month-bar',`data-index="${index}" style="${this._calStyle(event.calendar)};grid-column:${column}/span ${span};grid-row:${lane}" title="${esc(event.title)}"`);}).join('')}${layout.overflow.map((count,i)=>count?button(`+${count} more`,'day','phone-month-more',`data-date="${dateKey(week[i])}" style="grid-column:${i+1};grid-row:4" aria-label="${count} more events on ${format(week[i],{month:'long',day:'numeric'})}"`):'').join('')}</div></div>`;
   }).join('')}</div>`;
  },
  _phoneSchedule(events){
   const days=this._calendarRange().days,count=days.length;
   return `${this._phonePeriod('schedule')}<div class="phone-schedule" data-swipe-calendar><div class="phone-schedule-dates" style="--days:${count}"><span></span>${days.map(date=>button(`<small>${format(date,{weekday:'short'})}</small><b>${date.getDate()}</b>`,'day',`phone-schedule-date ${dateKey(date)===dateKey(new Date())?'today':''}`,`data-date="${dateKey(date)}" aria-label="Show ${format(date,{month:'long',day:'numeric'})}"`)).join('')}</div><div class="phone-all-day" style="--days:${count}"><span>all-day</span>${days.map(date=>`<div>${eventsOn(events,date).filter(e=>e.allDay).map(e=>this._phoneEvent(e,true)).join('')}</div>`).join('')}</div><div class="phone-timeline-scroll"><div class="phone-timeline" style="--days:${count}"><div class="phone-hours">${Array.from({length:24},(_,h)=>`<span style="top:${h*64}px">${h===0?'12 AM':h<12?h+' AM':h===12?'12 PM':h-12+' PM'}</span>`).join('')}</div>${days.map(date=>`<div class="phone-time-day">${Array.from({length:24},(_,h)=>`<div class="phone-hour-line" style="top:${h*64}px"></div>`).join('')}${scheduleLayout(events,date).map(({event,start,end,column,columns})=>{const index=this._eventIndex.push(event)-1;return button(`<strong>${esc(event.title)}</strong><small>${esc(time(event.start))}</small>`,'event','phone-time-event',`data-index="${index}" style="${this._calStyle(event.calendar)};top:${start/60*64}px;height:${Math.max(22,(end-start)/60*64-2)}px;left:calc(${column/columns*100}% + 2px);width:calc(${100/columns}% - 4px)" aria-label="${esc(event.title+' '+time(event.start)+' to '+time(event.end))}"`);}).join('')}${dateKey(date)===dateKey(new Date())?'<div class="phone-now-line" aria-hidden="true"></div>':''}</div>`).join('')}</div></div></div>`;
  },
  _phoneTasks(){
   const person=this._taskPerson||'all',mode=this._taskMode||'day';
   const profiles=`<div class="phone-person-tabs">${button('All','phone-task-person',`phone-person ${person==='all'?'active':''}`,'data-person="all"')}${this._config.people.filter(p=>p.todo).map(p=>button(`<span class="avatar" style="${personStyle(p)}">${esc(p.initial)}</span>${esc(p.name)}`,'phone-task-person',`phone-person ${person===p.id?'active':''}`,`data-person="${p.id}"`)).join('')}</div>`;
   return `<div class="phone-task-toolbar"><span>${mode==='day'?format(new Date(),{weekday:'short',month:'short',day:'numeric'}):'All saved tasks'}</span><div class="view-switch">${button('Day','phone-task-mode',mode==='day'?'active':'','data-mode="day"')}${button('All','phone-task-mode',mode==='all'?'active':'','data-mode="all"')}</div></div>${profiles}<div class="phone-task-groups">${this._config.people.filter(p=>p.todo&&(person==='all'||person===p.id)).map(p=>{
    const all=this._tasks[p.todo]||[],items=mode==='day'?all.filter(i=>dueToday(i)):all,done=items.filter(i=>i.status==='completed').length;
    return `<section class="phone-task-group" style="${personStyle(p)}"><div class="phone-section-heading"><h2><span class="avatar">${esc(p.initial)}</span>${esc(p.name)}</h2><span>${done}/${items.length}</span></div><div class="progress"><span style="width:${items.length?100*done/items.length:0}%"></span></div>${this._phoneTaskRows(p.todo,[...items.filter(i=>i.status!=='completed'),...items.filter(i=>i.status==='completed')])||'<div class="empty">Nothing due. All clear!</div>'}${button('+ Add a chore','add-task','text-link',`data-person="${p.id}"`)}</section>`;
   }).join('')}</div>`;
  },
  _phoneTaskRows(entity,items){
   return items.map(item=>{const meta=taskMeta(item),done=item.status==='completed',repeats={daily:'Every day',weekdays:'Weekdays',weekly:'Every week'};
    const note=repeats[meta.repeat]|| (item.due?`Due ${format(localDate(String(item.due).slice(0,10)),{month:'short',day:'numeric'})}`:'');
    return `<div class="phone-task-row ${done?'done':''}">${button(`<strong>${esc(item.summary)}</strong>${note?`<small>${esc(note)}</small>`:''}`,'edit-task','phone-task-title',`data-entity="${entity}" data-uid="${esc(item.uid)}" aria-label="Edit ${esc(item.summary)}"`)}${button(`<span class="check">${done?icon('check'):''}</span>`,'toggle-task','phone-task-check',`data-entity="${entity}" data-uid="${esc(item.uid)}" aria-label="${done?'Uncheck':'Complete'} ${esc(item.summary)}" aria-pressed="${done}"`)}</div>`;
   }).join('');
  },
  _phoneLists(){
   if(!this._mobileListOpen)return `<div class="phone-list-grid">${this._config.lists.map((list,i)=>{const count=(this._tasks[list.entity]||[]).filter(x=>x.status!=='completed').length;return button(`<span class="phone-list-mark">${icon('list')}</span><strong>${esc(list.name)}</strong><small>${count} ${count===1?'item':'items'}</small>`,'phone-open-list','phone-list-card',`data-list="${i}"`);}).join('')}</div>`;
   const list=this._config.lists[this._list],items=this._tasks[list.entity]||[],pending=items.filter(i=>i.status!=='completed'),done=items.filter(i=>i.status==='completed');
   return `<section class="phone-list-detail"><p class="section-note">${pending.length} ${pending.length===1?'item':'items'} remaining</p>${this._phoneTaskRows(list.entity,pending)||'<div class="empty">The list is clear.</div>'}${button('+ Add an item','add-list-item','text-link')}${done.length?`<details class="phone-completed"><summary>Completed (${done.length})</summary>${this._phoneTaskRows(list.entity,done)}</details>`:''}</section>`;
  },
  _phoneMeals(){
   const days=rangeFor('week',this._date).days,events=eventsOn(Object.values(this._events).flat().filter(e=>e.calendar.kind==='meals'),this._date);
   return `${this._phonePeriod('week')}<div class="phone-meal-dates">${days.map(date=>button(`<small>${format(date,{weekday:'short'})}</small><b>${date.getDate()}</b>`,'phone-meal-day',`phone-meal-date ${dateKey(date)===dateKey(this._date)?'active':''}`,`data-date="${dateKey(date)}" aria-label="Meals for ${format(date,{weekday:'long',month:'long',day:'numeric'})}"`)).join('')}</div><div class="phone-meal-plan">${['Breakfast','Lunch','Dinner','Snack'].map(slot=>`<section><div class="phone-section-heading"><h2>${slot}</h2>${button(icon('plus'),'add-meal','phone-icon',`data-date="${dateKey(this._date)}" data-slot="${slot}" aria-label="Plan ${slot.toLowerCase()}"`)}</div>${events.filter(e=>(mealMeta(e).slot||'Dinner')===slot).map(e=>this._phoneEvent(e)).join('')||`<p class="phone-empty-slot">Nothing planned yet.</p>`}</section>`).join('')}${this._config.recipes?button(icon('book')+' Family recipes','phone-page','btn','data-page="recipes"'):''}</div>`;
  },
  _phoneRecipes(){
   const recipes=this._tasks[this._config.recipes]||[];
   return `<div class="phone-recipes"><p class="section-note">Your family favorites, ready for the week.</p>${recipes.map(r=>button(`<span class="phone-recipe-mark">${icon('book')}</span><span><strong>${esc(r.summary)}</strong><small>View recipe & plan a meal</small></span>${icon('right')}`,'recipe','phone-recipe-card',`data-uid="${esc(r.uid)}"`)).join('')||`<div class="empty">${icon('book')}Start your family recipe book.${button('Add a recipe','add-recipe','btn')}</div>`}</div>`;
  },
  _phoneFilters(){
   this._openModal('Calendar filters',`<div class="settings-options"><div class="eyebrow">Family profiles</div>${this._config.people.map(p=>`<label class="settings-row"><span><span class="avatar" style="${personStyle(p)}">${esc(p.initial)}</span> ${esc(p.name)}</span><input type="checkbox" data-phone-person="${p.id}" ${!this._hidden.has(p.id)?'checked':''}></label>`).join('')}<label class="settings-row">Show meals<input type="checkbox" data-pref="showMeals" ${this._prefs.showMeals!==false?'checked':''}></label><label class="field">Days in schedule view<select name="phone_schedule_days" aria-label="Days in schedule view">${[1,2,3].map(n=>`<option value="${n}" ${this._scheduleDays()===n?'selected':''}>${n} ${n===1?'day':'days'}</option>`).join('')}</select></label><div class="eyebrow">Other calendars</div>${this._config.calendars.filter(c=>c.auxiliary).map(c=>`<label class="settings-row">${esc(c.name)}<input type="checkbox" data-calendar="${c.entity}" ${!this._hidden.has(c.entity)?'checked':''}></label>`).join('')}</div><div class="modal-foot">${button('Done','close-modal','btn primary')}</div>`);
  },
  _phoneSearch(){this._openModal('Search calendar',`<form data-form="phone-search"><label class="field">Search displayed dates<input type="search" name="query" value="${esc(this._mobileQuery||'')}" placeholder="Event name, location, or notes" required></label>${this._formFooter('Search')}</form>`);},
  _phoneAdd(){
   const actions={calendar:()=>this._eventForm(),tasks:()=>this._taskForm({person:this._taskPerson==='all'?undefined:this._taskPerson}),list:()=>this._taskForm({entity:this._config.lists[this._list].entity}),meals:()=>this._eventForm(null,{meal:true,date:dateKey(this._date)}),recipes:()=>this._recipeForm()};
   if(actions[this._page]){actions[this._page]();return;}
   this._openModal('Add to your family',`<div class="phone-add-menu">${[['add-event','calendar','Event'],['add-task','tasks','Chore'],['quick-grocery','list','Grocery item'],['add-meal','meals','Meal'],['add-recipe','book','Recipe']].filter(([action])=>({ 'add-task':this._pages.includes('tasks'),'quick-grocery':this._pages.includes('list'),'add-meal':this._pages.includes('meals'),'add-recipe':this._pages.includes('recipes')})[action]!==false).map(([action,glyph,label])=>button(icon(glyph)+label,action,'phone-add-option')).join('')}</div>`);
  },
  _phoneNavigate(page){
   this._page=page;this._view=this._mobile?'week':page==='calendar'?'month':'week';this._date=new Date();this._mobileQuery='';this._mobileListOpen=false;if(page==='calendar')this._pendingFocusDate=dateKey(new Date());this._loadCalendars();
  },
  _updatePhoneNow(){
   const now=new Date(),top=(now.getHours()*60+now.getMinutes())/60*64;
   for(const line of this.shadowRoot.querySelectorAll('.phone-now-line'))line.style.top=top+'px';
  },
  _phoneTouchStart(event){
   if(!this._mobile||event.touches.length!==1||!event.target.closest('[data-swipe-calendar]')){this._swipeStart=null;return;}
   const touch=event.touches[0];this._swipeStart={x:touch.clientX,y:touch.clientY,time:Date.now()};
  },
  _phoneTouchEnd(event){
   const start=this._swipeStart;this._swipeStart=null;if(!start||!event.changedTouches.length)return;
   const touch=event.changedTouches[0],dx=touch.clientX-start.x,dy=touch.clientY-start.y;
   if(Math.abs(dx)>=70&&Math.abs(dx)>Math.abs(dy)*1.7&&Date.now()-start.time<700){this._suppressPhoneClick=Date.now()+400;this._navigatePeriod(dx<0?1:-1);}
  },
  _navigatePeriod(n){
   const view=this._page==='meals'?'week':this._view;
   if(view==='month')this._date=new Date(this._date.getFullYear(),this._date.getMonth()+n,1);
   else this._date=addDays(this._date,n*(view==='day'?1:this._mobile&&view==='schedule'?this._scheduleDays():7));
   this._loadCalendars();
  },
 };
}
