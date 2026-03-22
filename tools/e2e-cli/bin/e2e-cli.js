#!/usr/bin/env node

import('../build/index.js')
  .then((mod) => mod.main())
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
