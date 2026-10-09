using ojt from '../db/schema';
using {SFLearning as sf} from './external/SFLearning';

/** OJT admins: who can observe what, and an overview of all bookings. */
@requires: 'OJTAdmin'
service AdminService @(path: '/odata/v4/admin') {

  @odata.draft.enabled
  entity Observers        as projection on ojt.Observers;

  entity Qualifications   as projection on ojt.Qualifications;
  entity AvailabilityRules as projection on ojt.AvailabilityRules;
  entity AvailabilityExceptions as projection on ojt.AvailabilityExceptions;
  entity AvailabilityDates as projection on ojt.AvailabilityDates;

  @readonly
  entity Weekdays         as projection on ojt.Weekdays;

  @readonly
  entity Appointments     as
    projection on ojt.Appointments {
      *,
      observer.name as observerName,
      case status
        when 'Booked' then 3
        else 1
      end           as statusCriticality : Integer
    }
    excluding {
      calendarEventId
    };

  /** Observation items from SF Learning, read live (value help for qualifications). */
  @readonly
  entity ObservationItems as
    projection on sf.LearningItems {
      key itemID,
          title,
          durationMinutes,
          location
    }
    where
      itemType = 'OJT_OBS';
}
