sap.ui.define([
  "ojt/booking/controller/BaseController"
], (BaseController) => {
  "use strict";

  return BaseController.extend("ojt.booking.controller.App", {
    onInit() {
      this.getView().addStyleClass(this.getOwnerComponent().getContentDensityClass());
    }
  });
});
