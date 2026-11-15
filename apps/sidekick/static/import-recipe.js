const form = document.querySelector('form');
const input = document.querySelector('#recipe-url');
const button = form.querySelector('button');
const login = document.querySelector('#import-login');
const status = document.querySelector('#import-message');
input.value = new URLSearchParams(location.search).get('url') || '';

login.addEventListener('click', () => {
  const params = new URLSearchParams({next:'import-recipe', url:input.value.trim()});
  login.href = './auth/login?' + params;
});

async function request(path, options) {
  const response = await fetch('./' + path, options);
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
  status.textContent = login.hidden ? error.message : 'Sign in to save this recipe to your library.';
}

let csrf;
request('api/session').then(session => {
  if (!session.config.recipes || !session.config.recipes.startsWith('sensor.')) {
    throw new Error('The Hearthglance recipe library is unavailable.');
  }
  csrf = session.csrf;
  button.disabled = false;
}).catch(report);

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (button.disabled || !csrf) return;
  button.disabled = true;
  input.readOnly = true;
  status.textContent = 'Reading the recipe…';
  try {
    const result = await request('api/recipes/import', {
      method:'POST',
      headers:{'Content-Type':'application/json','X-HG-CSRF':csrf},
      body:JSON.stringify({url:input.value.trim()}),
    });
    status.textContent = result.created ? 'Saved ' + result.title + '.' : result.title + ' is already in your library.';
  } catch (error) {
    report(error);
  } finally {
    input.readOnly = false;
    button.disabled = !login.hidden;
  }
});
