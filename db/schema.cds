namespace ojt;

using {
  cuid,
  managed
} from '@sap/cds/common';

type UserId : String(100);
type ItemId : String(90);

/**
 * People who are allowed to observe. userId is the SuccessFactors user ID,
 * which is also the login name when Cloud Identity Services uses SF as IdP.
 */
entity Observers : cuid, managed {
  userId         : UserId      @mandatory;
  name           : String(111) @mandatory;
  email          : String(241);
  jobTitle       : String(100);
  active         : Boolean default true;
  qualifications : Composition of many Qualifications
                     on qualifications.observer = $self;
  rules          : Composition of many AvailabilityRules
                     on rules.observer = $self;
  blockedTimes   : Composition of many AvailabilityExceptions
                     on blockedTimes.observer = $self;
}

annotate Observers with @assert.unique: {userId: [userId]};

/** Which SF Learning observation items an observer may observe. */
entity Qualifications : cuid {
  observer  : Association to Observers;
  itemId    : ItemId @mandatory;
  itemTitle : String(255);
  validTo   : Date;
}

/** Recurring weekly availability, in local time (see cds.ojt.timezone). */
entity AvailabilityRules : cuid {
  observer  : Association to Observers;
  weekday   : Integer @mandatory @assert.range: [1, 7]; // 1 = Monday
  dayName   : Association to Weekdays on dayName.code = weekday;
  startTime : Time    @mandatory;
  endTime   : Time    @mandatory;
}

/** One-off blocked time, in local time. */
entity AvailabilityExceptions : cuid {
  observer  : Association to Observers;
  day       : Date    @mandatory;
  startTime : Time    @mandatory;
  endTime   : Time    @mandatory;
  reason    : String(120);
}

entity Weekdays {
  key code : Integer;
      name : String(20);
}

type AppointmentStatus : String(12) enum {
  Booked;
  Cancelled;
}

/**
 * The only thing this app owns: the appointment.
 * No results, scores or completion status - SF Learning is the system of record for those.
 */
entity Appointments : cuid, managed {
  employeeId      : UserId;
  employeeName    : String(111);
  employeeEmail   : String(241);
  observer        : Association to Observers;
  itemId          : ItemId;
  itemTitle       : String(255);
  startAt         : Timestamp;
  endAt           : Timestamp;
  location        : String(120);
  note            : String(500);
  status          : AppointmentStatus default 'Booked';
  cancelReason    : String(120);
  rescheduleCount : Integer default 0;
  reminderSentAt  : Timestamp;
  calendarEventId : String(200);
}
