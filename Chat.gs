/***************************************
 * chat.gs — AI Scheduler Chat + Gemini Integration
 ***************************************/

const CHAT_HISTORY_KEY_ = "chatHistory";
const PENDING_PROPOSAL_KEY_ = "pendingProposal";
const CHAT_MAX_MESSAGES_ = 15; // Prompt token limits
const PURPLE_THEME = "#4b2e83";
const GREEN_CONFIRM = "#188038";
const RED_CANCEL = "#d93025";

function onOpenChat() {
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().pushCard(buildChatCard_()))
    .build();
}

/**
 * Gets upcoming calendar events and turns them into text for the AI.
 */
function getCalendarContext_(userMessage) {
  const now = new Date();
  let daysToFetch = 14; 

  const msg = (userMessage || "").toLowerCase();
  if (msg.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|month|months|later)\b/)) {
    daysToFetch = 90;
  }

  const horizonOut = new Date(now.getTime() + daysToFetch * 24 * 60 * 60 * 1000);

  const response = Calendar.Events.list("primary", {
    timeMin: now.toISOString(),
    timeMax: horizonOut.toISOString(),
    singleEvents: true,
    orderBy: "startTime",
    maxResults: daysToFetch === 14 ? 100 : 500 
  });

  const events = response.items || [];
  if (!events.length) return `No events for the next ${daysToFetch} days.`;

  const tz = Session.getScriptTimeZone();

  return events.map(e => {
    const startRaw = e.start.dateTime || e.start.date;
    const endRaw = e.end.dateTime || e.end.date;
    
    const eventDate = new Date(startRaw);
    let dayName = "";
    if (!isNaN(eventDate.getTime())) {
      dayName = Utilities.formatDate(eventDate, tz, "EEEE") + ", ";
    }

    return `[${e.id}] ${e.summary}: ${dayName}${startRaw} to ${endRaw}`;
  }).join("\n");
}

function onSendChat(e) {
  if (!e || !e.formInput) {
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText("No input received."))
      .build();
  }

  const form = e.formInput || {};
  const message = (form.message || "").trim();
  if (!message) {
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText("Type a message first."))
      .build();
  }

  return processAIGeneration_(message);
}

/**
 * Handle Suggestion Button
 */
function onGetRecommendation() {
  const recPrompt = "Analyze my schedule, fixed events, and role. Based on my preferences and knowledge bank, provide a MAXIMUM of 6 specific recommendations to optimize my week. If a recommendation is for a regular habit or routine (like studying, training, or meal prep), actively propose it as a RECURRING event.";
  return processAIGeneration_(recPrompt);
}

/**
 * Handles the main flow for sending a message to the AI and saving the result.
 */
function processAIGeneration_(userMessage, notificationText) {
  const history = getChatHistory_();
  
  const chatDisplay = userMessage.includes("optimize my week") ? "Suggest a schedule improvement" : userMessage;
  history.push({ role: "user", text: chatDisplay });

  try {
    const ai = callGeminiAI_(userMessage);
    history.push({ role: "ai", text: ai.message || "I've prepared a proposal for you." });
    const proposalMessageIndex = history.length - 1;
    saveChatHistory_(history);

    if (ai && ai.action !== "none" && Array.isArray(ai.proposals) && ai.proposals.length > 0) {
    if (ai.proposals.length > 6) ai.proposals = ai.proposals.slice(0, 6);
    ai._proposalMessageIndex = proposalMessageIndex;

    // Fallback explanation for the whole proposal
    if (!ai.explanation || !String(ai.explanation).trim()) {
      ai.explanation = ai.message || "The AI proposed these changes based on your request and calendar context.";
    }

    // Fallback explanation for each individual proposal
    ai.proposals.forEach(p => {
      if (!p.explanation || !String(p.explanation).trim()) {
        if (ai.action === "create_event") {
          p.explanation = "This event was proposed based on your request and placed in the suggested time slot.";
        } else if (ai.action === "reschedule_event") {
          p.explanation = "This event was moved to better fit your request and schedule constraints.";
        } else if (ai.action === "delete_event") {
          p.explanation = "This event was selected for deletion because it appears to match your request.";
        } else {
          p.explanation = "This proposal was generated based on your request.";
        }
      }
    });

    // PREVIEW & COLOR LOGIC
    if (ai.action === "create_event") {
      const tz = Session.getScriptTimeZone();
      ai.proposals.forEach(p => {
        p.finalColorId = getColorForTitle_(p.title);

        try {
          const calId = p.calendarId || "primary";
          const eventPayload = {
            summary: "PREVIEW: " + (p.title || "Event"),
            description: p.description || "",
            location: p.location || "",
            start: { dateTime: p.newStartISO, timeZone: tz },
            end: { dateTime: p.newEndISO, timeZone: tz },
            colorId: "8"
          };
          if (p.recurrence && Array.isArray(p.recurrence) && p.recurrence.length > 0) eventPayload.recurrence = p.recurrence;
          else if (p.rrule) eventPayload.recurrence = [p.rrule];

          const created = Calendar.Events.insert(eventPayload, calId);
          p.previewEventId = created.id;
        } catch (e) {
          Logger.log("Preview creation failed: " + e.message);
        }
      });
    }

    savePendingProposal_(ai);
  } else {
    clearPendingProposal_();
  }
  } catch (err) {
    history.push({ role: "ai", text: "Error: " + err.message });
    saveChatHistory_(history);
  }

  const builder = CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().updateCard(buildChatCard_()));
    
  if (notificationText) builder.setNotification(CardService.newNotification().setText(notificationText));
  
  return builder.build();
}

