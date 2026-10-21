"""A native entity exposes the library count without recipe content in history."""
from homeassistant.components.sensor import SensorEntity
from homeassistant.helpers.device_registry import DeviceInfo
from .const import DOMAIN


async def async_setup_entry(hass, entry, async_add_entities):
    async_add_entities([RecipeCount(entry.runtime_data)])


class RecipeCount(SensorEntity):
    _attr_has_entity_name = True
    _attr_name = "Recipes"
    _attr_icon = "mdi:book-open-page-variant"
    _attr_should_poll = False
    _attr_unique_id = "hearthglance_recipe_library"
    _attr_device_info = DeviceInfo(identifiers={(DOMAIN, "library")}, name="Hearthglance",
                                   manufacturer="Hearthglance", model="Local recipe library")

    def __init__(self, library):
        self.library = library

    @property
    def native_value(self):
        return len(self.library.records)

    @property
    def extra_state_attributes(self):
        return {"schema_version": 1, "last_import": self.library.imports[-1]["date"] if self.library.imports else None}

    async def async_added_to_hass(self):
        self.library.entity_id = self.entity_id
        self.async_on_remove(self.library.subscribe(self.async_write_ha_state))
