# OJT Observation Booking (demo)

Self-service booking of **on-the-job training (OJT) observations**, integrated with **SAP SuccessFactors Learning**.
Built with SAP CAP (Node.js) and SAPUI5 standard controls, ready to run on SAP BTP behind SAP Build Work Zone.

- Employees see the observations assigned to them in SF Learning, pick a qualified observer and a free time, and book, move or cancel.
- Observers publish their weekly availability, block time and see their bookings.
- OJT admins maintain who may observe what, and see all bookings.

**SF Learning stays the system of record.** The app only reads from SF Learning (assignments, items, completion status). It never writes learning records, results, assessments or completion. That rule is enforced in code: every write to the `SFLearning` service is rejected (`srv/lib/sf-learning.js`).

## Apps

| App | Who | Built with | Folder |
|---|---|---|---|
| Book Observation | Employee | UI5 freestyle (XML views): `ObjectListItem`, `sap.ui.unified.Calendar`, `Select`, `Dialog`, `SimpleForm`, `IllustratedMessage` | `app/book-observation` |
| My Availability | Observer | UI5 freestyle: `SinglePlanningCalendar`, `IconTabBar`, `Table`, `TimePicker`, `DatePicker` | `app/my-availability` |
| Manage Observers | OJT admin | Fiori elements List Report / Object Page (draft) | `app/ojt-admin` |
| All OJT Bookings | OJT admin | Fiori elements List Report (read-only) | `app/ojt-appointments` |

Each app has a `crossNavigation` inbound in its `manifest.json`, so it shows up as a tile in SAP Build Work Zone.

## Project structure

```
db/schema.cds                Observers, Qualifications, AvailabilityRules/-Exceptions, Appointments
db/data/                     Demo data (observers, qualifications, weekly availability)
srv/booking-service.*        Employee API: MyObservations, freeSlots, book, reschedule, cancel
srv/observer-service.*       Observer API: own rules, blocked time, bookings, myCalendar
srv/admin-service.*          Admin API (draft) + live value help from SF Learning
srv/job-service.*            sendReminders, called by BTP Job Scheduling
srv/external/SFLearning.cds  Simplified stand-in for the SF Learning OData API (mocked locally)
srv/lib/sf-learning.js       The only place that knows SF Learning's entity/field names
srv/lib/slots.js             Free-slot calculation (pure function, unit tested)
srv/lib/calendar.js          Outlook via Microsoft Graph (logs only when no MS_GRAPH destination)
app/*/                       The four UI5 apps, plus app/launchpad.html (local launchpad)
mta.yaml, xs-security.json   BTP deployment: HANA HDI, XSUAA, HTML5 repo, destinations, Work Zone
test/                        Unit tests for the slot calculation
```

## Run the demo locally

Prerequisites: Node.js 20+ and `@sap/cds-dk` (`npm i -g @sap/cds-dk`). Works the same in SAP Business Application Studio.

```bash
npm install
cds watch
```

Open http://localhost:4004/launchpad.html for a local Fiori launchpad with all four tiles, or open the apps directly from http://localhost:4004.

Log in with one of the demo users (no password). Use a private browser window to switch user.

| User | Role | Use it to |
|---|---|---|
| `jonas` | Employee | Book "Pushback with towbar" or "Baggage loader operation" |
| `anna` | Employee | Already has two bookings |
| `mette`, `lars`, `sofie` | Observer | See and change availability, see bookings |
| `admin` | OJT admin (also Employee and Observer roles) | Manage observers, see all bookings |

The database is in memory, so every restart of `cds watch` resets the demo data. Two bookings for Anna and a blocked slot for Mette are created relative to today, so the observer calendar is never empty.

The local launchpad (`app/launchpad.html`) loads the SAPUI5 sandbox shell from `ui5.sap.com`, so it needs internet access. It is for demos only; on BTP, SAP Build Work Zone takes its place.

### Suggested demo flow

