sap.ui.define([
  "ojt/booking/controller/BaseController",
  "sap/ui/model/json/JSONModel",
  "sap/ui/model/Filter",
  "sap/ui/model/FilterOperator",
  "sap/ui/model/Sorter"
], (BaseController, JSONModel, Filter, FilterOperator, Sorter) => {
  "use strict";

  const GROUP_TEXT = { ToBook: "groupToBook", Booked: "groupBooked", AwaitingResult: "groupAwaitingResult", Completed: "groupCompleted" };
  const STATUS_TEXT = { ToBook: "statusToBook", Booked: "statusBooked", AwaitingResult: "statusAwaitingResult", Completed: "statusCompleted" };
  const STATUS_STATE = { ToBook: "Warning", Booked: "Information", AwaitingResult: "None", Completed: "Success" };
  const STATUS_ICON = { ToBook: "sap-icon://appointment-2", Booked: "sap-icon://check-availability", AwaitingResult: "sap-icon://lateness", Completed: "sap-icon://complete" };
  const STATUS_AVATAR = { ToBook: "Accent1", Booked: "Accent6", AwaitingResult: "Accent10", Completed: "Accent8" };
  const DAY_MS = 24 * 3600e3;

  return BaseController.extend("ojt.booking.controller.Observations", {
    onInit() {
      this.getView().setModel(new JSONModel({
        busy: true, tab: "open", items: [], openCount: 0, completedCount: 0
      }), "obs");
      this.getRouter().getRoute("observations").attachPatternMatched(this._onRouteMatched, this);
    },

    _onRouteMatched() {
      // Bookings may have changed on another page: always show the current state
      this.onTabSelect();
      this._load();
    },

    /**
     * Reads all of my observations once and filters per tab in the browser.
     * MyObservations is computed live from SF Learning, so the service doesn't support $filter on it.
     */
    async _load() {
      const model = this.getModel("obs");
      model.setProperty("/busy", true);
      try {
        const contexts = await this.getOwnerComponent().getModel()
          .bindList("/MyObservations").requestContexts(0, Infinity);
        const items = contexts.map((c) => c.getObject());
        const completed = items.filter((i) => i.status === "Completed").length;
        model.setProperty("/items", items);
        model.setProperty("/openCount", items.length - completed);
        model.setProperty("/completedCount", completed);
      } catch (e) {
        this.showError(e);
      } finally {
        model.setProperty("/busy", false);
      }
    },

    onTabSelect() {
      const completed = this.getModel("obs").getProperty("/tab") === "completed";
      const binding = this.byId("list").getBinding("items");
      binding.filter(new Filter("status", completed ? FilterOperator.EQ : FilterOperator.NE, "Completed"));
      // Open tab: grouped by status, soonest due first. Completed tab: one list, most recent first.
      binding.sort(completed
        ? [new Sorter("completedOn", true)]
        : [new Sorter("statusOrder", false, this.groupByStatus.bind(this)), new Sorter("dueDate")]);
    },

    groupByStatus(context) {
      const status = context.getProperty("status");
      return { key: status, text: this.getText(GROUP_TEXT[status]) };
    },

    statusText(status) {
      return status ? this.getText(STATUS_TEXT[status]) : "";
    },

    statusState(status) {
      return STATUS_STATE[status] || "None";
    },

    statusIcon(status) {
      return STATUS_ICON[status] || STATUS_ICON.ToBook;
    },

    statusAvatarColor(status) {
      return STATUS_AVATAR[status] || "Accent10";
    },

    durationText(minutes) {
      return minutes ? this.getText("durationValue", [minutes]) : "";
    },

    dueText(dueDate, status) {
      const due = this.formatter.fromEdmDate(dueDate);
      if (!due) { return ""; }
      const date = this.formatter.date(dueDate);
      if (status !== "ToBook") { return this.getText("dueOn", [date]); }
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const days = Math.round((due - today) / DAY_MS);
      if (days < 0) { return this.getText("dueOverdue", [date]); }
      if (days === 0) { return this.getText("dueToday"); }
      if (days === 1) { return this.getText("dueTomorrow"); }
      return this.getText("dueInDays", [date, days]);
    },

    statusLine(status, start, end, observerName, completedOn) {
      switch (status) {
        case "Booked": return this.getText("bookedLine", [this.formatter.timeRange(start, end), observerName]);
        case "AwaitingResult": return this.getText("awaitingLine", [this.formatter.day(start), observerName]);
        case "Completed": return this.getText("completedLine", [this.formatter.date(completedOn)]);
        default: return "";
      }
    },

    onItemPress(event) {
      const data = event.getSource().getBindingContext("obs").getObject();
      if (data.status === "ToBook") {
        this.getRouter().navTo("book", { itemId: data.itemId });
      } else if (data.appointmentId) {
        this.getRouter().navTo("appointment", { appointmentId: data.appointmentId });
      }
    }
  });
});
