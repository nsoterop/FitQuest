# Shared contracts

This directory owns the platform-neutral client/server contracts, validation and consent text. Both mobile and backend import these files directly. It stays within the existing backend Docker build context so the cleanup does not require a hosting configuration change or a second copy of the contract.

Keep these modules dependency-free except for sibling contracts. Do not import server services, database drivers, Node built-ins or React Native here. `scripts/production-build.test.mjs` checks that boundary and that mobile application code imports no other backend source. Mobile tests can still use synthetic backend fixtures to exercise legacy compatibility.

The complete-plan contract is retained for legacy saved plans. Moving it does not convert saved data or authorize new generation calls. Metro watches this directory; the owner should restart their existing Metro when they choose to test the changed configuration.
