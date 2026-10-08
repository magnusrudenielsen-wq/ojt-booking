sap.ui.define([
  "ojt/booking/controller/BaseController",
  "sap/ui/model/json/JSONModel",
  "sap/m/MessageToast"
], (BaseController, JSONModel, MessageToast) => {
  "use strict";

  const CUTOFF_HOURS = 24; // same rule as the server (cds.ojt.changeCutoffHours)

  return BaseController.extend("ojt.booking.controller.Appointment", {
    onInit() {
      this.getView().setModel(new JSONModel({ steps: [] }), "view");
      this.getRouter().getRoute("appointment").attachPatternMatched(this._onRouteMatched, this);
    },

    _onRouteMatched(event) {
      this._appointmentId = event.getParameter("arguments").appointmentId;
      this.getView().bindElement({
        path: "/MyAppointments(" + this._appointmentId + ")",
        events: { dataReceived: () => this._update() }
      });
      this.getView().getElementBinding().refresh();
    },

    _update() {
      const context = this.getView().getBindingContext();
      const a = context && context.getObject();
      if (!a) { return; }
      const now = Date.now();
      const start = new Date(a.startAt).getTime();
      const end = new Date(a.endAt).getTime();
      const booked = a.status === "Booked";
      const held = booked && end < now;
      const reminderDone = booked && start - now < CUTOFF_HOURS * 3600e3;
      const step = (title, text, done, current) => ({
        title: this.getText(title),
        text,
        icon: done ? "sap-icon://sys-enter-2" : "sap-icon://circle-task",
        highlight: done ? "Success" : (current ? "Information" : "None")
      });
      this.getModel("view").setData({
        canChange: booked && !held && start - now >= CUTOFF_HOURS * 3600e3,
        tooLate: booked && !held && start - now < CUTOFF_HOURS * 3600e3,
        steps: booked ? [
          step("stepBooked", this.getText("stepBookedText"), true),
          step("stepReminder", this.getText("stepReminderText"), reminderDone, !reminderDone),
          step("stepObservation", this.formatter.timeRange(a.startAt, a.endAt), held, reminderDone && !held),
          step("stepResult", this.getText("stepResultText"), false, held)
        ] : []
      });
    },

    statusText(status, endAt) {
      if (status === "Cancelled") { return this.getText("apptCancelled"); }
      return endAt && new Date(endAt).getTime() < Date.now() ? this.getText("apptHeld") : this.getText("apptBooked");
    },

    statusState(status) {
      return status === "Cancelled" ? "Error" : "Information";
    },

    onBackToList() {
      this.getRouter().navTo("observations", {}, undefined, true);
    },

    onMove() {
      const a = this.getView().getBindingContext().getObject();
      this.getRouter().navTo("book", { itemId: a.itemId, "?query": { appointment: a.ID } });
    },

    async onCancelBooking() {
      const a = this.getView().getBindingContext().getObject();
      const model = this.getModel("view");
      model.setProperty("/cancelText", this.getText("cancelText", [a.observerName]));
      model.setProperty("/reason", this.getText("reasonShift"));
      this._cancelDialog ??= await this.loadFragment({ name: "ojt.booking.view.CancelDialog" });
      this._cancelDialog.open();
    },

    onCloseCancel() {
      this._cancelDialog.close();
    },

    async onConfirmCancel() {
      const model = this.getModel("view");
      const a = this.getView().getBindingContext().getObject();
      model.setProperty("/saving", true);
      try {
        await this.invokeAction("cancel", { appointmentId: a.ID, reason: model.getProperty("/reason") });
        this._cancelDialog.close();
        MessageToast.show(this.getText("cancelled", [a.observerName.split(" ")[0]]));
        this.onBackToList();
      } catch (e) {
        this._cancelDialog.close();
        this.showError(e);
      } finally {
        model.setProperty("/saving", false);
      }
    }
  });
});
