/******************************
 * Settings
 ******************************/

const SETTINGS_DRAFT_KEY_ = "settingsDraft";

/**
 * Opens the settings page and loads the current saved settings into a draft.
 */
function onOpenSettings() {
  const prefs = getPrefs_() || {};

  let draft = getSettingsDraft_();
  if (!draft) {
    draft = prefs.onboarding ? { ...prefs.onboarding } : {};
  }

  // ALWAYS refresh fixed schedules from prefs (source of truth)
  draft.fixedSchedules = normalizeFixedSchedules_(prefs.fixedSchedules || []);

  saveSettingsDraft_(draft);

  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().pushCard(buildSettingsCard_().build()))
    .build();
}

/**
 * Throws away any unsaved edits and takes you back to the previous screen
 */
function onCancelSettings() {
  clearSettingsDraft_();
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().popCard())
    .build();
}

/**
 * Builds the settings UI card with dropdowns, text fields, and current data
 */
function buildSettingsCard_(errorMessage) {
  const prefs = getPrefs_() || {};
  const draft = getSettingsDraft_() || (prefs.onboarding || {});
  const card = CardService.newCardBuilder()

    .setHeader(
      CardService.newCardHeader()
        .setTitle("Settings")
    );

  // Render error message
  if (errorMessage) {
    card.addSection(
      CardService.newCardSection()
        .addWidget(CardService.newTextParagraph().setText(`⚠️ ${escapeHtml_(String(errorMessage))}`))
    );
  }

  // Put the summary of their options
  const strugglesArr = normalizeStruggles_(draft.struggles);

  const hoursDisplay = (draft.hoursType === "flexible")
    ? `Flexible (${draft.hoursStart || "09:00"}–${draft.hoursEnd || "17:00"})`
    : formatHoursType_(draft);

  const summary = CardService.newCardSection()
    .addWidget(CardService.newTextParagraph().setText("<b><font color='#4b2e83'>About you</font></b>"))
    .addWidget(kvRow_("Primary role", humanizeEnum_(formatRole_(draft))))
    .addWidget(kvRow_("Working hours", humanizeEnum_(hoursDisplay)))
    .addWidget(kvRow_("Focus peak", humanizeEnum_(formatFocusTime_(draft.focusTime))))
    .addWidget(kvRow_("Work style", humanizeEnum_(formatWorkStyle_(draft.blockPreference))))
    .addWidget(kvRow_("Struggles", strugglesArr.length
      ? strugglesArr.map(formatStruggleLabel_).map(humanizeEnum_).join(", ")
      : "—"
    ))

  card.addSection(summary);

  // 1) Role
  card.addSection(
    CardService.newCardSection()
      .setHeader("Primary role")
      .setCollapsible(true)
      .setNumUncollapsibleWidgets(0)
      .addWidget(
        CardService.newSelectionInput()
          .setType(CardService.SelectionInputType.RADIO_BUTTON)
          .setFieldName("role")
          .addItem("Full-time student", "full_time_student", draft.role === "full_time_student")
          .addItem("Student + part-time work", "student_part_time", draft.role === "student_part_time")
          .addItem("Student-athlete", "student_athlete", draft.role === "student_athlete")
          .addItem("Caregiver + student", "caregiver_student", draft.role === "caregiver_student")
          .addItem("Working professional", "working_professional", draft.role === "working_professional")
          .addItem("Other", "other", draft.role === "other")
      )
      .addWidget(
        (draft.role === "other")
          ? CardService.newTextInput()
              .setFieldName("roleOther")
              .setTitle("Role (other)")
              .setValue(draft.roleOther || "")
          : CardService.newTextParagraph().setText("")
      )
  );

  // 2) Working hours
  const hoursSection = CardService.newCardSection()
    .setHeader("Working hours")
    .setCollapsible(true)
    .setNumUncollapsibleWidgets(0)
    .addWidget(
      CardService.newSelectionInput()
        .setType(CardService.SelectionInputType.RADIO_BUTTON)
        .setFieldName("hoursType")
        .addItem("Fixed (e.g., 9–5)", "fixed", draft.hoursType === "fixed")
        .addItem("Flexible", "flexible", draft.hoursType === "flexible")
    );

  if (draft.hoursType === "flexible") {
    const [sH, sM] = (draft.hoursStart || "09:00").split(":").map(Number);
    const [eH, eM] = (draft.hoursEnd || "17:00").split(":").map(Number);

    hoursSection
      .addWidget(CardService.newDivider())
      .addWidget(helper_("Only needed for Flexible hours."))
      .addWidget(
        CardService.newTimePicker()
          .setFieldName("hoursStart")
          .setTitle("Start time")
          .setHours(sH || 9)
          .setMinutes(sM || 0)
      )
      .addWidget(
        CardService.newTimePicker()
          .setFieldName("hoursEnd")
          .setTitle("End time")
          .setHours(eH || 17)
          .setMinutes(eM || 0)
      );
  }

  card.addSection(hoursSection);

  // 3) Focus peak
  card.addSection(
    CardService.newCardSection()
      .setHeader("Focus peak")
      .setCollapsible(true)
      .setNumUncollapsibleWidgets(0)
      .addWidget(
        CardService.newSelectionInput()
          .setType(CardService.SelectionInputType.RADIO_BUTTON)
          .setFieldName("focusTime")
          .addItem("Morning (before 11am)", "morning", draft.focusTime === "morning")
          .addItem("Midday (11am–3pm)", "midday", draft.focusTime === "midday")
          .addItem("Afternoon (3pm–6pm)", "afternoon", draft.focusTime === "afternoon")
          .addItem("Evening (after 6pm)", "evening", draft.focusTime === "evening")
      )
  );

  // 4) Work style
  card.addSection(
    CardService.newCardSection()
      .setHeader("Work style")
      .setCollapsible(true)
      .setNumUncollapsibleWidgets(0)
      .addWidget(
        CardService.newSelectionInput()
          .setType(CardService.SelectionInputType.RADIO_BUTTON)
          .setFieldName("blockPreference")
          .addItem("Short (25–45 min)", "short", draft.blockPreference === "short")
          .addItem("Medium (45–120 min)", "medium", draft.blockPreference === "medium")
          .addItem("Long (2+ hours)", "long", draft.blockPreference === "long")
      )
  );

  // 5) Struggles 
  card.addSection(
    CardService.newCardSection()
      .setHeader("Scheduling struggles")
      .setCollapsible(true)
      .setNumUncollapsibleWidgets(0)
      .addWidget(helper_("Select any that regularly cause planning friction."))
      .addWidget(
        CardService.newSelectionInput()
          .setType(CardService.SelectionInputType.CHECK_BOX)
          .setFieldName("struggles")
          .addItem("Overbooking", "overbooking", strugglesArr.includes("overbooking"))
          .addItem("Procrastination", "procrastination", strugglesArr.includes("procrastination"))
          .addItem("Context switching", "context_switching", strugglesArr.includes("context_switching"))
          .addItem("Forgetting tasks", "forgetting_tasks", strugglesArr.includes("forgetting_tasks"))
          .addItem("Work-life balance", "work_life_balance", strugglesArr.includes("work_life_balance"))
      )
  );

  // 6) Fixed schedules
  card.addSection(buildFixedSchedulesSectionClean_(draft, prefs));

  // Fixed Footer
  const stickyFooter = CardService.newFixedFooter()
    .setPrimaryButton(
      CardService.newTextButton()
        .setText("Save")
        .setBackgroundColor("#4b2e83") // Keeps your premium purple theme
        .setOnClickAction(CardService.newAction().setFunctionName("onSaveSettings"))
    )
    .setSecondaryButton(
      CardService.newTextButton()
        .setText("Cancel")
        .setOnClickAction(CardService.newAction().setFunctionName("onCancelSettings"))
    );

  card.setFixedFooter(stickyFooter);

  return card;
}

