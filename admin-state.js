/* ============================================================
   FEROCIA SPORTS CENTER — ADMIN SHARED STATE
   Load this FIRST, before app.js and any admin-*.js module.

   Formalizes the pattern app.js already used to hand things to
   tournament.js (window.app = {...}) into something every admin
   module can share:

     window.AdminState        Mutable state, formerly closure `let`
                               variables inside app.js. Read/write as
                               AdminState.currentLadder, etc. — never
                               destructure into a local `let`, or your
                               copy goes stale the moment another
                               module updates it.

     window.CLICK_HANDLERS    data-action -> handler function map.
                               Each module adds its own entries via
                               Object.assign(window.CLICK_HANDLERS, {...}).
                               The single delegated click listener
                               (still in app.js's BOOT section) reads
                               from this at click time.

     window.AdminPageLoaders  page-name -> loader function map. Each
                               module registers itself, e.g.
                               AdminPageLoaders.orders = loadOrdersPage.
                               showPage() looks a page up here first.

   Nothing in this file executes any logic — it only creates the
   shared containers other scripts fill in.
   ============================================================ */

window.AdminState = {
  allPlayers: [],
  allLadders: [],
  currentLadder: null,
  ladderPlayers: [],
  courtPlayers: [],
  noShowPlayer: null,
  noShowPenalty: -4,
  subPlayers: new Set(),
  gameCount: 0,
  extraGameCount: 0,
  extraGames: [],
  modalLadderId: null,
  currentTournamentId: null,
  emailInFlight: false, // shared "an email send is in progress" guard —
                        // read/written by Email Notifications, Tournament
                        // Notify, and Promotions, so it must live here, not
                        // as a separate local flag in each.
  ftc: {
    teams: [],    // ftcTeams — used across FTC Standings/Playoffs/Schedule/Team Registration
    schedule: [], // ftcSchedule — used across FTC Standings/Schedule Generation
    matches: [],  // ftcMatches — used across FTC Standings/Playoffs/Schedule Generation
  },
  lpGenderFilter: 'all', // Ladder Players modal's gender filter — the SAME modal
                         // is opened by both admin-ladder-management.js (regular
                         // ladders) and admin-ftc-teams.js (FTC roster), so this
                         // can't be a private variable in either file.
};

window.CLICK_HANDLERS   = window.CLICK_HANDLERS   || {};
window.AdminPageLoaders = window.AdminPageLoaders || {};