1. As **jonas**: open *Book Observation*. Only observation items assigned in SF Learning appear; e-learning items and other people's items do not.
2. Pick *Pushback with towbar*. Days with free times are marked in the calendar. Switch between *Any qualified observer* and a specific observer.
3. Pick a time next week, review (the *Bring* list comes from the SF item), add a note, confirm.
4. Open the booking, *Move to another time*, then *Cancel*. Bookings that start within 24 hours can't be changed.
5. As **mette**: open *My Availability*. Jonas's booking shows in blue. Add weekly availability or block time; the free slots update for employees straight away.
6. As **admin**: open *Manage Observers*, add a qualification. The value help reads observation items live from SF Learning.

To show double-booking protection: open the same free slot as `jonas` and as `admin` in two browsers, confirm one, then the other. The second gets "That time is no longer available" and fresh times.

### Tests

```bash
npm test
```

## How booking works

1. `MyObservations` reads the user's assignments from SF Learning and keeps only observation items (`itemType = OJT_OBS`). Status (*To book*, *Booked*, *Awaiting result*, *Completed*) combines SF completion with the app's own bookings.
2. `freeSlots` = weekly availability of qualified observers, minus blocked time, existing bookings, Outlook busy time (when Graph is configured) and anything within the next 2 hours. Times are kept in local time (`cds.ojt.timezone`, default `Europe/Copenhagen`) and stored in UTC.
3. `book` re-checks everything on the server: the item is still assigned and open in SF, the observer is still qualified, and the slot is still free. It locks the observer row while doing so. The Outlook invite is only sent after the booking is committed.

Settings live in `package.json` under `cds.ojt`: time zone, booking horizon, minimum lead time, change cut-off and reminder timing.

## Deploy to SAP BTP

```bash
npm i -g mbt
mbt build
cf deploy mta_archives/ojt-booking_0.1.0.mtar
```

This creates HANA HDI, XSUAA, Destination and HTML5 Application Repository instances. Then:

1. **Destinations** (subaccount):
   - `SF_LEARNING`: the SF Learning OData API, with a technical user that has **read permissions only**.
   - `MS_GRAPH` (optional): `https://graph.microsoft.com` with OAuth2 client credentials. Also set `cds.ojt.organizerMailbox` to the shared mailbox that sends the invites. Without it, invites are only logged.
2. **SAP Build Work Zone, standard edition**: refresh the HTML5 content provider, add the four apps to a site, and assign them to roles.
3. **Role collections**: assign *Employee*, *Observer*, *OJTAdmin* (generated by the deployment) to users or IdP groups. Use SAP Cloud Identity Services with SuccessFactors as the identity provider, so the login name equals the SF user ID.
4. **Reminders**: create a SAP BTP Job Scheduling job that calls `POST /odata/v4/jobs/sendReminders` every hour, with the *JobScheduler* scope.

Before going live, remove the demo files in `db/data` (and `srv/external/data`).

Without SAP Build Work Zone, the same apps can run behind a standalone approuter. Only the deployment layer changes; the CAP service and the UI5 apps stay the same.

## Connecting the real SF Learning API

`srv/external/SFLearning.cds` is a simplified model so the demo runs without SuccessFactors. For a real system:

1. Download the EDMX for the SF Learning OData APIs you need (assignments / learning plan, learning items) from the SAP Business Accelerator Hub, and check it against the client's SF release.
2. `cds import <file>.edmx --as cds` and point `cds.requires.SFLearning.model` to it.
3. Adjust the mapping in `srv/lib/sf-learning.js`. Nothing else in the app knows SF's entity or field names.

Open points to confirm with the business:

- Which SF Learning items count as observations (item type, or a custom field)?
- Is "qualified observer" maintained in this app (as now), or derived from SF Learning data?
- Cancellation cut-off, number of allowed moves, and the reminder timing.
- Retention period for appointment data (GDPR).
