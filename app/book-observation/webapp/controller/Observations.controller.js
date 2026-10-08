sap.ui.define([
  "ojt/booking/controller/BaseController"
], (BaseController) => {
  "use strict";

  const GROUP_TEXT = { ToBook: "groupToBook", Booked: "groupBooked", AwaitingResult: "groupAwaitingResult", Completed: "groupCompleted" };
  const STATUS_TEXT = { ToBook: "statusToBook", Booked: "statusBooked", AwaitingResult: "statusAwaitingResult", Completed: "statusCompleted" };
  const STATUS_STATE = { ToBook: "Warning", Booked: "Information", AwaitingResult: "None", Completed: "Success" };

  return BaseController.extend("ojt.booking.controller.Observations", {
    onInit() {
      this.getRouter().getRoute("observations").attachPatternMatched(this._onRouteMatched, this);
    },

    _onRouteMatched() {
      // Bookings may have changed on another page: always show the current state
      this.byId("list").getBinding("items")?.refresh();
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

    itemLine(itemId, dueDate, minutes) {
      return this.getText("itemLine", [itemId, this.formatter.date(dueDate), minutes]);
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
