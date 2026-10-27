import {escapeHTML as esc} from './model.js';
import {filterRecipes} from './recipes.js';

export function mealRecipeMethods({button}) {return {
 _mealTitleField(title){
  return `<div class="field full meal-title-field"><label for="meal-title">What’s on the menu?</label><input id="meal-title" name="title" value="${esc(title)}" required maxlength="200" autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="meal-recipe-suggestions" aria-describedby="meal-recipe-status"><div id="meal-recipe-suggestions" role="listbox" aria-label="Matching recipes" hidden></div><div id="meal-recipe-status" class="section-note" aria-live="polite"></div></div>`;
 },
 _renderMealRecipes(){
  const input=this.shadowRoot.querySelector('#meal-title');if(!input)return;
  const list=this.shadowRoot.querySelector('#meal-recipe-suggestions'),status=this.shadowRoot.querySelector('#meal-recipe-status');
  const query=input.value.trim(),linked=this._mealRecipeId;
  const matches=query&&!linked?filterRecipes(this._recipeItems(),query).slice(0,8):[];
  this._mealMatches=matches;this._mealMatchIndex=-1;input.removeAttribute('aria-activedescendant');
  list.innerHTML=matches.map((r,i)=>button(esc(r.summary),'select-meal-recipe','meal-recipe-option',`role="option" id="meal-recipe-${i}" aria-selected="false" data-uid="${esc(r.uid)}"`)).join('');
  list.hidden=!matches.length;input.setAttribute('aria-expanded',String(matches.length>0));
  const unavailable=this._errors.has('recipes')||this._errors.has(this._config.recipes);
  status.innerHTML=linked?`Linked to recipe. ${button('Use as free text','unlink-meal-recipe','text-link')}`
   :unavailable?'Recipe library unavailable. You can still save this meal name.'
   :this._config.recipes&&!this._recipeReady?'Loading recipes. You can still save this meal name.'
   :query&&this._config.recipes&&!matches.length?`No matching recipes. ${button('Create Recipe for “'+esc(query)+'”','create-meal-recipe','text-link')}<span class="meal-free-text">Or add this meal as free text.</span>`
   :'Choose a recipe to link it, or use any meal name as free text.';
 },
 _mealTitleInput(event){
  if(event.target.id!=='meal-title')return;
  this._mealRecipeId=null;this._renderMealRecipes();
 },
 _mealRecipeKey(event){
  if(event.target.id!=='meal-title'||!this._mealMatches?.length)return;
  if(['ArrowDown','ArrowUp'].includes(event.key)){
   event.preventDefault();const count=this._mealMatches.length;
   this._mealMatchIndex=this._mealMatchIndex<0?(event.key==='ArrowDown'?0:count-1):(this._mealMatchIndex+(event.key==='ArrowDown'?1:count-1))%count;
   const input=event.target;input.setAttribute('aria-activedescendant','meal-recipe-'+this._mealMatchIndex);
   for(const [i,option] of [...this.shadowRoot.querySelectorAll('.meal-recipe-option')].entries())option.setAttribute('aria-selected',String(i===this._mealMatchIndex));
  }else if(event.key==='Enter'&&this._mealMatchIndex>=0){event.preventDefault();this._selectMealRecipe(this._mealMatches[this._mealMatchIndex].uid);}
  else if(event.key==='Escape'){event.preventDefault();event.stopPropagation();this.shadowRoot.querySelector('#meal-recipe-suggestions').hidden=true;event.target.setAttribute('aria-expanded','false');this._mealMatches=[];}
 },
 _selectMealRecipe(uid){
  const recipe=this._recipeItems().find(r=>r.uid===uid);if(!recipe)return;
  this._mealRecipeId=recipe.uid;const input=this.shadowRoot.querySelector('#meal-title');input.value=recipe.summary;this._renderMealRecipes();input.focus();
 },
 _createMealRecipe(){
  const form=this.shadowRoot.querySelector('form[data-form=event]'),title=form?.querySelector('[name=title]').value.trim();if(!title)return;
  this._mealDraft={event:this._editingEvent,options:this._eventOptions,recipeId:this._mealRecipeId,values:Object.fromEntries(new FormData(form))};
  this._recipeForm(null,{title});
 },
 _resumeMeal(recipe){
  const draft=this._mealDraft;if(!draft)return;this._mealDraft=null;
  this._eventForm(draft.event,draft.options);
  const form=this.shadowRoot.querySelector('form[data-form=event]');
  for(const [name,value] of Object.entries(draft.values)){const input=form.elements.namedItem(name);if(input&&input.type!=='checkbox')input.value=value;}
  const allDay=form.elements.namedItem('all_day');allDay.checked=Object.hasOwn(draft.values,'all_day');this._change({target:allDay});
  this._mealRecipeId=recipe?.uid||draft.recipeId||null;
  if(recipe)form.elements.namedItem('title').value=recipe.summary;
  this._renderMealRecipes();
 },
};}

export const mealRecipeStyles=`
.meal-title-field{gap:8px}.meal-title-field input{font:inherit;font-size:16px;min-height:48px;padding:12px;border:1px solid var(--line);border-radius:10px;background:var(--surface);color:var(--ink)}#meal-recipe-suggestions{border:1px solid var(--line);border-radius:10px;overflow:auto;max-height:240px;background:var(--surface)}.meal-recipe-option{display:block;width:100%;text-align:left;padding:12px;font-size:15px;min-height:44px}.meal-recipe-option:hover,.meal-recipe-option:focus,.meal-recipe-option[aria-selected=true]{background:var(--soft);color:var(--accent)}.meal-free-text{display:block}#meal-recipe-status .text-link{font-size:13px;text-align:left;white-space:normal}
`;
