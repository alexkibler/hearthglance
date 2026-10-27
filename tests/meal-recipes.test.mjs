import test from 'node:test';
import assert from 'node:assert/strict';
import {mealRecipeMethods} from '../src/meal-recipes.js';

const methods=mealRecipeMethods({button:(label,action)=>`<button data-action="${action}">${label}</button>`});
const recipe={uid:'recipe-42',summary:'Taco dip'};
function picker(query='taco'){
 const input={id:'meal-title',value:query,setAttribute(){},removeAttribute(){},focus(){}};
 const list={},status={};
 const ctx={...methods,_config:{recipes:'sensor.recipes'},_recipeReady:true,_errors:new Map(),_recipeItems:()=>[recipe],
  shadowRoot:{querySelector:s=>({'#meal-title':input,'#meal-recipe-suggestions':list,'#meal-recipe-status':status}[s])}};
 return {ctx,input,list,status};
}
test('meal suggestions do not link a recipe until explicitly selected; changing the title clears its ID',()=>{
 const {ctx,input,list,status}=picker();ctx._renderMealRecipes();
 assert.match(list.innerHTML,/Taco dip/);assert.equal(ctx._mealRecipeId,undefined);
 ctx._selectMealRecipe('recipe-42');assert.equal(ctx._mealRecipeId,'recipe-42');assert.equal(input.value,'Taco dip');assert.match(status.innerHTML,/Linked to recipe/);
 input.value='Takeout';ctx._mealTitleInput({target:input});assert.equal(ctx._mealRecipeId,null);assert.match(status.innerHTML,/Create Recipe for/);
});
test('an unmatched title remains free text, with escaped opt-in recipe creation and no writes',()=>{
 const {ctx,status}=picker('<script>alert(1)</script>');ctx._renderMealRecipes();
 assert.match(status.innerHTML,/&lt;script&gt;/);assert.doesNotMatch(status.innerHTML,/<script>/);
 assert.match(status.innerHTML,/Or add this meal as free text/);assert.equal(ctx._mealRecipeId,undefined);
 ctx._recipeReady=false;ctx._renderMealRecipes();assert.match(status.innerHTML,/Loading recipes/);assert.doesNotMatch(status.innerHTML,/data-action/);
 ctx._errors.set('recipes','Offline');ctx._renderMealRecipes();assert.match(status.innerHTML,/unavailable/);assert.doesNotMatch(status.innerHTML,/data-action/);
});
test('cancelling recipe creation restores the meal draft and saving explicitly links the created ID',()=>{
 const fields={title:{value:''},slot:{value:''},notes:{value:''},all_day:{type:'checkbox',checked:false}};
 const form={elements:{namedItem:n=>fields[n]}};
 const ctx={...methods,_mealDraft:{event:null,options:{meal:true},recipeId:null,values:{title:'Takeout',slot:'Lunch',notes:'At home',all_day:'on'}},
  _eventForm(){},_change(){},_renderMealRecipes(){},shadowRoot:{querySelector:()=>form}};
 ctx._resumeMeal();assert.equal(fields.title.value,'Takeout');assert.equal(fields.slot.value,'Lunch');assert.equal(fields.notes.value,'At home');assert.equal(fields.all_day.checked,true);assert.equal(ctx._mealRecipeId,null);
 ctx._mealDraft={event:null,options:{meal:true},recipeId:null,values:{title:'New meal',slot:'Lunch'}};
 ctx._resumeMeal({uid:'new-id',summary:'Completed recipe'});assert.equal(ctx._mealRecipeId,'new-id');assert.equal(fields.title.value,'Completed recipe');assert.equal(fields.all_day.checked,false);
});
