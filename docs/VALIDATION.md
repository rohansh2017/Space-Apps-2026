# Validation

Measured values only. Regenerate with `make validate`.

## Engine vs JPL Horizons (quantity 4), frame MOON_ME_DE440_ME421

Engine angles are computed from the shipped Float32 ephemeris table (`web/public/data/ephemeris/2026.bin`) with `horizonwalk.engine.site_angles`.

Window: 720 hourly steps from 2026-11-20 00:00 UTC. Target: < 0.1 deg. Azimuth error is scaled by cos(elevation).

| Site | Body | Max az error (deg) | Max el error (deg) | Pass |
| --- | --- | --- | --- | --- |
| apollo11 | Sun | 0.00000 | 0.00068 | yes |
| apollo11 | Earth | 0.00000 | 0.00002 | yes |
| change7-shackleton-rim | Sun | 0.00000 | 0.00068 | yes |
| change7-shackleton-rim | Earth | 0.00000 | 0.00003 | yes |
| im2-mons-mouton | Sun | 0.00000 | 0.00068 | yes |
| im2-mons-mouton | Earth | 0.00000 | 0.00003 | yes |
