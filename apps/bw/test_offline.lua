-- Traverse the actual saved snapshot without any network or framebuffer access.
require('setupkoenv')
package.loaded['socket.http']={request=function()error('Offline navigation attempted HTTP')end}
local Cache=dofile('plugins/hearthglance.koplugin/cache.lua')
local f=assert(io.open('/mnt/onboard/.adds/hearthglance/offline.json','rb'))
local body=f:read('*all');f:close()
local pack=assert(Cache.parse(body),'Saved complete snapshot must validate')
local count,recipes=0,0
for key,bundle in pairs(pack.views)do
 count=count+1
 for _,hit in ipairs(bundle.hits)do
  local a=hit.action
  if a.type=='view' then assert(Cache.view(pack,a),'Missing cached navigation target: '..key)end
 end
end
for id,recipe in pairs(pack.recipes)do
 recipes=recipes+1
 for _,section in ipairs{'ingredients','instructions','notes'}do
  local bundle=assert(Cache.view(pack,{page='recipes',recipe=id,section=section}))
  assert(bundle.recipe_title==recipe.title and bundle.scroll.text==recipe[section])
  assert(bundle.view.recipe==id and bundle.view.section==section)
  for _,hit in ipairs(bundle.hits)do
   local a=hit.action
   if a.recipe and a.recipe~='' then assert(a.recipe==id,'Recipe navigation must use actual recipe ID')end
  end
 end
end
assert(not Cache.parse(body:sub(1,#body/2)),'Interrupted snapshot must be rejected')
assert(pack.views['recipe:ingredients'].view.recipe=='__offline_recipe__','Recipe template must remain immutable')
print('PASS: '..count..' cached views and '..recipes..' complete recipes; all navigation/sections offline, immutable templates, interrupted snapshot rejected')
