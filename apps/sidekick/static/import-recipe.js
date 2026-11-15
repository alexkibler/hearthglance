const source = document.querySelector('#import-source');
const input = document.querySelector('#recipe-url');
const previewButton = source.querySelector('button');
const draft = document.querySelector('#import-draft');
const fields = draft.querySelector('fieldset');
const login = document.querySelector('#import-login');
const status = document.querySelector('#import-message');
const another = document.querySelector('#import-another');
const draftKey = 'hearthglance-recipe-sign-in-draft';

input.value = new URLSearchParams(location.search).get('url') || '';

function readDraft() {
  const recipe = Object.fromEntries(new FormData(draft));
  recipe.categories = recipe.categories.split(',').map(value => value.trim()).filter(Boolean);
  return recipe;
}

login.addEventListener('click', event => {
  try {
    sessionStorage.setItem(draftKey, JSON.stringify({url:input.value, recipe:readDraft()}));
  } catch {
    event.preventDefault();
    status.textContent = 'Open Hearthglance in another tab and sign in there, then return here to save your edits.';
    status.focus();
    return;
  }
  login.href = './auth/login?' + new URLSearchParams({next:'import-recipe', url:input.value});
});

async function request(path, body, csrf) {
  const response = await fetch('./' + path, body && {
    method:'POST',
    headers:{'Content-Type':'application/json', ...(csrf ? {'X-HG-CSRF':csrf} : {})},
    body:JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error || 'Hearthglance is unavailable.');
    error.status = response.status;
    throw error;
  }
  return data;
}

function report(error, saving = false) {
  login.hidden = !saving || error.status !== 401;
  status.textContent = login.hidden ? error.message : 'Sign in to save this recipe. Your edits will be here when you return.';
  (login.hidden ? status : login).focus();
}

function showDraft(recipe) {
  for (const field of fields.querySelectorAll('[name]')) {
    field.value = field.name === 'categories' ? recipe.categories.join(', ') : (recipe[field.name] || '');
  }
  source.hidden = true;
  draft.hidden = false;
  draft.querySelector('h2').focus();
}

async function preview() {
  if (previewButton.disabled || !input.reportValidity()) return;
  previewButton.disabled = input.readOnly = true;
  status.textContent = 'Reading the recipe…';
  try {
    const {recipe} = await request('api/recipes/import', {url:input.value.trim(), preview:true});
    input.value = recipe.link;
    showDraft(recipe);
    status.textContent = '';
  } catch (error) {
    report(error);
  } finally {
    input.readOnly = previewButton.disabled = false;
  }
}

source.addEventListener('submit', event => {
  event.preventDefault();
  preview();
});

draft.addEventListener('submit', async event => {
  event.preventDefault();
  if (fields.disabled || draft.hidden) return;
  const recipe = readDraft();
  for (const name of Object.keys(recipe)) {
    if (typeof recipe[name] === 'string') recipe[name] = recipe[name].trim();
  }
  if (!(recipe.title && recipe.ingredients && recipe.instructions)) {
    report(new Error('Enter a recipe name, ingredients, and directions.'));
    return;
  }
  fields.disabled = true;
  login.hidden = true;
  status.textContent = 'Saving the recipe…';
  try {
    const session = await request('api/session');
    if (!session.config.recipes?.startsWith('sensor.')) throw new Error('The Hearthglance recipe library is unavailable.');
    await request('api/command', {
      type:'hearthglance_recipes/save',
      entity_id:session.config.recipes,
      dedupe_source:true,
      recipe,
    }, session.csrf);
    draft.hidden = true;
    another.hidden = false;
    status.textContent = 'Saved ' + recipe.title + '.';
    status.focus();
  } catch (error) {
    report(error, true);
  } finally {
    fields.disabled = false;
  }
});

function showSource() {
  draft.hidden = another.hidden = login.hidden = true;
  source.hidden = false;
  status.textContent = '';
  input.focus();
}
document.querySelector('#change-recipe-url').addEventListener('click', showSource);
another.addEventListener('click', () => {
  input.value = '';
  showSource();
});

function takeDraft() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(draftKey));
    sessionStorage.removeItem(draftKey);
    if (saved?.url === input.value) return saved.recipe;
  } catch {
    // A blocked or expired browser store does not prevent fetching a fresh preview.
  }
}

const saved = takeDraft();
previewButton.disabled = false;
if (saved) {
  showDraft(saved);
  status.textContent = 'Your draft is ready. Tap Save recipe when you’re done editing.';
} else if (input.value) {
  preview();
}
