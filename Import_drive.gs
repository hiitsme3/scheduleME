/***************************************
 * import_drive.gs — Drive link import (Image/PDF) -> Gemini multimodal -> recurring proposals
 ***************************************/

const MAX_INLINE_BYTES_ = 3.5 * 1024 * 1024;
const DEFAULT_GEMINI_MULTIMODAL_MODEL_ = "gemini-2.5-flash";

/**
 * UI entry point
 */
function goToDriveImport_(e) {
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().pushCard(buildDriveImportCard_(e)))
    .build();
}

function onExtractScheduleFromDriveFile(e) {
  const form = (e && e.formInput) ? e.formInput : {};

  const input = (form.driveFile || "").trim();
  if (!input) {
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText("Paste a Google Drive file link or ID."))
      .build();
  }

  // Checks if the schedule should be repeated weekly
  const isWeeklyRecurring = isChecked_(form.isWeeklyRecurring);

  // Only require dates if recurring is ON
  const startDateStr = isWeeklyRecurring ? normalizeDatePicker_(form.bulkStartDate) : "";
  const endDateStr   = isWeeklyRecurring ? normalizeDatePicker_(form.bulkEndDate)   : "";

  if (isWeeklyRecurring && (!startDateStr || !endDateStr)) {
    console.error("DatePicker raw values:", form.bulkStartDate, form.bulkEndDate);
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText("Please select valid start and end dates for the weekly repeat."))
      .build();
  }

  const fileId = extractDriveFileId_(input);
  if (!fileId) {
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText("Could not detect a Drive file ID. Paste a valid Drive link or ID."))
      .build();
  }

  let blob, mimeType;
  try {
    const file = DriveApp.getFileById(fileId);
    blob = file.getBlob();
    mimeType = blob.getContentType();
  } catch (err) {
    console.error("DriveApp access error:", err);
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText("Could not access that Drive file. Check sharing permissions."))
      .build();
  }

  const isImage = mimeType && mimeType.toLowerCase().startsWith("image/");
  const isPdf = mimeType === MimeType.PDF || mimeType === "application/pdf";
  if (!isImage && !isPdf) {
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText("Unsupported file type. Use an image (PNG/JPG) or a PDF."))
      .build();
  }

  const bytes = blob.getBytes();
  if (bytes.length > MAX_INLINE_BYTES_) {
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText("File too large. Upload a smaller file or paste a screenshot image instead."))
      .build();
  }

  try {
    const parsed = callGeminiScheduleFromMedia_(bytes, mimeType, isWeeklyRecurring);

    const tz = Session.getScriptTimeZone();

    // Only parse date range if recurring is ON
    const startDate = isWeeklyRecurring ? parseYMD_(startDateStr) : null;
    const endDate   = isWeeklyRecurring ? parseYMD_(endDateStr)   : null;

    const proposals = (parsed.events || [])
      .filter(ev => ev && ev.title && ev.startISO && ev.endISO)
      .map(ev => {
        if (isWeeklyRecurring) {
          const first = computeFirstOccurrenceFromISO_(ev.startISO, ev.endISO, startDate, tz);
          const byDay = isoToByDay_(ev.startISO);
          const rrule = buildWeeklyRRule_([byDay], endDate);

          return {
            calendarId: "primary",
            title: ev.title,
            newStartISO: first.startISO,
            newEndISO: first.endISO,
            recurrence: [rrule],
            description: ev.description || "",
            location: ev.location || ""
          };
        }

        // If NOT recurring: schedule a single event at the extracted datetime
        return {
          calendarId: "primary",
          title: ev.title,
          newStartISO: ev.startISO,
          newEndISO: ev.endISO,
          recurrence: [], // or omit this field if your downstream code treats [] and undefined differently
          description: ev.description || "",
          location: ev.location || ""
        };
      });

    if (!proposals.length) {
      return CardService.newActionResponseBuilder()
        .setNotification(CardService.newNotification().setText("No events detected. Try a clearer image (include days/times)."))
        .build();
    }

    const proposalObj = {
      message: parsed.message || (
        isWeeklyRecurring
          ? `I detected ${proposals.length} weekly events. Review and confirm.`
          : `I detected ${proposals.length} events. Review and confirm.`
      ),
      action: "create_event",
      proposals
    };

    savePendingProposal_(proposalObj);

    const history = getChatHistory_();
    history.push({ role: "ai", text: proposalObj.message });
    saveChatHistory_(history);

    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText(`Detected ${proposals.length} events. Review below.`))
      .setNavigation(CardService.newNavigation().popToRoot().updateCard(buildChatCard_()))
      .build();

  } catch (err) {
    console.error("Drive import extraction failed:", err);
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText("Extraction failed: " + (err.message || err)))
      .build();
  }
}

