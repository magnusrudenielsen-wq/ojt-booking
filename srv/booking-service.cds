using ojt from '../db/schema';

/** Employee-facing service: see my observations, find free times, book, move, cancel. */
@requires: 'Employee'
service BookingService @(path: '/odata/v4/booking') {

  /**
   * My observation items, read live from SF Learning and merged with my bookings.
   * Not stored here.
   */
  @readonly @cds.persistence.skip
  entity MyObservations {
    key itemId           : String(90);
        title            : String(255);
        dueDate          : Date;
        durationMinutes  : Integer;
        location         : String(120);
        preparation      : String(1000);
        status           : String(20); // ToBook | Booked | AwaitingResult | Completed
        statusOrder      : Integer;
        completedOn      : Date;
        appointmentId    : UUID;
        appointmentStart : Timestamp;
        appointmentEnd   : Timestamp;
        observerName     : String(111);
  }

  @readonly
  entity MyAppointments as
    projection on ojt.Appointments {
      *,
      observer.name     as observerName,
      observer.email    as observerEmail,
      observer.jobTitle as observerJobTitle
    }
    excluding {
      calendarEventId
    };

  type ObserverInfo {
    ID       : UUID;
    name     : String(111);
    jobTitle : String(100);
  }

  type Slot {
    startAt      : Timestamp;
    endAt        : Timestamp;
    observerId   : UUID;
    observerName : String(111);
  }

  function qualifiedObservers(itemId : String)                                                               returns many ObserverInfo;
  /** observerId = null means "any qualified observer". Dates are local dates. */
  function freeSlots(itemId : String, observerId : UUID, fromDate : Date, toDate : Date)                     returns many Slot;
  action   book(itemId : String, observerId : UUID, startAt : Timestamp, note : String)                       returns MyAppointments;
  action   reschedule(appointmentId : UUID, observerId : UUID, startAt : Timestamp)                           returns MyAppointments;
  action   cancel(appointmentId : UUID, reason : String)                                                       returns MyAppointments;
}
