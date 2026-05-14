/***************************************
 * Onboarding Page
 ***************************************/

const ONBOARDING_TOTAL_STEPS = 6; 
const ONBOARDING_DRAFT_KEY = "onboardingDraft";

/**
 * Entry point: Intro Card
 * RETURNS: CardBuilder
 * Builds the very first welcome screen card
 */
function buildOnboardingIntroCard_() {
  // Hero Image
  const heroImage = CardService.newImage()
    .setImageUrl("https://placehold.co/600x200/4b2e83/FFFFFF/png?text=ScheduleMe!&font=roboto")
    .setAltText("Welcome");

  const startBtn = CardService.newTextButton()
    .setText("🚀 Get Started") 
    .setTextButtonStyle(CardService.TextButtonStyle.FILLED) 
    .setBackgroundColor("#4b2e83") 
    .setOnClickAction(CardService.newAction().setFunctionName("onStartOnboarding"));

  const skipBtn = CardService.newTextButton()
    .setText("Skip for now")
    .setTextButtonStyle(CardService.TextButtonStyle.OUTLINED) 
    .setOnClickAction(CardService.newAction().setFunctionName("onSkipOnboarding"));

  // Combined everything into a SINGLE section. 
  const mainSection = CardService.newCardSection()
    .addWidget(heroImage)
    .addWidget(CardService.newTextParagraph().setText(
      "<font color='#4b2e83'><b>Hi there! 👋</b></font><br>" + 
      "Answer a few quick questions so we can personalize scheduling to your life."
    ))
    .addWidget(CardService.newDecoratedText()
      .setText("Takes about 30–60 seconds")
      .setStartIcon(CardService.newIconImage().setIcon(CardService.Icon.CLOCK)))
    // Custom purple divider
    .addWidget(CardService.newImage().setImageUrl("https://placehold.co/600x6/4b2e83/4b2e83/png").setAltText("Divider"))
    .addWidget(CardService.newButtonSet().addButton(startBtn))
    .addWidget(CardService.newButtonSet().addButton(skipBtn));

  return CardService.newCardBuilder()
    .addSection(mainSection); 
}

/**
 * Step cards (1-6)
 * RETURNS: CardBuilder (NOT built yet)
 * Builds the step-by-step questions UI and handles the progress bar
 */
