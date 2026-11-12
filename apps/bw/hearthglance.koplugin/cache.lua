-- Offline navigation over one atomic snapshot. Only the visible PNG is decoded.
local json=require('json')
local Client=dofile('/mnt/onboard/.adds/koreader/plugins/hearthglance.koplugin/client.lua')
local Cache={}
local sections={ingredients=true,instructions=true,notes=true}

function Cache.parse(body)
    if type(body)~='string' or #body>12*1024*1024 then return nil end
    local ok,pack=pcall(json.decode,body)
    if not ok or type(pack)~='table' or pack.version~=1 or type(pack.views)~='table'
        or type(pack.recipes)~='table' then return nil end
    if pack.downloaded_at~=nil and (type(pack.downloaded_at)~='number' or pack.downloaded_at<0 or pack.downloaded_at>1e11) then return nil end
    local count=0
    for key,bundle in pairs(pack.views)do
        count=count+1
        if count>512 or type(key)~='string' or not Client.validateBundle(bundle) then return nil end
    end
    for _,page in ipairs{'home','calendar','chores','lists','meals','recipes'}do
        if not pack.views[page..':0:0'] then return nil end
    end
    for section in pairs(sections)do if not pack.views['recipe:'..section] then return nil end end
    count=0
    for id,recipe in pairs(pack.recipes)do
        count=count+1
        if count>5000 or type(id)~='string' or #id>250 or type(recipe)~='table'
            or type(recipe.title)~='string' then return nil end
        for section in pairs(sections)do
            if type(recipe[section])~='string' or #recipe[section]>512*1024 then return nil end
        end
    end
    return pack
end

function Cache.view(pack,view)
    if not pack then return nil end
    view=view or {page='home'}
    local recipe=view.page=='recipes' and view.recipe and pack.recipes[view.recipe]
    local section=sections[view.section] and view.section or 'ingredients'
    local key=recipe and 'recipe:'..section or (view.page or 'home')..':'..(view.group or 0)..':'..(view.offset or 0)
    local original=pack.views[key]
    if not original then return nil end
    -- Keep cached manifests immutable when injecting recipe IDs and text.
    local bundle=json.decode(json.encode(original))
    if recipe then
        bundle.view.recipe=view.recipe
        bundle.recipe_title=recipe.title
        bundle.scroll.key='recipe:'..view.recipe..':'..section
        bundle.scroll.text=recipe[section]
        for _,hit in ipairs(bundle.hits)do
            if hit.action.recipe=='__offline_recipe__' then hit.action.recipe=view.recipe end
        end
    end
    return Client.validateBundle(bundle)
end

function Cache.write(path,body)
    local f=io.open(path..'.tmp','wb')
    if not f then return false end
    local ok=f:write(body);f:close()
    return ok and os.rename(path..'.tmp',path)~=nil
end

return Cache
