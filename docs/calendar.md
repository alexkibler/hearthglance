# Editing events

Open an event's details to edit it. Local meal-calendar entries reopen the meal
picker, including an existing recipe link or a free-text title. Regular entries
on calendars with HA update support use the event form, with rich-text
description formatting. Imported HTML is sanitized before display and saving.

Mark Google sources in the card configuration:

```yaml
calendars:
  - entity: calendar.shared_calendar
    name: Shared Calendar
    person: family
    google: true
```

Google events offer **Edit in Google Calendar** if the source supplies a trusted
Google event URL. When HA omits it, **Open Google Calendar** opens the app for
editing there. Hearthglance does not resolve missing URLs or update Google
events locally. Calendar subscriptions without update support remain read-only.

For recurring local events, editing is offered only when HA supplies an
occurrence ID. The edit targets that occurrence. Manage the series in the source
calendar.