/**
 * Builds the fixed schedules section in the settings page.
 */
function buildFixedSchedulesSectionClean_(draft, prefs) {
  const section = CardService.newCardSection()
    .setHeader("Fixed schedules")
    .setCollapsible(true)
    .setNumUncollapsibleWidgets(0)
    .addWidget(helper_("Blocks the AI will not move."));

  // Get the fixed schedules from draft first
  const fixedArr = normalizeFixedSchedules_(draft.fixedSchedules || prefs.fixedSchedules || []);

  // Show a message if there are no fixed schedules yet
  if (!fixedArr.length) {
    section.addWidget(CardService.newTextParagraph().setText("No fixed schedules yet."));
  }

  fixedArr.forEach((fs, idx) => {
    section
      .addWidget(CardService.newDivider())
      .addWidget(kvRow_(`Fixed schedule #${idx + 1}`, fs.title || "Untitled"))
      .addWidget(
        CardService.newSelectionInput()
          .setType(CardService.SelectionInputType.CHECK_BOX)
          .setFieldName(`fsEnabled_${idx}`)
          .addItem("Enabled", "1", fs.enabled !== false)
      )
      .addWidget(
        CardService.newTextInput()
          .setFieldName(`fsTitle_${idx}`)
          .setTitle("Title")
          .setValue(String(fs.title || ""))
      )
      .addWidget(
        CardService.newTextInput()
          .setFieldName(`fsDays_${idx}`)
          .setTitle("Days (Mon,Tue,Wed)")
          .setValue(formatDaysCsvFromNums_(fs.days))
      );

    const [fsStartH, fsStartM] = (fs.startTime || "09:00").split(":").map(Number);
    const [fsEndH, fsEndM] = (fs.endTime || "10:00").split(":").map(Number);

    section
      .addWidget(
        CardService.newTimePicker()
          .setFieldName(`fsStart_${idx}`)
          .setTitle("Start time")
          .setHours(fsStartH || 9)
          .setMinutes(fsStartM || 0)
      )
      .addWidget(
        CardService.newTimePicker()
          .setFieldName(`fsEnd_${idx}`)
          .setTitle("End time")
          .setHours(fsEndH || 10)
          .setMinutes(fsEndM || 0)
      );

    // Optional end date for the fixed schedule
    const datePicker = CardService.newDatePicker()
      .setFieldName(`fsEndDate_${idx}`)
      .setTitle("End date (optional)");

    if (fs.endDate) {
      const d = new Date(fs.endDate + "T12:00:00Z");
      if (!isNaN(d.getTime())) datePicker.setValueInMsSinceEpoch(d.getTime());
    }

    section.addWidget(datePicker);

    section.addWidget(
      // Button to remove this fixed schedule
      CardService.newTextButton()
        .setText("Remove")
        .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
        .setBackgroundColor("#d93025")
        .setOnClickAction(
          CardService.newAction()
            .setFunctionName("onRemoveFixedSchedule")
            .setParameters({ idx: String(idx) })
        )
    );
  });

  section
    .addWidget(CardService.newDivider())
    .addWidget(
      CardService.newTextButton()
        .setText("➕ Add fixed schedule")
        .setOnClickAction(CardService.newAction().setFunctionName("onAddFixedSchedule"))
    )
    .addWidget(CardService.newDivider())
    .addWidget(
      CardService.newTextParagraph().setText(
        "<b><font color='#4b2e83'>Rescan calendar</font></b><br/>Automatically detect recurring events from your calendar and add them as fixed schedules."
      )
    )
    .addWidget(
      CardService.newTextButton()
        .setText("Rescan calendar")
        .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
        .setBackgroundColor("#4b2e83") 
        .setOnClickAction(CardService.newAction().setFunctionName("onRescanFixedSchedules"))
    );

  return section;
}