function buildOnboardingStepCard_(step, draft, errorMessage) {
  step = Number(step);
  draft = draft || getOnboardingDraft_();

  // Visual Progress Header
  const filled = "█".repeat(step);
  const empty  = "░".repeat(ONBOARDING_TOTAL_STEPS - step);
  const header = CardService.newCardHeader()
    .setTitle("ScheduleMe!")
    .setSubtitle(`Step ${step} of ${ONBOARDING_TOTAL_STEPS} • ${filled}${empty}`);

  const card = CardService.newCardBuilder().setHeader(header);
  
  // Inline Error Message
  if (errorMessage) {
    card.addSection(CardService.newCardSection()
      .addWidget(CardService.newTextParagraph().setText(`<font color="#D93025"><b>⚠️ ${errorMessage}</b></font>`))
    );
  }

  const section = CardService.newCardSection();

  // REMOVED the marker from here! 
  
  // --- STEP 1: ROLE ---
  if (step === 1) {
    section.addWidget(CardService.newImage()
      .setImageUrl("https://placehold.co/600x100/4b2e83/FFFFFF/png?text=Who+are+you%3F&font=roboto")
      .setAltText("Role Question"));

    section.addWidget(CardService.newTextParagraph().setText("<b>Which best describes your primary role right now?</b>"));

    const role = CardService.newSelectionInput()
      .setType(CardService.SelectionInputType.RADIO_BUTTON)
      .setFieldName("role")
      .setOnChangeAction(CardService.newAction().setFunctionName("onOnboardingChoiceChanged").setParameters({ step: "1" }))
      .addItem("Full-time student", "full_time_student", draft.role === "full_time_student")
      .addItem("Student + part-time work", "student_part_time", draft.role === "student_part_time")
      .addItem("Student-athlete", "student_athlete", draft.role === "student_athlete")
      .addItem("Caregiver + student", "caregiver_student", draft.role === "caregiver_student")
      .addItem("Working professional", "working_professional", draft.role === "working_professional")
      .addItem("Other", "other", draft.role === "other");

    section.addWidget(role);

    if (draft.role === "other") {
      section.addWidget(CardService.newTextInput()
        .setFieldName("roleOther")
        .setTitle("Please specify")
        .setHint("Type your role")
        .setValue(draft.roleOther || ""));
    }
  }

  // --- STEP 2: HOURS (NATIVE WIDGETS APPLIED) ---
  if (step === 2) {
    section.addWidget(CardService.newImage()
      .setImageUrl("https://placehold.co/600x100/4b2e83/FFFFFF/png?text=Your+Hours&font=roboto"));
    
    section.addWidget(CardService.newTextParagraph().setText("<b>What are your typical working hours?</b>"));

    const hoursType = CardService.newSelectionInput()
      .setType(CardService.SelectionInputType.RADIO_BUTTON)
      .setFieldName("hoursType")
      .setOnChangeAction(CardService.newAction().setFunctionName("onOnboardingChoiceChanged").setParameters({ step: "2" }))
      .addItem("Fixed (e.g., 9–5)", "fixed", draft.hoursType === "fixed")
      .addItem("Flexible (specify range)", "flexible", draft.hoursType === "flexible");

    section.addWidget(hoursType);

    if (draft.hoursType === "flexible") {
      section.addWidget(CardService.newTextParagraph().setText("<i>Select your preferred times:</i>"));
      
      const [sH, sM] = (draft.hoursStart || "09:00").split(":").map(Number);
      const [eH, eM] = (draft.hoursEnd || "17:00").split(":").map(Number);

      const startInput = CardService.newTimePicker()
        .setFieldName("hoursStart")
        .setTitle("Start Time")
        .setHours(sH || 9).setMinutes(sM || 0);

      const endInput = CardService.newTimePicker()
        .setFieldName("hoursEnd")
        .setTitle("End Time")
        .setHours(eH || 17).setMinutes(eM || 0);

      section.addWidget(startInput).addWidget(endInput);
    }
  }

  // --- STEP 3: FOCUS ---
  if (step === 3) {
    section.addWidget(CardService.newImage()
      .setImageUrl("https://placehold.co/600x100/4b2e83/FFFFFF/png?text=Focus+Time&font=roboto"));

    section.addWidget(CardService.newTextParagraph().setText("<b>When do you feel most focused?</b>"));

    const focusTime = CardService.newSelectionInput()
      .setType(CardService.SelectionInputType.RADIO_BUTTON)
      .setFieldName("focusTime")
      .addItem("Morning (before 11am)", "morning", draft.focusTime === "morning")
      .addItem("Midday (11am - 3pm)", "midday", draft.focusTime === "midday")
      .addItem("Afternoon (3pm - 6pm)", "afternoon", draft.focusTime === "afternoon")
      .addItem("Evening (after 6pm)", "evening", draft.focusTime === "evening");

    section.addWidget(focusTime);
  }

  // --- STEP 4: BLOCKS ---
  if (step === 4) {
    section.addWidget(CardService.newImage()
      .setImageUrl("https://placehold.co/600x100/4b2e83/FFFFFF/png?text=Work+Style&font=roboto"));

    section.addWidget(CardService.newTextParagraph().setText("<b>Do you prefer working in:</b>"));

    const blockPref = CardService.newSelectionInput()
      .setType(CardService.SelectionInputType.RADIO_BUTTON)
      .setFieldName("blockPreference")
      .addItem("Short focused sessions (25–45 min)", "short", draft.blockPreference === "short")
      .addItem("Medium blocks (45–120 min)", "medium", draft.blockPreference === "medium")
      .addItem("Long deep-work blocks (2+ hours)", "long", draft.blockPreference === "long");

    section.addWidget(blockPref);
  }

  // --- STEP 5: STRUGGLES ---
  if (step === 5) {
    section.addWidget(CardService.newImage()
      .setImageUrl("https://placehold.co/600x100/4b2e83/FFFFFF/png?text=The+Enemy&font=roboto"));

    section.addWidget(CardService.newTextParagraph().setText("<b>What’s your biggest scheduling struggle right now?</b> (Select all that apply)"));

    const selected = Array.isArray(draft.struggles) ? draft.struggles : [];
    const struggles = CardService.newSelectionInput()
      .setType(CardService.SelectionInputType.CHECK_BOX)
      .setFieldName("struggles")
      .setOnChangeAction(
        CardService.newAction()
          .setFunctionName("onOnboardingStrugglesChanged")
          .setParameters({ step: "5" })
      )
      .addItem("Overbooking", "overbooking", selected.includes("overbooking"))
      .addItem("Procrastination", "procrastination", selected.includes("procrastination"))
      .addItem("Context switching", "context_switching", selected.includes("context_switching"))
      .addItem("Forgetting tasks", "forgetting_tasks", selected.includes("forgetting_tasks"))
      .addItem("Work-life balance", "work_life_balance", selected.includes("work_life_balance"));

    section.addWidget(struggles);
  }

  // MOVED THE MARKER HERE
  // This appends it to the bottom of the section after all the question widgets
  if (step >= 3 && step < 6) {
    // Adding a subtle divider line
    section.addWidget(CardService.newImage().setImageUrl("https://placehold.co/600x6/4b2e83/4b2e83/png").setAltText("Divider"));
    
    section.addWidget(CardService.newDecoratedText()
      .setText(step === 5 ? "Last one!" : "Almost there!") 
      .setBottomLabel("Your preferences help the AI plan better.")
      .setStartIcon(CardService.newIconImage().setIcon(CardService.Icon.STAR)));
  }

  // ADD SECTIONS TO CARD
  if (step === 5) {
    card.addSection(section);
    // Collapsible explanation section for Step 5
    const helpSection = CardService.newCardSection()
      .setHeader("ℹ What do these mean?")
      .setCollapsible(true)
      .setNumUncollapsibleWidgets(0)
      .addWidget(
        CardService.newTextParagraph().setText(
          "<b>Overbooking:</b> Scheduling too many commitments in a short time.<br><br>" +
          "<b>Procrastination:</b> Delaying tasks even when they’re important.<br><br>" +
          "<b>Context switching:</b> Frequently jumping between tasks, which reduces deep focus.<br><br>" +
          "<b>Forgetting tasks:</b> Important tasks slipping through the cracks.<br><br>" +
          "<b>Work-life balance:</b> Difficulty separating work responsibilities from personal time."
        )
      );

    card.addSection(helpSection);
  }

  // --- STEP 6: SMART DETECTION (NATIVE WIDGETS APPLIED) ---
  if (step === 6) {
      const finalStepSection = CardService.newCardSection();
      
      finalStepSection.addWidget(CardService.newImage()
        .setImageUrl("https://placehold.co/600x100/4b2e83/FFFFFF/png?text=Smart+Detection+%F0%9F%94%8D&font=roboto")
        .setAltText("Smart Detection Header")
      );
      card.addSection(finalStepSection); 
    
    // Collapsible definition section
    const helpSection = CardService.newCardSection()
      .setHeader("ℹ What is a Fixed Schedule?")
      .setCollapsible(true)
      .setNumUncollapsibleWidgets(0)
      .addWidget(
        CardService.newTextParagraph().setText(
          "A <b>Fixed Schedule</b> means the AI cannot move this time block. It will always remain blocked off in your calendar until the end date. " +
          "No other tasks will be scheduled that overlap with this block. Think of it as a non-negotiable commitment that must be preserved."
        )
      );

      card.addSection(helpSection);

    if (!Array.isArray(draft.fixedScheduleCandidates)) {
      draft.fixedScheduleCandidates = typeof analyzeFixedScheduleCandidates_ === 'function' ? analyzeFixedScheduleCandidates_() : [];
      draft.fixedScheduleConfirmed = draft.fixedScheduleCandidates.map(c => ({ ...c }));
      saveOnboardingDraft_(draft);
    }

    const candidates = Array.isArray(draft.fixedScheduleCandidates) ? draft.fixedScheduleCandidates : [];

    if (!candidates.length) {
      section.addWidget(
        CardService.newTextParagraph().setText(
          "We couldn’t detect any recurring patterns in the next few weeks.<br/>" +
          "You can skip this step — we’ll still schedule around your existing events."
        )
      );
      card.addSection(section);
    } else {
      section.addWidget(
        CardService.newTextParagraph().setText(
         "<font color='#4b2e83'><b>We found these recurring events that look like fixed schedule. Please review them.</b></font>"
        )
      );
      card.addSection(section);

      candidates.slice(0, 8).forEach((c, idx) => {
        const title = String(c.title || "Untitled Event");
        const daysList = Array.isArray(c.days) ? c.days : [];
        const startTime = String(c.startTime || "09:00");
        const endTime = String(c.endTime || "10:00");
        const csvDays = typeof formatDaysCsv_ === 'function' ? String(formatDaysCsv_(daysList)) : "";
        
        const detectedEndDate = c.endDate || (c.lastDetectedDate ? formatDateYMD_(c.lastDetectedDate) : "");

        const displayTitle = title.toUpperCase();

        const candidateDetailsSection = CardService.newCardSection()
          .setHeader(`📌 ${displayTitle}`) 
          .setCollapsible(true)
          .setNumUncollapsibleWidgets(1);

        const keepCheckbox = CardService.newSelectionInput()
          .setType(CardService.SelectionInputType.CHECK_BOX)
          .setFieldName(`fixedKeep_${idx}`)
          .addItem("Keep as fixed schedule", "keep", isCandidateKept_(draft, idx));

        candidateDetailsSection.addWidget(keepCheckbox);

        candidateDetailsSection.addWidget(
          CardService.newTextInput()
            .setFieldName(`fixedTitle_${idx}`)
            .setTitle("Title")
            .setValue(title)
        );

        candidateDetailsSection.addWidget(
          CardService.newTextInput()
            .setFieldName(`fixedDays_${idx}`)
            .setTitle("Days (e.g., Mon,Tue)")
            .setValue(csvDays)
        );

        // NATIVE WIDGETS
        const [fsStartH, fsStartM] = startTime.split(":").map(Number);
        const [fsEndH, fsEndM] = endTime.split(":").map(Number);

        candidateDetailsSection.addWidget(
          CardService.newTimePicker()
            .setFieldName(`fixedStart_${idx}`)
            .setTitle("Start time")
            .setHours(fsStartH || 9)
            .setMinutes(fsStartM || 0)
        );

        candidateDetailsSection.addWidget(
          CardService.newTimePicker()
            .setFieldName(`fixedEnd_${idx}`)
            .setTitle("End time")
            .setHours(fsEndH || 10)
            .setMinutes(fsEndM || 0)
        );

        const datePicker = CardService.newDatePicker()
          .setFieldName(`fixedEndDate_${idx}`)
          .setTitle("End Date");

        if (detectedEndDate) {
          const d = new Date(detectedEndDate + "T12:00:00Z");
          if (!isNaN(d.getTime())) datePicker.setValueInMsSinceEpoch(d.getTime());
        }

        candidateDetailsSection.addWidget(datePicker);

        candidateDetailsSection.addWidget(CardService.newTextParagraph().setText("<font color='#888888'><i>*Once past the end date, the fixed schedule will be removed.</i></font>"));

        candidateDetailsSection.addWidget(
          CardService.newImage().setImageUrl("https://placehold.co/600x6/4b2e83/4b2e83/png").setAltText("Divider")
        );

        const saveBtn = CardService.newTextButton()
          .setText("Save Changes")
          .setTextButtonStyle(CardService.TextButtonStyle.FILLED) 
          .setBackgroundColor("#4b2e83") 
          .setOnClickAction(CardService.newAction()
            .setFunctionName("onSaveCandidateOnboarding")
            .setParameters({ idx: String(idx) })
          );

        candidateDetailsSection.addWidget(
          CardService.newButtonSet().addButton(saveBtn)
        );

        card.addSection(candidateDetailsSection);
      });
    }
  } else if (step !== 5) {
    card.addSection(section);
  }

  // Fixed Footer Navigation
  const footer = CardService.newFixedFooter();
  const isLast = step === ONBOARDING_TOTAL_STEPS;

  const nextBtn = CardService.newTextButton()
    .setText(isLast ? "Finish" : "Next ➔")
    .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
    .setBackgroundColor("#4b2e83")
    .setOnClickAction(
      CardService.newAction()
        .setFunctionName(isLast ? "onFinishOnboarding" : "onNextOnboarding")
        .setParameters({ step: String(step) })
        .setPersistValues(true)
    );

  footer.setPrimaryButton(nextBtn);

  if (step > 1) {
    const backBtn = CardService.newTextButton()
      .setText("⬅ Back")
      .setOnClickAction(
        CardService.newAction()
          .setFunctionName("onBackOnboarding")
          .setParameters({ step: String(step) })
      );
    footer.setSecondaryButton(backBtn);
  }

  card.setFixedFooter(footer);

  return card;
}

