import {solarForDate, solarStatesChanged, solarStyles} from './solar.js';
import {normalizeConfig, enabledPages} from './config.js';
import {recipeMethods,recipeStyles} from './recipes.js';
import {styles} from './styles.js';
import {mobileStyles} from './mobile-styles.js';
import {mobileMethods} from './mobile.js';
import {richTextHTML,richTextField,richTextStyles} from './rich-text.js';
import {mealRecipeMethods,mealRecipeStyles} from './meal-recipes.js';
import {nativeCards, pageSubscriptions, navigateView, calendarLocation, nativeStyles} from './native.js';
import {dateKey,localDate,addDays,midnight,weekStart,rangeFor,escapeHTML as esc,normalizeEvent,eventsOn,uniqueEvents,taskMeta,mealMeta,dueToday} from './model.js';

const paths={
 filter:'M4 6h16M7 12h10m-7 6h4',search:'M16 16l5 5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
 home:'M3 10 12 3l9 7v11h-6v-7H9v7H3Z',calendar:'M4 5h16v16H4ZM8 3v4m8-4v4M4 10h16m-12 4h2m4 0h2m-8 4h2',
 tasks:'M9 6h12M9 12h12M9 18h12M3 5l1 1 2-2M3 11l1 1 2-2M3 17l1 1 2-2',list:'M8 5h12M8 12h12M8 19h12M3 5h.01M3 12h.01M3 19h.01',
 meals:'M4 3v6c0 2 4 2 4 0V3M6 3v18M18 3c-3 4-3 8 0 8h2V3h-2Zm2 8v10',sun:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.4 1.4m11.2 11.2L19 19M5 19l1.4-1.4M17.6 6.4 19 5',
 settings:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1Z',
 plus:'M12 5v14M5 12h14',left:'m14 6-6 6 6 6',right:'m10 6 6 6-6 6',check:'m5 12 4 4L19 6',close:'m6 6 12 12M6 18 18 6',
 clock:'M12 8v5l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',pin:'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0ZM15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
 edit:'m15 4 5 5M4 16 16 4a3 3 0 0 1 4 4L8 20H4Z',refresh:'M20 7v5h-5M4 17v-5h5M19 8a8 8 0 0 0-14-2M5 16a8 8 0 0 0 14 2',
 ha:'M21.8,13H20V21H13V17.67L15.79,14.88L16.5,15C17.66,15 18.6,14.06 18.6,12.9C18.6,11.74 17.66,10.8 16.5,10.8A2.1,2.1 0 0,0 14.4,12.9L14.5,13.61L13,15.13V9.65C13.66,9.29 14.1,8.6 14.1,7.8A2.1,2.1 0 0,0 12,5.7A2.1,2.1 0 0,0 9.9,7.8C9.9,8.6 10.34,9.29 11,9.65V15.13L9.5,13.61L9.6,12.9A2.1,2.1 0 0,0 7.5,10.8A2.1,2.1 0 0,0 5.4,12.9A2.1,2.1 0 0,0 7.5,15L8.21,14.88L11,17.67V21H4V13H2.25C1.83,13 1.42,13 1.42,12.79C1.43,12.57 1.85,12.15 2.28,11.72L11,3C11.33,2.67 11.67,2.33 12,2.33C12.33,2.33 12.67,2.67 13,3L17,7V6H19V9L21.78,11.78C22.18,12.18 22.59,12.59 22.6,12.8C22.6,13 22.2,13 21.8,13M7.5,12A0.9,0.9 0 0,1 8.4,12.9A0.9,0.9 0 0,1 7.5,13.8A0.9,0.9 0 0,1 6.6,12.9A0.9,0.9 0 0,1 7.5,12M16.5,12C17,12 17.4,12.4 17.4,12.9C17.4,13.4 17,13.8 16.5,13.8A0.9,0.9 0 0,1 15.6,12.9A0.9,0.9 0 0,1 16.5,12M12,6.9C12.5,6.9 12.9,7.3 12.9,7.8C12.9,8.3 12.5,8.7 12,8.7C11.5,8.7 11.1,8.3 11.1,7.8C11.1,7.3 11.5,6.9 12,6.9Z',book:'M3 4h6l3 2 3-2h6v16h-6l-3 2-3-2H3ZM12 6v16',moon:'M20 15A9 9 0 0 1 9 3a9 9 0 1 0 11 12',
};
const icon=name=>`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name==='recipes'?'book':name]||paths.calendar}"/></svg>`;
const weatherGlyph=condition=>({sunny:'☀',partlycloudy:'⛅',cloudy:'☁',rainy:'☂',pouring:'☂',snowy:'❄','snowy-rainy':'❄',fog:'≋',windy:'≋','windy-variant':'≋','clear-night':'☾',lightning:'ϟ','lightning-rainy':'ϟ'}[condition]||'☁');
const format=(date,options)=>new Intl.DateTimeFormat('en-US',options).format(date);
const time=date=>format(date,{hour:'numeric',minute:'2-digit'});
const repeatLabels={none:'One time',daily:'Every day',weekdays:'Weekdays',weekly:'Every week'};
const personStyle=p=>`--color:${p.color};--pale:${p.pale}`;
const button=(label,action,classes='btn',attrs='')=>`<button type="button" class="${classes}" data-action="${action}" ${attrs}>${label}</button>`;

