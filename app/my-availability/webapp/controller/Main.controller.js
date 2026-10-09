sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/json/JSONModel",
  "sap/m/MessageToast",
  "sap/m/MessageBox",
  "sap/ui/core/format/DateFormat",
  "ojt/availability/model/formatter"
], (Controller, JSONModel, MessageToast, MessageBox, DateFormat, formatter) => {
  "use strict";

  /** Local time of a Date as "HH:mm:ss" (Edm.TimeOfDay) */
  const hhmmss = (d) => String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0") + ":00";
  const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
  const dayTitleFormat = DateFormat.getDateInstance({ pattern: "EEEE d MMMM" });

  const COLORS = { Open: "#5DC122", Booked: "#0070F2", Blocked: "#E76500" };
  const ICONS = { Open: "sap-icon://accept", Booked: "sap-icon://employee", Blocked: "sap-icon://locked" };

  const mondayOf = (date) => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d;
  };

  return Controller.extend("ojt.availability.controller.Main", {
    formatter,

    onInit() {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      // Cozy on purpose: SinglePlanningCalendar works best (and is easiest to use) in cozy density
      this.getView().addStyleClass("sapUiSizeCozy");
      // Only Open / Booked / Blocked in the legend, not the calendar's generic Today/Selected/Working day items
      this.byId("legend").setStandardItems([]);
      this.getView().setModel(new JSONModel({
        greeting: this.getText("heroText"),
        counts: { bookings: 0 },
        startDate: mondayOf(today),
        today,
        entries: [],
        rule: {},
        block: {},
        quick: {},
        entry: {}
      }), "view");
      this._loadMe();
      this._loadCalendar();
    },

    getText(key, args) {
      return this.getOwnerComponent().getModel("i18n").getResourceBundle().getText(key, args);
    },

    async _loadMe() {
      try {
        const [me] = await this.getOwnerComponent().getModel().bindList("/Me").requestContexts(0, 1);
        if (me) {
          const firstName = String(me.getProperty("name") || "").split(" ")[0];
          this.getView().getModel("view").setProperty("/greeting", this.getText("heroGreeting", [firstName]));
        }
      } catch (e) {
        MessageBox.error(e.message);
      }
    },

    /** Reads open slots, bookings and blocked time for the visible week. */
    async _loadCalendar() {
      const calendar = this.byId("calendar");
      const from = mondayOf(calendar.getStartDate() || new Date());
      const to = new Date(from);
      to.setDate(to.getDate() + 6);
      const url = this.getOwnerComponent().getModel().getServiceUrl() +
        "myCalendar(fromDate=" + formatter.dayKey(from) + ",toDate=" + formatter.dayKey(to) + ")";
      try {
        const response = await fetch(url, { headers: { Accept: "application/json" }, credentials: "same-origin" });
        const body = await response.json();
        if (!response.ok) { throw new Error(body.error?.message || response.statusText); }
        this.getView().getModel("view").setProperty("/entries", body.value.map((e) => ({
          ...e,
          start: new Date(e.startAt),
          end: new Date(e.endAt),
          color: COLORS[e.kind],
          icon: ICONS[e.kind]
        })));
      } catch (e) {
        MessageBox.error(e.message);
      }
    },

    /** Keeps the counts in the tab headers up to date (each table says which count it feeds) */
    onListUpdated(event) {
      const key = event.getSource().data("count");
      this.getView().getModel("view").setProperty("/counts/" + key, event.getParameter("total") || 0);
    },

    onStartDateChange() {
      this._loadCalendar();
    },

    // ------------------------------------------------------------------ click an entry in the calendar

    /** Clicking a box shows what it is and what can be done: remove a weekly rule, block a day, remove a block */
    async onAppointmentSelect(event) {
      const appointment = event.getParameter("appointment");
      if (!appointment) { return; }
      const e = appointment.getBindingContext("view").getObject();
      const weekday = WEEKDAYS[(e.start.getDay() + 6) % 7];
      const when = formatter.day(e.start) + ", " + formatter.time(e.start) + "–" + formatter.time(e.end);
      const entry = {
        kind: e.kind, icon: ICONS[e.kind], when, line1: "", line2: "",
        ruleId: e.ruleId, blockId: e.blockId, dateId: e.dateId, weekday,
        ruleText: e.ruleStart ? this.getText(weekday) + " " + this.shortTime(e.ruleStart) + "–" + this.shortTime(e.ruleEnd) : "",
        day: formatter.dayKey(e.start), startTime: hhmmss(e.start), endTime: hhmmss(e.end)
      };
      if (e.kind === "Open") {
        entry.heading = this.getText("entryOpen");
        entry.line1 = e.ruleStart ? this.getText("entryFromRule", [this.getText(weekday + "Plural"), this.shortTime(e.ruleStart), this.shortTime(e.ruleEnd)])
          : (e.dateId ? this.getText("entryFromDate") : "");
        entry.line2 = this.getText("entryOpenHint");
      } else if (e.kind === "Blocked") {
        entry.heading = this.getText("entryBlocked");
        entry.line1 = e.title && e.title !== "Blocked" ? e.title : "";
      } else {
        entry.heading = this.getText("entryBooked");
        entry.line1 = e.title;
        entry.line2 = e.text;
      }
      this.getView().getModel("view").setProperty("/entry", entry);
      this._entryPopover ??= await this.loadFragment({ name: "ojt.availability.view.EntryPopover" });
      // The calendar marks the clicked box as selected; undo that when the popover closes
      this._entryPopover.detachEvent("afterClose", this._onEntryClosed, this);
      this._selectedAppointment = appointment;
      this._entryPopover.attachEventOnce("afterClose", this._onEntryClosed, this);
      this._entryPopover.openBy(appointment);
    },

    _onEntryClosed() {
      this._selectedAppointment?.setSelected(false);
      this._selectedAppointment = null;
    },

    /** Removes the weekly rule behind an open box, after asking (it affects every week) */
    onEntryRemoveRule() {
      const entry = this.getView().getModel("view").getProperty("/entry");
      this._entryPopover.close();
      MessageBox.confirm(this.getText("entryRemoveRuleConfirm", [entry.ruleText]), {
        title: this.getText("entryRemoveRuleTitle"),
        emphasizedAction: MessageBox.Action.OK,
        onClose: (action) => {
          if (action === MessageBox.Action.OK) { this._deleteById("/MyRules", entry.ruleId); }
        }
      });
    },

    onEntryRemoveDate() {
      const entry = this.getView().getModel("view").getProperty("/entry");
      this._entryPopover.close();
      this._deleteById("/MyExtraDays", entry.dateId);
    },

    onEntryRemoveBlock() {
      const entry = this.getView().getModel("view").getProperty("/entry");
      this._entryPopover.close();
      this._deleteById("/MyBlockedTimes", entry.blockId);
    },

    /** Blocks just this day for the clicked open time; the weekly rule stays */
    onEntryBlockDay() {
      const entry = this.getView().getModel("view").getProperty("/entry");
      this._create("/MyBlockedTimes", this._entryPopover, {
        day: entry.day, startTime: entry.startTime, endTime: entry.endTime, reason: null
      });
    },

    async _deleteById(entitySet, id) {
      try {
        await this.getOwnerComponent().getModel().delete(entitySet + "(" + id + ")");
        MessageToast.show(this.getText("deleted"));
        this._loadCalendar();
      } catch (e) {
        MessageBox.error(e.message);
      }
    },

    shortTime(value) {
      return value ? String(value).slice(0, 5) : "";
    },

    // ------------------------------------------------------------------ add availability / block time

    async onAddRule() {
      this.getView().getModel("view").setProperty("/rule", { weekday: "1", startTime: "08:00:00", endTime: "12:00:00" });
      this._ruleDialog ??= await this.loadFragment({ name: "ojt.availability.view.AddRuleDialog" });
      this._ruleDialog.open();
    },

    async onAddBlock() {
      this.getView().getModel("view").setProperty("/block", {
        day: formatter.dayKey(new Date(Date.now() + 864e5)), startTime: "08:00:00", endTime: "16:00:00", reason: ""
      });
      this._blockDialog ??= await this.loadFragment({ name: "ojt.availability.view.AddBlockDialog" });
      this._blockDialog.open();
    },

    // ------------------------------------------------------------------ drag in the calendar

    /** Dragging across the calendar opens a pre-filled dialog: available that day (optionally every week) or blocked */
    async onCalendarDrag(event) {
      const start = event.getParameter("startDate");
      const end = event.getParameter("endDate");
      if (!start || !end) { return; }
      const sameDay = formatter.dayKey(start) === formatter.dayKey(end);
      const weekday = WEEKDAYS[(start.getDay() + 6) % 7];
      const day = formatter.dayKey(start);
      const today = this.getView().getModel("view").getProperty("/today");
      const past = day < formatter.dayKey(today);
      this.getView().getModel("view").setProperty("/quick", {
        kind: "open",
        // A single day by default; a day in the past only makes sense as a weekly rule
        weekly: past,
        weeklyLabel: this.getText("quickWeekly", [this.getText(weekday)]),
        dayHint: this.getText("quickDayHint", [formatter.day(start)]),
        day,
        weekday: (start.getDay() + 6) % 7 + 1, // 1 = Monday, as in AvailabilityRules
        startTime: hhmmss(start),
        endTime: sameDay ? hhmmss(end) : "23:45:00",
        reason: "",
        past,
        dayText: dayTitleFormat.format(start),
        ruleHint: this.getText("quickRuleHint", [this.getText(weekday + "Plural")]),
        blockHint: this.getText("quickBlockHint", [formatter.day(start)])
      });
      this._quickDialog ??= await this.loadFragment({ name: "ojt.availability.view.QuickAddDialog" });
      this._quickDialog.open();
    },

    onSaveQuick() {
      const q = this.getView().getModel("view").getProperty("/quick");
      if (q.kind === "block") {
        this._create("/MyBlockedTimes", this._quickDialog, {
          day: q.day, startTime: q.startTime, endTime: q.endTime, reason: q.reason || null
        });
      } else if (!q.weekly) {
        this._create("/MyExtraDays", this._quickDialog, {
          day: q.day, startTime: q.startTime, endTime: q.endTime
        });
      } else {
        this._create("/MyRules", this._quickDialog, {
          weekday: q.weekday, startTime: q.startTime, endTime: q.endTime
        });
      }
    },

    onCloseDialog(event) {
      event.getSource().getParent().close();
    },

    onSaveRule() {
      const rule = this.getView().getModel("view").getProperty("/rule");
      this._create("/MyRules", this._ruleDialog, {
        weekday: Number(rule.weekday), startTime: rule.startTime, endTime: rule.endTime
      });
    },

    onSaveBlock() {
      const block = this.getView().getModel("view").getProperty("/block");
      this._create("/MyBlockedTimes", this._blockDialog, {
        day: block.day, startTime: block.startTime, endTime: block.endTime, reason: block.reason || null
      });
    },

    /** Creates a rule, single day or blocked time and refreshes the calendar */
    async _create(entitySet, dialog, data) {
      if (Object.entries(data).some(([key, value]) => key !== "reason" && !value)) {
        MessageBox.warning(this.getText("fillAll"));
        return;
      }
      if (data.startTime >= data.endTime) {
        MessageBox.warning(this.getText("endAfterStart"));
        return;
      }
      const model = this.getView().getModel("view");
      model.setProperty("/saving", true);
      const context = this.getOwnerComponent().getModel().bindList(entitySet).create(data);
      try {
        await context.created();
        dialog.close();
        MessageToast.show(this.getText("saved"));
        this._loadCalendar();
      } catch (e) {
        if (!e.canceled) {
          MessageBox.error(e.message);
          context.delete().catch(() => { /* already gone */ });
        }
      } finally {
        model.setProperty("/saving", false);
      }
    }
  });
});
