/**
 * Simplified stand-in for the SAP SuccessFactors Learning OData API.
 *
 * For the demo, `cds watch` mocks this service with the CSV files in ./data.
 * In the real project: import the actual API definition (`cds import <edmx>`),
 * then adjust the mapping in srv/lib/sf-learning.js. That file is the only place
 * that knows SF's entity and field names.
 */
@cds.external
service SFLearning {

  entity LearningItems {
    key itemID          : String(90);
        title           : String(255);
        itemType        : String(20); // OJT_OBS = on-the-job observation
        durationMinutes : Integer;
        location        : String(120);
        preparation     : String(1000); // what to bring, one item per line
  }

  entity LearningAssignments {
    key userID         : String(100);
    key itemID         : String(90);
        dueDate        : Date;
        status         : String(20); // ASSIGNED | COMPLETED
        completionDate : Date;
  }
}
