import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {runInNewContext} from 'node:vm';
import {parseHTML} from 'linkedom';

const read = file => readFileSync(new URL('../static/' + file, import.meta.url), 'utf-8');
const url = 'https://example.org/soup';
const recipe = {title:'Broccoli Cheddar Soup', link:url, categories:['Soup'],
  ingredients:'Broccoli\nCheddar', instructions:'Simmer.'};
const settle = () => new Promise(resolve => setImmediate(resolve));

test('a signed-out user can preview and keep edits through sign-in before saving', async () => {
  const calls = [];
  const storage = new Map();
  let signedIn = false;
  let duplicate = true;
  const session = {config:{recipes:'sensor.fixture_recipes'}, csrf:'test'};

  function loadPage() {
    const {document, Event} = parseHTML(read('import-recipe.html'));
    document.querySelector('#recipe-url').reportValidity = () => true;
    runInNewContext(read('import-recipe.js'), {
      document, URLSearchParams, location:{search:'?url='+encodeURIComponent(url)},
      sessionStorage:{
        getItem:key => storage.get(key) ?? null,
        setItem:(key,value) => storage.set(key,value),
        removeItem:key => storage.delete(key),
      },
      fetch: async (path, options) => {
        calls.push({path, body:options && JSON.parse(options.body)});
        if (path === './api/recipes/import') {
          assert.equal(options.headers['X-HG-CSRF'], undefined);
          return {ok:true, json:async () => ({recipe})};
        }
        if (path === './api/session') return signedIn ? {ok:true, json:async () => session}
          : {ok:false, status:401, json:async () => ({error:'Sign in first.'})};
        assert.equal(options.headers['X-HG-CSRF'], 'test');
        return duplicate ? {ok:false, status:409, json:async () => ({error:'Recipe already exists.'})}
          : {ok:true, json:async () => ({created:true})};
      },
      // Linkedom doesn't implement form serialization.
      FormData: function(form) {
        return Array.from(form.querySelectorAll('[name]'), field => [field.name, field.value || '']);
      },
    });
    const draft = document.querySelector('#import-draft');
    return {document, draft, login:document.querySelector('#import-login'),
      field:name => draft.querySelector(`[name="${name}"]`),
      submit:() => draft.dispatchEvent(new Event('submit', {cancelable:true})),
      signIn:() => document.querySelector('#import-login').dispatchEvent(new Event('click', {cancelable:true}))};
  }

  const first = loadPage();
  await settle();
  assert.deepEqual(calls, [{path:'./api/recipes/import', body:{url, preview:true}}]);
  assert.equal(first.draft.hidden, false);
  assert.equal(first.field('title').value, recipe.title);
  assert.equal(first.login.hidden, true);

  first.field('title').value = 'Our broccoli soup';
  first.field('ingredients').value += '\nBlack pepper';
  first.field('categories').value = 'Soup, Dinner';
  first.submit();
  await settle();
  assert.equal(first.login.hidden, false);
  assert.equal(first.draft.hidden, false);
  assert.equal(calls.at(-1).path, './api/session');
  assert.equal(calls.some(call => call.path === './api/command'), false);

  first.signIn();
  assert.match(first.login.getAttribute('href'), /^\.\/auth\/login\?next=import-recipe&url=/);
  signedIn = true;
  const returned = loadPage();
  await settle();
  assert.equal(returned.field('title').value, 'Our broccoli soup');
  assert.equal(returned.field('ingredients').value, 'Broccoli\nCheddar\nBlack pepper');
  assert.equal(storage.size, 0);
  assert.equal(calls.length, 2);
  returned.submit();
  await settle();
  assert.deepEqual(calls.at(-1).body.recipe.categories, ['Soup','Dinner']);
  assert.equal(returned.draft.hidden, false);
  assert.equal(returned.field('title').value, 'Our broccoli soup');

  duplicate = false;
  returned.submit();
  await settle();
  assert.equal(calls.at(-1).body.recipe.title, 'Our broccoli soup');
  assert.equal(returned.draft.hidden, true);
  assert.equal(returned.document.querySelector('#import-message').textContent, 'Saved Our broccoli soup.');
});
