import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeConfig, enabledPages} from '../src/config.js';
const minimal=()=>({people:[{id:'family',name:'Family'}],calendars:[{entity:'calendar.family'}]});
test('calendar-only config supplies safe defaults and hides unconfigured features',()=>{
 const c=normalizeConfig(minimal());
 assert.deepEqual(enabledPages(c),['home','calendar','settings']);
 assert.equal(c.people[0].initial,'F');assert.match(c.people[0].color,/^#[a-f0-9]{6}$/);
 assert.equal(c.default_calendar,'calendar.family');assert.equal(c.calendars[0].person,'family');
 assert.deepEqual(c.lists,[]);assert.equal(c.recipes,undefined);
});
test('features can be enabled independently without assuming any particular person ID',()=>{
 const input={people:[{id:'parent-1',name:'Pat',todo:'todo.chores'}],calendars:[{entity:'calendar.dinner',kind:'meals'}],recipes:'todo.recipes',lists:[{entity:'todo.groceries',name:'Shopping'}]};
 const c=normalizeConfig(input);
 assert.deepEqual(enabledPages(c),['home','calendar','tasks','list','meals','recipes','settings']);
 assert.equal(c.default_calendar,undefined);
});
test('invalid entities, duplicate owners, references, and CSS injection fail with useful errors',()=>{
 for(const mutate of [
  c=>{c.people[0].id='all';},c=>{c.people.push({...c.people[0]});},
  c=>{c.calendars[0].person='missing';},c=>{c.people[0].color='red; background:url(https://example.org)';},
  c=>{c.calendars[0].entity='todo.wrong_domain';},c=>{c.people[0].todo='todo.chores';c.recipes='todo.chores';},
  c=>{c.default_calendar='calendar.missing';},c=>{c.lists='todo.bad';},c=>{c.calendars=[];},
 ]){const c=minimal();mutate(c);assert.throws(()=>normalizeConfig(c),/Hearthglance:/);}
});
test('preferences are scoped deterministically and can be split for identical calendars',()=>{
 const a=normalizeConfig(minimal()),b=normalizeConfig({...minimal(),storage_key:'kitchen'});
 assert.equal(a.storage_key,'calendar.family');assert.equal(b.storage_key,'kitchen');
});
