sap.ui.define([
  "ojt/booking/controller/BaseController",
  "sap/ui/model/json/JSONModel",
  "sap/ui/core/format/DateFormat"
], (BaseController, JSONModel, DateFormat) => {
  "use strict";

  const WEEK_MS = 7 * 24 * 3600e3;
  const weekdayFormat = DateFormat.getDateInstance({ pattern: "EEE" });
  const dateFormat = DateFormat.getDateInstance({ pattern: "d MMM" });

  const today = () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  };
  const addDays = (date, days) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
  /** Monday of the week that contains the date (local time) */
  const startOfWeek = (date) => addDays(date, -((date.getDay() + 6) % 7));
  /** ISO 8601 week number: the week that contains the year's first Thursday is week 1 */
  const isoWeek = (date) => {
    const thursday = addDays(date, 3 - ((date.getDay() + 6) % 7));
    const jan1 = new Date(thursday.getFullYear(), 0, 1);
    return 1 + Math.floor(Math.round((thursday - jan1) / 864e5) / 7);
  };

  return BaseController.extend("ojt.booking.controller.Book", {
    onInit() {
      this.getView().setModel(new JSONModel(), "view");
      this.getRouter().getRoute("book").attachPatternMatched(this._onRouteMatched, this);
    },

    async _onRouteMatched(event) {
      const args = event.getParameter("arguments");
      const query = args["?query"] || {};
      this._itemId = args.itemId;
      this._appointmentId = query.appointment || null;

      this._weeks = [];
      this.getModel("view").setData({
        busy: true,
        reschedule: !!this._appointmentId,
        rescheduleText: "",
        error: "",
        observers: [],
        observerId: "",
        slots: [],
        week: { index: -1, count: 0, days: [] },
        selectedSlot: null,
        selectedText: "",
        review: {}
      });

      const key = encodeURIComponent(this._itemId.replace(/'/g, "''"));
      this.getView().bindElement({ path: "/MyObservations('" + key + "')" });

      try {
        const [observers, current] = await Promise.all([
          this.callFunction("qualifiedObservers", [["itemId", this._itemId, "String"]]),
          this._appointmentId ? this._readAppointment(this._appointmentId) : null
        ]);
        this.getModel("view").setProperty("/observers", [{ ID: "", name: this.getText("anyObserver") }, ...observers]);
        if (current) {
          this._current = current;
          this.getModel("view").setProperty("/rescheduleText", this.getText("currentBooking", [
            this.formatter.timeRange(current.startAt, current.endAt), current.observerName
          ]));
        }
        await this._loadSlots();
      } catch (e) {
        this.showError(e);
      } finally {
        this.getModel("view").setProperty("/busy", false);
      }
    },

    _readAppointment(id) {
      return this.getModel().bindContext("/MyAppointments(" + id + ")").requestObject();
    },

    durationText(minutes) {
      return minutes ? this.getText("durationValue", [minutes]) : "";
    },

    dueText(dueDate) {
      return dueDate ? this.getText("dueOn", [this.formatter.date(dueDate)]) : "";
    },

    /** Loads free slots for the whole booking horizon and splits them into weeks. */
    async _loadSlots() {
      const model = this.getModel("view");
      const slots = await this.callFunction("freeSlots", [
        ["itemId", this._itemId, "String"],
        ["observerId", model.getProperty("/observerId"), "Guid"],
        ["fromDate", null, "Date"],
        ["toDate", null, "Date"]
      ]);
      model.setProperty("/slots", slots);
      this._setSlot(null);

      // Weeks run Monday-Sunday, from this week up to the week of the last free time
      const thisWeek = startOfWeek(today());
      const lastDay = slots.length ? this.formatter.fromEdmDate(this.formatter.dayKey(slots[slots.length - 1].startAt)) : today();
      const count = Math.round((startOfWeek(lastDay) - thisWeek) / WEEK_MS) + 1;
      this._weeks = Array.from({ length: count }, (_, i) => addDays(thisWeek, i * 7));

      // Stay on the week the user was looking at if it still has times, otherwise go to the first free week
      const current = model.getProperty("/week/index");
      const keep = current >= 0 && current < count && this._slotsInWeek(current).length;
      this._showWeek(keep ? current : Math.max(0, this._nextFreeWeek(-1)));
    },

    _slotsInWeek(index) {
      const from = this._weeks[index], to = addDays(from, 7);
      return this.getModel("view").getProperty("/slots").filter((s) => {
        const d = new Date(s.startAt);
        return d >= from && d < to;
      });
    },

    /** Index of the first week after `index` that has free times, or -1. */
    _nextFreeWeek(index) {
      for (let i = index + 1; i < this._weeks.length; i++) {
        if (this._slotsInWeek(i).length) { return i; }
      }
      return -1;
    },

    _showWeek(index) {
      const model = this.getModel("view");
      const monday = this._weeks[index];
      const anyObserver = !model.getProperty("/observerId");
      const weekSlots = this._slotsInWeek(index);
      const todayKey = this.formatter.dayKey(today());

      const days = Array.from({ length: 7 }, (_, i) => {
        const date = addDays(monday, i);
        const key = this.formatter.dayKey(date);
        const slots = weekSlots
          .filter((s) => this.formatter.dayKey(s.startAt) === key)
          .map((s) => ({
            ...s,
            label: this.formatter.time(s.startAt) + (anyObserver ? " · " + s.observerName.split(" ")[0] : ""),
            tooltip: this.formatter.slotTime(s.startAt, s.endAt) + ", " + s.observerName
          }));
        let state = slots.length ? "free" : "empty";
        if (key < todayKey) { state = "past"; } else if (key === todayKey) { state = "today"; }
        return {
          key,
          weekday: weekdayFormat.format(date),
          date: dateFormat.format(date),
          state,
          slots
        };
      });

      const next = weekSlots.length ? -1 : this._nextFreeWeek(index);
      const firstNext = next >= 0 ? this._slotsInWeek(next)[0] : null;
      const total = model.getProperty("/slots").length;
      let summary = this.getText("weekFreeNone");
      if (!total) { summary = this.getText("noSlotsAtAll"); }
      else if (weekSlots.length === 1) { summary = this.getText("weekFreeOne"); }
      else if (weekSlots.length) { summary = this.getText("weekFree", [weekSlots.length]); }

      model.setProperty("/week", {
        index,
        count: this._weeks.length,
        title: this.getText("weekTitle", [isoWeek(monday)]),
        range: this.getText("weekRange", [dateFormat.format(monday), dateFormat.format(addDays(monday, 6))]),
        counter: this.getText("weekCounter", [index + 1, this._weeks.length]),
        summary,
        nextFreeText: firstNext ? this.getText("nextFree", [this.formatter.day(firstNext.startAt)]) : "",
        nextFreeIndex: next,
        days
      });
    },

    _setSlot(slot) {
      const model = this.getModel("view");
      model.setProperty("/selectedSlot", slot);
      model.setProperty("/selectedText", slot
        ? this.getText("selectedSlot", [this.formatter.timeRange(slot.startAt, slot.endAt), slot.observerName])
        : "");
    },

    async onObserverChange() {
      const model = this.getModel("view");
      model.setProperty("/busy", true);
      try {
        await this._loadSlots();
      } catch (e) {
        this.showError(e);
      } finally {
        model.setProperty("/busy", false);
      }
    },

    onPrevWeek() {
      this._showWeek(Math.max(0, this.getModel("view").getProperty("/week/index") - 1));
    },

    onNextWeek() {
      this._showWeek(Math.min(this._weeks.length - 1, this.getModel("view").getProperty("/week/index") + 1));
    },

    onJumpToNextFree() {
      const next = this.getModel("view").getProperty("/week/nextFreeIndex");
      if (next >= 0) { this._showWeek(next); }
    },

    onSlotPress(event) {
      const slot = event.getSource().getBindingContext("view").getObject();
      const current = this.getModel("view").getProperty("/selectedSlot");
      const same = current && current.startAt === slot.startAt && current.observerId === slot.observerId;
      this._setSlot(same ? null : slot);
    },

    onErrorClose() {
      this.getModel("view").setProperty("/error", "");
    },

    async onContinue() {
      const model = this.getModel("view");
      const slot = model.getProperty("/selectedSlot");
      const item = this.getView().getBindingContext().getObject();
      const lines = (item.preparation || "").split("\n").map((l) => l.trim()).filter(Boolean);
      model.setProperty("/review", {
        itemTitle: item.title,
        when: this.formatter.timeRange(slot.startAt, slot.endAt),
        observerName: slot.observerName,
        location: item.location,
        current: this._current ? this.formatter.timeRange(this._current.startAt, this._current.endAt) + ", " + this._current.observerName : "",
        bring: lines.length ? this.getText("bring", [lines.join("; ")]) : "",
        note: "",
        nextSteps: this.getText("nextSteps", [slot.observerName.split(" ")[0]])
      });
      this._dialog ??= await this.loadFragment({ name: "ojt.booking.view.ReviewDialog" });
      this._dialog.open();
    },

    onCloseReview() {
      this._dialog.close();
    },

    async onConfirm() {
      const model = this.getModel("view");
      const slot = model.getProperty("/selectedSlot");
      model.setProperty("/saving", true);
      try {
        const result = this._appointmentId
          ? await this.invokeAction("reschedule", {
            appointmentId: this._appointmentId, observerId: slot.observerId, startAt: slot.startAt
          })
          : await this.invokeAction("book", {
            itemId: this._itemId, observerId: slot.observerId, startAt: slot.startAt,
            note: model.getProperty("/review/note") || null
          });
        this._dialog.close();
        this.getRouter().navTo("booked", {
          appointmentId: result.ID,
          "?query": this._appointmentId ? { moved: "1" } : {}
        }, true);
      } catch (e) {
        // Most likely someone else took the slot a moment ago: show why and refresh the times
        this._dialog.close();
        model.setProperty("/error", e.message);
        model.setProperty("/busy", true);
        try { await this._loadSlots(); } catch (ignore) { /* error already shown */ }
        model.setProperty("/busy", false);
      } finally {
        model.setProperty("/saving", false);
      }
    }
  });
});
