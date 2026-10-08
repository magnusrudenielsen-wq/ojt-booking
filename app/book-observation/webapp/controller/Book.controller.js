sap.ui.define([
  "ojt/booking/controller/BaseController",
  "sap/ui/model/json/JSONModel",
  "sap/ui/unified/DateRange"
], (BaseController, JSONModel, DateRange) => {
  "use strict";

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

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      this.getModel("view").setData({
        busy: true,
        reschedule: !!this._appointmentId,
        rescheduleText: "",
        error: "",
        observers: [],
        observerId: "",
        slots: [],
        specialDates: [],
        daySlots: [],
        selectedDay: null,
        selectedSlot: null,
        dayTitle: this.getText("freeTimesNoDay"),
        noSlotsText: this.getText("pickDayFirst"),
        continueText: this.getText("continue"),
        minDate: today,
        maxDate: null,
        review: {}
      });
      this.byId("calendar").removeAllSelectedDates();

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

    /** Loads free slots from the server and marks the days that have any. */
    async _loadSlots() {
      const model = this.getModel("view");
      const slots = await this.callFunction("freeSlots", [
        ["itemId", this._itemId, "String"],
        ["observerId", model.getProperty("/observerId"), "Guid"],
        ["fromDate", null, "Date"],
        ["toDate", null, "Date"]
      ]);
      const days = [...new Set(slots.map((s) => this.formatter.dayKey(s.startAt)))];
      model.setProperty("/slots", slots);
      model.setProperty("/specialDates", days.map((d) => ({ date: this.formatter.fromEdmDate(d) })));
      model.setProperty("/maxDate", days.length ? this.formatter.fromEdmDate(days[days.length - 1]) : null);

      if (!slots.length) {
        this._showDay(null);
        model.setProperty("/noSlotsText", this.getText("noSlotsAtAll"));
        return;
      }
      // Keep the chosen day if it still has times, otherwise jump to the first free day
      const selected = model.getProperty("/selectedDay");
      this._selectDay(selected && days.includes(selected) ? selected : days[0]);
    },

    _selectDay(dayKey) {
      const calendar = this.byId("calendar");
      const date = this.formatter.fromEdmDate(dayKey);
      calendar.removeAllSelectedDates();
      calendar.addSelectedDate(new DateRange({ startDate: date }));
      calendar.focusDate(date);
      this._showDay(dayKey);
    },

    _showDay(dayKey) {
      const model = this.getModel("view");
      const daySlots = dayKey ? model.getProperty("/slots").filter((s) => this.formatter.dayKey(s.startAt) === dayKey) : [];
      model.setProperty("/selectedDay", dayKey);
      model.setProperty("/daySlots", daySlots);
      model.setProperty("/dayTitle", dayKey ? this.getText("freeTimes", [this.formatter.day(this.formatter.fromEdmDate(dayKey))]) : this.getText("freeTimesNoDay"));
      model.setProperty("/noSlotsText", this.getText(dayKey ? "noSlotsDay" : "pickDayFirst"));
      this._setSlot(null);
      this.byId("slotList").removeSelections(true);
    },

    _setSlot(slot) {
      const model = this.getModel("view");
      model.setProperty("/selectedSlot", slot);
      model.setProperty("/continueText", slot
        ? this.getText("continueWith", [this.formatter.day(slot.startAt) + " " + this.formatter.time(slot.startAt)])
        : this.getText("continue"));
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

    onDaySelect(event) {
      const range = event.getSource().getSelectedDates()[0];
      this._showDay(range ? this.formatter.dayKey(range.getStartDate()) : null);
    },

    onSlotSelect(event) {
      const item = event.getParameter("listItem");
      this._setSlot(item ? item.getBindingContext("view").getObject() : null);
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
