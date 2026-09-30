#!/bin/bash
# Prints how many uvicorn worker processes this VPS should run, then the
# figures it was based on, e.g. `2 cpus=2,mem_available=1400MB`.
#
# Sep 30 2026 — The backend ran as ONE process, so any slow request (a big
# report, a Sheets import) froze the ERP for every user until it finished.
# The deploy workflow exports this number as WEB_CONCURRENCY, which uvicorn
# reads when --workers isn't given, and `pm2 start all --update-env` hands it
# to the backend process. Background jobs stay single-run via
# backend/core/leader.py.
#
# One worker per CPU, between 2 and 4. Two even on a single CPU: a request
# stuck on CPU then shares the core instead of making everyone queue behind
# it. Capped by free memory (~400 MB each, leaving room for MongoDB), and
# never below 1.
cpus=$(nproc 2>/dev/null || echo 1)
avail_mb=$(awk '/MemAvailable/ {print int($2 / 1024)}' /proc/meminfo 2>/dev/null)
avail_mb=${avail_mb:-0}

workers=$cpus
if [ "$workers" -gt 4 ]; then workers=4; fi
if [ "$workers" -lt 2 ]; then workers=2; fi
mem_cap=$((avail_mb / 400))
if [ "$mem_cap" -lt "$workers" ]; then workers=$mem_cap; fi
if [ "$workers" -lt 1 ]; then workers=1; fi

echo "$workers cpus=$cpus,mem_available=${avail_mb}MB"