/***************************************
 * Handlers
 ***************************************/

/**
 * Clears old draft data and starts the onboarding at step 1
 */
function onStartOnboarding(e) {
  PropertiesService.getUserProperties().deleteProperty("onboardingDraft");
  return CardService.newActionResponseBuilder()
    .setNavigation(
      CardService.newNavigation().updateCard(buildOnboardingStepCard_(1).build())
    )
    .build();
}

/**
 * Takes the user back to the previous question step
 */
function onBackOnboarding(e) {
  const step = Number((e.parameters && e.parameters.step) || "1");
  const prev = Math.max(1, step - 1);
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().updateCard(buildOnboardingStepCard_(prev).build()))
    .build();
}

/**
 * Saves current answers and moves to the next question step
 */
function onNextOnboarding(e) {
  const step = Number((e.parameters && e.parameters.step) || "1");
  const draft = getOnboardingDraft_();
  const form = e.formInput || {};
  const formInputs = e.formInputs || {};

  const validation = applyStepInputToDraft_(step, form, formInputs, draft);
  if (!validation.ok) {
    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().updateCard(buildOnboardingStepCard_(step, draft, validation.message).build()))
      .build();
  }

  saveOnboardingDraft_(draft);

  const next = Math.min(ONBOARDING_TOTAL_STEPS, step + 1);
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().updateCard(buildOnboardingStepCard_(next, draft).build()))
    .build();
}

