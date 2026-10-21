"""Native, local Hearthglance recipe records and authenticated frontend access."""
from datetime import timedelta
from pathlib import Path

from aiohttp import web
import voluptuous as vol

from homeassistant.auth.permissions.const import POLICY_CONTROL, POLICY_READ
from homeassistant.components import websocket_api
from homeassistant.components.http import HomeAssistantView
from homeassistant.core import SupportsResponse, callback
from homeassistant.exceptions import HomeAssistantError, Unauthorized
from homeassistant.helpers.event import async_track_time_interval
from homeassistant.helpers.http import KEY_HASS
from homeassistant.helpers.service import async_register_admin_service

from .const import DOMAIN
from .store import RecipeLibrary


def library_for(hass, connection, msg, policy=POLICY_READ):
    library = hass.data.get(DOMAIN)
    if library is None or msg["entity_id"] != library.entity_id:
        raise HomeAssistantError("Recipe library is unavailable")
    if not connection.user.permissions.check_entity(library.entity_id, policy):
        raise Unauthorized
    return library


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/list", vol.Required("entity_id"): str})
@callback
def ws_list(hass, connection, msg):
    library = library_for(hass, connection, msg)
    connection.send_result(msg["id"], library.snapshot(connection.refresh_token_id))


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/subscribe", vol.Required("entity_id"): str})
@callback
def ws_subscribe(hass, connection, msg):
    library = library_for(hass, connection, msg)

    @callback
    def update(*_):
        if connection.user.permissions.check_entity(library.entity_id, POLICY_READ):
            connection.send_event(msg["id"], library.snapshot(connection.refresh_token_id))

    remove_listener = library.subscribe(update)
    remove_timer = async_track_time_interval(hass, update, timedelta(hours=12))

    @callback
    def remove():
        remove_listener()
        remove_timer()

    connection.subscriptions[msg["id"]] = remove
    connection.send_result(msg["id"])
    update()


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/save", vol.Required("entity_id"): str,
    vol.Required("recipe"): dict, vol.Optional("recipe_id"): str, vol.Optional("revision"): int})
@websocket_api.async_response
async def ws_save(hass, connection, msg):
    library = library_for(hass, connection, msg, POLICY_CONTROL)
    try:
        recipe_id = await library.async_save(msg["recipe"], msg.get("recipe_id"), msg.get("revision"))
    except ValueError as err:
        connection.send_error(msg["id"], "invalid_recipe", str(err))
        return
    connection.send_result(msg["id"], {"recipe_id": recipe_id})


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/delete", vol.Required("entity_id"): str,
    vol.Required("recipe_id"): str, vol.Required("revision"): int})
@websocket_api.async_response
async def ws_delete(hass, connection, msg):
    library = library_for(hass, connection, msg, POLICY_CONTROL)
    try:
        await library.async_delete(msg["recipe_id"], msg["revision"])
    except ValueError as err:
        connection.send_error(msg["id"], "invalid_recipe", str(err))
        return
    connection.send_result(msg["id"])


class RecipeImageView(HomeAssistantView):
    url = f"/api/{DOMAIN}/image/{{image_id}}/{{variant}}"
    name = f"api:{DOMAIN}:image"
    requires_auth = True

    async def get(self, request, image_id, variant):
        hass = request.app[KEY_HASS]
        library = hass.data.get(DOMAIN)
        user = request.get("hass_user")
        if not library or not user or not user.permissions.check_entity(library.entity_id, POLICY_READ):
            raise web.HTTPUnauthorized
        path = library.image_path(image_id, variant)
        if path is None or not await hass.async_add_executor_job(path.is_file):
            raise web.HTTPNotFound
        return web.FileResponse(path, headers={"Content-Type": "image/jpeg", "Cache-Control": "private, max-age=3600"})


def import_path(root, value):
    root = Path(root).resolve()
    path = Path(value).resolve()
    if not path.is_relative_to(root) or path.suffix != ".melarecipes":
        raise ValueError("Choose a .melarecipes file inside /config/imports")
    return path


async def async_setup(hass, config):
    for command in (ws_list, ws_subscribe, ws_save, ws_delete):
        websocket_api.async_register_command(hass, command)
    hass.http.register_view(RecipeImageView())

    async def import_mela(call):
        library = hass.data.get(DOMAIN)
        if library is None:
            raise HomeAssistantError("Add the Hearthglance Recipes integration first")
        try:
            path = await hass.async_add_executor_job(import_path, hass.config.path("imports"), call.data["path"])
            return await library.async_import(path)
        except (ValueError, OSError) as err:
            raise HomeAssistantError(f"Recipe import failed: {err}") from err

    async_register_admin_service(hass, DOMAIN, "import_mela", import_mela,
                                schema=vol.Schema({vol.Required("path"): str}),
                                supports_response=SupportsResponse.ONLY)
    return True


async def async_setup_entry(hass, entry):
    library = RecipeLibrary(hass)
    await library.async_load()
    entry.runtime_data = library
    hass.data[DOMAIN] = library
    await hass.config_entries.async_forward_entry_setups(entry, ["sensor"])
    return True


async def async_unload_entry(hass, entry):
    if await hass.config_entries.async_unload_platforms(entry, ["sensor"]):
        hass.data.pop(DOMAIN, None)
        return True
    return False
