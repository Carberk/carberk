// builds the job list. usage: node gen.mjs <tier>
const T = process.argv[2];
const P = { tech: "role=tech&scene=capture", techCorrect: "role=tech&scene=correct", rev: "role=reviewer&scene=capture", bonly: "role=tech&scene=capture&handoff=1" };
const S = [
 ["intake", P.tech, "intake", "[data-panel=visit]"],
 ["capture-empty", P.tech, "captureEmpty", "[data-panel=visit]"],
 ["capture-errors", P.tech, "captureErrorsBlurred", "[data-panel=visit]"],
 ["capture-ready", P.tech, "capturePath", "[data-panel=visit]"],
 ["capture-review", P.tech, "captureReview", "[data-panel=visit]"],
 ["capture-saved", P.tech, "captureSave", "[data-panel=visit]"],
 ["correct-prereq", P.techCorrect, "correctionPrereq", "[data-panel=visit]"],
 ["correct-form", P.techCorrect, "correctionFilled", "[data-panel=visit]"],
 ["correct-review", P.techCorrect, "correctionReview", "[data-panel=visit]"],
 ["correct-saved", P.techCorrect, "correctionSave", "[data-panel=visit]"],
 ["stale", P.tech, "stale", "[data-panel=visit]"],
 ["cand-partial", P.rev, "candidatesEmptyPartial", "[data-panel=link]"],
 ["cand-scope-empty", P.rev, "candidatesScopeEmpty", "[data-panel=link]"],
 ["pair-full", P.rev, "pair", "[data-panel=link]"],
 ["pair-images", P.rev, "pairImagesOpen", "[data-panel=link]"],
 ["pair-imgfail", P.rev, "pairImageFail", "[data-panel=link]"],
 ["pair-imgfail-corrupt", P.rev, "pairImageFailCorrupt", "[data-panel=link]"],
 ["pair-imgready", P.rev, "pairImageRetryOk", "[data-panel=link]"],
 ["pair-techNone", P.rev, "techNone", "[data-panel=link]"],
 ["pair-decision", P.rev, "decision", "[data-panel=link]"],
 ["pair-review", P.rev, "decisionReview", "[data-panel=link]"],
 ["pair-issued", P.rev, "issued", "[data-panel=link]"],
 ["pair-denied", P.rev, "denied", "main"],
 ["offline", P.rev, "offline", "[data-panel=link]"],
 ["busy", P.rev, "busy", "[data-panel=link]"],
 ["bonly-list", P.bonly, "bonlyList", "[data-panel=link]"],
 ["bonly-review", P.bonly, "bonlyReview", "[data-panel=link]"],
 ["bonly-lost", P.bonly, "bonlyLostChecked", "[data-panel=link]"],
 ["bonly-done", P.bonly, "bonlyOpenResult", "[data-panel=reports]"],
 ["bonly-none", P.bonly + "&hm=none", "bonlyList", "[data-panel=link]"],
];
const W = { 1280: 1000, 1024: 900, 768: 1000, 640: 1000, 384: 800 };
const jobs = [];
const add = (state, locale, theme, w) => { const [n, q, st, subject] = S.find(x => x[0] === state); jobs.push({ id: `${n}__${locale}__${theme}__${w}`, q, locale, theme, w, h: W[w], state: st, subject, maxH: 12000 }); };
const names = S.map(x => x[0]);
if (T === "en") for (const t of ["light", "dark"]) for (const w of [1280, 768, 640, 384]) for (const s of names) add(s, "en", t, w);
if (T === "pair1024") for (const w of [1024, 1023]) for (const t of ["light", "dark"]) for (const s of ["pair-full", "pair-images", "pair-decision"]) add(s, "en", t, w);
if (T === "loc") for (const l of ["ru", "tk"]) for (const w of [1280, 768, 384]) for (const s of names) add(s, l, "light", w);
if (T === "locdark") for (const l of ["ru", "tk"]) for (const w of [1280, 384]) for (const s of ["capture-errors", "capture-review", "pair-full", "pair-imgfail", "pair-review", "bonly-list", "bonly-lost", "correct-prereq"]) add(s, l, "dark", w);
console.log(JSON.stringify(jobs));