/**
 * Builds a clean, two-line UI row showing a label on top and a value on the bottom
 */
function kvRow_(label, value) {
  return CardService.newKeyValue()
    .setTopLabel(label)
    .setContent(value ? String(value) : "—")
    .setMultiline(true); // This stops truncation
}

/**
 * Quickly wraps text in italics so it looks like a hint or helper note
 */
function helper_(text) {
  return CardService.newTextParagraph().setText(`<i>${escapeHtml_(String(text))}</i>`);
}

/**
 * Safely replaces weird characters so user inputs don't accidentally break the UI formatting
 */
function escapeHtml_(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Triggers an automatic scan of the user's calendar to find and save new recurring events
 */
function onRescanFixedSchedules(e) {
  const prefsBefore = getPrefs_() || {};
  const draft = getSettingsDraft_() || (prefsBefore.onboarding ? { ...prefsBefore.onboarding } : {});

  try {
    // Run scan
    const candidates = analyzeFixedScheduleCandidates_(); // uses Calendar.Events.list
    const detectedFixed = candidatesToFixedSchedules_(candidates);

    // Merge: keep manual, replace detected
    const merged = mergeRescanFixedSchedules_(
      prefsBefore.fixedSchedules || draft.fixedSchedules || [],
      detectedFixed
    );

    // Save prefs
    const updated = {
      ...prefsBefore,
      fixedSchedules: merged,
      onboarding: {
        ...(prefsBefore.onboarding || {}),
        fixedSchedules: merged
      },
      updatedAt: new Date().toISOString()
    };
    savePrefs_(updated);

    // Update draft so UI refresh
    draft.fixedSchedules = merged;
    saveSettingsDraft_(draft);

    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText(`Rescan complete ✅`))
      .setNavigation(CardService.newNavigation().updateCard(buildSettingsCard_().build()))
      .build();

  } catch (err) {
    Logger.log("Rescan failed:");
    Logger.log(err && err.stack ? err.stack : String(err));

    // Display the error inline
    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().updateCard(buildSettingsCard_("Rescan failed: " + (err.message || err)).build()))
      .build();
  }
}

