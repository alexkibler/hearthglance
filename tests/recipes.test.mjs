import test from 'node:test';
import assert from 'node:assert/strict';
import {recipeData,filterRecipes,recipePhoto,recipeMethods} from '../src/recipes.js';
import {normalizeConfig} from '../src/config.js';
const recipes=[{uid:'1',summary:'Soup',_recipe:{title:'Tomato soup',ingredients:'Basil\nTomatoes',categories:['Lunch'],favorite:true}},
 {uid:'2',summary:'Pasta',_recipe:{title:'Pasta',ingredients:'Noodles',categories:['Dinner'],favorite:false}}];
test('recipe search combines terms, categories and favorites across native records',()=>{
 assert.deepEqual(filterRecipes(recipes,'basil tomato','Lunch',true),[recipes[0]]);
 assert.deepEqual(filterRecipes(recipes,'basil','Dinner'),[]);
 assert.deepEqual(filterRecipes(recipes,'','',true),[recipes[0]]);
 assert.deepEqual(filterRecipes(recipes,'  PASTA '),[recipes[1]]);
});
test('legacy recipes keep source URLs while native records preserve Mela metadata',()=>{
 assert.equal(recipeData({summary:'Old',description:JSON.stringify({source:'https://example.org',ingredients:'Rice'})}).link,'https://example.org');
 const record={title:'Native',nutrition:'Protein 5 g',yield:'2',date:123,notes:'Keep me'};
 assert.deepEqual(recipeData({_recipe:record}),record);
 assert.equal(recipeData({summary:'Plain',description:'not JSON'}).title,'Plain');
});
test('recipe cards escape imported HTML and accept only authenticated local photo routes',()=>{
 const methods=recipeMethods({icon:()=>'<svg></svg>',button:(label,action,classes,attrs)=>`<button ${attrs}>${label}</button>`});
 const output=methods._recipeCards([{uid:'x',_recipe:{title:'<img src=x onerror=alert(1)>',categories:['<script>'],images:[{thumb:'javascript:alert(1)'}]}}]);
 assert.match(output,/&lt;img/);assert.doesNotMatch(output,/onerror=alert\(1\)>/);
 assert.equal(recipePhoto('https://external.example/photo.jpg'),'');
 assert.equal(recipePhoto('/api/hearthglance_recipes/image/'+ 'a'.repeat(64) +'/thumb?authSig=abc').length>0,true);
});
test('native recipe configuration accepts a library entity without subscribing to it as a task list',()=>{
 const c=normalizeConfig({people:[{id:'family',name:'Family'}],calendars:[{entity:'calendar.family'}],recipes:'sensor.hearthglance_recipes'});
 assert.equal(c.recipes,'sensor.hearthglance_recipes');
});
test('native recipe edits send revisions and preserve metadata through a patch rather than a task service',async()=>{
 const methods=recipeMethods({});let command;
 const ctx={_config:{recipes:'sensor.library'},_editingRecipe:{uid:'abc',_recipe:{revision:7,images:[{id:'x'}]}},_nativeRecipes:()=>true,_hass:{callWS:async c=>{command=c;}}};
 const values={title:'Dinner',categories:'Soup, Lunch',ingredients:'Rice',link:'https://example.org'};
 await methods._saveRecipe.call(ctx,k=>values[k]||'',{has:key=>key==='favorite'});
 assert.equal(command.type,'hearthglance_recipes/save');assert.equal(command.recipe_id,'abc');assert.equal(command.revision,7);
 assert.equal(command.recipe.favorite,true);assert.deepEqual(command.recipe.categories,['Soup','Lunch']);assert.equal(command.recipe.images,undefined);
});
