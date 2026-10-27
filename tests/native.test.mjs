import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeConfig} from '../src/config.js';
import {nativeCards, pageSubscriptions, calendarLocation} from '../src/native.js';

const elements = new Map();
globalThis.HTMLElement = class {
  toggleAttribute() {}
  attachShadow() {
    const main = {innerHTML: '', scrollTop: 0, dataset: {}, querySelector: selector => selector === '.phone-scroll' ? {scrollTop: 0} : null};
    this.shadowRoot = {innerHTML: '', main, addEventListener() {}, removeEventListener() {}, querySelectorAll: () => [],
      querySelector: selector => selector === '.main' && this.shadowRoot.innerHTML.includes('<main') ? main : null};
  }
};
globalThis.window = {location: {origin: 'https://ha.example', pathname: '/family/home', search: ''},
  matchMedia: () => ({matches: false, addEventListener() {}, removeEventListener() {}})};
globalThis.customElements = {get: name => elements.get(name), define: (name, value) => elements.set(name, value)};
globalThis.localStorage = {getItem: () => null};
await import('../src/hearthglance-card.js');

const full = () => ({people: [{id: 'family', name: 'Family', todo: 'todo.chores'}],
  calendars: [{entity: 'calendar.family'}, {entity: 'calendar.meals', kind: 'meals'}],
  lists: [{entity: 'todo.shopping'}], recipes: 'sensor.recipes', weather: 'weather.home',
  routes: {calendar: '/family/calendar', tasks: '/family/chores', list: '/family/lists', meals: '/family/meals'}});

test('each native card stays on its configured page and renders without the app navigation', () => {
  for (const [name, , page] of nativeCards) {
    const card = new (elements.get(`hearthglance-${name}-card`))();
    card.setConfig(full());
    assert.equal(card._page, page);
    assert.match(card.shadowRoot.innerHTML, /app native/);
    assert.doesNotMatch(card.shadowRoot.innerHTML, /<nav|Dashboard navigation/);
    if (page !== 'header') {
      card._mobile = true; card._renderShell();
      assert.doesNotMatch(card.shadowRoot.main.innerHTML, /phone-feature-grid|Back to Home Assistant|aria-label="Back"/);
    }
  }
});

test('cross-page actions delegate to HA and retain the card page, including selected dates', async () => {
  const calls = [];
  window.history = {pushState: (...args) => calls.push(args)};
  window.dispatchEvent = event => calls.push(event);
  const card = new (elements.get('hearthglance-home-card'))();
  card.setConfig(full());
  const click = dataset => card._click({target: {closest: () => ({dataset})}});
  await click({action: 'go-tasks'});
  assert.equal(card._page, 'home'); assert.equal(calls[0][2], '/family/chores');
  assert.equal(calls[1].type, 'location-changed');
  await click({action: 'day', date: '2026-11-01'});
  assert.equal(card._page, 'home');
  assert.equal(calls[2][2], '/family/calendar?hg_date=2026-11-01&hg_view=day');
  const meals = new (elements.get('hearthglance-meals-card'))(); meals.setConfig(full());
  meals._loadCalendars = () => {};
  await meals._click({target: {closest: () => ({dataset: {action: 'day', date: '2026-11-02'}})}});
  assert.equal(meals._page, 'meals');
});

test('standalone cards accept only their own data and do not subscribe to unrelated entities', () => {
  const header = normalizeConfig({page: 'header', weather: 'weather.home'});
  assert.deepEqual(pageSubscriptions(header), {todos: [], calendars: [], recipes: false, weather: true});
  const recipes = normalizeConfig({page: 'recipes', recipes: 'sensor.recipes'});
  assert.deepEqual(pageSubscriptions(recipes), {todos: [], calendars: [], recipes: true, weather: false});
  const lists = normalizeConfig({page: 'list', lists: [{entity: 'todo.shopping'}]});
  assert.deepEqual(pageSubscriptions(lists), {todos: ['todo.shopping'], calendars: [], recipes: false, weather: false});
  const calendar = normalizeConfig({...full(), page: 'calendar'});
  assert.equal(pageSubscriptions(calendar).todos.length, 0);
  assert.equal(pageSubscriptions(calendar).recipes, true);
  assert.throws(() => normalizeConfig({page: 'tasks'}), /to-do/);
  assert.throws(() => normalizeConfig({page: 'recipes'}), /recipe entity/);
});

test('HA view paths and calendar deep links reject malformed input while legacy preferences keep their key', () => {
  for (const path of ['https://evil.example', '//evil.example', '/\\evil.example', '/bad\npath']) {
    assert.throws(() => normalizeConfig({...full(), page: 'home', routes: {calendar: path}}), /local HA paths/);
  }
  assert.deepEqual(calendarLocation('?hg_date=2026-02-31&hg_view=unknown'), {date: undefined, view: undefined});
  assert.equal(calendarLocation('?hg_date=2026-11-01&hg_view=day').date.getDate(), 1);
  assert.equal(normalizeConfig(full()).storage_key, 'calendar.family:calendar.meals');
});