/**
 * Main chat card
 */
function buildChatCard_() {
  const card = CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle("Chat Assistant"));

  const history = getChatHistory_();
  const pending = getPendingProposal_();

  // Conversation Section
  const chatSection = CardService.newCardSection();

  if (!history.length) {
    chatSection.addWidget(
      CardService.newTextParagraph().setText(
        `<b><font color='${PURPLE_THEME}'>What can I do?</font></b><br/>` +
        "Ask me to move, add, delete, or organize events.<br/><br/>" +
        `<b><font color='${PURPLE_THEME}'>Try:</font></b><br/>` +
        "• Move my Bio lab to Monday morning<br/>" +
        "• Schedule a 2-hour Python coding block this weekend<br/>" +
        "• Cancel my CS group meeting<br/>" +
        "• Suggest when to schedule study blocks to study for my exam on Friday"
      )
    );
  } else {
    history.forEach(m => buildChatRowWidgets_(m).forEach(w => chatSection.addWidget(w)));
  }

  card.addSection(chatSection);

  // Proposed changes Section
  if (pending && Array.isArray(pending.proposals) && pending.proposals.length) {
    card.addSection(buildProposalSectionClean_(pending));
  }

  // Quick actions Section
  card.addSection(
    CardService.newCardSection()
      .addWidget(
      CardService.newImage()
        .setImageUrl("https://placehold.co/600x6/4b2e83/4b2e83/png")
        .setAltText("Divider")
      )
      .addWidget(CardService.newTextParagraph().setText(`<b><font color='${PURPLE_THEME}'>Quick actions</font></b>`))
      .addWidget(
      CardService.newImage()
        .setImageUrl("https://placehold.co/600x6/4b2e83/4b2e83/png")
        .setAltText("Divider")
      )
      .addWidget(
        CardService.newButtonSet()
          .addButton(
            CardService.newTextButton()
              .setText("📁 Bulk upload")
              .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
              .setBackgroundColor(PURPLE_THEME)
              .setOnClickAction(CardService.newAction().setFunctionName("goToDriveImport_"))
          )
          .addButton(
            CardService.newTextButton()
              .setText("💡 Schedule Suggestions")
              .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
              .setBackgroundColor(PURPLE_THEME)
              .setOnClickAction(CardService.newAction().setFunctionName("onGetRecommendation"))
          )
      )
  );

  // Input Section
  card.addSection(
    CardService.newCardSection()
      .addWidget(
        CardService.newTextInput()
          .setFieldName("message")
          .setTitle("") 
          .setHint('Type a message… (e.g., "Schedule a 2-hour study block tomorrow")')
          .setMultiline(true)
      )
      .addWidget(
        CardService.newButtonSet()
          .addButton(
            CardService.newTextButton()
              .setText("Send")
              .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
              .setBackgroundColor(PURPLE_THEME)
              .setOnClickAction(
                CardService.newAction().setFunctionName("onSendChat") 
              )
          )
          .addButton(
            CardService.newTextButton()
              .setText("Clear")
              .setOnClickAction(CardService.newAction().setFunctionName("onClearChat"))
          )
      )
  );

  return card.build();
}

/**
 * Explanation logic
 */