/**
 * Gets the Google Drive file ID from a link or raw ID.
 */
function extractDriveFileId_(input) {
  const s = String(input || "").trim();
  const patterns = [
    /\/file\/d\/([a-zA-Z0-9-_]+)/,
    /\/open\?id=([a-zA-Z0-9-_]+)/,
    /[?&]id=([a-zA-Z0-9-_]+)/,
    /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/,
    /\/document\/d\/([a-zA-Z0-9-_]+)/,
    /\/presentation\/d\/([a-zA-Z0-9-_]+)/
  ];
  for (const re of patterns) {
    const m = s.match(re);
    if (m && m[1]) return m[1];
  }
  if (/^[a-zA-Z0-9-_]{20,}$/.test(s)) return s;
  return null;
}

/**
 * Function makes sure the date is in yyyy-MM-dd format.
 */
function normalizeDatePicker_(v) {
  if (!v) return "";
  const tz = Session.getScriptTimeZone();

  // Date object
  if (Object.prototype.toString.call(v) === "[object Date]" && !isNaN(v.getTime())) {
    return Utilities.formatDate(v, tz, "yyyy-MM-dd");
  }

  // String
  if (typeof v === "string") {
    const s = v.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const m = s.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    return s;
  }

  // Object forms (numbers OR numeric strings)
  if (typeof v === "object") {
    const y = Number(v.year);
    const m = Number(v.month);
    const d = Number(v.day);

    if (!isNaN(y) && !isNaN(m) && !isNaN(d) && y > 1900 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${String(y).padStart(4,"0")}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    }

    if (typeof v.msSinceEpoch === "number") {
      const dt = new Date(v.msSinceEpoch);
      if (!isNaN(dt.getTime())) return Utilities.formatDate(dt, tz, "yyyy-MM-dd");
    }
  }

  return "";
}

/**
 * Sends a schedule image/PDF to Gemini and asks it to extract events.
 */
function callGeminiScheduleFromMedia_(bytes, mimeType, isWeeklyRecurring) {
  const apiKey = PropertiesService.getScriptProperties().getProperty("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY not found in Script Properties.");

  const timezone = Session.getScriptTimeZone();
  const now = new Date();
  const b64 = Utilities.base64Encode(bytes);

  const mode = isWeeklyRecurring ? "WEEKLY_RECURRING" : "ONE_TIME";

  const prompt = `
  You are an AI scheduler.

  Extract calendar events from the provided schedule image/PDF.
  Return ONLY valid JSON. No markdown. No explanation.

  Current datetime: ${now.toISOString()}
  Timezone: ${timezone}
  Mode: ${mode}

  Output format:
  {
    "message": "string",
    "events": [
      {
        "title": "string",
        "startISO": "ISO 8601 datetime with timezone offset",
        "endISO": "ISO 8601 datetime with timezone offset",
        "location": "string (optional)",
        "description": "string (optional)"
      }
    ]
  }

  Rules:
  - startISO/endISO MUST include timezone offset.
  - Do not guess missing times.
  - Prefer fewer accurate events over many uncertain ones.
  - Titles should be concise (e.g., "BIO 101 Lecture", "Work Shift", "Chem Lab").

  Mode rules:
  - If Mode = ONE_TIME:
    - DO NOT assume the schedule repeats weekly.
    - Only output an event if the image/PDF provides an explicit calendar date (e.g., "Mar 12", "2026-03-12").
    - If no explicit date is present, return events: [] and set message explaining that a date is required for one-time scheduling.
  - If Mode = WEEKLY_RECURRING:
    - If the schedule shows days of week but no exact date, choose the NEXT occurrence from the current datetime.
  `;

  const payload = {
    contents: [
      {
        parts: [
          { text: prompt },
          { inlineData: { mimeType: mimeType, data: b64 } }
        ]
      }
    ],
    generationConfig: { temperature: 0.1 }
  };

  const model = DEFAULT_GEMINI_MULTIMODAL_MODEL_;
  const url = `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${apiKey}`;

  const response = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const code = response.getResponseCode();
  const text = response.getContentText();
  console.log("Gemini multimodal response code:", code);
  console.log("Gemini multimodal raw response:", text);

  if (code !== 200) throw new Error("Gemini API error: " + text);

  const resJson = JSON.parse(text);
  let aiText = resJson?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!aiText) throw new Error("No candidates returned from Gemini.");

  aiText = String(aiText).replace(/```json/g, "").replace(/```/g, "").trim();
  return JSON.parse(aiText);
}

