/******************************
 * Utils
 ******************************/

/**
 * Safely grabs the user's role from the onboarding data, defaulting to "User" if missing
 */
function formatRole_(onboarding) { 
  return onboarding.role || "User"; 
}

/**
 * Ensures the struggles variable is always an array, returning an empty one if it isn't
 */
function normalizeStruggles_(struggles) { 
  return Array.isArray(struggles) ? struggles : []; 
}

/**
 * Converts a struggle value into a guaranteed string format
 */
function formatStruggleLabel_(s) { 
  return String(s); 
}

/**
 * Grabs a saved event proposal from the user's properties to continue a previous action
 */
function getPendingProposal_() { 
  const raw = PropertiesService.getUserProperties().getProperty(PENDING_PROPOSAL_KEY_); return raw ? JSON.parse(raw) : null; 
}

/**
 * Saves a new event proposal to the user's properties so it isn't lost between clicks
 */
function savePendingProposal_(proposal) { 
  PropertiesService.getUserProperties().setProperty(PENDING_PROPOSAL_KEY_, JSON.stringify(proposal)); 
}

/**
 * Completely wipes out any saved event proposal from the user's properties
 */
function clearPendingProposal_() { 
  PropertiesService.getUserProperties().deleteProperty(PENDING_PROPOSAL_KEY_); 
}

/**
 * Safely encodes special characters like '&' and '<' to prevent HTML injection errors
 */
function escapeHtml_(s) { 
return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); 
}

/**
 * Validates HH:MM 24-hour format (e.g., 09:00, 21:30)
 * Uses a regular expression to check if a string is a valid 24-hour time format
 */
function isValidTime_(t) {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(t);
}

/**
 * Converts "HH:MM" into a Date object for today.
 * Takes a simple time string and turns it into a full JavaScript Date object for the current day
 */
function timeStringToDate_(timeStr) {
  const [hours, minutes] = timeStr.split(":").map(Number);
  const now = new Date();
  now.setHours(hours);
  now.setMinutes(minutes);
  now.setSeconds(0);
  now.setMilliseconds(0);
  return now;
}

/**
 * Formats a Date object nicely for UI display.
 * Takes a messy Date object and formats it cleanly for the user to read (like Mar 12, 09:00)
 */
function formatDateTime_(date) {
  return Utilities.formatDate(
    date,
    Session.getScriptTimeZone(),
    "MMM d, HH:mm"
  );
}

/**
 * Adds minutes to a Date object.
 * Takes a specific Date and pushes it forward in time by a given number of minutes
 */
function addMinutes_(date, minutes) {
  return new Date(date.getTime() + minutes * 60000);
}

/**
 * The main navigation function that cleans up old data and sends the user to the dashboard
 */
function goToHome() {
  // Run the cleanup sweep first!
  cleanExpiredFixedSchedules_();
  const prefs = getPrefs_();
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().updateCard(buildHomeCard_(prefs)))
    .build();
}

/**
 * Formats a Date (or date string) to YYYY-MM-DD in the script timezone.
 * Standardizes dates into a reliable year-month-day string format to avoid timezone issues
 */
function formatDateYMD_(dateLike) {
  if (!dateLike) return "";
  const tz = Session.getScriptTimeZone(); // e.g. America/Los_Angeles
  const d = (dateLike instanceof Date) ? dateLike : new Date(dateLike);
  return Utilities.formatDate(d, tz, "yyyy-MM-dd");
}

/**
 * Validates YYYY-MM-DD format.
 * Checks if a string perfectly matches the YYYY-MM-DD pattern using a regular expression
 */
function isValidDateYMD_(d) {
  return /^\d{4}-\d{2}-\d{2}$/.test(d);
}

/**
 * Removes fixed schedules that have passed their End Date.
 * Runs through the user's saved schedules and automatically deletes any that have expired
 */
function cleanExpiredFixedSchedules_() {
  const prefs = getPrefs_();
  if (!prefs || !prefs.fixedSchedules) return;

  const today = formatDateYMD_(new Date());
  
  const validSchedules = prefs.fixedSchedules.filter(schedule => {
    // If there is no end date, keep it forever
    if (!schedule.endDate) return true;
    
    // Keep it if the end date is today or in the future
    return schedule.endDate >= today;
  });

  // If we removed anything, save the updated prefs back to the Knowledge Bank
  if (validSchedules.length !== prefs.fixedSchedules.length) {
    prefs.fixedSchedules = validSchedules;
    savePrefs_(prefs);
  }
}