function onExplainProposal() {
  const pending = getPendingProposal_();
  if (!pending) {
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText("No proposal found."))
      .build();
  }

  const section = CardService.newCardSection()
    .addWidget(
      CardService.newTextParagraph().setText(
        `<b><font color='${PURPLE_THEME}'>Why the AI proposed this</font></b>`
      )
    )
    .addWidget(CardService.newDivider());

  const overallExplanation = String(pending.explanation || "").trim();

  if (overallExplanation) {
    section.addWidget(
      CardService.newTextParagraph().setText(
        nl2br_(escapeHtml_(overallExplanation))
      )
    );
    section.addWidget(CardService.newDivider());
  }

  if (Array.isArray(pending.proposals) && pending.proposals.length > 0) {
    pending.proposals.forEach((p, idx) => {
      const title = escapeHtml_(p.title || `Proposal ${idx + 1}`);
      const explanation = String(p.explanation || "").trim();

      section.addWidget(
        CardService.newTextParagraph().setText(
          `<b><font color='${PURPLE_THEME}'>${title}</font></b>`
        )
      );

      section.addWidget(
        CardService.newTextParagraph().setText(
          explanation
            ? nl2br_(escapeHtml_(explanation))
            : "No specific explanation was returned for this proposal."
        )
      );

      if (idx < pending.proposals.length - 1) {
        section.addWidget(CardService.newDivider());
      }
    });
  } else {
    section.addWidget(
      CardService.newTextParagraph().setText("No proposal details available.")
    );
  }

  section.addWidget(CardService.newDivider());
  section.addWidget(
    CardService.newTextButton()
      .setText("Back")
      .setOnClickAction(CardService.newAction().setFunctionName("onBackToChat"))
  );

  return CardService.newActionResponseBuilder()
    .setNavigation(
      CardService.newNavigation().pushCard(
        CardService.newCardBuilder()
          .setHeader(CardService.newCardHeader().setTitle("AI Explanation"))
          .addSection(section)
          .build()
      )
    )
    .build();
}

/**
 * Confirming proposals
 */
function onConfirmProposal(e) {
  const pending = getPendingProposal_();
  if (!pending) {
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText("No proposal found."))
      .build();
  }

  const selectedIndices = [];
  
  if (pending.proposals.length === 1) {
    selectedIndices.push("0");
  } else {
    pending.proposals.forEach((_, idx) => {
      const fieldName = "selectedProposal_" + idx;
      let isTicked = false;
      
      // Checkbox reader
      if (e.formInput && e.formInput[fieldName]) {
        isTicked = true;
      } else if (e.commonEventObject && e.commonEventObject.formInputs && e.commonEventObject.formInputs[fieldName]) {
        const inputObj = e.commonEventObject.formInputs[fieldName];
        if (inputObj.stringInputs && inputObj.stringInputs.value && inputObj.stringInputs.value.length > 0) {
          isTicked = true;
        }
      }

      if (isTicked) {
        selectedIndices.push(String(idx));
      }
    });
  }

  if (!selectedIndices.length) {
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText("Please select at least one item."))
      .build();
  }

  const filteredProposals = [];
  const rejectedProposals = [];

  pending.proposals.forEach((p, idx) => {
    if (selectedIndices.includes(String(idx))) {
      filteredProposals.push(p);
    } else {
      rejectedProposals.push(p);
    }
  });

  rejectedProposals.forEach(p => {
    if (p.previewEventId) {
      try {
        Calendar.Events.remove(p.calendarId || "primary", p.previewEventId);
        Utilities.sleep(200); // Pause
      } catch(err) {
        try {
          // Fallback: If delete fails, forcefully cancel the event status
          Calendar.Events.patch({ status: "cancelled" }, p.calendarId || "primary", p.previewEventId);
        } catch(e2) {}
      }
    }
  });

  // Lock in only the accepted proposals
  pending.proposals = filteredProposals;

  try {
    executeProposal_(pending);

    // Create a structured data list for the "Receipt Card"
    const confirmedList = filteredProposals.map(p => {
      const start = new Date(p.newStartISO);
      const end = new Date(p.newEndISO);
      return {
        title: p.title || "Event",
        timeLabel: formatTimeLabel_(p, start, end), // Uses the new smart formatter!
        isRecurring: !!(p.rrule || (p.recurrence && p.recurrence.length > 0))
      };
    });

    const history = getChatHistory_();
    
    history.push({ 
      role: "ai", 
      text: `Applied ${filteredProposals.length} change(s) successfully! ✅`,
      confirmedEvents: confirmedList 
    });
    
    saveChatHistory_(history);
    clearPendingProposal_();

    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().updateCard(buildChatCard_()))
      .build();
  } catch (err) {
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText("Update failed: " + err.message))
      .build();
  }
}