/**
 * Saves changes made to the detected schedule candidates in step 6
 */
function onSaveCandidateOnboarding(e) {
  const draft = getOnboardingDraft_();
  const form = e.formInput || {};
  const idx = Number((e.parameters && e.parameters.idx) || "0");

  if (draft.fixedScheduleCandidates && draft.fixedScheduleCandidates[idx]) {
    const c = draft.fixedScheduleCandidates[idx];

    if (form[`fixedTitle_${idx}`] !== undefined) {
      c.title = form[`fixedTitle_${idx}`].trim();
    }
    if (form[`fixedDays_${idx}`] !== undefined) {
      const parts = form[`fixedDays_${idx}`].split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
      const map = { mon:1, tue:2, wed:3, thu:4, fri:5, sat:6, sun:7 };
      const out = [];
      parts.forEach(p => {
        const k = p.slice(0, 3);
        if (map[k] && !out.includes(map[k])) out.push(map[k]);
      });
      c.days = out.sort();
    }
    
    // NATIVE WIDGET EXTRACTION
    if (form[`fixedStart_${idx}`] !== undefined) {
      c.startTime = extractTimeFromPicker_(form[`fixedStart_${idx}`]);
    }
    if (form[`fixedEnd_${idx}`] !== undefined) {
      c.endTime = extractTimeFromPicker_(form[`fixedEnd_${idx}`]);
    }
    if (form[`fixedEndDate_${idx}`] !== undefined) {
      c.endDate = extractDateFromPicker_(form[`fixedEndDate_${idx}`]);
    }
  }

  saveOnboardingDraft_(draft);

  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().updateCard(buildOnboardingStepCard_(6, draft).build()))
    .setNotification(CardService.newNotification().setText("Schedule updated!"))
    .build();
}