/**
 * Translates saved fixed schedules into a readable string for the Gemini prompt.
 * Bundles all the user's active schedules into a clean text list so the AI can understand them
 */
function formatFixedSchedulesForAI_(prefs) {
  if (!prefs || !prefs.fixedSchedules || !Array.isArray(prefs.fixedSchedules) || prefs.fixedSchedules.length === 0) {
    return "None";
  }

  const dayMap = { 1: "Mon", 2: "Tue", 3: "Wed", 4: "Thu", 5: "Fri", 6: "Sat", 7: "Sun" };
  
  // Only include schedules that are actually enabled
  const activeSchedules = prefs.fixedSchedules.filter(fs => fs.enabled !== false);

  if (activeSchedules.length === 0) {
    return "None";
  }

  // Format them nicely for the AI (e.g., "- 'Bio Lecture': Mon, Wed from 09:00 to 10:30")
  return activeSchedules.map(fs => {
    const title = fs.title || "Busy Block";
    const days = Array.isArray(fs.days) ? fs.days.map(d => dayMap[d] || d).join(", ") : "Unknown days";
    const start = fs.startTime || "??:??";
    const end = fs.endTime || "??:??";
    
    let endDateStr = "";
    if (fs.endDate) {
      endDateStr = ` (Valid until ${fs.endDate})`;
    }
    
    return `- '${title}': ${days} from ${start} to ${end}${endDateStr}`;
  }).join("\n");
}

/**
 * Digs into complex recurring event data to extract exactly when the event stops repeating
 */
function parseUntilFromRecurrence_(recurrenceArr) {
  if (!Array.isArray(recurrenceArr)) return "";

  const tz = Session.getScriptTimeZone(); // e.g. America/Los_Angeles
  const rule = recurrenceArr.find(r => String(r).startsWith("RRULE:"));
  if (!rule) return "";

  const m = String(rule).match(/UNTIL=([0-9TZ]+)/);
  if (!m) return "";

  const until = m[1];

  // Case A: UNTIL is date-only: YYYYMMDD (rare but valid)
  if (/^\d{8}$/.test(until)) {
    const y = +until.slice(0, 4);
    const mo = +until.slice(4, 6);
    const d = +until.slice(6, 8);
    const dt = new Date(Date.UTC(y, mo - 1, d, 12, 0, 0)); // midday UTC to avoid TZ edge
    return Utilities.formatDate(dt, tz, "yyyy-MM-dd");
  }

  // Case B: UNTIL is date-time: YYYYMMDDTHHMMSSZ
  const mm = until.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
  if (!mm) return "";

  const y = +mm[1], mo = +mm[2], d = +mm[3];
  const hh = +mm[4], mi = +mm[5], ss = +mm[6];

  const dtUTC = new Date(Date.UTC(y, mo - 1, d, hh, mi, ss));
  return Utilities.formatDate(dtUTC, tz, "yyyy-MM-dd");
}

/**
 * A quick wrapper to convert an ISO date string into our standard year-month-day format
 */
function ymdFromIsoDate_(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return formatDateYMD_(d); // we already use formatDateYMD_ elsewhere
}

/**
 * Converts raw calendar suggestions into formatted, enabled objects ready to be saved
 */
function candidatesToFixedSchedules_(candidates) {
  const arr = Array.isArray(candidates) ? candidates : [];
  return arr.map(c => ({
    title: String(c.title || ""),
    days: Array.isArray(c.days) ? c.days.map(Number) : [],
    startTime: String(c.startTime || ""),
    endTime: String(c.endTime || ""),
    endDate: String(c.endDate || ""), // if you have it
    enabled: true,
    source: "calendar_detected" // 
  }));
}

/**
 * Cleans up titles by making them lowercase and stripping out weird extra spaces
 */
function normalizeTitle_(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Updates the draft memory when the user checks or unchecks boxes on the struggles step
 */
function onOnboardingStrugglesChanged(e) {
  const draft = getOnboardingDraft_() || {};
  const form = e.formInput || {};
  const formInputs = e.formInputs || {};

  // Reliably capture the exact array of checked items
  draft.struggles = getFieldValues_(form, formInputs, "struggles");

  saveOnboardingDraft_(draft);

  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().updateCard(buildOnboardingStepCard_(5, draft).build()))
    .build();
}

/**
 * An advanced helper that safely digs through complex form objects to extract chosen values
 */
