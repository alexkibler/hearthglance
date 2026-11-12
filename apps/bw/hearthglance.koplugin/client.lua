local http = require("socket.http")
local socket = require("socket")
local json = require("json")
local mime = require("mime")
local Client = {}

function Client.validPNG(png)
    return type(png)=="string" and png:sub(1,8)=="\137PNG\r\n\026\n"
        and png:sub(17,24)=="\000\000\004\048\000\000\005\168"
        and png:sub(-8,-5)=="IEND"
end

function Client.request(url, token, payload, options)
    options=options or {}
    local timeout=options.timeout or 4
    local encoded = payload and json.encode(payload)
    local chunks, size, sent = {}, 0, false
    local deadline = socket.gettime() + timeout
    local headers = { Authorization="Bearer "..token }
    if encoded then headers["Content-Type"]="application/json";headers["Content-Length"]=#encoded end
    local old_timeout=http.TIMEOUT;http.TIMEOUT=timeout
    local ok, _, status = pcall(http.request, {
        url=url, method=encoded and "POST" or "GET",headers=headers,redirect=false,
        create=function() local tcp=socket.tcp();tcp:settimeout(timeout,"t");return tcp end,
        source=encoded and function() if not sent then sent=true;return encoded end end or nil,
        sink=function(chunk)
            if socket.gettime()>deadline then return nil,"Request deadline" end
            if chunk then
                size=size+#chunk
                if size>(options.max_bytes or 768*1024) then return nil,"Response too large" end
                chunks[#chunks+1]=chunk
            end
            return 1
        end,
    })
    http.TIMEOUT=old_timeout
    if not ok or status~=200 then return nil end
    return table.concat(chunks)
end

function Client.bundle(body)
    if not body then return nil end
    local ok, data=pcall(json.decode,body)
    if not ok then return nil end
    return Client.validateBundle(data)
end

function Client.validateBundle(data)
    if type(data)~="table" or type(data.png)~="string" or type(data.hits)~="table" or type(data.view)~="table" then return nil end
    local png=mime.unb64(data.png)
    if not Client.validPNG(png) or #data.hits>100 then return nil end
    if data.updated_epoch~=nil and (type(data.updated_epoch)~='number' or data.updated_epoch<0 or data.updated_epoch>1e11) then return nil end
    for _,hit in ipairs(data.hits) do
        if type(hit.rect)~="table" or #hit.rect~=4 or type(hit.action)~="table" then return nil end
        for _,n in ipairs(hit.rect) do if type(n)~="number" or n<0 or n>1448 then return nil end end
    end
    if data.scroll~=nil then
        local s=data.scroll
        if type(s)~="table" or type(s.key)~="string" or #s.key>300
            or type(s.text)~="string" or #s.text>512*1024 or type(s.rect)~="table" or #s.rect~=4
            or type(s.font_pixels)~="number" or s.font_pixels<20 or s.font_pixels>44 then return nil end
        for _,n in ipairs(s.rect) do if type(n)~="number" then return nil end end
        if s.rect[1]<0 or s.rect[2]<0 or s.rect[3]<=0 or s.rect[4]<=0
            or s.rect[1]+s.rect[3]>1072 or s.rect[2]+s.rect[4]>1448 then return nil end
    end
    return data,png
end

return Client
