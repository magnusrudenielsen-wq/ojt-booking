sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/json/JSONModel",
  "sap/m/MessageToast",
  "sap/m/MessageBox",
  "ojt/availability/model/formatter"
], (Controller, JSONModel, MessageToast, MessageBox, formatter) => {
  "use strict";

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
      this.getView().setModel(new JSONModel({
        title: this.getText("pageTitle"),
        startDate: mondayOf(today),
        today,
        entries: [],
        rule: {},
        block: {}
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
          this.getView().getModel("view").setProperty("/title", this.getText("pageTitle") + " – " + me.getProperty("name"));
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

    onStartDateChange() {
      this._loadCalendar();
    },

    onAppointmentSelect(event) {
      const appointment = event.getParameter("appointment");
      if (appointment) {
        const e = appointment.getBindingContext("view").getObject();
        MessageToast.show(formatter.timeRange(e.start, e.end) + "\n" + e.title + (e.text ? "\n" + e.text : ""));
      }
    },

    shortTime(value) {
      return value ? String(value).slice(0, 5) : "";
    },

    validToText(value) {
      return value ? this.getText("validTo") + " " + formatter.date(value) : "";
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

    onCloseDialog(event) {
      event.getSource().getParent().close();
    },

    onSaveRule() {
      const rule = this.getView().getModel("view").getProperty("/rule");
      this._create("rulesTable", this._ruleDialog, {
        weekday: Number(rule.weekday), startTime: rule.startTime, endTime: rule.endTime
      });
    },

    onSaveBlock() {
      const block = this.getView().getModel("view").getProperty("/block");
      this._create("blockedTable", this._blockDialog, {
        day: block.day, startTime: block.startTime, endTime: block.endTime, reason: block.reason || null
      });
    },

    async _create(tableId, dialog, data) {
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
      const context = this.byId(tableId).getBinding("items").create(data);
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
    },

    async onDeleteRow(event) {
      try {
        await event.getSource().getBindingContext().delete();
        MessageToast.show(this.getText("deleted"));
        this._loadCalendar();
      } catch (e) {
        MessageBox.error(e.message);
      }
    }
  });
});
