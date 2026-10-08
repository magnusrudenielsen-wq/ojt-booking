sap.ui.define([
  "sap/ui/core/UIComponent",
  "sap/ui/model/json/JSONModel",
  "sap/ui/Device"
], (UIComponent, JSONModel, Device) => {
  "use strict";

  return UIComponent.extend("ojt.booking.Component", {
    metadata: {
      manifest: "json",
      interfaces: ["sap.ui.core.IAsyncContentCreation"]
    },

    init() {
      UIComponent.prototype.init.apply(this, arguments);
      this.setModel(new JSONModel(Device).setDefaultBindingMode("OneWay"), "device");
      this.getRouter().initialize();
    },

    getContentDensityClass() {
      return Device.support.touch ? "sapUiSizeCozy" : "sapUiSizeCompact";
    }
  });
});