/**
 * Updates the settings draft when the user changes something on the settings form.
 */
function onSettingsChoiceChanged(e) {
  const draft = getSettingsDraft_() || {};
  const form = e.formInput || {};
  const formInputs = e.formInputs || {};

  // Single selects
  if (form.role) {
    draft.role = String(form.role);
    if (draft.role !== "other") draft.roleOther = "";
  }
  if (typeof form.roleOther === "string") draft.roleOther = form.roleOther.trim();

  if (form.hoursType) draft.hoursType = String(form.hoursType);
  
  // Capture Start/End time
  if (form.hoursStart) draft.hoursStart = extractTimeFromPicker_(form.hoursStart);
  if (form.hoursEnd) draft.hoursEnd = extractTimeFromPicker_(form.hoursEnd);

  if (form.focusTime) draft.focusTime = String(form.focusTime);
  if (form.blockPreference) draft.blockPreference = String(form.blockPreference);

  // Checkbox Extraction
  let selectedStruggles = [];
  if (e.formInputs && e.formInputs.struggles) {
    selectedStruggles = e.formInputs.struggles; // Standard GAS array
  } else if (e.formInput && e.formInput.struggles) {
    selectedStruggles = e.formInput.struggles.split(","); // Fallback
  }
  
  draft.struggles = selectedStruggles.map(String).map(s => s.trim()).filter(Boolean);

  saveSettingsDraft_(draft);

  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().updateCard(buildSettingsCard_().build()))
    .build();
}

/**
 * Checks all settings for errors, saves them, and sends the user back to the dashboard
 */
