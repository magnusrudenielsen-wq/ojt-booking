using ojt from '../db/schema';

/** Observer-facing service: my availability, blocked time and bookings. */
@requires: 'Observer'
service ObserverService @(path: '/odata/v4/observer') {

  @readonly
  entity Me               as
    projection on ojt.Observers {
      ID,
      name,
      email,
      jobTitle
    };

  entity MyRules          as
    projection on ojt.AvailabilityRules {
      ID,
      observer,
      weekday,
      dayName.name as dayName,
      startTime,
      endTime
    };

  /** Available on one date only (in addition to the weekly rules) */
  entity MyExtraDays      as
    projection on ojt.AvailabilityDates {
      ID,
      observer,
      day,
      startTime,
      endTime
    };

  entity MyBlockedTimes   as
    projection on ojt.AvailabilityExceptions {
      ID,
      observer,
      day,
      startTime,
      endTime,
      reason
    };

  @readonly
  entity MyQualifications as
    projection on ojt.Qualifications {
      ID,
      observer,
      itemId,
      itemTitle,
      validTo
    };

  @readonly
  entity MyAppointments   as
    projection on ojt.Appointments {
      ID,
      observer,
      employeeName,
      itemId,
      itemTitle,
      startAt,
      endAt,
      location,
      note,
      status
    };

  // The observer is always the logged-in user; set by the handlers, never by the client
  annotate MyRules with {
    observer @readonly @UI.Hidden;
  };

  annotate MyBlockedTimes with {
    observer @readonly @UI.Hidden;
  };

  annotate MyExtraDays with {
    observer @readonly @UI.Hidden;
  };

  type CalendarEntry {
    startAt       : Timestamp;
    endAt         : Timestamp;
    kind          : String(10); // Open | Booked | Blocked
    title         : String(255);
    text          : String(255);
    appointmentId : UUID;
    ruleId        : UUID; // Open: the weekly rule this time comes from
    ruleStart     : Time;
    ruleEnd       : Time;
    dateId        : UUID; // Open: the single-date availability this time comes from
    blockId       : UUID; // Blocked: the blocked-time entry
  }

  function myCalendar(fromDate : Date, toDate : Date) returns many CalendarEntry;
}
