// Force UTC so any Date formatting in tests is host-timezone-independent.
// Belt-and-suspenders alongside the renderer's UTC fmtTime (E2).
process.env.TZ = "UTC";