/** Date + recurrence helpers */
function isoToByDay_(isoStr) {
  const d = new Date(isoStr);
  const map = ["SU","MO","TU","WE","TH","FR","SA"];
  return map[d.getDay()];
}

function parseYMD_(ymd) {
  const s = String(ymd || "").trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) throw new Error("Invalid date: " + s);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/**
 * Take extracted startISO/endISO,
 * and compute the first occurrence ON/AFTER userStart date that falls on the same weekday,
 * using the same time-of-day and duration.
 */
function computeFirstOccurrenceFromISO_(startISO, endISO, userStartDate, tz) {
  const extractedStart = new Date(startISO);
  const extractedEnd = new Date(endISO);
  if (isNaN(extractedStart.getTime()) || isNaN(extractedEnd.getTime())) {
    throw new Error("Bad ISO from extraction.");
  }

  const durationMs = extractedEnd.getTime() - extractedStart.getTime();
  const targetDow = extractedStart.getDay();
  const hour = extractedStart.getHours();
  const min = extractedStart.getMinutes();

  // Base date = user's chosen start date at extracted time
  const base = new Date(
    userStartDate.getFullYear(),
    userStartDate.getMonth(),
    userStartDate.getDate(),
    hour, min, 0
  );

  // Move forward to the target weekday (including same day)
  const delta = (targetDow - base.getDay() + 7) % 7;
  base.setDate(base.getDate() + delta);

  const end = new Date(base.getTime() + durationMs);

  return {
    startISO: Utilities.formatDate(base, tz, "yyyy-MM-dd'T'HH:mm:ssXXX"),
    endISO: Utilities.formatDate(end, tz, "yyyy-MM-dd'T'HH:mm:ssXXX")
  };
}

/** Helper function to build a weekly rule using the selected days and end date. */
function buildWeeklyRRule_(byDayArr, endDate) {
  const localEnd = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate(), 23, 59, 59);
  const untilUtc = Utilities.formatDate(localEnd, "UTC", "yyyyMMdd'T'HHmmss'Z'");
  const days = byDayArr.map(d => String(d).toUpperCase()).join(",");
  return `RRULE:FREQ=WEEKLY;BYDAY=${days};UNTIL=${untilUtc}`;
}

/**
 * Refreshes the Drive import card when the recurring option is changed.
 */
function onDriveRecurringToggle_(e) {
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().updateCard(buildDriveImportCard_(e)))
    .build();
}

/** Checks whether the checkbox is checked or not. */
function isChecked_(v) {
  if (v === true) return true;
  if (!v) return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "string") {
    const s = v.toLowerCase();
    return s === "true" || s === "yes" || s === "1";
  }
  return false;
}

/**
 * The Drive Import UI card.
 */
function buildDriveImportCard_(e) {
  const form = (e && e.formInput) ? e.formInput : {};
  const isWeeklyRecurring = isChecked_(form.isWeeklyRecurring);

  const section = CardService.newCardSection()
    .addWidget(
      CardService.newTextParagraph().setText(
        "Upload a <b>schedule screenshot</b> or <b>PDF</b> from Google Drive.<br/><br/> " +
        "I’ll extract the events and suggest them for review before creating anything.<br/><br/>" +
        "<b>Tips:</b><br/>" +
        "• Make sure the image shows <b>days + times</b><br/>" +
        "• For <b>Repeat weekly</b>, choose a start and end date"
      )
    )
    // Drive input
    .addWidget(
      CardService.newTextInput()
        .setFieldName("driveFile")
        .setTitle("Paste a Google Drive file link/ID here")
        .setValue(form.driveFile || "")
    );

  // Checkbox (single option)
  const checkbox = CardService.newSelectionInput()
    .setType(CardService.SelectionInputType.CHECK_BOX)
    .setFieldName("isWeeklyRecurring")
    .setTitle("Repeat weekly?")
    .setOnChangeAction(CardService.newAction().setFunctionName("onDriveRecurringToggle_"))
    .addItem("Yes, repeat weekly", "yes", isWeeklyRecurring);

  section.addWidget(checkbox);

  // Conditionally render date pickers only when checked
  if (isWeeklyRecurring) {
    section
      .addWidget(
        CardService.newDatePicker()
          .setFieldName("bulkStartDate")
          .setTitle("Recurring start date")
      )
      .addWidget(
        CardService.newDatePicker()
          .setFieldName("bulkEndDate")
          .setTitle("Recurring end date")
      );
  }

  // Extract button
  section.addWidget(
    CardService.newTextButton()
      .setText("Extract schedule")
      .setOnClickAction(CardService.newAction().setFunctionName("onExtractScheduleFromDriveFile"))
      .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
  );

  return CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle("Bulk Import Your Schedule"))
    .addSection(section)
    .build();
}