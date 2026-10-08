sap.ui.define([
  "ojt/booking/controller/BaseController",
  "sap/ui/model/json/JSONModel"
], (BaseController, JSONModel) => {
  "use strict";

  const GROUP_TEXT = { ToBook: "groupToBook", Booked: "groupBooked", AwaitingResult: "groupAwaitingResult", Completed: "groupCompleted" };
  const STATUS_TEXT = { ToBook: "statusToBook", Booked: "statusBooked", AwaitingResult: "statusAwaitingResult", Completed: "statusCompleted" };
  const STATUS_STATE = { ToBook: "Warning", Booked: "Information", AwaitingResult: "None", Completed: "Success" };
  const STATUS_ICON = { ToBook: "sap-icon://add-appointment", Booked: "sap-icon://appointment-2", AwaitingResult: "sap-icon://lateness", Completed: "sap-icon://complete" };
  const STATUS_AVATAR = { ToBook: "Accent1", Booked: "Accent6", AwaitingResult: "Accent10", Completed: "Accent8" };
  const DAY_MS = 24 * 3600e3;

  return BaseController.extend("ojt.booking.controller.Observations", {
    onInit() {
      this.getView().setModel(new JSONModel({ toBook: 0, booked: 0, done: 0 }), "summary");
      this.getRouter().getRoute("observations").attachPatternMatched(this._onRouteMatched, this);
    },

    _onRouteMatched() {
      // Bookings may have changed on another page: always show the current state
      this.byId("list").getBinding("items")?.refresh();
    },

    /** Counts for the summary tiles in the header */
    onUpdateFinished() {
      const statuses = this.byId("list").getBinding("items").getCurrentContexts().map((c) => c.getProperty("status"));
      const count = (...wanted) => statuses.filter((s) => wanted.includes(s)).length;
      this.getModel("summary").setData({
        toBook: count("ToBook"),
        booked: count("Booked", "AwaitingResult"),
        done: count("Completed")
      });
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
      const data = event.getSource().getBindingContext().getObject();
      if (data.status === "ToBook") {
        this.getRouter().navTo("book", { itemId: data.itemId });
      } else if (data.appointmentId) {
        this.getRouter().navTo("appointment", { appointmentId: data.appointmentId });
      }
    }
  });
});
