# Gate Routing Test Results

The production integration runner calls exported production modules and the real validator CLI. Final observed result: 27/27 cases passed.

The suite covers five-gate routing, explicit target-gate exit semantics, Candidate/final decoupling, typed Domain routing, scanner report forgery rejection, schema-loader integration, and current fail-closed CLI behavior. It checks routed statuses and reasons, not only process exit codes.
