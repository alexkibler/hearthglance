const source = document.querySelector('#import-source');
const input = document.querySelector('#recipe-url');
const previewButton = source.querySelector('button');
const draft = document.querySelector('#import-draft');
const fields = draft.querySelector('fieldset');
const login = document.querySelector('#import-login');
const status = document.querySelector('#import-message');
const another = document.querySelector('#import-another');
let session;

input.value = new URLSearchParams(location.search).get('url') || '';

login.addEventListener('click', () => {
  const params = new URLSearchParams({next:'import-recipe', url:input.value.trim()});
  login.href = './auth/login?' + params;
});

async function request(path, body) {
  const response = await fetch('./' + path, body && {
    method:'POST',
    headers:{'Content-Type':'application/json','X-HG-CSRF':session.csrf},
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

function report(error) {
  login.hidden = error.status !== 401;
  status.textContent = login.hidden ? error.message : 'Sign in to import a recipe.';
  (login.hidden ? status : login).focus();
}

async function preview() {
  if (!session || previewButton.disabled || !input.reportValidity()) return;
  previewButton.disabled = input.readOnly = true;
  status.textContent = 'Reading the recipe…';
  try {
    const {recipe} = await request('api/recipes/import', {url:input.value.trim(), preview:true});
    for (const field of fields.querySelectorAll('[name]')) {
      field.value = field.name === 'categories' ? recipe.categories.join(', ') : (recipe[field.name] || '');
    }
    source.hidden = true;
    draft.hidden = false;
    status.textContent = '';
    draft.querySelector('h2').focus();
  } catch (error) {
    report(error);
  } finally {
    input.readOnly = false;
    previewButton.disabled = !login.hidden;
  }
}

source.addEventListener('submit', event => {
  event.preventDefault();
  preview();
});

draft.addEventListener('submit', async event => {
  event.preventDefault();
  if (fields.disabled || draft.hidden || !session) return;
  const recipe = {};
  for (const [name, value] of new FormData(draft)) recipe[name] = value.trim();
  recipe.categories = recipe.categories.split(',').map(value => value.trim()).filter(Boolean);
  if (!(recipe.title && recipe.ingredients && recipe.instructions)) {
    report(new Error('Enter a recipe name, ingredients, and directions.'));
    return;
  }
  fields.disabled = true;
  status.textContent = 'Saving the recipe…';
  try {
    await request('api/command', {
      type:'hearthglance_recipes/save',
      entity_id:session.config.recipes,
      dedupe_source:true,
      recipe,
    });
    draft.hidden = true;
    another.hidden = false;
    status.textContent = 'Saved ' + recipe.title + '.';
    status.focus();
  } catch (error) {
    report(error);
    fields.disabled = !login.hidden;
  }
});

function showSource() {
  draft.hidden = another.hidden = true;
  fields.disabled = false;
  source.hidden = false;
  status.textContent = '';
  input.focus();
}
document.querySelector('#change-recipe-url').addEventListener('click', showSource);
another.addEventListener('click', () => {
  input.value = '';
  showSource();
});

request('api/session').then(current => {
  if (!current.config.recipes || !current.config.recipes.startsWith('sensor.')) {
    throw new Error('The Hearthglance recipe library is unavailable.');
  }
  session = current;
  previewButton.disabled = false;
  if (input.value) return preview();
}).catch(report);