/**
 * Template: Bulk upload schedule
 */
function onOpenBulkUploadSchedule() {
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().pushCard(buildBulkUploadCard_()))
    .build();
}

function buildBulkUploadCard_() {
  const card = CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle("Bulk upload schedule"));

  const info = CardService.newCardSection()
    .addWidget(CardService.newTextParagraph().setText(
      `<b><font color='${PURPLE_THEME}'>Upload Documents</font></b><br/>` +
      "Upload a class/work schedule or any bulk event list from an <b>image or PDF</b> in Google Drive.<br/><br/>" +
      "Pick a <b>start</b> and <b>end</b> date. Imported items become <b>weekly recurring events</b> within that range."
    ));

  const form = CardService.newCardSection()
    .addWidget(
      CardService.newTextInput()
        .setFieldName("driveFile")
        .setTitle("Google Drive file link or ID")
        .setHint("Paste a Drive link to an image/PDF")
    )
    .addWidget(CardService.newDatePicker().setFieldName("bulkStartDate").setTitle("Start date"))
    .addWidget(CardService.newDatePicker().setFieldName("bulkEndDate").setTitle("End date"))
    .addWidget(
      CardService.newButtonSet()
        .addButton(
          CardService.newTextButton()
            .setText("Extract & Preview")
            .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
            .setBackgroundColor(PURPLE_THEME)
            .setOnClickAction(CardService.newAction().setFunctionName("onExtractScheduleFromDriveFile").setPersistValues(true))
        )
        .addButton(
          CardService.newTextButton()
            .setText("Back")
            .setOnClickAction(CardService.newAction().setFunctionName("onBackToChat"))
        )
    );

  card.addSection(info);
  card.addSection(form);
  return card.build();
}

function onCancelProposal() {
  const pending = getPendingProposal_();
  
  // Delete ALL remaining preview ghosts!
  cleanupGhostEvents_(pending);

  if (pending && typeof pending._proposalMessageIndex === "number") {
    const history = getChatHistory_();
    const idx = pending._proposalMessageIndex;
    if (idx >= 0 && idx < history.length && history[idx].role === "ai") {
      history.splice(idx, 1);
      saveChatHistory_(history);
    }
  }
  clearPendingProposal_();
  const history2 = getChatHistory_();
  history2.push({ role: "ai", text: "Canceled — previews removed from calendar." });
  saveChatHistory_(history2);
  
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().updateCard(buildChatCard_()))
    .build();
}

function onClearChat() {
  const props = PropertiesService.getUserProperties();
  
  // 1. Clear the old generic key
  props.deleteProperty(CHAT_HISTORY_KEY_);
  
  // 2. Clear the active threaded session so the app knows to start a blank slate
  try {
    CacheService.getUserCache().remove("activeChatThread");
  } catch(e) {
    // Ignore if cache is empty
  }
  props.deleteProperty("activeChatThread");

  // 3. Clear any pending AI proposals on the screen
  clearPendingProposal_();

  // 4. Reload the card
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().updateCard(buildChatCard_()))
    .build();
}

/**
 * Proposal screen
 */
