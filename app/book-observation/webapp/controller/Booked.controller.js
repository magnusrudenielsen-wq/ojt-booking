sap.ui.define([
  "ojt/booking/controller/BaseController",
  "sap/ui/model/json/JSONModel"
], (BaseController, JSONModel) => {
  "use strict";

  return BaseController.extend("ojt.booking.controller.Booked", {
    onInit() {
      this.getView().setModel(new JSONModel({}), "view");
      this.getRouter().getRoute("booked").attachPatternMatched(this._onRouteMatched, this);
    },

    async _onRouteMatched(event) {
      const args = event.getParameter("arguments");
      const moved = !!(args["?query"] && args["?query"].moved);
      const model = this.getModel("view");
      this._appointmentId = args.appointmentId;
      model.setData({ busy: true, title: this.getText(moved ? "movedHeadline" : "bookedHeadline"), description: "" });
      try {
        const a = await this.getModel().bindContext("/MyAppointments(" + this._appointmentId + ")").requestObject();
        const when = a.itemTitle + ", " + this.formatter.timeRange(a.startAt, a.endAt);
        model.setProperty("/description", moved
          ? this.getText("movedDescription", [when, a.observerName])
          : this.getText("bookedDescription", [when, a.observerName, a.observerName.split(" ")[0]]));
      } catch (e) {
        this.showError(e);
      } finally {
        model.setProperty("/busy", false);
      }
    },

    onViewBooking() {
      this.getRouter().navTo("appointment", { appointmentId: this._appointmentId }, true);
    },

    onBackToList() {
      this.getRouter().navTo("observations", {}, undefined, true);
    }
  });
});
