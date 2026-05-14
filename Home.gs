/******************************
 * Home UI (Premium Dashboard)
 ******************************/

/**
 * Builds the main dashboard screen with buttons to access the AI assistant, chat history, and settings
 */
function buildHomeCard_(prefs) {

  const card = CardService.newCardBuilder();

  // --- Main Banner ---
  card.addSection(
    CardService.newCardSection().addWidget(
      CardService.newImage()
        .setImageUrl("https://placehold.co/600x150/4b2e83/FFFFFF/png?text=Your+Dashboard&font=roboto")
        .setAltText("Dashboard Banner")
    )
  );

  // --- MAIN CONTENT BLOCK (Combined to remove grey lines) ---
  const mainSection = CardService.newCardSection()
    // AI Assistant Text & Button
    .addWidget(
      CardService.newImage()
        .setImageUrl("https://placehold.co/600x6/4b2e83/4b2e83/png")
        .setAltText("Divider")
    )

    .addWidget(
      CardService.newTextParagraph().setText(
        "<b><font color='#4b2e83'>ScheduleMe Assistant</font></b><br>" +
        "Chat with your AI to organize your day."
      )
    )

    .addWidget(
      CardService.newButtonSet().addButton(
        CardService.newTextButton()
          .setText("💬 Open AI Assistant")
          .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
          .setBackgroundColor("#4b2e83")
          .setOnClickAction(CardService.newAction().setFunctionName("onOpenChat"))
      )
    )

    .addWidget(
      CardService.newImage()
        .setImageUrl("https://placehold.co/600x6/4b2e83/4b2e83/png")
        .setAltText("Divider")
    )

    .addWidget(CardService.newDivider())

    // Chat History Text & Button
    .addWidget(
      CardService.newTextParagraph().setText(
        "<b><font color='#4b2e83'>Chat History</font></b><br>" +
        "Review your past AI conversations."
      )
    )
    .addWidget(
      CardService.newButtonSet().addButton(
        CardService.newTextButton()
          .setText("🕒 History")
          .setTextButtonStyle(CardService.TextButtonStyle.TEXT)
          .setOnClickAction(CardService.newAction().setFunctionName("onOpenChatHistory"))
      )
    )
    
    .addWidget(CardService.newDivider())

    // Preferences Text & Button
    .addWidget(
      CardService.newTextParagraph().setText(
        "<b><font color='#4b2e83'>Preferences</font></b><br>" +
        "Edit your preferences and fixed schedules."
      )
    )
    .addWidget(
      CardService.newButtonSet().addButton(
        CardService.newTextButton()
          .setText("⚙️ Settings")
          .setTextButtonStyle(CardService.TextButtonStyle.TEXT)
          .setOnClickAction(CardService.newAction().setFunctionName("onOpenSettings"))
      )
    );

  card.addSection(mainSection);

  // --- Footer Action ---
  const stickyFooter = CardService.newFixedFooter()
    .setPrimaryButton( // Using secondary makes it a subtle, outlined button
      CardService.newTextButton()
        .setText("Restart Onboarding")
        .setBackgroundColor("#4b2e83")
        .setOnClickAction(CardService.newAction().setFunctionName("onRestartOnboarding"))
    );

  card.setFixedFooter(stickyFooter);

  return card.build(); 
}

/**
 * A simple placeholder function that just shows a coming soon popup notification when clicked
 */
function onGeneratePlaceholder() {
  return CardService.newActionResponseBuilder()
    .setNotification(CardService.newNotification().setText("Feature coming soon!"))
    .build();
}

/**
 * Wipes out the saved preferences and draft data, then sends the user back to the very first welcome screen
 */
function onRestartOnboarding() {
  clearPrefs_();
  clearOnboardingDraft_();
  onClearAllHistory(); // Wipes all of the chat history
  
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().updateCard(buildOnboardingIntroCard_().build()))
    .build();
}