function onModifyProposal(e) {
  const idx = Number((e && e.parameters && e.parameters.idx) || -1);
  const pending = getPendingProposal_();
  if (!pending || !pending.proposals || idx < 0 || idx >= pending.proposals.length) {
    return CardService.newActionResponseBuilder().setNotification(CardService.newNotification().setText("No proposal to modify.")).build();
  }
  
  const p = pending.proposals[idx];
  const start = new Date(p.newStartISO);
  const end = new Date(p.newEndISO);
  const tz = Session.getScriptTimeZone();
  const startHHMM = Utilities.formatDate(start, tz, "HH:mm");
  const endHHMM = Utilities.formatDate(end, tz, "HH:mm");
  const [sH, sM] = startHHMM.split(":").map(Number);
  const [eH, eM] = endHHMM.split(":").map(Number);

  // Check if this event is repeating
  const isRecurring = p.rrule || (p.recurrence && p.recurrence.length > 0);

  const section = CardService.newCardSection()
    .addWidget(CardService.newTextParagraph().setText(`<b><font color='${PURPLE_THEME}'>Current Plan</font></b>`))
    .addWidget(CardService.newTextParagraph().setText(`<b>${escapeHtml_(p.title || "Event")}</b>`))
    .addWidget(CardService.newDivider())
    .addWidget(CardService.newTextInput().setFieldName("modifyTitle").setTitle("Title").setValue(p.title || ""))
    .addWidget(CardService.newTextInput().setFieldName("modifyLocation").setTitle("Location").setValue(p.location || ""))
    .addWidget(CardService.newTextInput().setFieldName("modifyDescription").setTitle("Description").setMultiline(true).setValue(p.description || ""));
    
  if (isRecurring) {
    section.addWidget(CardService.newTimePicker().setFieldName("modifyStartTime").setTitle("Start time").setHours(sH).setMinutes(sM));
    section.addWidget(CardService.newTimePicker().setFieldName("modifyEndTime").setTitle("End time").setHours(eH).setMinutes(eM));
    section.addWidget(CardService.newDatePicker().setFieldName("modifyStartDate").setTitle("Start Date").setValueInMsSinceEpoch(start.getTime()));
    section.addWidget(CardService.newDatePicker().setFieldName("modifyEndDate").setTitle("End Date").setValueInMsSinceEpoch(end.getTime()));
    section.addWidget(CardService.newTextParagraph().setText("<font color='#888888'><i>*Start date sets when the repeating series begins. End date sets when the series finally stops.</i></font>"));
  } else {
    section.addWidget(CardService.newTimePicker().setFieldName("modifyStartTime").setTitle("Start time").setHours(sH).setMinutes(sM));
    section.addWidget(CardService.newTimePicker().setFieldName("modifyEndTime").setTitle("End time").setHours(eH).setMinutes(eM));
    section.addWidget(CardService.newDatePicker().setFieldName("modifyDate").setTitle("Date").setValueInMsSinceEpoch(start.getTime()));
  }

  section.addWidget(CardService.newDivider())
    .addWidget(
      CardService.newButtonSet()
        .addButton(
          CardService.newTextButton()
            .setText("Save") // <-- Changed to "Save"
            .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
            .setBackgroundColor(PURPLE_THEME) // <-- Changed to Purple Theme
            .setOnClickAction(CardService.newAction().setFunctionName("onApplyModifyProposal").setParameters({ idx: String(idx) }).setPersistValues(true))
        )
        .addButton(CardService.newTextButton().setText("Back").setOnClickAction(CardService.newAction().setFunctionName("onBackToChat")))
    );

  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().pushCard(
      CardService.newCardBuilder().setHeader(CardService.newCardHeader().setTitle("Edit Details")).addSection(section).build()
    )).build();
}

function onBackToChat() {
  return CardService.newActionResponseBuilder().setNavigation(CardService.newNavigation().popToRoot().updateCard(buildChatCard_())).build();
}

/**
 * BACKEND: Saving the user's edits dynamically
 */
function onApplyModifyProposal(e) {
  const idx = Number((e && e.parameters && e.parameters.idx) || -1);
  const pending = getPendingProposal_();
  if (!pending || !pending.proposals || idx < 0 || idx >= pending.proposals.length) {
    return CardService.newActionResponseBuilder().setNotification(CardService.newNotification().setText("No proposal to update.")).build();
  }
  
  const p = pending.proposals[idx];
  const isRecurring = p.rrule || (p.recurrence && p.recurrence.length > 0);
  
  const newTitle = String(getFormValue_(e, "modifyTitle") || "").trim();
  const newLocation = String(getFormValue_(e, "modifyLocation") || "").trim();
  const newDescription = String(getFormValue_(e, "modifyDescription") || "").trim();

  if (!newTitle) return CardService.newActionResponseBuilder().setNotification(CardService.newNotification().setText("Event name can't be empty.")).build();

  const startHHMM = normalizeTimePicker_(getFormValue_(e, "modifyStartTime"));
  const endHHMM = normalizeTimePicker_(getFormValue_(e, "modifyEndTime"));

  const tz = Session.getScriptTimeZone();
  const curStart = new Date(p.newStartISO);
  const curEnd = new Date(p.newEndISO);

  function extractDateObj_(raw, fallback) {
    if (!raw) return fallback;
    if (typeof raw === "string") {
      const parts = raw.split("-");
      if (parts.length === 3) return new Date(parts[0], parts[1]-1, parts[2]);
      return new Date(raw);
    }
    if (raw.msSinceEpoch) return new Date(Number(raw.msSinceEpoch));
    if (raw.year !== undefined) return new Date(raw.year, raw.month - 1, raw.day);
    return fallback;
  }

  let baseStartDate, baseEndDate;

  if (isRecurring) {
    baseStartDate = extractDateObj_(getFormValue_(e, "modifyStartDate"), curStart);
    baseEndDate = extractDateObj_(getFormValue_(e, "modifyEndDate"), curEnd);
  } else {
    const singleDate = extractDateObj_(getFormValue_(e, "modifyDate"), curStart);
    baseStartDate = singleDate;
    baseEndDate = singleDate; 
  }
  
  const finalStartTime = startHHMM || Utilities.formatDate(curStart, tz, "HH:mm");
  const finalEndTime = endHHMM || Utilities.formatDate(curEnd, tz, "HH:mm");

  const start = new Date(baseStartDate.getTime());
  const [sH, sM] = finalStartTime.split(":").map(Number);
  start.setHours(sH, sM, 0, 0);

  const end = new Date(baseEndDate.getTime());
  const [eH, eM] = finalEndTime.split(":").map(Number);
  end.setHours(eH, eM, 0, 0);

  if (end.getTime() <= start.getTime()) {
    end.setDate(start.getDate()); 
    if (end.getTime() <= start.getTime()) {
      end.setDate(end.getDate() + 1); 
    }
  }

  p.title = newTitle;
  p.location = newLocation;
  p.description = newDescription;
  p.newStartISO = Utilities.formatDate(start, tz, "yyyy-MM-dd'T'HH:mm:ssXXX");
  p.newEndISO = Utilities.formatDate(end, tz, "yyyy-MM-dd'T'HH:mm:ssXXX");

  savePendingProposal_(pending);
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().popToRoot().updateCard(buildChatCard_()))
    .setNotification(CardService.newNotification().setText("Details updated!"))
    .build();
}

