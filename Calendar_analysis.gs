// Looks at the next 6 weeks of calendar events and finds possible fixed schedules.
// It groups events with the same title and time, then keeps the ones that repeat at least twice.
function analyzeFixedScheduleCandidates_() {
  // Scan next 6 weeks
  const now = new Date();
  const timeMin = now.toISOString();
  const timeMax = new Date(now.getTime() + 42 * 24 * 60 * 60 * 1000).toISOString();

  // Expand recurring events into instances
  const events = Calendar.Events.list("primary", {
    timeMin,
    timeMax,
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 2500
  });

  const items = (events && events.items) ? events.items : [];

  // Group by (normalized title + day-of-week + startTime + durationMinutes)
  const groups = new Map();

  items.forEach(ev => {
    if (!ev.start) return;
    const startIso = ev.start.dateTime;
    const endIso = ev.end && ev.end.dateTime;
    if (!startIso || !endIso) return; // skip all-day

    const title = (ev.summary || "").trim();
    if (!title) return;

    const start = new Date(startIso);
    const end = new Date(endIso);

    const dow = jsDowToMon1_(start.getDay());
    const startTime = toHHMM_(start);
    const endTime = toHHMM_(end);
    const durationMin = Math.round((end.getTime() - start.getTime()) / 60000);

    const key = `${normalizeTitle_(title)}|${startTime}|${durationMin}`;
    const recurringId = ev.recurringEventId || "";

    const g = groups.get(key) || {
      title,
      days: new Set(),
      startTime,
      endTime,
      durationMin,
      count: 0,
      lastDetectedDate: start,
      recurringEventId: recurringId
    };
    // if the group existed but didn't have it yet, fill it in
    if (!g.recurringEventId && recurringId) g.recurringEventId = recurringId;

    g.count += 1;
    g.days.add(dow);
    
    //Update to the latest date seen in the scan
    if (start > g.lastDetectedDate) {
      g.lastDetectedDate = start;
    }

    groups.set(key, g);
  });

  // Candidate rule: appears >= 2 times in scan window
  const candidates = [];
  for (const g of groups.values()) {
    if (g.count >= 2) {

      let endDate = "";

      if (g.recurringEventId) {
        try {
          const master = Calendar.Events.get("primary", g.recurringEventId);
          endDate = parseUntilFromRecurrence_(master.recurrence);
        } catch (e) {
          // ignore
        }
      }

      // fallback: last seen instance in scan window
      if (!endDate) endDate = formatDateYMD_(g.lastDetectedDate);

      candidates.push({
        title: g.title,
        days: Array.from(g.days).sort(),
        startTime: g.startTime,
        endTime: g.endTime,
        count: g.count,
        endDate, 
        lastDetectedDate: formatDateYMD_(g.lastDetectedDate)
      });
    }
  }

  // Sort: more frequent first
  candidates.sort((a, b) => (b.count - a.count));

  return candidates;
}

// Makes the title lowercase and removes extra spaces so similar titles match better.
function normalizeTitle_(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// Changes a Date object into HH:mm format.
function toHHMM_(d) {
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

// Changes JavaScript day numbers so Monday = 1 and Sunday = 7.
function jsDowToMon1_(jsDow) {
  if (jsDow === 0) return 7;
  return jsDow;
}

// Changes an array of day numbers into labels like Mon, Tue, Wed.
function formatDays_(days) {
  const arr = Array.isArray(days) ? days : [];
  return arr.map(dowLabel_).join(", ");
}

// Changes an array of day numbers into a short comma-separated string.
function formatDaysCsv_(days) {
  const arr = Array.isArray(days) ? days : [];
  return arr.map(dowShort_).join(",");
}

// Changes a comma-separated day string like "mon,wed,fri" into day numbers.
function parseDaysCsv_(csv) {
  const raw = String(csv || "");
  const parts = raw.split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
  const map = { mon:1, tue:2, wed:3, thu:4, fri:5, sat:6, sun:7 };
  const out = [];
  parts.forEach(p => {
    const k = p.slice(0, 3);
    if (map[k] && !out.includes(map[k])) out.push(map[k]);
  });
  return out.sort();
}

// Returns the short label for a day number.
function dowLabel_(n) {
  const map = {1:"Mon",2:"Tue",3:"Wed",4:"Thu",5:"Fri",6:"Sat",7:"Sun"};
  return map[n] || String(n);
}
// Returns the short day label.
function dowShort_(n) { return dowLabel_(n); }

// Checks if a fixed schedule candidate should still be kept.
function isCandidateKept_(draft, idx) {
  // default keep = true unless user saved settings otherwise
  const kept = draft.fixedSchedules;
  if (!Array.isArray(kept)) return true;
  const c = (Array.isArray(draft.fixedScheduleCandidates) ? draft.fixedScheduleCandidates[idx] : null);
  if (!c) return true;

  // if user already confirmed, keep only if it matches something
  return kept.some(x => normalizeTitle_(x.title) === normalizeTitle_(c.title) && x.startTime === c.startTime);
}