class HearthglanceCard extends HTMLElement {
 constructor(){
  super();this.attachShadow({mode:'open'});this._events={};this._tasks={};this._forecast=[];this._unsubs=[];this._calendarUnsubs=[];this._errors=new Map();this._date=new Date();this._page='home';this._view='week';this._list=0;this._busy=false;this._generation=0;this._eventIndex=[];
  this._prefs={};this._hidden=new Set();
  this._phoneMedia=window.matchMedia('(max-width:600px)');this._mobile=this._phoneMedia.matches;
  this._onPhoneResize=()=>{if(!this._native)this._setMobile(this._phoneMedia.matches);};
  if(typeof ResizeObserver!=='undefined')this._resizeObserver=new ResizeObserver(entries=>{const width=entries[0]?.contentRect.width;if(this._native&&width>0)this._setMobile(width<=600);});
  this.shadowRoot.addEventListener('touchstart',e=>this._phoneTouchStart(e),{passive:true});
  this.shadowRoot.addEventListener('touchend',e=>this._phoneTouchEnd(e),{passive:true});
  this.shadowRoot.addEventListener('touchcancel',()=>{this._swipeStart=null;},{passive:true});
  this.shadowRoot.addEventListener('click',e=>this._click(e));
  this.shadowRoot.addEventListener('submit',e=>this._submit(e));
  this.shadowRoot.addEventListener('change',e=>this._change(e));
  this.shadowRoot.addEventListener('input',e=>{this._recipeInput(e);this._mealTitleInput(e);});
  this.shadowRoot.addEventListener('mousedown',e=>{if(e.target.closest('[data-rich-command]'))e.preventDefault();});
  this.shadowRoot.addEventListener('paste',e=>{if(e.target.closest('.rich-editor')){e.preventDefault();document.execCommand('insertText',false,e.clipboardData.getData('text/plain'));}});
  this.shadowRoot.addEventListener('keydown',e=>{this._mealRecipeKey(e);if(e.defaultPrevented)return;if(e.key==='Escape'&&!this._busy)this._closeModal();});
 }
 setConfig(config){
  const normalized=normalizeConfig(config);
  this._stop();this._config=normalized;this._native=Boolean(normalized.page);this.toggleAttribute('data-native',this._native);this._subscriptions=pageSubscriptions(normalized);this._pages=enabledPages(normalized);this._page=normalized.page||'home';this._list=0;
  this._view=this._page==='calendar'&&!this._mobile?'month':'week';
  if(this._native&&this._page==='calendar'){const location=calendarLocation(window.location?.search||'');if(location.date)this._date=location.date;if(location.view)this._view=this._mobile&&location.view==='day'?'week':location.view;}
  this._events={};this._tasks={};this._recipes=[];this._recipeReady=false;this._mealDraft=null;this._recipeQuery='';this._recipeCategory='';this._recipeFavorites=false;this._errors.clear();this._forecast=[];
  this._storageKey='hearthglance:'+normalized.storage_key;
  try{const prefs=JSON.parse(localStorage.getItem(this._storageKey)||'{}');this._prefs=prefs&&typeof prefs==='object'&&!Array.isArray(prefs)?prefs:{};}catch{this._prefs={};}
  this._hidden=new Set(Array.isArray(this._prefs.hidden)?this._prefs.hidden.filter(id=>typeof id==='string'):[]);
  this._renderShell();this._start();
 }
 set hass(hass){
  const previous=this._hass,wasConnected=previous?.connected;this._hass=hass;
  this._syncNativeTheme();
  if(solarStatesChanged(this._config?.solar,previous,hass))this._renderSolar();
  if(!this._started){this._start();return;}
  this._updateConnection();
  if(!wasConnected&&hass.connected)this._updateClock();
 }
 static getStubConfig(hass){
  const calendar=Object.keys(hass?.states||{}).find(id=>id.startsWith('calendar.'))||'calendar.family';
  return {type:'custom:hearthglance-card',household:'Our family',people:[{id:'family',name:'Family'}],calendars:[{entity:calendar,name:'Family',person:'family'}]};
 }
 getCardSize(){return 12;}
 getGridOptions(){return {columns:'full',rows:'auto'};}
 connectedCallback(){this._active=true;this._phoneMedia.addEventListener('change',this._onPhoneResize);this._resizeObserver?.observe(this);if(this._config){this._renderShell();this._start();}}
 disconnectedCallback(){this._active=false;this._phoneMedia.removeEventListener('change',this._onPhoneResize);this._resizeObserver?.disconnect();this._stop();}
 _setMobile(mobile){if(this._mobile===mobile)return;if(this.shadowRoot.querySelector('#modal-root'))this._closeModal();this._mobile=mobile;if(mobile&&this._view==='day')this._view='week';this._renderShell();this._loadCalendars();}
 _stop(){
  this._started=false;clearInterval(this._clockTimer);clearTimeout(this._toastTimer);this._generation++;this._sessionGeneration=(this._sessionGeneration||0)+1;
  for(const unsub of [...this._unsubs,...this._calendarUnsubs])Promise.resolve().then(unsub).catch(()=>{});
  this._unsubs=[];this._calendarUnsubs=[];
 }
 async _start(){
  if(this._started||!this._active||!this._hass||!this._config)return;
  const session=this._sessionGeneration;this._started=true;this._today=dateKey(new Date());this._updateClock();
  this._clockTimer=setInterval(()=>{this._updateClock();if(this._today!==dateKey(new Date())){this._today=dateKey(new Date());this._date=new Date();this._loadCalendars();}},30000);
  const entities=this._subscriptions.todos;
  for(const entity of entities){
   try{
    const unsub=await this._hass.connection.subscribeMessage(message=>{if(session!==this._sessionGeneration)return;this._tasks[entity]=message.items||[];if(entity===this._config.recipes)this._recipeReady=true;this._errors.delete(entity);this._renderMain();this._renderMealRecipes();},{type:'todo/item/subscribe',entity_id:entity});
    if(!this._started||session!==this._sessionGeneration){unsub();return;}this._unsubs.push(unsub);
   }catch(error){if(session!==this._sessionGeneration)return;this._errors.set(entity,'A task list is unavailable. Try Refresh.');}
  }
  if(this._subscriptions.recipes)await this._startRecipes(session);
  if(session!==this._sessionGeneration)return;
  if(this._subscriptions.weather&&this._config.weather)try{
   const unsub=await this._hass.connection.subscribeMessage(message=>{if(session!==this._sessionGeneration)return;this._forecast=message.forecast||[];this._renderWeather();this._renderMain();},{type:'weather/subscribe_forecast',entity_id:this._config.weather,forecast_type:'daily'});
   if(this._started&&session===this._sessionGeneration)this._unsubs.push(unsub);else unsub();
  }catch(error){if(session===this._sessionGeneration)this._errors.set('weather','The weather forecast is unavailable.');}
  if(session===this._sessionGeneration)this._loadCalendars();
 }
 async _loadCalendars(){
  if(!this._started)return;
  const gen=++this._generation;
  for(const unsub of this._calendarUnsubs)Promise.resolve().then(unsub).catch(()=>{});
  this._calendarUnsubs=[];this._loading=true;this._events={};this._renderMain();
  const range=this._calendarRange();
  const min=midnight(new Date()),max=addDays(min,1);
  // Keep today's agenda available even while browsing another week.
  const currentInRange=range.start<=min&&range.end>=max;
  let remaining=this._subscriptions.calendars.length;
  if(!remaining){this._loading=false;this._renderMain();return;}
  const done=()=>{if(gen===this._generation){remaining--;this._loading=remaining>0;this._renderMain();}};
  for(const calendar of this._subscriptions.calendars){
   this._subscribeCalendar(calendar,range,gen,currentInRange,done);
  }
 }
 async _subscribeCalendar(calendar,range,gen,currentInRange,done){
  let received=false;
  try{
   const unsub=await this._hass.connection.subscribeMessage(message=>{
    if(gen!==this._generation)return;
    if(message.events===null){this._errors.set(calendar.entity,`${calendar.name} could not sync. Try Refresh.`);}
    else{this._events[calendar.entity]=(message.events||[]).map(e=>normalizeEvent(e,calendar));this._errors.delete(calendar.entity);}
    if(!received){received=true;done();}else this._renderMain();
   },{type:'calendar/event/subscribe',entity_id:calendar.entity,start:range.start.toISOString(),end:range.end.toISOString()});
   if(gen===this._generation)this._calendarUnsubs.push(unsub);else unsub();
   if(!currentInRange){
    const today=midnight(new Date()),end=addDays(today,1);
    const events=await this._hass.callApi('GET',`calendars/${calendar.entity}?start=${encodeURIComponent(today.toISOString())}&end=${encodeURIComponent(end.toISOString())}`);
    if(gen===this._generation){this._todayEvents||={};this._todayEvents[calendar.entity]=events.map(e=>normalizeEvent(e,calendar));this._renderMain();}
   }
  }catch(error){if(gen===this._generation){this._errors.set(calendar.entity,`${calendar.name} is unavailable. Try Refresh.`);if(!received){received=true;done();}}}
 }
 _savePrefs(){this._prefs.hidden=[...this._hidden];try{localStorage.setItem(this._storageKey,JSON.stringify(this._prefs));}catch{}}
 _renderShell(){
  if(!this._config)return;
  if(this._native){this._renderNativeShell();return;}
  this.shadowRoot.innerHTML=`<style>${styles}${mobileStyles}${solarStyles}${recipeStyles}${mealRecipeStyles}${richTextStyles}</style><div class="app ${this._mobile?'phone':''} ${this._prefs.dark?'theme-dark':''}"><nav class="rail" aria-label="Dashboard navigation"><a class="brand ha-home" href="/lovelace" title="Back to Home Assistant" aria-label="Back to Home Assistant">${icon('ha')}</a>${[['home','Home'],['calendar','Calendar'],['tasks','Chores'],['list','Lists'],['meals','Meals'],['recipes','Recipes']].filter(([id])=>this._pages.includes(id)).map(([id,label])=>button(`${icon(id)}<span>${label}</span>`,'page','nav',`data-page="${id}" aria-label="${label}"`)).join('')}<div class="rail-bottom">${button(icon('settings'),'settings','icon-btn','aria-label="Dashboard settings"')}</div></nav><div class="body"><header class="topbar"><div class="clock"><div class="clock-time"></div><div class="clock-date"></div></div><div class="weather"></div><div class="connection" role="status"><span class="dot"></span><span class="connection-label">Connected to home</span></div></header><main class="main"></main></div></div><div id="modal-root" class="${this._mobile?'phone-ui':''} ${this._prefs.dark?'theme-dark':''}"></div><div id="toast-root" aria-live="polite"></div>`;
  this._updateClock();this._renderWeather();this._renderMain();
 }
 _renderNativeShell(){
  const header=this._page==='header';
  this.shadowRoot.innerHTML=`<style>${styles}${mobileStyles}${solarStyles}${recipeStyles}${mealRecipeStyles}${richTextStyles}${nativeStyles}</style><div class="app native ${this._mobile?'phone':''}"><div class="body">${header?'<header class="topbar"><div class="clock"><div class="clock-time"></div><div class="clock-date"></div></div><div class="weather"></div><div class="connection" role="status"><span class="dot"></span><span class="connection-label">Connected to home</span></div></header>':'<main class="main"></main>'}</div></div><div id="modal-root" class="${this._mobile?'phone-ui':''}"></div><div id="toast-root" aria-live="polite"></div>`;
  this._syncNativeTheme();this._updateClock();this._renderMain();
 }
 _syncNativeTheme(){
  if(!this._native)return;
  const dark=Boolean(this._hass?.themes?.darkMode);
  for(const selector of ['.app','#modal-root'])this.shadowRoot.querySelector(selector)?.classList.toggle('theme-dark',dark);
 }
 _navigatePage(page,options={}){
  if(!this._native){this._phoneNavigate(page);return;}
  const route=this._config.routes?.[page];
  if(route)navigateView(route,options);
 }
 _pageButton(label,page,classes='text-link'){
  if(this._native&&!this._config.routes?.[page])return '';
  return button(label,'page',classes,`data-page="${page}"`);
 }
 _updateClock(){
  const now=new Date(),clock=this.shadowRoot.querySelector('.clock-time'),date=this.shadowRoot.querySelector('.clock-date');
  if(clock){const parts=format(now,{hour:'numeric',minute:'2-digit'}).split(' ');clock.innerHTML=`${esc(parts[0])}<small>${esc(parts[1])}</small>`;}
  if(date)date.innerHTML=`<strong>${format(now,{weekday:'long'})}</strong>${format(now,{month:'long',day:'numeric'})}`;
  this._renderWeather();this._updateConnection();if(this._mobile)this._updatePhoneNow();
 }
 _updateConnection(){
  const el=this.shadowRoot.querySelector('.connection');if(!el)return;
  const connected=this._hass?.connected!==false;el.classList.toggle('offline',!connected);
  el.querySelector('.connection-label').textContent=connected?'Connected to home':'Reconnecting…';
  el.title=connected?'Connected to Home Assistant':'Reconnecting to Home Assistant';
 }
 _solarDayHTML(date){
  const reading=solarForDate(this._config.solar,this._hass?.states,date,new Date(),this._hass?.connected);
  if(!reading)return '';
  const {actual,forecast}=reading,label=actual&&forecast?'Solar actual / forecast':actual?'Solar actual':'Solar forecast';
  const value=[actual,forecast].filter(Boolean).map(r=>r.value).join(' / ');
  return `<span class="weather-solar" title="${esc(label)}" aria-label="${esc(label+': '+value+' kWh')}"><b>${esc(value)}<span class="solar-unit">kWh</span></b></span>`;
 }
 _weatherHTML(){
  if(!this._hass||!this._config.weather&&!this._config.solar)return '';
  const weather=this._hass.states[this._config.weather],available=weather&&!['unknown','unavailable'].includes(weather.state);
  const condition=available?weather.state.replaceAll('-',' ').replace('partlycloudy','Partly cloudy'):'';
  const today=new Date(),solar=this._solarDayHTML(today);
  let future=this._forecast.filter(f=>dateKey(localDate(f.datetime))>dateKey(today)).slice(0,5);
  if(!future.length&&(this._config.solar?.forecast_tomorrow||this._config.solar?.forecasts?.length>1))future=[{datetime:addDays(today,1).toISOString()}];
  return `<div class="weather-now">${available?`<span class="weather-icon">${weatherGlyph(weather.state)}</span>`:''}<div><div class="weather-temp">${available?`${Math.round(weather.attributes.temperature)}°<small>${esc((weather.attributes.temperature_unit||'F').replace('°',''))}</small>`:'Today'}</div><div class="weather-label">${available?'Today · '+esc(condition[0].toUpperCase()+condition.slice(1)):this._config.weather?'Weather unavailable':''}</div>${solar}</div></div><div class="forecast">${future.map(f=>`<div class="forecast-day">${format(localDate(f.datetime),{weekday:'short'})}${f.condition?`<span class="weather-icon">${weatherGlyph(f.condition)}</span><b>${Math.round(f.temperature)}° <span style="color:var(--muted)">${f.templow==null?'':Math.round(f.templow)+'°'}</span></b>`:''}${this._solarDayHTML(localDate(f.datetime))}</div>`).join('')}</div>`;
 }
 _renderWeather(){
  for(const el of this.shadowRoot.querySelectorAll('.weather, .phone-weather-strip'))el.innerHTML=this._weatherHTML();
 }
 _visibleEvents(today=false){
  let data=this._events;
  if(today){const r=this._calendarRange();if(!(r.start<=midnight(new Date())&&r.end>new Date()))data=this._todayEvents||{};}
  return uniqueEvents(Object.values(data).flat().filter(e=>!this._hidden.has(e.calendar.person)&&!this._hidden.has(e.calendar.entity))).filter(e=>e.calendar.kind!=='meals'||this._prefs.showMeals!==false);
 }
 _person(id){return this._config.people.find(p=>p.id===id)||this._config.people[0];}
 _calStyle(calendar){return personStyle(this._person(calendar.person));}
 _eventButton(e,compact=false){
  const index=this._eventIndex.push(e)-1;
  if(compact)return button(`${e.allDay?'':esc(time(e.start))+' '}${esc(e.title)}`,'event','month-event',`data-index="${index}" style="${this._calStyle(e.calendar)}" title="${esc(e.title)}"`);
  return button(`<span class="event-time">${e.allDay?'All day':esc(time(e.start))}</span><span class="event-title">${esc(e.title)}</span>${e.location?`<span class="event-location">${esc(e.location)}</span>`:''}`,'event',`event ${e.end<new Date()?'past':''}`,`data-index="${index}" style="${this._calStyle(e.calendar)}"`);
 }
 _renderMain(){
  const main=this.shadowRoot.querySelector('.main');if(!main||!this._config)return;
  const scroll=main.scrollTop;this._eventIndex=[];main.dataset.page=this._page;
  if(this._mobile){this._renderMobileMain();return;}
  for(const nav of this.shadowRoot.querySelectorAll('.nav')){const active=nav.dataset.page===this._page;nav.classList.toggle('active',active);nav.setAttribute('aria-current',active?'page':'false');}
  const titles={home:['YOUR FAMILY, AT A GLANCE','A little more together.','The week ahead, and what matters today.'],calendar:['THE FAMILY SCHEDULE','Calendar','One place for everyone’s plans.'],tasks:['SMALL THINGS, SHARED','Chores & routines','A little teamwork goes a long way.'],list:['LESS TO REMEMBER','Shared lists','For the things you need, and the things to do.'],meals:['AROUND THE TABLE','Meal planner','Good food. One less decision.'],recipes:['FAMILY FAVORITES','Recipes','Your family favorites, ready for the week.']};
  const [eyebrow,title,subtitle]=titles[this._page];
  const primary=this._page==='recipes'?['Add recipe','add-recipe']:this._page==='tasks'?['Add chore','add-task']:this._page==='list'?['Add item','add-list-item']:this._page==='meals'?['Plan a meal','add-meal']:['Add event','add-event'];
  main.innerHTML=`<div class="page-head"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><div class="subtitle">${subtitle}</div></div><div class="head-actions">${button(icon('refresh'),'refresh','icon-btn','aria-label="Refresh dashboard"')}${button(icon('plus')+primary[0],primary[1],'btn primary')}</div></div>${this._errors.size?`<div class="error-banner" role="alert"><span>${esc([...new Set(this._errors.values())].join(' '))}</span>${button('Retry','refresh','text-link')}</div>`:''}${this._page==='home'||this._page==='calendar'?this._calendarPage():this._page==='tasks'?this._choresPage():this._page==='list'?this._listsPage():this._page==='recipes'?this._phoneRecipes():this._mealsPage()}`;
  main.scrollTop=scroll;
 }
 _profiles(){return `<div class="profiles" aria-label="Family filters">${this._config.people.map(p=>button(`<span class="avatar">${esc(p.initial)}</span>${esc(p.name)}`,'filter',`profile ${this._hidden.has(p.id)?'off':''}`,`data-person="${p.id}" style="${personStyle(p)}" aria-pressed="${!this._hidden.has(p.id)}"`)).join('')}${button('Other calendars','other-calendars','text-link')}</div>`;}
 _calendarPage(){
  const filters=`<div class="filters-row">${this._profiles()}<div class="view-switch" aria-label="Calendar view">${[['day','Day'],['schedule','Schedule'],['week','Week'],['month','Month']].map(([id,label])=>button(label,'view',this._view===id?'active':'',`data-view="${id}" aria-pressed="${this._view===id}"`)).join('')}</div></div>`;
  const calendar=this._calendarHTML();
  if(this._page==='calendar')return filters+calendar;
  const meals=eventsOn(Object.values(this._events).flat().filter(e=>e.calendar.kind==='meals'),new Date());
  const dinner=meals.find(e=>mealMeta(e).slot==='Dinner')||meals[0];
  return `${filters}<div class="home-grid"><div class="calendar-area">${calendar}${this._pages.includes('meals')?`<div class="dinner-strip"><div class="meal-icon">${icon('meals')}</div><div><div class="eyebrow">${dinner?'On the menu today':'Tonight, at home'}</div><strong>${esc(dinner?.title||'What’s for dinner?')}</strong></div>${dinner?this._pageButton('View meals','meals','btn small'):button('Plan dinner','add-meal','btn small')}</div>`:''}</div><aside class="aside">${this._agendaHTML()}${this._todayTasksHTML()}${this._groceryHTML()}</aside></div>`;
 }
 _toolbar(view=this._view){
  const range=rangeFor(view,this._date);
  let label=format(this._date,{month:'long',year:'numeric'});
  if(view==='week'||view==='schedule'){const end=addDays(range.end,-1);label=`${format(range.start,{month:'short',day:'numeric'})} – ${format(end,{month:range.start.getMonth()===end.getMonth()?undefined:'short',day:'numeric'})}, ${end.getFullYear()}`;}
  if(view==='day')label=format(this._date,{weekday:'long',month:'long',day:'numeric'});
  return `<div class="cal-toolbar"><div class="cal-title">${esc(label)}</div><div class="date-nav">${button(icon('left'),'previous','icon-btn small','aria-label="Previous period"')}${button('Today','today','btn small')}${button(icon('right'),'next','icon-btn small','aria-label="Next period"')}</div></div>`;
 }
 _dayWeather(date){
  const f=this._forecast.find(x=>dateKey(localDate(x.datetime))===dateKey(date));
  return `<span class="day-weather">${f?`${weatherGlyph(f.condition)} ${Math.round(f.temperature)}°${f.templow==null?'':' / '+Math.round(f.templow)+'°'}`:''}</span>`;
 }
 _dayHeader(date){return button(`<span class="day-name">${format(date,{weekday:'short'})}</span><span class="day-number">${date.getDate()}</span>${this._dayWeather(date)}`,'day','day-header',`data-date="${dateKey(date)}" aria-label="Show ${format(date,{weekday:'long',month:'long',day:'numeric'})}"`);}
 _calendarHTML(){
  const range=rangeFor(this._view,this._date),events=this._visibleEvents();
  let content='';
  if(this._view==='month'){
   content=`<div class="month-labels">${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d=>`<span class="day-name">${d}</span>`).join('')}</div><div class="month-grid">${range.days.map(date=>{const ev=eventsOn(events,date),limit=ev.length>2?1:2;return `<div class="month-day ${date.getMonth()!==this._date.getMonth()?'other':''} ${dateKey(date)===dateKey(new Date())?'today':''}">${button(`<b>${date.getDate()}</b>${this._dayWeather(date)}`,'day','month-date',`data-date="${dateKey(date)}" aria-label="Show ${format(date,{month:'long',day:'numeric'})}"`)}${ev.slice(0,limit).map(e=>this._eventButton(e,true)).join('')}${ev.length>limit?button(`+${ev.length-limit} more`,'day','more',`data-date="${dateKey(date)}"`):''}</div>`;}).join('')}</div>`;
  }else if(this._view==='day'){
   const ev=eventsOn(events,this._date);content=`<div class="day-view">${ev.length?ev.map(e=>this._eventButton(e)).join(''):`<div class="empty">${icon('sun')}<strong>A little breathing room.</strong>No events on this day.${button('Add an event','add-event','btn small')}</div>`}</div>`;
  }else{
   content=`<div class="week-grid ${this._view==='schedule'?'schedule':''}">${range.days.map(date=>{const ev=eventsOn(events,date);return `<section class="day-column ${dateKey(date)===dateKey(new Date())?'today':''}">${this._dayHeader(date)}<div class="day-events">${ev.length?ev.map(e=>this._eventButton(e)).join(''):`<div class="no-events">${this._loading?'Loading…':'No plans yet'}</div>`}</div></section>`;}).join('')}</div>`;
  }
  return `<section class="calendar" aria-label="${this._view} calendar">${this._toolbar()}${content}</section>`;
 }
 _agendaHTML(){
  const events=eventsOn(this._visibleEvents(true).filter(e=>e.calendar.kind!=='meals'),new Date());
  return `<section class="panel"><div class="panel-head"><h2>Today’s agenda</h2><span class="count">${events.length} ${events.length===1?'event':'events'}</span></div>${events.length?events.map(e=>{const idx=this._eventIndex.push(e)-1;return button(`<span class="agenda-dot" style="${this._calStyle(e.calendar)}"></span><span class="agenda-time">${e.allDay?'All day':esc(time(e.start))}</span><span class="agenda-detail"><strong>${esc(e.title)}</strong><small>${esc(e.calendar.name)}</small></span>`,'event','agenda-row',`data-index="${idx}"`);}).join(''):`<div class="empty">${icon('sun')}Your day has room to breathe.<br>No events scheduled.</div>`}</section>`;
 }
 _taskRows(entity,items,compact=false){return items.map(item=>{
  const meta=taskMeta(item),done=item.status==='completed';
  const note=meta.repeat&&meta.repeat!=='none'?repeatLabels[meta.repeat]:item.due?`Due ${format(localDate(String(item.due).slice(0,10)),{month:'short',day:'numeric'})}`:'';
  return `<div class="task-row ${done?'done':''}">${button(`<span class="check">${done?icon('check'):''}</span>`,'toggle-task','',`data-entity="${entity}" data-uid="${esc(item.uid)}" aria-label="${done?'Uncheck':'Complete'} ${esc(item.summary)}" aria-pressed="${done}"`)}<div class="task-label"><span>${esc(item.summary)}</span>${!compact&&note?`<small>${esc(note)}</small>`:''}</div>${compact?'':button(icon('edit'),'edit-task','task-edit',`data-entity="${entity}" data-uid="${esc(item.uid)}" aria-label="Edit ${esc(item.summary)}"`)}</div>`;
 }).join('');}
 _todayTasksHTML(){
  if(!this._pages.includes('tasks'))return '';
  const people=this._config.people.filter(p=>p.todo&&!this._hidden.has(p.id));
  const entries=people.flatMap(p=>(this._tasks[p.todo]||[]).filter(i=>dueToday(i)).map(item=>({person:p,item})));
  const done=entries.filter(x=>x.item.status==='completed').length;
  return `<section class="panel"><div class="panel-head"><h2>A little teamwork</h2><span class="count">${done}/${entries.length} done</span></div>${entries.filter(x=>x.item.status!=='completed').slice(0,3).map(({person,item})=>this._taskRows(person.todo,[item],true)).join('')||`<div class="empty">${icon('check')}${entries.length?'All caught up. Nice teamwork!':'No chores for today.'}</div>`}${this._pageButton('View all chores →','tasks')}</section>`;
 }
 _renderSolar(){this._renderWeather();}
 _groceryHTML(){if(!this._config.lists.length)return '';const list=this._config.lists[0],items=(this._tasks[list.entity]||[]).filter(i=>i.status!=='completed');return `<section class="panel"><div class="panel-head"><h2>${esc(list.name)}</h2><span class="count">${items.length} ${items.length===1?'item':'items'}</span></div>${this._taskRows(list.entity,items.slice(0,3),true)||`<div class="empty">The list is clear.<br>Add something before you forget.</div>`}${button('+ Add to list','quick-grocery','text-link')}</section>`;}
 _choresPage(){
  return `<div class="filters-row">${this._profiles()}<span class="section-note">Tap a check to complete. Recurring chores return when due.</span></div><div class="person-grid">${this._config.people.filter(p=>p.todo&&!this._hidden.has(p.id)).map(p=>{
   const items=this._tasks[p.todo]||[],today=items.filter(i=>dueToday(i)),done=today.filter(i=>i.status==='completed').length;
   return `<section class="panel" style="${personStyle(p)}"><div class="person-head"><span class="avatar">${esc(p.initial)}</span><div><h2>${esc(p.name)}</h2><small>${done} of ${today.length} done today</small></div></div><div class="progress"><span style="width:${today.length?100*done/today.length:0}%"></span></div>${this._taskRows(p.todo,today.filter(i=>i.status!=='completed'))}${this._taskRows(p.todo,today.filter(i=>i.status==='completed'))}${!today.length?'<div class="empty">Nothing due today.</div>':''}${items.some(i=>i.status!=='completed'&&!dueToday(i))?`<div class="completed-label">Coming up</div>${this._taskRows(p.todo,items.filter(i=>i.status!=='completed'&&!dueToday(i)))}`:''}${items.some(i=>i.status==='completed'&&!dueToday(i))?`<details><summary class="completed-label">Completed earlier</summary>${this._taskRows(p.todo,items.filter(i=>i.status==='completed'&&!dueToday(i)))}</details>`:''}${button('+ Add a chore','add-task','text-link',`data-person="${p.id}"`)}</section>`;
  }).join('')}</div>`;
 }
 _listsPage(){const list=this._config.lists[this._list],items=this._tasks[list.entity]||[],pending=items.filter(i=>i.status!=='completed'),done=items.filter(i=>i.status==='completed');return `<div class="lists-layout"><nav class="list-nav" aria-label="Shared lists">${this._config.lists.map((l,i)=>button(`${icon('list')}<span>${esc(l.name)}</span><small>${(this._tasks[l.entity]||[]).filter(x=>x.status!=='completed').length}</small>`,'select-list',`list-tab ${i===this._list?'active':''}`,`data-list="${i}"`)).join('')}</nav><section class="panel list-items"><div class="panel-head"><h2>${esc(list.name)}</h2><span class="count">${pending.length} remaining</span></div>${this._taskRows(list.entity,pending)||'<div class="empty">All clear. Add something to get started.</div>'}${button('+ Add an item','add-list-item','text-link')}${done.length?`<div class="completed-label">Completed (${done.length})</div>${this._taskRows(list.entity,done)}`:''}</section></div>`;}
 _mealsPage(){
  const range=rangeFor('week',this._date),events=Object.values(this._events).flat().filter(e=>e.calendar.kind==='meals');
  const recipes=this._recipeItems();
  return `<div class="meal-layout"><section class="calendar" aria-label="Weekly meal planner">${this._toolbar('week')}<div class="meal-week">${range.days.map(date=>`<section class="meal-day ${dateKey(date)===dateKey(new Date())?'today':''}">${this._dayHeader(date)}${['Breakfast','Lunch','Dinner','Snack'].map(slot=>`<div class="meal-slot"><label>${slot}</label>${eventsOn(events,date).filter(e=>(mealMeta(e).slot||'Dinner')===slot).map(e=>this._eventButton(e)).join('')}${button('+ Plan','add-meal','meal-add',`data-date="${dateKey(date)}" data-slot="${slot}" aria-label="Plan ${slot.toLowerCase()} for ${format(date,{weekday:'long'})}"`)}</div>`).join('')}</section>`).join('')}</div></section><aside class="panel recipes-panel" ${this._config.recipes?'':'hidden'}><div class="panel-head"><h2>Family favorites</h2>${button(icon('plus'),'add-recipe','icon-btn small','aria-label="Add recipe"')}</div><p class="section-note">Save recipes here, then add them to your week.</p>${recipes.map(r=>button(`${esc(r.summary)}<small>View recipe & plan a meal →</small>`,'recipe','recipe-btn',`data-uid="${esc(r.uid)}"`)).join('')||'<div class="empty">Your favorites belong here.<br>Add your first recipe.</div>'}${button('+ Add a recipe','add-recipe','text-link')}</aside></div>`;
 }
 async _click(event){
  if(this._mobile&&event.target.classList.contains('modal-backdrop')&&!this._busy){this._closeModal();return;}
  if(this._suppressPhoneClick>Date.now())return;
  const el=event.target.closest('[data-action]');if(!el||el.disabled)return;
  const a=el.dataset.action;
  if(a==='select-meal-recipe'){this._selectMealRecipe(el.dataset.uid);return;}
  if(a==='unlink-meal-recipe'){this._mealRecipeId=null;this._renderMealRecipes();return;}
  if(a==='create-meal-recipe'){this._createMealRecipe();return;}
  if(a==='rich-command'){this.shadowRoot.querySelector('.rich-editor')?.focus();document.execCommand(el.dataset.richCommand,false);return;}
  if(a==='close-modal'){if(!this._busy)this._closeModal();return;}
  if(a==='phone-back'){if(this._page==='list'&&this._mobileListOpen){this._mobileListOpen=false;this._renderMain();}else this._phoneNavigate('home');return;}
  if(a==='phone-page'){this._phoneNavigate(el.dataset.page);return;}
  if(a==='phone-add'){this._phoneAdd();return;}
  if(a==='phone-filters'){this._phoneFilters();return;}
  if(a==='phone-search'){this._phoneSearch();return;}
  if(a==='phone-clear-search'){this._mobileQuery='';this._renderMain();return;}
  if(a==='phone-toggle-meals'){this._prefs.showMeals=this._prefs.showMeals===false;this._savePrefs();this._renderMain();return;}
  if(a==='phone-task-person'){this._taskPerson=el.dataset.person;this._renderMain();return;}
  if(a==='phone-task-mode'){this._taskMode=el.dataset.mode;this._renderMain();return;}
  if(a==='phone-open-list'){this._list=Number(el.dataset.list);this._mobileListOpen=true;this._renderMain();return;}
  if(a==='phone-meal-day'){this._date=localDate(el.dataset.date);this._renderMain();return;}
  if(a==='page'){this._navigatePage(el.dataset.page);return;}
  if(a==='view'){this._view=el.dataset.view;this._loadCalendars();return;}
  if(a==='filter'){const id=el.dataset.person;this._hidden.has(id)?this._hidden.delete(id):this._hidden.add(id);this._savePrefs();this._renderMain();return;}
  if(a==='day'){
   if(this._native&&this._page==='home'&&this._config.routes?.calendar){this._navigatePage('calendar',{date:el.dataset.date,view:this._mobile?'week':'day'});return;}
   this._date=localDate(el.dataset.date);if(!this._native)this._page='calendar';if(this._page!=='meals')this._view=this._mobile?'week':'day';if(this._mobile)this._pendingFocusDate=el.dataset.date;this._loadCalendars();return;
  }
  if(a==='previous'||a==='next'){
   this._navigatePeriod(a==='next'?1:-1);return;
  }
  if(a==='today'){this._date=new Date();if(this._mobile&&['week','month'].includes(this._view))this._pendingFocusDate=dateKey(this._date);this._loadCalendars();return;}
  if(a==='refresh'){this._errors.clear();this._stop();this._start();return;}
  if(a==='event'){this._showEvent(this._eventIndex[Number(el.dataset.index)]);return;}
  if(a==='add-event'){this._eventForm(null,{date:el.dataset.date});return;}
  if(a==='edit-event'){this._eventForm(this._selectedEvent);return;}
  if(a==='delete-event'){this._confirmDelete('event',this._selectedEvent);return;}
  if(a==='go-tasks'||a==='go-meals'){this._navigatePage(a==='go-tasks'?'tasks':'meals');return;}
  if(a==='add-task'){this._taskForm({person:el.dataset.person});return;}
  if(a==='toggle-task'){await this._toggleTask(el.dataset.entity,el.dataset.uid,el);return;}
  if(a==='edit-task'){this._taskForm({entity:el.dataset.entity,item:this._tasks[el.dataset.entity]?.find(i=>i.uid===el.dataset.uid)});return;}
  if(a==='select-list'){this._list=Number(el.dataset.list);this._renderMain();return;}
  if(a==='add-list-item'||a==='quick-grocery'){this._taskForm({entity:this._config.lists[a==='quick-grocery'?0:this._list].entity});return;}
  if(a==='delete-task'){this._confirmDelete('task',this._editingTask);return;}
  if(a==='add-meal'){this._eventForm(null,{meal:true,date:el.dataset.date,slot:el.dataset.slot});return;}
  if(a==='add-recipe'){this._recipeForm();return;}
  if(a==='recipe'){this._showRecipe(this._recipeItems().find(r=>r.uid===el.dataset.uid));return;}
  if(a==='edit-recipe'){this._recipeForm(this._selectedRecipe);return;}
  if(a==='meal-recipe'){this._showRecipe(this._recipeItems().find(r=>r.uid===mealMeta(this._selectedEvent).recipe));return;}
  if(a==='plan-recipe'){this._eventForm(null,{meal:true,recipe:this._selectedRecipe});return;}
  if(a==='delete-recipe'){this._confirmDelete('recipe',{item:this._selectedRecipe});return;}
  if(a==='settings'||a==='other-calendars'){this._settings();return;}
 }
 _change(event){
  const input=event.target;
  if(input.hasAttribute('data-recipe-category')){this._recipeCategory=input.value;this._renderRecipeResults();return;}
  if(input.hasAttribute('data-recipe-favorites')){this._recipeFavorites=input.checked;this._renderRecipeResults();return;}
  if(input.name==='phone_view'){this._view=input.value;this._mobileQuery='';this._loadCalendars();return;}
  if(input.name==='phone_schedule_days'){this._prefs.scheduleDays=Number(input.value);this._savePrefs();if(this._view==='schedule')this._loadCalendars();return;}
  if(input.dataset.phonePerson){const id=input.dataset.phonePerson;input.checked?this._hidden.delete(id):this._hidden.add(id);this._savePrefs();this._renderMain();return;}
  if(input.name==='all_day'){
   const form=input.closest('form');for(const name of ['start_time','end_time']){const field=form.querySelector(`[name="${name}"]`);field.disabled=input.checked;field.closest('.field').style.opacity=input.checked?'.4':'1';}
  }
  if(input.dataset.pref){this._prefs[input.dataset.pref]=input.checked;this._savePrefs();this.shadowRoot.querySelector('.app').classList.toggle('theme-dark',Boolean(this._prefs.dark));this.shadowRoot.querySelector('#modal-root').classList.toggle('theme-dark',Boolean(this._prefs.dark));this._renderMain();}
  if(input.dataset.calendar){this._hidden.has(input.dataset.calendar)?this._hidden.delete(input.dataset.calendar):this._hidden.add(input.dataset.calendar);this._savePrefs();this._renderMain();}
 }
 _openModal(title,content,wide=false){
  if(this._focusTrap)this.shadowRoot.removeEventListener('keydown',this._focusTrap);
  this.shadowRoot.querySelector('#modal-root').innerHTML=`<div class="modal-backdrop"><section class="modal ${wide?'wide':''}" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="modal-head"><h2>${esc(title)}</h2>${button(icon('close'),'close-modal','icon-btn small','aria-label="Close dialog"')}</div>${content}</section></div>`;
  this._previousFocus=this.shadowRoot.activeElement;
  (this.shadowRoot.querySelector('.modal input:not([type=checkbox])')||this.shadowRoot.querySelector('.modal button'))?.focus({preventScroll:true});
  this._focusTrap=e=>{if(e.key!=='Tab')return;const nodes=[...this.shadowRoot.querySelectorAll('.modal button:not(:disabled),.modal a[href],.modal input:not(:disabled),.modal select:not(:disabled),.modal textarea:not(:disabled)')];const first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&this.shadowRoot.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&this.shadowRoot.activeElement===last){e.preventDefault();first.focus();}};
  this.shadowRoot.addEventListener('keydown',this._focusTrap);
 }
 _closeModal(){if(this._mealDraft){this._resumeMeal();return;}this.shadowRoot.querySelector('#modal-root').innerHTML='';this.shadowRoot.removeEventListener('keydown',this._focusTrap);this._previousFocus?.focus?.({preventScroll:true});}
 _field(label,name,value='',type='text',extra=''){return `<label class="field ${extra}">${esc(label)}<input type="${type}" name="${name}" value="${esc(value)}" ${name==='title'?'required maxlength="200"':(type==='date'||type==='time')?'required':''}></label>`;}
 _options(options,value){return options.map(([v,label])=>`<option value="${esc(v)}" ${v===value?'selected':''}>${esc(label)}</option>`).join('');}
 _formFooter(label='Save',removeAction=''){return `<div class="form-error" role="alert" hidden></div><div class="modal-foot">${removeAction?button('Delete',removeAction,'btn danger'):''}${button('Cancel','close-modal','btn')}<button class="btn primary" type="submit">${label}</button></div>`;}
 _isMeal(event){return event?.calendar.kind==='meals'||Boolean(mealMeta(event||{}).slot);}
 _canEditEvent(event){return !event.calendar.google&&Boolean((this._hass.states[event.calendar.entity]?.attributes.supported_features&4)&&(!(event.rrule||event.recurrence_id)||event.recurrence_id));}
 _googleEventLink(event){
  if(!event.calendar.google)return '';
  const value=event.htmlLink||event.url;
  try{const url=new URL(value);if(url.protocol==='https:'&&!url.username&&!url.password&&(url.hostname==='calendar.google.com'||url.hostname==='www.google.com'&&url.pathname.startsWith('/calendar/')))return `<a class="btn primary" href="${esc(url.href)}" target="_blank" rel="noopener noreferrer">Edit in Google Calendar</a>`;}catch{}
  return '<a class="btn primary" href="https://calendar.google.com/calendar/u/0/r" target="_blank" rel="noopener noreferrer">Open Google Calendar</a>';
 }
 _eventForm(event,options={}){
  if(event&&!this._canEditEvent(event)){this._showEvent(event);return;}
  const meal=options.meal||this._isMeal(event);this._editingEvent=event;this._eventOptions=options;
  const writable=this._config.calendars.filter(c=>(this._hass.states[c.entity]?.attributes.supported_features&1)&&(meal?c.kind==='meals':c.kind!=='meals'));
  const selected=event?.calendar.entity||writable.find(c=>c.entity===this._config.default_calendar)?.entity||writable[0]?.entity;
  const start=event?.start||localDate(options.date||dateKey(this._date)),end=event?.end||addDays(start,1),allDay=event?.allDay??true;
  const dateEnd=event?.allDay?addDays(end,-1):event?end:start;
  const hour=new Date();hour.setMinutes(0,0,0);hour.setHours(hour.getHours()+1);
  const timeInput=d=>`${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  const metadata=event?mealMeta(event):{};
  const recipe=options.recipe;this._mealRecipeId=recipe?.uid||metadata.recipe||null;
  this._openModal(event?(meal?'Edit meal':'Edit event'):(meal?'Plan a meal':'Add an event'),`<form data-form="event"><div class="form-grid">${meal?this._mealTitleField(event?.title||recipe?.summary||''):this._field('Event title','title',event?.title||'','text','full')}${meal?`<label class="field">Meal<select name="slot">${this._options(['Breakfast','Lunch','Dinner','Snack'].map(x=>[x,x]),metadata.slot||options.slot||'Dinner')}</select></label>`:''}<label class="field ${meal?'':'full'}">${meal?'Calendar':'Who is it for?'}<select name="calendar" ${event?'disabled':''}>${this._options(writable.map(c=>[c.entity,c.name]),selected)}</select></label>${this._field('Starts','start_date',dateKey(start),'date')}${this._field('Ends (inclusive for all-day)','end_date',dateKey(dateEnd),'date')}<label class="checkbox-field field full"><span><input name="all_day" type="checkbox" ${allDay?'checked':''}> All-day event</span></label>${this._field('Start time','start_time',timeInput(event&&!event.allDay?start:hour),'time')}${this._field('End time','end_time',timeInput(event&&!event.allDay?end:new Date(hour.getTime()+3600000)),'time')}${!event?`<label class="field full">Repeat<select name="repeat">${this._options([['','Does not repeat'],['FREQ=DAILY','Every day'],['FREQ=WEEKLY','Every week'],['FREQ=MONTHLY','Every month']],'')}</select></label>`:''}${!meal?this._field('Location','location',event?.location||'','text','full'):''}${meal?`<label class="field full">Notes<textarea name="notes">${esc(metadata.notes||'')}</textarea></label>`:richTextField(event?.description||'')}</div>${!writable.length?'<p class="form-error">No editable calendar is available.</p>':''}${this._formFooter(event?'Save changes':meal?'Add to meal plan':'Add event')}</form>`);
  this._renderMealRecipes();
  for(const name of ['start_time','end_time']){const f=this.shadowRoot.querySelector(`[name="${name}"]`);f.disabled=allDay;f.closest('.field').style.opacity=allDay?'.4':'1';}
 }
 _showEvent(event){
  if(!event)return;this._selectedEvent=event;
  const meal=this._isMeal(event),features=this._hass.states[event.calendar.entity]?.attributes.supported_features||0,recurring=Boolean(event.rrule||event.recurrence_id),meta=mealMeta(event);
  const notes=meal?meta.notes||'':event.description;
  const linkedRecipe=this._recipeItems().find(r=>r.uid===meta.recipe);
  this._openModal(meal?'On the menu':'Event details',`<span class="tag" style="${this._calStyle(event.calendar)}">${esc(event.calendar.name)}${meta.slot?' · '+esc(meta.slot):''}</span><h3 class="detail-title">${esc(event.title)}</h3><div class="detail-line">${icon('calendar')}<span>${format(event.start,{weekday:'long',month:'long',day:'numeric',year:'numeric'})}${dateKey(event.start)!==dateKey(event.allDay?addDays(event.end,-1):event.end)?'<br>through '+format(event.allDay?addDays(event.end,-1):event.end,{month:'long',day:'numeric'}):''}<br>${event.allDay?'All day':esc(time(event.start)+' – '+time(event.end))}</span></div>${event.location?`<div class="detail-line">${icon('pin')}<span>${esc(event.location)}</span></div>`:''}${notes?`<div class="detail-notes ${meal?'':'rich-description'}">${meal?esc(notes):richTextHTML(notes)}</div>`:''}${!(features&1)?'<p class="section-note">Subscribed calendar · edit events in the source calendar.</p>':''}${recurring?'<p class="section-note">Repeating event · manage the series in the source calendar.</p>':''}<div class="modal-foot">${features&2&&!recurring?button('Delete','delete-event','btn danger'):''}${button('Close','close-modal','btn')}${linkedRecipe?button('View recipe','meal-recipe','btn primary'):''}${this._canEditEvent(event)?button(meal?'Edit meal':'Edit event','edit-event','btn primary'):''}${this._googleEventLink(event)}${recurring?'<a class="btn" href="/calendar">Open HA calendar</a>':''}</div>`);
 }
 _taskForm({person,entity,item}={}){
  const chores=!entity||this._config.people.some(p=>p.todo===entity);const owner=this._config.people.find(p=>entity&&p.todo===entity)||this._config.people.find(p=>p.id===person&&p.todo)||this._config.people.find(p=>p.todo);
  entity=entity||owner?.todo;if(!entity)return;this._editingTask={entity,item};const meta=item?taskMeta(item):{};
  this._openModal(item?(chores?'Edit chore':'Edit item'):(chores?'Add a chore':'Add to list'),`<form data-form="task"><div class="form-grid">${this._field(chores?'What needs doing?':'Item','title',item?.summary||'','text','full')}${chores?`<label class="field full">Assigned to<select name="person" ${item?'disabled':''}>${this._options(this._config.people.filter(p=>p.todo).map(p=>[p.id,p.name]),owner.id)}</select></label><label class="field">Repeat<select name="repeat">${this._options(Object.entries(repeatLabels),meta.repeat||'none')}</select></label>${this._field('Due date','due',item?.due?String(item.due).slice(0,10):dateKey(new Date()),'date')}`:''}</div>${this._formFooter(item?'Save changes':'Add',item?'delete-task':'')}</form>`);
 }
 _confirmDelete(kind,value){this._deleteTarget={kind,value};this._openModal('Delete '+(kind==='event'?'event':kind==='recipe'?'recipe':'item')+'?',`<form data-form="delete"><p>Delete <strong>${esc(kind==='event'?value.title:value.item.summary)}</strong>? This removes it from Home Assistant and its connected source, if any. This cannot be undone.</p>${this._formFooter('Delete')}</form>`);}
 _settings(){this._openModal('Make it yours',`<div class="settings-options">${this._native?'':'<label class="settings-row">Dark appearance<input type="checkbox" data-pref="dark" '+(this._prefs.dark?'checked':'')+'></label>'}<label class="settings-row">Meals on calendar<input type="checkbox" data-pref="showMeals" ${this._prefs.showMeals!==false?'checked':''}></label><div class="eyebrow" style="margin-top:12px">Other calendars</div>${this._config.calendars.filter(c=>c.auxiliary).map(c=>`<label class="settings-row">${esc(c.name)}<input type="checkbox" data-calendar="${c.entity}" ${!this._hidden.has(c.entity)?'checked':''}></label>`).join('')}<p class="section-note">Calendar filters and appearance are saved on this display. Your events, lists, recipes, and chores are stored in Home Assistant.</p><a class="btn" href="/config">Home Assistant settings</a></div>`);}
 async _toggleTask(entity,uid,button){
  const item=this._tasks[entity]?.find(i=>i.uid===uid);if(!item)return;button.disabled=true;
  try{
   const payload={item:uid,status:item.status==='completed'?'needs_action':'completed'};
   if(this._config.people.some(p=>p.todo===entity))payload.description=JSON.stringify({hearthglance:{...taskMeta(item),completed_on:payload.status==='completed'?dateKey(new Date()):null}});
   await this._hass.callService('todo','update_item',payload,{entity_id:entity});
  }
  catch(error){this._toast('Could not save: '+(error.message||'Connection unavailable'));button.disabled=false;}
 }
 async _submit(event){
  const form=event.target.closest('form[data-form]');if(!form)return;event.preventDefault();if(this._busy)return;
  const data=new FormData(form),get=name=>String(data.get(name)||'').trim(),kind=form.dataset.form;
  if(kind==='phone-search'){this._mobileQuery=get('query');this._closeModal();this._renderMain();return;}
  const err=form.querySelector('.form-error');err.hidden=true;this._busy=true;for(const b of form.querySelectorAll('button'))b.disabled=true;
  try{
   if(this._hass.connected===false)throw new Error('Home Assistant is offline. Your changes have not been saved.');
   if(kind==='event'){
    const editing=this._editingEvent,meal=this._eventOptions.meal||this._isMeal(editing);
    const entity=editing?.calendar.entity||get('calendar'),allDay=data.has('all_day');
    if(!get('title')||!entity||!get('start_date')||!get('end_date'))throw new Error('Add a title, calendar, and both dates.');
    const start=allDay?localDate(get('start_date')):localDate(get('start_date')+'T'+get('start_time'));
    const end=allDay?addDays(localDate(get('end_date')),1):localDate(get('end_date')+'T'+get('end_time'));
    if(!Number.isFinite(+start)||!Number.isFinite(+end)||end<=start)throw new Error('The event must end after it starts.');
    const payload={summary:get('title'),dtstart:allDay?dateKey(start):start.toISOString(),dtend:allDay?dateKey(end):end.toISOString(),description:meal?JSON.stringify({hearthglance:{...mealMeta(editing||{}),slot:get('slot'),notes:get('notes'),recipe:this._mealRecipeId||null}}):richTextHTML(form.querySelector('.rich-editor').innerHTML),location:get('location')};
    if(get('repeat'))payload.rrule=get('repeat');
    const command={type:editing?'calendar/event/update':'calendar/event/create',entity_id:entity,event:payload};if(editing){if(!this._canEditEvent(editing))throw new Error('Edit this event in its source calendar.');command.uid=editing.uid;if(editing.recurrence_id)command.recurrence_id=editing.recurrence_id;}
    await this._hass.callWS(command);this._loadCalendars();
   }else if(kind==='task'){
    const {entity:oldEntity,item}=this._editingTask,person=get('person');
    const entity=item?oldEntity:person?this._person(person).todo:oldEntity;
    if(!get('title'))throw new Error('Add a name first.');
    const payload=item?{item:item.uid,rename:get('title')}:{item:get('title')};
    if(form.querySelector('[name=repeat]')){payload.description=JSON.stringify({hearthglance:{...taskMeta(item||{}),repeat:get('repeat')}});if(get('due'))payload.due_date=get('due');}
    await this._hass.callService('todo',item?'update_item':'add_item',payload,{entity_id:entity});
   }else if(kind==='recipe'){
    const recipe=await this._saveRecipe(get,data);if(this._mealDraft){this._resumeMeal(recipe);this._toast('Recipe saved. Review the meal, then add it to the plan.');return;}
   }else if(kind==='delete'){
    const {kind:targetKind,value}=this._deleteTarget;
    if(targetKind==='event')await this._hass.callWS({type:'calendar/event/delete',entity_id:value.calendar.entity,uid:value.uid});
    else if(targetKind==='recipe')await this._removeRecipe(value.item);
    else await this._hass.callService('todo','remove_item',{item:value.item.uid},{entity_id:value.entity});
   }
   this._closeModal();this._toast(kind==='delete'?'Deleted.':'Saved to Home Assistant.');
  }catch(error){err.textContent=error.message||'Home Assistant could not save this change. Please try again.';err.hidden=false;}
  finally{this._busy=false;for(const b of form.querySelectorAll('button'))b.disabled=false;}
 }
 _toast(message){const root=this.shadowRoot.querySelector('#toast-root');root.innerHTML=`<div class="toast" role="status">${esc(message)}</div>`;clearTimeout(this._toastTimer);this._toastTimer=setTimeout(()=>{root.innerHTML='';},4500);}
}
Object.assign(HearthglanceCard.prototype,mealRecipeMethods({button}));
Object.assign(HearthglanceCard.prototype,recipeMethods({icon,button}));
Object.assign(HearthglanceCard.prototype,mobileMethods({icon,button,format,time,personStyle,weatherGlyph}));
if(!customElements.get('hearthglance-card'))customElements.define('hearthglance-card',HearthglanceCard);
window.customCards=window.customCards||[];
if(!window.customCards.some(c=>c.type==='hearthglance-card'))window.customCards.push({type:'hearthglance-card',name:'Hearthglance Family Dashboard',description:'A touch-friendly family calendar, chores, lists, recipes, and meal planner powered by Home Assistant.'});
for(const [name,label,page] of nativeCards){
 const tag=`hearthglance-${name}-card`;
 class NativeCard extends HearthglanceCard {
  setConfig(config){super.setConfig({...config,type:'custom:'+tag,page});}
  static getStubConfig(hass){
   const base={...HearthglanceCard.getStubConfig(hass),type:'custom:'+tag};
   const todo=Object.keys(hass?.states||{}).find(id=>id.startsWith('todo.'))||'todo.family';
   if(page==='header')return {type:base.type,weather:Object.keys(hass?.states||{}).find(id=>id.startsWith('weather.'))};
   if(page==='tasks')return {type:base.type,people:[{id:'family',name:'Family',todo}]};
   if(page==='list')return {type:base.type,lists:[{entity:todo,name:'Shopping'}]};
   if(page==='recipes')return {type:base.type,recipes:hass?.states?.['sensor.hearthglance_recipes']?'sensor.hearthglance_recipes':todo};
   if(page==='meals')base.calendars=[{entity:'calendar.meals',kind:'meals'}];
   return base;
  }
  getCardSize(){return page==='header'?2:12;}
 }
 if(!customElements.get(tag))customElements.define(tag,NativeCard);
 if(!window.customCards.some(c=>c.type===tag))window.customCards.push({type:tag,name:`Hearthglance ${label}`,description:'Reusable content card. Home Assistant provides navigation.'});
}