/**
 * Applies the proposal changes to Google Calendar.
 */
function executeProposal_(proposal) {
  const action = proposal.action;

  proposal.proposals.forEach((p) => {
    const calId = p.calendarId || "primary";

    if (action === "reschedule_event") {
      Calendar.Events.patch({
        start: { dateTime: p.newStartISO },
        end: { dateTime: p.newEndISO },
      }, calId, p.eventId);
    } else if (action === "create_event") {
      
      // Choose a color
      const colorToApply = p.finalColorId || "9";

      // Apply the vibrant color and remove the "PREVIEW: " tag!
      if (p.previewEventId) {
        try {
          Calendar.Events.patch({
            summary: p.title, // Overwrites the "PREVIEW: " text
            colorId: colorToApply 
          }, calId, p.previewEventId);
        } catch (e) {} 
      } else {
        // Fallback if the ghost failed to generate
        const tz = Session.getScriptTimeZone();
        const eventPayload = {
          summary: p.title,
          description: p.description || "",
          location: p.location || "",
          start: { dateTime: p.newStartISO, timeZone: tz },
          end: { dateTime: p.newEndISO, timeZone: tz },
          colorId: colorToApply
        };
        if (p.recurrence && p.recurrence.length > 0) eventPayload.recurrence = p.recurrence;
        else if (p.rrule) eventPayload.recurrence = [p.rrule];
        Calendar.Events.insert(eventPayload, calId);
      }
      
    } else if (action === "delete_event") {
      Calendar.Events.remove(calId, p.eventId);
    }
  });
}

/**
 * Proposal tiles
 */
function buildProposalTile_(pending, p, idx) {
  if (!p) return CardService.newTextParagraph().setText("Invalid proposal.");
  const isDelete = pending && pending.action === "delete_event";
  if (!isDelete && (!p.newStartISO || !p.newEndISO)) return CardService.newTextParagraph().setText("Invalid proposal: missing start/end time.");
  
  const start = new Date(p.newStartISO);
  const end = new Date(p.newEndISO);
  const durationMin = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
  
  const timeLabel = formatTimeLabel_(p, start, end);

  const isRecurring = p.rrule || (p.recurrence && p.recurrence.length > 0); 
  
  const titleHtml = isRecurring 
    ? `<b>${escapeHtml_(p.title || "Event")}</b> <br><font color='${PURPLE_THEME}'>🔁 <i>Recurring</i></font>` 
    : `<b>${escapeHtml_(p.title || "Event")}</b>`;

  const tile = CardService.newDecoratedText()
    .setWrapText(true)
    .setStartIcon(CardService.newIconImage().setIcon(CardService.Icon.CLOCK))
    .setText(titleHtml) 
    .setBottomLabel(`${durationMin} min • ${timeLabel}`);

  if (pending && pending.proposals && pending.proposals.length > 1) {
    const switchControl = CardService.newSwitch()
      .setControlType(CardService.SwitchControlType.CHECK_BOX)
      .setFieldName("selectedProposal_" + idx)
      .setValue(String(idx))
      .setSelected(true); 
    tile.setSwitchControl(switchControl);
  }

  return tile;
}