function onSaveSettings(e) {
  const prefs = getPrefs_() || {};
  const draft = getSettingsDraft_() || {};
  const form = e.formInput || {};
  const formInputs = e.formInputs || {};

  // Get all the data
  draft.fixedSchedules = readFixedSchedulesFromForm_(draft.fixedSchedules || [], form);
  
  if (form.role) draft.role = String(form.role);
  if (typeof form.roleOther === "string") draft.roleOther = form.roleOther.trim();
  if (form.hoursType) draft.hoursType = String(form.hoursType);
  
  // Extract Flexible Hours from the native TimePicker widgets
  if (form.hoursStart) draft.hoursStart = extractTimeFromPicker_(form.hoursStart);
  if (form.hoursEnd) draft.hoursEnd = extractTimeFromPicker_(form.hoursEnd);

  if (form.focusTime) draft.focusTime = String(form.focusTime);
  if (form.blockPreference) draft.blockPreference = String(form.blockPreference);

  let selectedStruggles = [];
  if (e.formInputs && e.formInputs.struggles) {
    selectedStruggles = e.formInputs.struggles; 
  } else if (e.formInput && e.formInput.struggles) {
    selectedStruggles = e.formInput.struggles.split(","); 
  }
  draft.struggles = selectedStruggles.map(String).map(s => s.trim()).filter(Boolean);

  // Save the draft immediately
  saveSettingsDraft_(draft);

  // Run validations and show errors (if there are)
  const fixedValidated = validateFixedSchedules_(draft.fixedSchedules);
  if (!fixedValidated.ok) {
    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().updateCard(buildSettingsCard_(fixedValidated.message).build()))
      .build();
  }

  if (draft.role === "other") {
    if (!draft.roleOther) {
      return CardService.newActionResponseBuilder()
        .setNavigation(CardService.newNavigation().updateCard(buildSettingsCard_("Please specify your role for “Other”.").build()))
        .build();
    }
  }

  if (!draft.role) {
    return CardService.newActionResponseBuilder().setNavigation(CardService.newNavigation().updateCard(buildSettingsCard_("Please select your role.").build())).build();
  }
  if (!draft.hoursType) {
    return CardService.newActionResponseBuilder().setNavigation(CardService.newNavigation().updateCard(buildSettingsCard_("Please select your hours type.").build())).build();
  }
  
  if (draft.hoursType === "flexible") {
    if (!draft.hoursStart || !draft.hoursEnd) {
      return CardService.newActionResponseBuilder().setNavigation(CardService.newNavigation().updateCard(buildSettingsCard_("Please enter both start and end times.").build())).build();
    }
  }

  if (!draft.focusTime) {
    return CardService.newActionResponseBuilder().setNavigation(CardService.newNavigation().updateCard(buildSettingsCard_("Please select your focus time.").build())).build();
  }
  if (!draft.blockPreference) {
    return CardService.newActionResponseBuilder().setNavigation(CardService.newNavigation().updateCard(buildSettingsCard_("Please select your work style.").build())).build();
  }

  // Save to knowledge bank if everything is ok
  draft.fixedSchedules = fixedValidated.value;
  draft.struggles = normalizeStruggles_(draft.struggles);

  const derived = derivePrefsFromOnboarding_(draft);

  const updated = {
    ...prefs,
    hasCompletedOnboarding: true,
    focusMinutes: derived.focusMinutes,
    bufferMinutes: derived.bufferMinutes,
    earliestWorkTime: derived.earliestWorkTime,
    latestWorkTime: derived.latestWorkTime,
    fixedSchedules: draft.fixedSchedules,
    onboarding: {
      ...(prefs.onboarding || {}),
      ...draft,
      fixedSchedules: draft.fixedSchedules
    },
    updatedAt: new Date().toISOString()
  };

  savePrefs_(updated);
  clearSettingsDraft_();

  // Return Home
  const successCard = CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle("Settings Updated!"))
    .addSection(CardService.newCardSection()
      .addWidget(CardService.newImage().setImageUrl("https://placehold.co/600x200/4b2e83/FFFFFF?text=Preferences+Saved!&font=roboto"))
      .addWidget(CardService.newTextParagraph().setText(
        "<font color='#4b2e83'><b>Preferences Saved!</b></font><br><br>" +
        "Your scheduling preferences have been updated successfully."
      ))
      // Custom purple divider inline
      .addWidget(CardService.newImage().setImageUrl("https://placehold.co/600x6/4b2e83/4b2e83/png").setAltText("Divider"))
      .addWidget(
        CardService.newButtonSet().addButton(
          CardService.newTextButton()
            .setText("Back to Dashboard")
            .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
            .setBackgroundColor("#4b2e83")
            .setOnClickAction(CardService.newAction().setFunctionName("goToHome"))
        )
      )
    )
    .build();

  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().updateCard(successCard))
    .build();
}

/***************************************
 * Draft persistence
 ***************************************/

/**
 * Grabs the current unsaved settings draft out of local storage
 */
function getSettingsDraft_() {
  const raw = PropertiesService.getUserProperties().getProperty(SETTINGS_DRAFT_KEY_);
  if (!raw) return null;
  try { return JSON.parse(raw) || null; } catch (e) { return null; }
}

/**
 * Saves the current work-in-progress settings into local storage
 */
function saveSettingsDraft_(draft) {
  PropertiesService.getUserProperties().setProperty(SETTINGS_DRAFT_KEY_, JSON.stringify(draft || {}));
}

/**
 * Wipes out the temporary settings draft from storage entirely
 */
function clearSettingsDraft_() {
  PropertiesService.getUserProperties().deleteProperty(SETTINGS_DRAFT_KEY_);
}

/***************************************
 * Helpers
 ***************************************/

/**
 * Ensures struggles are in a neat array, converting messy strings if needed
 */
function normalizeStruggles_(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String).map(s => s.trim()).filter(Boolean);
  if (typeof value === "string") return value.split(",").map(s => s.trim()).filter(Boolean);
  return [];
}

