#!/usr/bin/env node

import('../build/esm/index.js')
  .then((mod) => mod.main())
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