function getFieldValues_(form, formInputs, fieldName) {
  // Newer event shape: formInputs[field].stringInputs.value = [...]
  const fi = formInputs && formInputs[fieldName];
  if (fi && fi.stringInputs && Array.isArray(fi.stringInputs.value)) {
    return fi.stringInputs.value.map(String).map(s => s.trim()).filter(Boolean);
  }

  // Some cases: formInputs[field] is already an array
  if (Array.isArray(fi)) {
    return fi.map(String).map(s => s.trim()).filter(Boolean);
  }

  // Fallback: form[field] might be array or string
  const f = form && form[fieldName];
  if (Array.isArray(f)) return f.map(String).map(s => s.trim()).filter(Boolean);
  if (typeof f === "string" && f.trim()) return [f.trim()];

  return [];
}

/**
 * Takes the time picker widget's output object and safely formats it back into HH:MM
 */
function extractTimeFromPicker_(timeObj) {
  if (!timeObj) return "";
  // In case it comes back as a string fallback
  if (typeof timeObj === "string") return timeObj; 
  
  const h = timeObj.hours || 0;
  const m = timeObj.minutes || 0;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Takes the date picker widget's messy epoch timestamp and formats it into a safe UTC date string
 */
function extractDateFromPicker_(dateObj) {
  if (!dateObj || !dateObj.msSinceEpoch) return "";
  const d = new Date(Number(dateObj.msSinceEpoch));
  // Use UTC to prevent timezone shifting on the saved date
  return Utilities.formatDate(d, "UTC", "yyyy-MM-dd");
}

/**
 * Helper to scrub temporary blocks off the calendar
 * Safely deletes placeholder calendar events if the user cancels or restarts a process
 */
function cleanupGhostEvents_(pending) {
  if (pending && pending.action === "create_event" && Array.isArray(pending.proposals)) {
    pending.proposals.forEach(p => {
      if (p.previewEventId) {
        try {
          Calendar.Events.remove(p.calendarId || "primary", p.previewEventId);
        } catch(e) { /* Ignore if already deleted */ }
      }
    });
  }
}

/**
 * Generates a consistent Google Calendar Color based on the Event Title,
 * Bio Lab will always be the same color, Gym will be a different color.
 * Uses math to turn a title string into a consistent number, assigning a fixed color for that specific title
 */
function getColorForTitle_(title) {
  const text = String(title || "Event").trim().toLowerCase();
  // Google Calendar valid color IDs (excluding 8 which is our Grey Ghost color)
  const palette = ["1", "2", "3", "4", "5", "6", "7", "9", "10", "11"]; 
  
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = text.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  // Pick a color from the palette based on the math
  const colorIndex = Math.abs(hash) % palette.length;
  return palette[colorIndex];
}

/**
 * Smart Time Formatter: Replaces the specific date with the Recurrence rules!
 * Checks if an event repeats and creates a custom, easy-to-read label summarizing its schedule
 */
function formatTimeLabel_(p, start, end) {
  const t1 = start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const t2 = end.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  
  const isRecurring = p.rrule || (p.recurrence && p.recurrence.length > 0);
  
  // IF NOT RECURRING: Just show the normal date! (e.g., "Thu, Mar 12 • 10:00 AM–11:00 AM")
  if (!isRecurring) {
    const date = start.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
    return `${date} • ${t1}–${t2}`;
  }

  // IF RECURRING: Swap the date for the recurring rules!
  const ruleStr = String(p.rrule || p.recurrence[0] || "");
  let daysStr = "";
  const byDayMatch = ruleStr.match(/BYDAY=([^;]+)/);
  if (byDayMatch) {
    const dayMap = { "SU": "Sun", "MO": "Mon", "TU": "Tue", "WE": "Wed", "TH": "Thu", "FR": "Fri", "SA": "Sat" };
    daysStr = byDayMatch[1].split(',').map(d => dayMap[d] || d).join(", ");
  } else if (ruleStr.includes("FREQ=WEEKLY")) {
    daysStr = Utilities.formatDate(start, Session.getScriptTimeZone(), "EEE");
  } else if (ruleStr.includes("FREQ=DAILY")) {
    daysStr = "every day";
  }

  let untilStr = "forever";
  const untilMatch = ruleStr.match(/UNTIL=(\d{4})(\d{2})(\d{2})/);
  if (untilMatch) {
    untilStr = `${untilMatch[2]}/${untilMatch[3]}/${untilMatch[1]}`;
  }

  if (daysStr) {
    return `Recurring on ${daysStr} until ${untilStr} • ${t1}–${t2}`;
  }
  return `Recurring until ${untilStr} • ${t1}–${t2}`;
}