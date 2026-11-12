export const nativeCards = [
  ['home', 'Home', 'home'], ['calendar', 'Calendar', 'calendar'],
  ['chores', 'Chores', 'tasks'], ['lists', 'Lists', 'list'],
  ['meals', 'Dinners', 'meals'], ['recipes', 'Recipes', 'recipes'],
  ['header', 'Weather & solar header', 'header'],
];

export function pageSubscriptions(config) {
  const page = config.page;
  const chores = !page || ['home', 'tasks'].includes(page);
  const lists = !page || ['home', 'list'].includes(page);
  return {
    todos: [...new Set([
      ...(chores ? config.people.map(p => p.todo) : []),
      ...(lists ? config.lists.slice(0, page === 'home' ? 1 : undefined).map(l => l.entity) : []),
      ...((!page || ['home', 'calendar', 'meals', 'recipes'].includes(page)) && config.recipes?.startsWith('todo.') ? [config.recipes] : []),
    ].filter(Boolean))],
    calendars: !page || ['home', 'calendar'].includes(page) ? config.calendars
      : page === 'meals' ? config.calendars.filter(c => c.kind === 'meals') : [],
    recipes: !page || ['home', 'calendar', 'meals', 'recipes'].includes(page),
    weather: !page || ['header', 'home', 'calendar', 'meals'].includes(page),
  };
}

// Use HA's normal location notification; page selection remains in the HA router.
export function navigateView(path, options = {}) {
  const url = new URL(path, window.location.origin);
  if (options.date) url.searchParams.set('hg_date', options.date);
  if (options.view) url.searchParams.set('hg_view', options.view);
  window.history.pushState({from: window.location.pathname + window.location.search}, '', url.pathname + url.search + url.hash);
  window.dispatchEvent(new CustomEvent('location-changed', {detail: {replace: false}}));
}

export function calendarLocation(search) {
  const query = new URLSearchParams(search);
  const date = query.get('hg_date'), view = query.get('hg_view');
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(date || '') ? new Date(date + 'T00:00:00') : null;
  return {
    date: parsed && Number.isFinite(+parsed) && parsed.getFullYear() === Number(date.slice(0, 4))
      && parsed.getMonth() + 1 === Number(date.slice(5, 7)) && parsed.getDate() === Number(date.slice(8, 10)) ? parsed : undefined,
    view: ['day', 'week', 'month', 'schedule'].includes(view) ? view : undefined,
  };
}

export const nativeStyles = `
:host([data-native]){container-type:inline-size;container-name:hearthglance;min-width:0}
.app.native{position:relative;inset:auto;z-index:auto;display:block;overflow:visible;background:transparent;min-width:0}
.native .body{height:auto;min-width:0}.native .main{height:auto;overflow:visible;padding:12px 4px 24px;min-width:0}
.native .filters-row{flex-wrap:wrap;align-items:center;gap:12px}.native .calendar{min-height:520px}
.native .page-actions{margin-left:auto;flex-shrink:0;gap:10px}.native .page-actions .btn{white-space:nowrap;min-height:48px}
.native .page-actions .icon-btn{width:48px;height:48px}.native .recipe-tools input[type=search],.native .recipe-tools select{min-height:48px}
.native .recipe-tools{gap:12px}.native .cal-toolbar{flex-wrap:wrap;gap:12px}.native .cal-title{margin-right:auto}
.native .cal-toolbar .page-actions{margin-left:0}.native .list-items .panel-head{flex-wrap:wrap;margin-bottom:12px}
.native .list-items .panel-head .count{margin-left:auto}.native .list-items .page-actions{margin-left:0}
.native .native-list-tools{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:12px 16px}
.native .native-list-tools strong{font-size:17px;overflow-wrap:anywhere;flex:1;min-width:0}
.native.phone .phone-home-preview{margin-top:12px}.native.phone .phone-preview-head{flex-wrap:wrap;gap:12px}
.native.phone .phone-calendar-tools{flex-wrap:wrap;overflow:visible;background:transparent;gap:8px}
.native.phone .phone-task-toolbar{flex-wrap:wrap;gap:12px}.native.phone .phone-period{flex-wrap:wrap;padding-top:8px;padding-bottom:8px}
.native.phone .phone-period .page-actions{flex-basis:100%;justify-content:flex-end}
.native.phone .recipe-tools .page-actions{flex-basis:100%;justify-content:flex-end}
.native.phone .phone-scroll{overflow:visible;flex:initial;padding-bottom:20px}.native.phone .phone-home-preview .page-actions{flex-wrap:wrap}
.native .home-grid{min-height:560px}.native .calendar-area{min-height:520px}.native .day-events{overflow:visible}
.native .month-grid,.native .main[data-page=calendar] .month-grid{grid-template-rows:repeat(6,minmax(90px,auto))}
.native .recipe-library{overflow:visible}.native .aside{overflow:visible}.native .recipes-panel{max-height:800px}
.native .topbar{position:relative;height:auto;min-height:92px;padding:18px 24px;border:1px solid var(--line);border-radius:18px;background:var(--surface);flex-wrap:wrap}
.native .weather{min-width:0;overflow:auto;flex:1;gap:clamp(16px,3cqw,44px)}.native .forecast{display:flex;flex:1;justify-content:space-between;gap:clamp(16px,2cqw,32px)}.native .forecast-day{display:block!important}
.native .connection{flex:0 0 auto}.native .connection-label{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap}.native .clock-date{white-space:normal}
.native.phone{background:transparent}.native.phone .body{height:auto}.native.phone .main{height:auto;overflow:visible;padding:0;background:transparent}
.native.phone .phone-timeline-scroll{max-height:65vh;min-height:320px}.native.phone .phone-month{min-height:520px}
.native.phone .phone-home-preview{padding-top:4px}.native.phone .phone-list-grid{padding-top:8px}
.native.phone .topbar{display:flex;flex-direction:column;align-items:stretch;padding:16px;gap:16px}
.native.phone .clock{justify-content:space-between;padding-right:14px}.native.phone .clock-time{font-size:30px}
.native.phone .weather{margin:0;display:block;flex:initial}.native.phone .weather-now{margin-bottom:16px}
.native.phone .forecast{justify-content:flex-start;gap:22px;overflow:auto;padding-bottom:4px}.native.phone .connection{display:flex;position:absolute;top:20px;right:18px}
@container hearthglance (max-width:1100px){
 .native .home-grid{display:flex;flex-direction:column}.native .aside{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}
 .native .aside .panel:first-child{display:block}.native .meal-layout{grid-template-columns:minmax(0,1fr)}.native .recipes-panel{display:none}
 .native .topbar{gap:18px}.native .weather-now{border:0;padding-left:0}.native .person-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
}
@container hearthglance (max-width:600px){
 .native .person-grid{grid-template-columns:1fr}.native .aside{display:flex}.native .clock-date{font-size:12px}
 .native .recipe-times{grid-template-columns:repeat(2,minmax(0,1fr))}
}
`;
