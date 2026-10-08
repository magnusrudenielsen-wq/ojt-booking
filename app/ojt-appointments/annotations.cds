using AdminService as service from '../../srv/admin-service';

// ---------------------------------------------------------------------------
// All bookings (read-only overview for OJT admins)
// ---------------------------------------------------------------------------
annotate service.Appointments with @(
  UI.HeaderInfo         : {
    TypeName      : 'Booking',
    TypeNamePlural: 'Bookings',
    Title         : {Value: itemTitle},
    Description   : {Value: employeeName}
  },
  UI.SelectionFields    : [
    status,
    observer_ID,
    itemId,
    employeeName
  ],
  UI.LineItem           : [
    {Value: startAt},
    {Value: employeeName},
    {Value: itemTitle},
    {Value: observer_ID},
    {Value: location},
    {
      Value      : status,
      Criticality: statusCriticality
    }
  ],
  UI.PresentationVariant: {
    SortOrder     : [{
      Property  : startAt,
      Descending: true
    }],
    Visualizations: ['@UI.LineItem']
  },
  UI.FieldGroup #Booking: {Data: [
    {Value: startAt},
    {Value: endAt},
    {Value: employeeName},
    {Value: employeeEmail},
    {Value: observer_ID},
    {Value: location},
    {Value: note}
  ]},
  UI.FieldGroup #Status : {Data: [
    {
      Value      : status,
      Criticality: statusCriticality
    },
    {Value: cancelReason},
    {Value: rescheduleCount},
    {Value: reminderSentAt},
    {Value: createdAt},
    {Value: modifiedAt}
  ]},
  UI.Facets             : [
    {
      $Type : 'UI.ReferenceFacet',
      ID    : 'Booking',
      Label : 'Booking',
      Target: '@UI.FieldGroup#Booking'
    },
    {
      $Type : 'UI.ReferenceFacet',
      ID    : 'Status',
      Label : 'Status',
      Target: '@UI.FieldGroup#Status'
    }
  ]
) {
  startAt         @title: 'Start';
  endAt           @title: 'End';
  employeeName    @title: 'Employee';
  employeeEmail   @title: 'Employee e-mail';
  itemId          @title: 'Observation item';
  itemTitle       @title: 'Observation';
  observer        @title: 'Observer'
                  @Common.Text: observerName
                  @Common.TextArrangement: #TextOnly
                  @Common.ValueList: {
                    CollectionPath: 'Observers',
                    Parameters    : [
                      {
                        $Type            : 'Common.ValueListParameterInOut',
                        LocalDataProperty: observer_ID,
                        ValueListProperty: 'ID'
                      },
                      {
                        $Type            : 'Common.ValueListParameterDisplayOnly',
                        ValueListProperty: 'name'
                      }
                    ]
                  };
  location        @title: 'Location';
  note            @title: 'Note from employee';
  status          @title: 'Status';
  cancelReason    @title: 'Cancellation reason';
  rescheduleCount @title: 'Times moved';
  reminderSentAt  @title: 'Reminder sent';
  statusCriticality @UI.Hidden;
};

annotate service.Observers with {
  ID @Common.Text: name @Common.TextArrangement: #TextOnly @UI.Hidden;
};
