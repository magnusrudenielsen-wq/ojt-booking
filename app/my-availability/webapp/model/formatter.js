sap.ui.define([
  "sap/ui/core/format/DateFormat"
], (DateFormat) => {
  "use strict";

  const dayFormat = DateFormat.getDateInstance({ pattern: "EEE d MMM" });
  const dateFormat = DateFormat.getDateInstance({ style: "medium" });
  const timeFormat = DateFormat.getTimeInstance({ pattern: "HH:mm" });

  /** Edm.Date ("2026-10-30") as a local date, so it never shifts a day */
  const fromEdmDate = (v) => {
    if (!v) { return null; }
    if (v instanceof Date) { return v; }
    const [y, m, d] = v.split("-").map(Number);
    return new Date(y, m - 1, d);
  };
  const toDate = (v) => (v instanceof Date ? v : (v ? new Date(v) : null));

  const formatter = {
    fromEdmDate,
    toDate,

    /** Local "YYYY-MM-DD" key for grouping slots by day */
    dayKey(v) {
      const d = toDate(v);
      return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    },

    date(v) {
      const d = fromEdmDate(v);
      return d ? dateFormat.format(d) : "";
    },

    day(v) {
      const d = toDate(v);
      return d ? dayFormat.format(d) : "";
    },

    time(v) {
      const d = toDate(v);
      return d ? timeFormat.format(d) : "";
    },

    timeRange(start, end) {
      if (!start) { return ""; }
      return formatter.day(start) + ", " + formatter.time(start) + "–" + formatter.time(end);
    },

    slotTime(start, end) {
      return start ? formatter.time(start) + "–" + formatter.time(end) : "";
    }
  };

  return formatter;
});