/**
 * Validates final step, saves all settings, and shows the success screen
 */
function onFinishOnboarding(e) {
  const step = Number((e.parameters && e.parameters.step) || String(ONBOARDING_TOTAL_STEPS));
  const draft = getOnboardingDraft_();
  const form = e.formInput || {};
  const formInputs = e.formInputs || {};

  const validation = applyStepInputToDraft_(step, form, formInputs, draft);
  if (!validation.ok) {
    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().updateCard(buildOnboardingStepCard_(step, draft, validation.message).build()))
      .build();
  }

  const derived = derivePrefsFromOnboarding_(draft);

  const prefs = {
    hasCompletedOnboarding: true,
    focusMinutes: derived.focusMinutes,
    bufferMinutes: derived.bufferMinutes,
    earliestWorkTime: derived.earliestWorkTime,
    latestWorkTime: derived.latestWorkTime,
    fixedSchedules: Array.isArray(draft.fixedSchedules) ? draft.fixedSchedules : [],
    onboarding: draft,
    updatedAt: new Date().toISOString()
  };

  savePrefs_(prefs);
  clearOnboardingDraft_();

  const successCard = CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle("Success")) 
    .addSection(CardService.newCardSection()
      .addWidget(CardService.newImage().setImageUrl("https://placehold.co/600x200/4b2e83/FFFFFF?text=You're+Ready!&font=roboto"))
      .addWidget(CardService.newTextParagraph().setText(
        "<font color='#4b2e83'><b>All set! 🥳</b></font><br><br>" +
        "<b>Boom!</b> Your AI Scheduler is configured and ready to help you crush your goals."
      ))
      .addWidget(CardService.newImage().setImageUrl("https://placehold.co/600x6/4b2e83/4b2e83/png").setAltText("Divider"))
      .addWidget(
        CardService.newButtonSet().addButton(
          CardService.newTextButton()
            .setText("Go to Dashboard")
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

/**
 * Redirects the user back to the main app dashboard
 */
function goToHome() {
  cleanExpiredFixedSchedules_();
  const prefs = getPrefs_();
  return CardService.newActionResponseBuilder()
    // 🐛 FIX: I removed the .build() at the end of buildHomeCard_(prefs) right here
    .setNavigation(CardService.newNavigation().updateCard(buildHomeCard_(prefs)))
    .build();
}

/**
 * Updates the temporary draft when a radio button or checkbox is clicked
 */
function onOnboardingChoiceChanged(e) {
  const step = Number((e.parameters && e.parameters.step) || "1");
  const draft = getOnboardingDraft_();
  const form = e.formInput || {};

  if (step === 1 && form.role) {
    draft.role = String(form.role);
    if (draft.role !== "other") draft.roleOther = "";
  }
  if (step === 2 && form.hoursType) {
    draft.hoursType = String(form.hoursType);
    if (draft.hoursType !== "flexible") {
      draft.hoursStart = "";
      draft.hoursEnd = "";
    }
  }

  saveOnboardingDraft_(draft);

  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().updateCard(buildOnboardingStepCard_(step, draft).build()))
    .build();
}

/**
 * Skips the setup, applies default 9-to-5 settings, and goes to dashboard
 */
function onSkipOnboarding() {
  const prefs = {
    hasCompletedOnboarding: true,
    focusMinutes: 60,
    bufferMinutes: 0,
    earliestWorkTime: "09:00",
    latestWorkTime: "21:00",
    onboarding: { skipped: true },
    updatedAt: new Date().toISOString()
  };

  savePrefs_(prefs);
  clearOnboardingDraft_();

  const skipSuccessCard = CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle("Using Defaults 🛠️"))
    .addSection(CardService.newCardSection()
      .addWidget(CardService.newImage()
        .setImageUrl("https://placehold.co/600x200/4b2e83/FFFFFF?text=Standard+Setup+Applied&font=roboto"))
      .addWidget(CardService.newTextParagraph()
        .setText("No worries! We've applied our standard 9-to-5 settings for now. You can customize these anytime in Settings."))
      .addWidget(CardService.newImage().setImageUrl("https://placehold.co/600x6/4b2e83/4b2e83/png").setAltText("Divider"))
      .addWidget(
        CardService.newButtonSet().addButton(
          CardService.newTextButton()
            .setText("Go to Dashboard")
            .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
            .setBackgroundColor("#4b2e83")
            .setOnClickAction(CardService.newAction().setFunctionName("goToHome"))
        )
      )
    )
    .build();

  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().updateCard(skipSuccessCard))
    .build();
}

