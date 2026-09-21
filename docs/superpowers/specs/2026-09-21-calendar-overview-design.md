# Read-only multi-calendar overview

Approved direction: the user requested a separate calendar interface, selection of one or several doctor calendars, combined display and read-only interaction. Existing appointment controls stay separate. Use the current demo hours: weekdays 09:00–17:00, lunch 12:00–13:00, Europe/Vienna.

Build a full-width block below the existing dashboard. Default to the current workweek, with a day view, previous/next/today/date controls and doctor toggles (all selected initially). Each date has parallel color-coded doctor lanes, preserving identity when appointments overlap. Show free, busy, break and closed time; mark past time and local demo bookings. Date navigation and filters never write events. On narrow screens the calendar scrolls within its own container; day view is available.

An authenticated GET route reads mapped Google calendars through the existing service-account credential, using Google's read-only FreeBusy API. Fetch only availability intervals, never patient names, contacts, summaries or event titles. Include confirmed local bookings in the display and distinguish their source: Google booking writes are still pending. Map doctor IDs on the server and do not send calendar IDs or credentials to the browser. Calendar-specific failures produce an unavailable lane, not empty/free time. An overall provider/auth failure replaces the grid with a retry state.

Centralize the existing working hours and lunch in a shared schedule module used by local slot generation and the overview. No new scheduling admin UI or different doctor hours are introduced. Free means an unoccupied working interval; an appointment also needs sufficient uninterrupted duration and must follow the existing booking lead time. The overview does not itself authorize booking.

Refresh on range change, manual refresh, local booking changes and every 30 seconds while visible. Clear outdated data while a new range is loading and abort superseded fetches. Only the requested calendar period is queried (one day or seven days, at most a year from today). Workweek view displays Monday–Friday, day view can inspect weekends.

Verification: pure interval tests for overlapping sources, exact boundaries, full-day blocks, weekends, lunch and Vienna DST; mocked FreeBusy mapping/errors and privacy; existing booking tests after schedule extraction; production build; live read-only provider check; browser doctor filters/date/day-week navigation/three languages plus desktop and available mobile checks. Do not create Google events merely to populate the demo.

Self-review: read-only scope, configuration, privacy, missing provider data and the distinction from pending Google booking synchronization are explicit. No schema or voice-tool changes required.