/**
 * Updates the selected state of a proposal checkbox
 */
function onToggleProposalCheckbox(e) {
  const idx = Number(e.parameters.idx);
  const pending = getPendingProposal_();
  if (!pending || !pending.proposals || !pending.proposals[idx]) return CardService.newActionResponseBuilder().build();

  const p = pending.proposals[idx];
  const fieldName = "selectedProposal_" + idx;
  
  const isChecked = e.formInput && e.formInput[fieldName] !== undefined;
  p.selected = isChecked;

  // Sync with Google Calendar
  if (pending.action === "create_event") {
    const calId = p.calendarId || "primary";
    const tz = Session.getScriptTimeZone();

    if (isChecked && !p.previewEventId) {
      // Show preview
      try {
        const eventPayload = {
          summary: "PREVIEW: " + (p.title || "Event"),
          description: p.description || "",
          location: p.location || "",
          start: { dateTime: p.newStartISO, timeZone: tz },
          end: { dateTime: p.newEndISO, timeZone: tz },
          colorId: "8"
        };
        if (p.recurrence && p.recurrence.length > 0) eventPayload.recurrence = p.recurrence;
        else if (p.rrule) eventPayload.recurrence = [p.rrule];
        
        const created = Calendar.Events.insert(eventPayload, calId);
        p.previewEventId = created.id;
      } catch (err) {}
    } else if (!isChecked && p.previewEventId) {
      // Delete preview from grid
      try {
        Calendar.Events.remove(calId, p.previewEventId);
        p.previewEventId = null; 
      } catch (err) {}
    }
  }

  savePendingProposal_(pending);
  
  // Return an empty build so the UI stay still while background updates
  return CardService.newActionResponseBuilder().build(); 
}

// Replaces relative dates like today and tomorrow with real dates.
function resolveRelativeDates_(text) {
  const tz = Session.getScriptTimeZone();
  const now = new Date();
  const todayStr = Utilities.formatDate(now, tz, "yyyy-MM-dd");
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
  const tomorrowStr = Utilities.formatDate(tomorrow, tz, "yyyy-MM-dd");
  return text.replace(/\btomorrow\b/i, tomorrowStr).replace(/\btoday\b/i, todayStr);
}

function normalizeTimePicker_(v) {
  if (!v) return "";
  if (typeof v === "string") return /^\d{2}:\d{2}$/.test(v.trim()) ? v.trim() : v.trim();
  if (typeof v === "object") {
    const h = v.hours ?? v.hour;
    const m = v.minutes ?? v.minute;
    if (h !== undefined && m !== undefined) return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    if (v.stringInputs?.value?.length) return v.stringInputs.value[0];
  }
  return "";
}

// Gets a form value from the event object.
function getFormValue_(e, fieldName) {
  const direct = e && e.formInput && e.formInput[fieldName];
  if (direct !== undefined && direct !== null) return direct;
  const fi = e && e.commonEventObject && e.commonEventObject.formInputs ? e.commonEventObject.formInputs[fieldName] : null;
  if (!fi) return null;
  if (fi.stringInputs?.value?.length) return fi.stringInputs.value[0];
  return fi.timeInput || fi.dateInput || null;
}

// Builds a simple chat bubble for one message.
function buildChatBubble_(m) {
  const isUser = m && m.role === "user";
  const name = isUser ? "You" : "Gemini";

  const body = nl2br_(escapeHtml_(String(m && m.text ? m.text : "")));

  return CardService.newTextParagraph().setText(
    `<b>${name}</b><br/>${body}`
  );
}