/**
 * Deletes all saved data and restarts the onboarding from scratch
 */
function onResetOnboarding() {
  PropertiesService.getUserProperties().deleteProperty("knowledgeBank");
  clearOnboardingDraft_();
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().updateCard(buildOnboardingIntroCard_().build()))
    .build();
}

/***************************************
 * Draft persistence helpers
 ***************************************/

/**
 * Gets the temporary onboarding draft from user properties
 */
function getOnboardingDraft_() {
  const raw = PropertiesService.getUserProperties().getProperty(ONBOARDING_DRAFT_KEY);
  if (!raw) return {};
  try { return JSON.parse(raw) || {}; } catch (e) { return {}; }
}

/**
 * Saves the current onboarding draft into user properties
 */
function saveOnboardingDraft_(draft) {
  PropertiesService.getUserProperties().setProperty(ONBOARDING_DRAFT_KEY, JSON.stringify(draft || {}));
}

/**
 * Clears out the onboarding draft from user properties
 */
function clearOnboardingDraft_() {
  PropertiesService.getUserProperties().deleteProperty(ONBOARDING_DRAFT_KEY);
}

/**
 * Helper to safely parse values from multi-select form fields
 */
function getMultiSelect_(form, key) {
  const raw = form ? form[key] : null;

  if (!raw) return [];

  if (Array.isArray(raw)) {
    return raw.map(String).map(s => s.trim()).filter(Boolean);
  }

  if (typeof raw === "string") {
    const t = raw.trim();
    if (t.startsWith("[") && t.endsWith("]")) {
      try {
        const parsed = JSON.parse(t);
        if (Array.isArray(parsed)) {
          return parsed.map(String).map(s => s.trim()).filter(Boolean);
        }
      } catch (e) {}
    }

    return t.split(",").map(s => s.trim()).filter(Boolean);
  }

  return [];
}

