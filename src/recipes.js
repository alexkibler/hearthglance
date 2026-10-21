import {escapeHTML as esc} from './model.js';

export function recipeData(item) {
 if(item?._recipe)return item._recipe;
 let data={};try{data=JSON.parse(item?.description||'{}')||{};}catch{}
 return {...data,title:item?.summary||'',link:data.link||data.source||'',categories:Array.isArray(data.categories)?data.categories:[]};
}
export function filterRecipes(items,query='',category='',favorites=false){
 const words=query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
 return items.filter(item=>{const r=recipeData(item),text=[r.title,r.text,r.ingredients,...(r.categories||[])].join(' ').toLocaleLowerCase();return (!category||r.categories?.includes(category))&&(!favorites||r.favorite)&&words.every(w=>text.includes(w));});
}
export const recipePhoto=url=>typeof url==='string'&&/^\/api\/hearthglance_recipes\/image\/[a-f0-9]{64}\/(?:photo|thumb)\?/.test(url)?url:'';
const fieldNames=['title','text','ingredients','instructions','yield','prepTime','cookTime','totalTime','notes','nutrition','link'];

export function recipeMethods({icon,button}){return {
 _nativeRecipes(){return this._config.recipes?.startsWith('sensor.');},
 _recipeItems(){return this._nativeRecipes()?(this._recipes||[]).map(r=>({uid:r.id,summary:r.title,_recipe:r})):(this._tasks[this._config.recipes]||[]);},
 async _startRecipes(session){
  if(!this._nativeRecipes())return;
  try{
   const unsub=await this._hass.connection.subscribeMessage(message=>{
    if(session!==this._sessionGeneration)return;
    this._recipes=message.recipes||[];this._errors.delete('recipes');this._renderMain();
   },{type:'hearthglance_recipes/subscribe',entity_id:this._config.recipes});
   if(this._started&&session===this._sessionGeneration)this._unsubs.push(unsub);else unsub();
  }catch(error){if(session===this._sessionGeneration){this._errors.set('recipes','The recipe library is unavailable. Check the Hearthglance Recipes integration, then Refresh.');this._renderMain();}}
 },
 _recipeCards(items){return items.map(item=>{
  const r=recipeData(item),image=recipePhoto(r.images?.[0]?.thumb);
  return button(`${image?`<img class="recipe-cover" src="${esc(image)}" loading="lazy" alt="">`:`<span class="recipe-cover recipe-placeholder">${icon('book')}</span>`}<span class="recipe-card-copy"><strong>${esc(r.title)}</strong><small>${esc([r.totalTime,...(r.categories||[]).slice(0,2)].filter(Boolean).join(' · '))||'View recipe'}</small>${r.favorite?'<span class="recipe-favorite" aria-label="Favorite">★</span>':''}</span>`,'recipe','recipe-card',`data-uid="${esc(item.uid)}"`);
 }).join('')||'<div class="empty">No recipes match these filters.</div>';},
 _recipesPage(){
  const items=this._recipeItems(),categories=[...new Set(items.flatMap(r=>recipeData(r).categories||[]))].sort((a,b)=>a.localeCompare(b));
  const matches=filterRecipes(items,this._recipeQuery,this._recipeCategory,this._recipeFavorites);
  return `<section class="recipe-library"><div class="recipe-tools"><label class="recipe-search">Search recipes<input type="search" data-recipe-query value="${esc(this._recipeQuery||'')}" placeholder="Name, ingredient, or category"></label><label>Category<select data-recipe-category><option value="">All categories</option>${categories.map(c=>`<option value="${esc(c)}" ${c===this._recipeCategory?'selected':''}>${esc(c)}</option>`).join('')}</select></label><label class="recipe-favorites-filter"><input type="checkbox" data-recipe-favorites ${this._recipeFavorites?'checked':''}> Favorites</label></div><p class="section-note recipe-result-count">${matches.length} of ${items.length} recipes</p><div class="recipe-results">${this._recipeCards(matches)}</div></section>`;
 },
 _renderRecipeResults(){
  const grid=this.shadowRoot.querySelector('.recipe-results');if(!grid)return;
  const items=this._recipeItems(),matches=filterRecipes(items,this._recipeQuery,this._recipeCategory,this._recipeFavorites);
  grid.innerHTML=this._recipeCards(matches);this.shadowRoot.querySelector('.recipe-result-count').textContent=`${matches.length} of ${items.length} recipes`;
 },
 _recipeInput(event){if(event.target.hasAttribute('data-recipe-query')){this._recipeQuery=event.target.value;this._renderRecipeResults();}},
 _recipeForm(recipe){
  this._editingRecipe=recipe;const r=recipeData(recipe);
  const text=(label,name,rows=4)=>`<label class="field full">${esc(label)}<textarea name="${name}" rows="${rows}">${esc(r[name]||'')}</textarea></label>`;
  this._openModal(recipe?'Edit recipe':'Save a family favorite',`<form data-form="recipe"><div class="form-grid">${this._field('Recipe name','title',r.title||'','text','full')}${text('Description','text',2)}${this._field('Servings / yield','yield',r.yield||'')}${this._field('Prep time','prepTime',r.prepTime||'')}${this._field('Cook time','cookTime',r.cookTime||'')}${this._field('Total time','totalTime',r.totalTime||'')}${this._field('Categories (comma separated)','categories',(r.categories||[]).join(', '),'text','full')}${text('Ingredients','ingredients')}${text('Instructions','instructions',6)}${text('Notes','notes',3)}${text('Nutrition','nutrition',3)}${this._field('Source URL (optional)','link',r.link||'','url','full')}<label class="checkbox-field"><input type="checkbox" name="favorite" ${r.favorite?'checked':''}> Favorite</label><label class="checkbox-field"><input type="checkbox" name="wantToCook" ${r.wantToCook?'checked':''}> Want to cook</label></div>${this._formFooter(recipe?'Save changes':'Save recipe')}</form>`,true);
 },
 _showRecipe(recipe){
  if(!recipe)return;this._selectedRecipe=recipe;const r=recipeData(recipe),safeURL=/^https?:\/\//i.test(r.link||'')?r.link:'';
  const sections=[['Ingredients','ingredients'],['Instructions','instructions'],['Notes','notes'],['Nutrition','nutrition']];
  const times=[['Servings',r.yield],['Prep',r.prepTime],['Cook',r.cookTime],['Total',r.totalTime]].filter(([,v])=>v);
  this._openModal(r.title,`<div class="recipe-tags">${r.favorite?'<span class="recipe-tag">★ Favorite</span>':''}${r.wantToCook?'<span class="recipe-tag">Want to cook</span>':''}${(r.categories||[]).map(c=>`<span class="recipe-tag">${esc(c)}</span>`).join('')}</div>${(r.images||[]).map(im=>{const src=recipePhoto(im.photo);return src?`<img class="recipe-photo" src="${esc(src)}" loading="lazy" alt="${esc(r.title)}">`:'';}).join('')}${r.text?`<p class="recipe-copy">${esc(r.text)}</p>`:''}${times.length?`<dl class="recipe-times">${times.map(([k,v])=>`<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`:''}${sections.filter(([,k])=>r[k]).map(([title,key])=>`<section class="recipe-section"><h3>${title}</h3><div class="recipe-copy">${esc(r[key])}</div></section>`).join('')}${safeURL?`<p><a href="${esc(safeURL)}" target="_blank" rel="noopener noreferrer">Original recipe ↗</a></p>`:''}<div class="modal-foot">${button('Delete','delete-recipe','btn danger')}${button('Edit','edit-recipe','btn')}${this._pages.includes('meals')?button('Plan this meal','plan-recipe','btn primary'):''}</div>`,true);
 },
 async _saveRecipe(get,data){
  if(!get('title'))throw new Error('Give the recipe a name.');
  const recipe=Object.fromEntries(fieldNames.map(key=>[key,get(key)]));
  Object.assign(recipe,{categories:get('categories').split(',').map(c=>c.trim()).filter(Boolean),favorite:data.has('favorite'),wantToCook:data.has('wantToCook')});
  if(this._nativeRecipes()){
   const existing=this._editingRecipe;
   await this._hass.callWS({type:'hearthglance_recipes/save',entity_id:this._config.recipes,recipe,...(existing?{recipe_id:existing.uid,revision:recipeData(existing).revision}:{})});
  }else{
   const payload={description:JSON.stringify({...recipeData(this._editingRecipe),...recipe,source:recipe.link})};
   if(this._editingRecipe){payload.item=this._editingRecipe.uid;payload.rename=recipe.title;}else payload.item=recipe.title;
   await this._hass.callService('todo',this._editingRecipe?'update_item':'add_item',payload,{entity_id:this._config.recipes});
  }
 },
 async _removeRecipe(recipe){
  if(this._nativeRecipes())await this._hass.callWS({type:'hearthglance_recipes/delete',entity_id:this._config.recipes,recipe_id:recipe.uid,revision:recipeData(recipe).revision});
  else await this._hass.callService('todo','remove_item',{item:recipe.uid},{entity_id:this._config.recipes});
 },
};}

export const recipeStyles=`
.recipe-library{min-height:0;overflow:auto;padding:0 2px 24px}.recipe-tools{display:flex;gap:16px;align-items:end;flex-wrap:wrap;margin-bottom:12px}.recipe-tools label{display:flex;flex-direction:column;gap:7px;font-size:12px;color:var(--muted)}.recipe-tools input[type=search],.recipe-tools select{min-height:44px;border:1px solid var(--line);border-radius:10px;padding:10px 12px;background:var(--surface);color:var(--ink);font:inherit;font-size:15px}.recipe-search{flex:1;min-width:180px}.recipe-tools .recipe-favorites-filter{flex-direction:row;align-items:center;min-height:44px}.recipe-favorites-filter input{width:20px;height:20px;accent-color:var(--accent)}.recipe-results{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:18px;margin-top:16px}.recipe-card{padding:0;overflow:hidden;border:1px solid var(--line);border-radius:16px;background:var(--surface);text-align:left;min-width:0;color:var(--ink)}.recipe-cover{display:block;width:100%;height:150px;object-fit:cover;background:var(--soft)}.recipe-placeholder{display:grid;place-items:center;color:var(--accent)}.recipe-placeholder svg{width:42px;height:42px}.recipe-card-copy{display:block;padding:15px;position:relative}.recipe-card strong{display:block;font-size:16px;line-height:1.4;overflow-wrap:anywhere}.recipe-card small{display:block;font-size:12px;line-height:1.5;color:var(--muted);margin-top:8px}.recipe-favorite{display:inline-block;color:var(--accent);margin-top:8px}.recipe-tags{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:15px}.recipe-tag{background:var(--soft);color:var(--accent);padding:6px 10px;border-radius:16px;font-size:12px}.recipe-photo{width:100%;max-height:420px;object-fit:contain;border-radius:12px;margin-bottom:16px;background:var(--bg)}.recipe-copy{white-space:pre-wrap;overflow-wrap:anywhere;font-size:15px;line-height:1.7}.recipe-section{margin:24px 0}.recipe-section h3{font-size:18px;margin:0 0 12px}.recipe-times{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;padding:16px 0;border-block:1px solid var(--line);margin:18px 0}.recipe-times dt{font-size:11px;color:var(--muted);margin-bottom:5px}.recipe-times dd{margin:0;font-size:14px;overflow-wrap:anywhere}.recipes-panel{overflow:auto}.phone .recipe-library{padding:18px 16px}.phone .recipe-tools{gap:12px}.phone .recipe-search{flex-basis:100%}.phone .recipe-tools>label:nth-child(2){flex:1}.phone .recipe-results{grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.phone .recipe-cover{height:112px}.phone .recipe-card-copy{padding:11px}.phone .recipe-card strong{font-size:14px}.phone .recipe-card small{font-size:11px}@media(max-width:360px){.phone .recipe-results{grid-template-columns:1fr}.phone .recipe-cover{height:155px}}
`;
