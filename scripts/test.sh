#!/bin/sh
# SPEC-1-001 (task 20c86bd2): substitui o placeholder — encaminha aos runners reais (node:test).
set -e
node --test tests/rules.test.mjs
node --test tests/backend.test.mjs
