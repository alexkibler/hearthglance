import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {runInNewContext} from 'node:vm';
import {parseHTML} from 'linkedom';

const read = file => readFileSync(new URL('../static/' + file, import.meta.url), 'utf-8');
const url = 'https://example.org/soup';

test('a shared URL previews automatically and saves only after the edited form is submitted', async () => {
  const {document, Event} = parseHTML(read('import-recipe.html'));
  const source = document.querySelector('#import-source');
  const draft = document.querySelector('#import-draft');
  const fields = draft.querySelector('fieldset');
  const status = document.querySelector('#import-message');
  document.querySelector('#recipe-url').reportValidity = () => true;
  const calls = [];
  const session = {config:{recipes:'sensor.fixture_recipes'}, csrf:'test'};
  const recipe = {title:'Broccoli Cheddar Soup', link:url, categories:['Soup'],
    ingredients:'Broccoli\nCheddar', instructions:'Simmer.'};
  let duplicate = true;
  runInNewContext(read('import-recipe.js'), {
    document, URLSearchParams, location:{search:'?url='+encodeURIComponent(url)},
    fetch: async (path, options) => {
      calls.push({path, body:options && JSON.parse(options.body)});
      if (path === './api/session') return {ok:true, json:async () => session};
      assert.equal(options.headers['X-HG-CSRF'], 'test');
      if (path === './api/recipes/import') return {ok:true, json:async () => ({recipe})};
      return duplicate
        ? {ok:false, status:409, json:async () => ({error:'Recipe already exists.'})}
        : {ok:true, json:async () => ({created:true})};
    },
    // Linkedom doesn't implement form serialization.
    FormData: function(form) {
      return Array.from(form.querySelectorAll('[name]'), field => [field.name, field.value || '']);
    },
  });
  const settle = () => new Promise(resolve => setImmediate(resolve));
  await settle();
  assert.deepEqual(calls.map(call => call.path), ['./api/session','./api/recipes/import']);
  assert.deepEqual(calls[1].body, {url, preview:true});
  assert.equal(source.hidden, true);
  assert.equal(draft.hidden, false);
  assert.equal(draft.querySelector('[name=title]').value, recipe.title);
  assert.equal(draft.querySelector('[name=instructions]').value, recipe.instructions);

  draft.querySelector('[name=title]').value = 'Our broccoli soup';
  draft.querySelector('[name=ingredients]').value += '\nBlack pepper';
  draft.querySelector('[name=categories]').value = 'Soup, Dinner';
  draft.dispatchEvent(new Event('submit', {cancelable:true}));
  await settle();
  assert.equal(calls[2].path, './api/command');
  assert.equal(calls[2].body.dedupe_source, true);
  assert.equal(calls[2].body.recipe.title, 'Our broccoli soup');
  assert.equal(calls[2].body.recipe.ingredients, 'Broccoli\nCheddar\nBlack pepper');
  assert.deepEqual(calls[2].body.recipe.categories, ['Soup','Dinner']);
  assert.equal(fields.disabled, false);
  assert.equal(draft.hidden, false);
  assert.equal(draft.querySelector('[name=title]').value, 'Our broccoli soup');

  duplicate = false;
  draft.dispatchEvent(new Event('submit', {cancelable:true}));
  await settle();
  assert.equal(calls.filter(call => call.path === './api/recipes/import').length, 1);
  assert.equal(draft.hidden, true);
  assert.equal(status.textContent, 'Saved Our broccoli soup.');
});