/***************************************
 * Step validation + state update
 ***************************************/

/**
 * Validates user input for the current step and updates the draft
 */
function applyStepInputToDraft_(step, form, formInputs, draft) {
  const v = (key) => {
    const x = form[key];
    return (typeof x === "string" && x.trim()) ? x.trim() : "";
  };

  if (step === 1) {
    const role = v("role") || draft.role || "";
    if (!role) return { ok: false, message: "Please select your role." };
    draft.role = role;

    if (role === "other") {
      const roleOther = (form.roleOther || draft.roleOther || "").trim();
      draft.roleOther = roleOther;
      if (!roleOther) return { ok: false, message: "Please specify your role for “Other”." };
    } else {
      draft.roleOther = "";
    }
  }

  if (step === 2) {
    const hoursType = v("hoursType") || draft.hoursType || "";
    if (!hoursType) return { ok: false, message: "Please choose Fixed or Flexible hours." };
    draft.hoursType = hoursType;

    if (hoursType === "flexible") {
      // WIDGET EXTRACTION: Use the helper to process the TimePicker object safely
      const start = extractTimeFromPicker_(form.hoursStart);
      const end = extractTimeFromPicker_(form.hoursEnd);

      if (!start || !end) return { ok: false, message: "Please enter a start and end time." };
      
      if (start >= end) {
         return { ok: false, message: "End time must be after start time." };
      }

      draft.hoursStart = start;
      draft.hoursEnd = end;
    } else {
      draft.hoursStart = "";
      draft.hoursEnd = "";
    }
  }

  if (step === 3) {
    const focusTime = v("focusTime");
    if (!focusTime) return { ok: false, message: "Please select a time of day." };
    draft.focusTime = focusTime;
  }

  if (step === 4) {
    const blockPreference = v("blockPreference");
    if (!blockPreference) return { ok: false, message: "Please select a work style." };
    draft.blockPreference = blockPreference;
  }

  if (step === 5) {
  const values = getFieldValues_(form, formInputs, "struggles");
    
    if (values.length === 0) {
      return { ok: false, message: "Please select at least one struggle." };
    }

    draft.struggles = values;
}

  if (step === 6) {
    const candidates = Array.isArray(draft.fixedScheduleCandidates) ? draft.fixedScheduleCandidates : [];
    const confirmed = [];

    for (let idx = 0; idx < Math.min(8, candidates.length); idx++) {
      const c = candidates[idx];

      const keepRaw = form[`fixedKeep_${idx}`];
      const keep = Array.isArray(keepRaw)
        ? keepRaw.includes("keep")
        : (typeof keepRaw === "string" ? keepRaw === "keep" : false);

      if (!keep) continue;

      const title = (form[`fixedTitle_${idx}`] || c.title || "").trim();
      const daysCsv = (form[`fixedDays_${idx}`] || formatDaysCsv_(c.days)).trim();
      
      // WIDGET EXTRACTION
      const startTime = extractTimeFromPicker_(form[`fixedStart_${idx}`]) || c.startTime || "";
      const endTime = extractTimeFromPicker_(form[`fixedEnd_${idx}`]) || c.endTime || "";
      const endDate = extractDateFromPicker_(form[`fixedEndDate_${idx}`]) || c.endDate || "";
      
      const days = parseDaysCsv_(daysCsv);

      if (!title) continue;
      if (!days.length) return { ok: false, message: `Please enter at least 1 day for Candidate #${idx + 1}.` };

      confirmed.push({
        title,
        days,
        startTime,
        endTime,
        endDate: endDate || "", 
        source: "calendar_detected"
      });
    }

    draft.fixedSchedules = confirmed;
  }

  return { ok: true };
}

/***************************************
 * Convert onboarding answers -> prefs
 ***************************************/

/**
 * Converts the onboarding answers into the final scheduling preferences
 */
function derivePrefsFromOnboarding_(draft) {
  let focusMinutes = 60;
  if (draft.blockPreference === "short") focusMinutes = 45;
  if (draft.blockPreference === "medium") focusMinutes = 75;
  if (draft.blockPreference === "long") focusMinutes = 120;

  let bufferMinutes = 0;
  const struggles = Array.isArray(draft.struggles) ? draft.struggles : [];

  if (struggles.includes("context_switching")) bufferMinutes = 10;
  if (struggles.includes("overbooking")) bufferMinutes = Math.max(bufferMinutes, 10);

  let earliestWorkTime = "09:00";
  let latestWorkTime = "21:00";

  if (draft.hoursType === "fixed") {
    earliestWorkTime = draft.hoursStart || "09:00";
    latestWorkTime = draft.hoursEnd || "17:00";
  } else if (draft.hoursType === "flexible") {
    earliestWorkTime = draft.hoursStart;
    latestWorkTime = draft.hoursEnd;
  }

  return { focusMinutes, bufferMinutes, earliestWorkTime, latestWorkTime };
}