/**
 * Turns the internal role data into clean display labels
 */
function formatRole_(onboarding) {
  const role = onboarding.role;
  if (!role) return "—";
  if (role === "other") return onboarding.roleOther ? `Other: ${onboarding.roleOther}` : "Other";
  const map = {
    full_time_student: "Full-time student",
    student_part_time: "Student + part-time work",
    student_athlete: "Student-athlete",
    caregiver_student: "Caregiver + student",
    working_professional: "Working professional",
  };
  return map[role] || role;
}

/**
 * Turns the internal hours type into display labels
 */
function formatHoursType_(onboarding) {
  const t = onboarding.hoursType;
  if (!t) return "—";
  return t === "fixed" ? "Fixed (e.g., 9–5)" : (t === "flexible" ? "Flexible" : t);
}

/**
 * Translates the internal focus time key into the full label text
 */
function formatFocusTime_(key) {
  const map = {
    morning: "Morning (before 11am)",
    midday: "Midday (11am - 3pm)",
    afternoon: "Afternoon (3pm - 6pm)",
    evening: "Evening (after 6pm)"
  };
  return map[key] || "—";
}

/**
 * Translates the internal work block size into the full label text
 */
function formatWorkStyle_(key) {
  const map = {
    short: "Short focused sessions (25–45 min)",
    medium: "Medium blocks (45–120 min)",
    long: "Long deep-work blocks (2+ hours)"
  };
  return map[key] || "—";
}

/**
 * Translates internal struggle keys into clean labels for the UI
 */
function formatStruggleLabel_(key) {
  const map = {
    overbooking: "Overbooking",
    procrastination: "Procrastination",
    context_switching: "Context switching",
    forgetting_tasks: "Forgetting tasks",
    work_life_balance: "Work-life balance"
  };
  return map[key] || key;
}

/**
 * Adds a brand new, empty fixed schedule slot for the user to fill out
 */
function onAddFixedSchedule() {
  const draft = getSettingsDraft_() || {};
  const fixedArr = normalizeFixedSchedules_(draft.fixedSchedules || []);

  // Push blank fields so the hints (HH:MM, e.g. Mon,Tue) show up naturally
  fixedArr.push({
    title: "",
    days: [],          
    startTime: "",
    endTime: "",
    enabled: true,
    source: "user_manual"
  });

  draft.fixedSchedules = fixedArr;
  saveSettingsDraft_(draft);

  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().updateCard(buildSettingsCard_().build()))
    .build();
}

/**
 * Deletes a specific fixed schedule slot from the list based on which "Remove" button was clicked
 */
function onRemoveFixedSchedule(e) {
  const idx = Number((e.parameters && e.parameters.idx) || "-1");
  const draft = getSettingsDraft_() || {};
  const fixedArr = normalizeFixedSchedules_(draft.fixedSchedules || []);

  if (idx >= 0 && idx < fixedArr.length) {
    fixedArr.splice(idx, 1);
    draft.fixedSchedules = fixedArr;
    saveSettingsDraft_(draft);
  }

  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().updateCard(buildSettingsCard_().build()))
    .build();
}

/**
 * Loops through fixed schedule data to guarantee every item is the correct data type
 */
function normalizeFixedSchedules_(value) {
  if (!value) return [];
  if (!Array.isArray(value)) return [];
  return value.map((x) => ({
    title: (x && x.title) ? String(x.title) : "",
    days: Array.isArray(x && x.days) ? x.days.map(Number).filter(n => n>=1 && n<=7) : [],
    startTime: (x && x.startTime) ? String(x.startTime) : "",
    endTime: (x && x.endTime) ? String(x.endTime) : "",
    endDate: (x && x.endDate) ? String(x.endDate) : "",
    enabled: (x && typeof x.enabled === "boolean") ? x.enabled : true,
    source: (x && x.source) ? String(x.source) : "user_manual" // default
  }));
}

/**
 * Converts an array of numbers into a readable string of days () "Mon,Tue")
 */
function formatDaysCsvFromNums_(days) {
  const map = {1:"Mon",2:"Tue",3:"Wed",4:"Thu",5:"Fri",6:"Sat",7:"Sun"};
  const arr = Array.isArray(days) ? days : [];
  return arr.map(n => map[n] || String(n)).join(",");
}

