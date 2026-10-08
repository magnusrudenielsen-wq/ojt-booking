sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/core/routing/History",
  "sap/ui/core/UIComponent",
  "sap/m/MessageBox",
  "ojt/booking/model/formatter"
], (Controller, History, UIComponent, MessageBox, formatter) => {
  "use strict";

  return Controller.extend("ojt.booking.controller.BaseController", {
    formatter,

    getRouter() {
      return UIComponent.getRouterFor(this);
    },

    getModel(name) {
      return this.getView().getModel(name);
    },

    getText(key, args) {
      return this.getOwnerComponent().getModel("i18n").getResourceBundle().getText(key, args);
    },

    onNavBack() {
      if (History.getInstance().getPreviousHash() !== undefined) {
        window.history.go(-1);
      } else {
        this.getRouter().navTo("observations", {}, undefined, true);
      }
    },

    /**
     * Calls an OData V4 function of the booking service and returns its "value".
     * @param {string} name function name
     * @param {Array<[string, any, string]>} params [name, value, type] with type "String" | "Guid" | "Date"
     */
    async callFunction(name, params) {
      const literal = ([, value, type]) => {
        if (value === null || value === undefined || value === "") { return "null"; }
        return type === "String" ? "'" + encodeURIComponent(String(value).replace(/'/g, "''")) + "'" : encodeURIComponent(value);
      };
      const args = params.map((p) => p[0] + "=" + literal(p)).join(",");
      const url = this.getOwnerComponent().getModel().getServiceUrl() + name + "(" + args + ")";
      const response = await fetch(url, { headers: { Accept: "application/json" }, credentials: "same-origin" });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error?.message || response.statusText);
      }
      return body.value;
    },

    /**
     * Invokes an unbound OData V4 action through the model and returns the result object.
     */
    async invokeAction(name, params) {
      const action = this.getOwnerComponent().getModel().bindContext("/" + name + "(...)");
      Object.entries(params).forEach(([key, value]) => action.setParameter(key, value));
      await (action.invoke ? action.invoke() : action.execute());
      return action.getBoundContext().getObject();
    },

    showError(error) {
      MessageBox.error(error?.message || String(error));
    }
  });
});