// Builds the proposal section shown in the chat card.
function buildProposalSectionClean_(pending) {
  const action = pending.action || "none";

  const headerText =
    action === "delete_event" ? "Delete Event Proposal" :
    (action === "create_event" ? "New Event Proposal" :
    (action === "reschedule_event" ? "Reschedule Proposal" : "Proposed changes"));

  const section = CardService.newCardSection()
    .addWidget(CardService.newTextParagraph().setText(`<b><font color='${PURPLE_THEME}'>${headerText}</font></b>`))
    .addWidget(
      CardService.newImage()
        .setImageUrl("https://placehold.co/600x6/4b2e83/4b2e83/png")
        .setAltText("Divider")
    )

  pending.proposals.forEach((p, idx) => {
    section.addWidget(buildProposalTile_(pending, p, idx));

    section.addWidget(
    CardService.newButtonSet()
      .addButton(
        CardService.newTextButton()
          .setText("Modify")
          .setOnClickAction(
            CardService.newAction()
              .setFunctionName("onModifyProposal")
              .setParameters({ idx: String(idx) })
          )
      )
      .addButton(
        CardService.newTextButton()
          .setText("Explain")
          .setOnClickAction(
            CardService.newAction()
              .setFunctionName("onExplainSingleProposal")
              .setParameters({ idx: String(idx) })
          )
      )
  );

    section.addWidget(CardService.newDivider())
  }); 

  section.addWidget(
    CardService.newButtonSet()
      .addButton(
        CardService.newTextButton()
          .setText(action === "delete_event" ? "Confirm Delete" : "Confirm")
          .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
          .setBackgroundColor(GREEN_CONFIRM) 
          .setOnClickAction(CardService.newAction().setFunctionName("onConfirmProposal").setPersistValues(true))
      )
      .addButton(
        CardService.newTextButton()
          .setText("Cancel")
          .setTextButtonStyle(CardService.TextButtonStyle.FILLED) 
          .setBackgroundColor(RED_CANCEL) 
          .setOnClickAction(CardService.newAction().setFunctionName("onCancelProposal"))
      )
  );

  return section;
}

// Changes line breaks into <br> tags.
function nl2br_(s) {
  return String(s || "").replace(/\n/g, "<br/>");
}

// Builds the widgets for one chat message row.
function buildChatRowWidgets_(m) {
  const isUser = m && m.role === "user";
  const who = isUser ? "You" : "AI";
  
  const nameColor = isUser ? PURPLE_THEME : "#1a73e8"; 

  const raw = String(m && m.text ? m.text : "");
  const msg = escapeHtml_(raw).replace(/\n/g, "<br>");

  const combinedText = `<b><font color="${nameColor}">${who}</font></b><br>${msg}`;

  const widgets = [
    CardService.newTextParagraph().setText(combinedText)
  ];

  if (m.confirmedEvents && Array.isArray(m.confirmedEvents) && m.confirmedEvents.length > 0) {
    widgets.push(CardService.newDivider()); 
    
    m.confirmedEvents.forEach(evt => {
      let titleHtml = `<b>${escapeHtml_(evt.title)}</b>`;
      if (evt.isRecurring) {
         titleHtml += `<br><font color='${PURPLE_THEME}'>🔁 <i>Recurring</i></font>`;
      }

      widgets.push(
        CardService.newDecoratedText()
          .setStartIcon(CardService.newIconImage().setIcon(CardService.Icon.CLOCK))
          .setText(titleHtml)
          .setBottomLabel(evt.timeLabel)
          .setWrapText(true)
      );
    });
    
    widgets.push(CardService.newDivider()); 
  }

  return widgets;
}

/**
 * Shows why the AI made one specific proposal.
 */
function onExplainSingleProposal(e) {
  const idx = Number((e && e.parameters && e.parameters.idx) || -1);
  const pending = getPendingProposal_();

  if (!pending || !pending.proposals || idx < 0 || idx >= pending.proposals.length) {
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText("No proposal found."))
      .build();
  }

  const p = pending.proposals[idx];
  const title = escapeHtml_(p.title || `Proposal ${idx + 1}`);
  const explanation = String(p.explanation || "").trim() || "No explanation was returned for this proposal.";

  const section = CardService.newCardSection()
    .addWidget(
      CardService.newTextParagraph().setText(
        `<b><font color='${PURPLE_THEME}'>${title}</font></b>`
      )
    )
    .addWidget(CardService.newDivider())
    .addWidget(
      CardService.newTextParagraph().setText(
        nl2br_(escapeHtml_(explanation))
      )
    )
    .addWidget(CardService.newDivider())
    .addWidget(
      CardService.newTextButton()
        .setText("Back")
        .setOnClickAction(CardService.newAction().setFunctionName("onBackToChat"))
    );

  return CardService.newActionResponseBuilder()
    .setNavigation(
      CardService.newNavigation().pushCard(
        CardService.newCardBuilder()
          .setHeader(CardService.newCardHeader().setTitle("Proposal Explanation"))
          .addSection(section)
          .build()
      )
    )
    .build();
}