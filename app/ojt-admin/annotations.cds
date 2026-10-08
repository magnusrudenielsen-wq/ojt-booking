using AdminService as service from '../../srv/admin-service';

// ---------------------------------------------------------------------------
// Observers: list report + object page with qualifications and availability
// ---------------------------------------------------------------------------
annotate service.Observers with @(
  UI.HeaderInfo      : {
    TypeName      : 'Observer',
    TypeNamePlural: 'Observers',
    Title         : {Value: name},
    Description   : {Value: jobTitle}
  },
  UI.SelectionFields : [
    name,
    active
  ],
  UI.LineItem        : [
    {Value: name},
    {Value: jobTitle},
    {Value: userId},
    {Value: email},
    {Value: active}
  ],
  UI.FieldGroup #General: {Data: [
    {Value: name},
    {Value: userId},
    {Value: email},
    {Value: jobTitle},
    {Value: active}
  ]},
  UI.Facets          : [
    {
      $Type : 'UI.ReferenceFacet',
      ID    : 'General',
      Label : 'General',
      Target: '@UI.FieldGroup#General'
    },
    {
      $Type : 'UI.ReferenceFacet',
      ID    : 'Qualifications',
      Label : 'Can observe',
      Target: 'qualifications/@UI.LineItem'
    },
    {
      $Type : 'UI.ReferenceFacet',
      ID    : 'Rules',
      Label : 'Weekly availability',
      Target: 'rules/@UI.LineItem'
    },
    {
      $Type : 'UI.ReferenceFacet',
      ID    : 'Blocked',
      Label : 'Blocked time',
      Target: 'blockedTimes/@UI.LineItem'
    }
  ]
) {
  name     @title: 'Name';
  userId   @title: 'SF user ID';
  email    @title: 'E-mail';
  jobTitle @title: 'Job title';
  active   @title: 'Active';
};

annotate service.Qualifications with @(UI.LineItem: [
  {Value: itemId},
  {Value: itemTitle},
  {Value: validTo}
]) {
  itemId    @title: 'Observation item'
            @Common.Text: itemTitle
            @Common.TextArrangement: #TextFirst
            @Common.ValueList: {
              CollectionPath: 'ObservationItems',
              Label         : 'Observation items in SF Learning',
              Parameters    : [
                {
                  $Type            : 'Common.ValueListParameterInOut',
                  LocalDataProperty: itemId,
                  ValueListProperty: 'itemID'
                },
                {
                  $Type            : 'Common.ValueListParameterDisplayOnly',
                  ValueListProperty: 'title'
                }
              ]
            };
  itemTitle @title: 'Title' @readonly;
  validTo   @title: 'Valid until';
};

annotate service.ObservationItems with {
  itemID          @title: 'Item ID';
  title           @title: 'Title';
  durationMinutes @title: 'Minutes';
  location        @title: 'Location';
};

annotate service.AvailabilityRules with @(UI.LineItem: [
  {Value: weekday},
  {Value: startTime},
  {Value: endTime}
]) {
  weekday   @title: 'Weekday'
            @Common.Text: dayName.name
            @Common.TextArrangement: #TextOnly
            @Common.ValueListWithFixedValues
            @Common.ValueList: {
              CollectionPath: 'Weekdays',
              Parameters    : [
                {
                  $Type            : 'Common.ValueListParameterInOut',
                  LocalDataProperty: weekday,
                  ValueListProperty: 'code'
                },
                {
                  $Type            : 'Common.ValueListParameterDisplayOnly',
                  ValueListProperty: 'name'
                }
              ]
            };
  startTime @title: 'From';
  endTime   @title: 'To';
};

annotate service.Weekdays with {
  code @title: 'Weekday' @Common.Text: name @Common.TextArrangement: #TextOnly;
  name @title: 'Weekday';
};

annotate service.AvailabilityExceptions with @(UI.LineItem: [
  {Value: day},
  {Value: startTime},
  {Value: endTime},
  {Value: reason}
]) {
  day       @title: 'Date';
  startTime @title: 'From';
  endTime   @title: 'To';
  reason    @title: 'Reason';
};