/**
 * Converts a text string (like "Mon,Tue") back into an array of numbers (like [1, 2])
 */
function parseDaysCsvToNums_(csv) {
  const raw = String(csv || "");
  const parts = raw.split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
  const map = { mon:1, tue:2, wed:3, thu:4, fri:5, sat:6, sun:7 };
  const out = [];
  parts.forEach(p => {
    const k = p.slice(0,3);
    const n = map[k];
    if (n && !out.includes(n)) out.push(n);
  });
  return out.sort();
}

/**
 * Scrapes all the individual text inputs and time pickers from the form and bundles them into an array of objects
 */
function readFixedSchedulesFromForm_(currentFixed, form) {
  const fixedArr = normalizeFixedSchedules_(currentFixed || []);
  const out = [];

  for (let idx = 0; idx < fixedArr.length; idx++) {
    const base = fixedArr[idx];

    const enabledRaw = form[`fsEnabled_${idx}`];
    const enabled = Array.isArray(enabledRaw)
      ? enabledRaw.includes("1")
      : (typeof enabledRaw === "string" ? enabledRaw === "1" : false);

    const title = (form[`fsTitle_${idx}`] ?? base.title ?? "").toString().trim();
    const daysCsv = (form[`fsDays_${idx}`] ?? formatDaysCsvFromNums_(base.days)).toString().trim();
    
    // Extract from the new widgets
    const startTime = extractTimeFromPicker_(form[`fsStart_${idx}`]) || base.startTime || "";
    const endTime = extractTimeFromPicker_(form[`fsEnd_${idx}`]) || base.endTime || "";
    const endDate = extractDateFromPicker_(form[`fsEndDate_${idx}`]) || base.endDate || "";

    out.push({
      title,
      days: parseDaysCsvToNums_(daysCsv),
      startTime,
      endTime,
      endDate,
      enabled,
      source: base.source || "user_manual"
    });
  }

  return out;
}

/**
 * Reviews the user's saved schedules and blocks the save if titles, times, or days are missing or formatted wrong
 */
function validateFixedSchedules_(fixedArr) {
  const cleaned = [];
  const arr = normalizeFixedSchedules_(fixedArr || []);

  for (let i = 0; i < arr.length; i++) {
    const fs = arr[i];

    if (!fs.enabled) {
      cleaned.push(fs);
      continue;
    }

    if (!fs.title) return { ok: false, message: `Fixed schedule #${i+1}: please enter a title.` };
    if (!Array.isArray(fs.days) || fs.days.length === 0) return { ok: false, message: `Fixed schedule #${i+1}: please enter at least one day (e.g., Mon,Wed).` };
    if (!isValidTime_(fs.startTime) || !isValidTime_(fs.endTime)) return { ok: false, message: `Fixed schedule #${i+1}: use HH:MM for start/end (e.g., 09:00).` };
    if (fs.endDate && !isValidDateYMD_(fs.endDate)) {
      return { ok: false, message: `Fixed schedule #${i+1}: End Date must be YYYY-MM-DD.` };
    }

    cleaned.push(fs);
  }

  return { ok: true, value: cleaned };
}

/**
 * Combines manual schedules with newly scanned calendar event
 */
function mergeRescanFixedSchedules_(existingFixed, newlyDetectedFixed) {
  const existing = normalizeFixedSchedules_(existingFixed || []);
  const detected = normalizeFixedSchedules_(newlyDetectedFixed || []).map(fs => ({
    ...fs,
    source: "calendar_detected"
  }));

  // Keep only manual schedules from the old list
  const manualKept = existing.filter(fs => fs.source !== "calendar_detected");

  // De-dupe so you don’t get duplicates if user manually recreated same block
  const key = (fs) => `${normalizeTitle_(fs.title)}|${(fs.days||[]).join(",")}|${fs.startTime}|${fs.endTime}`;

  const manualKeys = new Set(manualKept.map(key));
  const detectedDeduped = detected.filter(fs => !manualKeys.has(key(fs)));

  return [...manualKept, ...detectedDeduped];
}

/**
 * Takes text (like "full_time_student") and turns it into readable text (like "full time student")
 */
function humanizeEnum_(s) {
  return String(s || "—")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}