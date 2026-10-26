# Shared contracts

This directory owns the platform-neutral client/server contracts, validation and consent text. Both mobile and backend import these files directly. It stays within the existing backend Docker build context without a hosting configuration change or a second copy of the contracts. Its ten TypeScript modules include versioned exercise-logging hints and birthday-to-age calculation alongside planning, consent, food, journal, weight and schedule contracts.

Keep these modules dependency-free except for sibling contracts. Do not import server services, database drivers, Node built-ins or React Native here. `scripts/production-build.test.mjs` checks that boundary and that mobile application code imports no other backend source. Mobile tests can still use synthetic backend fixtures to exercise legacy compatibility.

The complete-plan contract is retained for legacy saved plans. Moving it does not convert saved data or authorize new generation calls. Metro already watches this directory for development. A future environment/configuration change may require its owner to restart it; the standalone preview bundles shared code and does not depend on Metro.
