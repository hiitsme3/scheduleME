/***************************************
 * Chat History
 ***************************************/

const THREADS_INDEX_KEY_ = "chatThreadsIndex";
const ACTIVE_THREAD_KEY_ = "activeChatThread";

/**
 * Retrieves the currently active chat session ID from temporary cache
 */
function getActiveThreadId_() {
  return CacheService.getUserCache().get(ACTIVE_THREAD_KEY_);
}

/**
 * Saves the active chat session ID for 1 hour so it survives page refreshes like a natural timeout
 */
function setActiveThreadId_(threadId) {
  CacheService.getUserCache().put(ACTIVE_THREAD_KEY_, threadId, 3600);
}

/**
 * Removes the current chat session ID from the temporary cache
 */
function clearActiveThreadId_() {
  CacheService.getUserCache().remove(ACTIVE_THREAD_KEY_);
}

/**
 * Fetches the permanent message history for the currently active chat session
 */
function getChatHistory_() {
  const threadId = getActiveThreadId_();
  if (!threadId) return []; 
  
  const raw = PropertiesService.getUserProperties().getProperty("CHAT_" + threadId);
  return raw ? JSON.parse(raw) : [];
}

/**
 * Saves new messages permanently and registers the chat in the history menu if it is brand new
 */
function saveChatHistory_(history) {
  const props = PropertiesService.getUserProperties();
  let threadId = getActiveThreadId_();

  if (!threadId) {
    threadId = "t_" + new Date().getTime(); 
    setActiveThreadId_(threadId); 

    const firstUserMsg = history.find(m => m.role === 'user');
    let title = firstUserMsg ? firstUserMsg.text.substring(0, 35) : "New Conversation";
    if (title.length >= 35) title += "...";

    const indexRaw = props.getProperty(THREADS_INDEX_KEY_);
    const index = indexRaw ? JSON.parse(indexRaw) : [];
    index.unshift({ id: threadId, title: title }); 

    props.setProperty(THREADS_INDEX_KEY_, JSON.stringify(index.slice(0, 15)));
  }

  const trimmed = history.slice(-CHAT_MAX_MESSAGES_);
  props.setProperty("CHAT_" + threadId, JSON.stringify(trimmed));
}

/**
 * Opens the dedicated screen showing a menu of all past chat conversations
 */
function onOpenChatHistory() {
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().pushCard(buildChatHistoryCard_()))
    .build();
}

/**
 * Builds the user interface for the chat history list, including clickable rows and delete buttons
 */
function buildChatHistoryCard_() {
  const PURPLE = "#4b2e83";
  const card = CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle("Chat History"));

  const section = CardService.newCardSection()
    .addWidget(CardService.newTextParagraph().setText("<b><font color='#4b2e83'>Past Conversations</font></b>"));

  const indexRaw = PropertiesService.getUserProperties().getProperty(THREADS_INDEX_KEY_);
  const index = indexRaw ? JSON.parse(indexRaw) : [];

  if (index.length === 0) {
    section.addWidget(CardService.newTextParagraph().setText("<i>No past conversations found.</i>"));
  } else {
    index.forEach(thread => {
      section.addWidget(
        CardService.newDecoratedText()
          .setText(`<b>${escapeHtml_(thread.title)}</b>`)
          .setStartIcon(CardService.newIconImage().setIcon(CardService.Icon.DESCRIPTION))
          .setOnClickAction(
            CardService.newAction()
              .setFunctionName("onLoadChatThread")
              .setParameters({ threadId: String(thread.id) })
          )
          .setButton(
            CardService.newImageButton()
              .setIconUrl("https://cdn-icons-png.flaticon.com/512/6861/6861362.png")
              .setAltText("Delete chat")
              .setOnClickAction(
                CardService.newAction()
                  .setFunctionName("onDeleteSingleChatThread")
                  .setParameters({ threadId: String(thread.id) })
              )
          )
      );
      section.addWidget(CardService.newDivider()); 
    });
  }

  card.addSection(section);

  const stickyFooter = CardService.newFixedFooter()
    .setPrimaryButton(
      CardService.newTextButton()
        .setText("Clear All History")
        .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
        .setBackgroundColor(PURPLE)
        .setOnClickAction(CardService.newAction().setFunctionName("onClearAllHistory"))
    );

  card.setFixedFooter(stickyFooter);
  return card.build();
}

/**
 * Loads a specific past conversation from the history menu into the chat window
 */
function onLoadChatThread(e) {
  const threadId = e.parameters.threadId;
  setActiveThreadId_(threadId); 
  clearPendingProposal_(); 

  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().pushCard(buildChatCard_()))
    .build();
}

/**
 * Deletes a single specific chat thread from the history list and storage
 */
function onDeleteSingleChatThread(e) {
  const threadId = String(e.parameters.threadId);
  const props = PropertiesService.getUserProperties();
  
  // Delete the actual messages for this specific thread
  props.deleteProperty("CHAT_" + threadId);
  
  // Remove it from the main index menu
  const indexRaw = props.getProperty(THREADS_INDEX_KEY_);
  let index = indexRaw ? JSON.parse(indexRaw) : [];
  index = index.filter(thread => thread.id !== threadId);
  props.setProperty(THREADS_INDEX_KEY_, JSON.stringify(index));
  
  // If the user is currently looking at this exact thread, clear the active session
  if (getActiveThreadId_() === threadId) {
    clearActiveThreadId_();
  }

  return CardService.newActionResponseBuilder()
    // Refreshes the history menu so the deleted chat disappears instantly
    .setNavigation(CardService.newNavigation().updateCard(buildChatHistoryCard_()))
    .build();
}

/**
 * Wipes out every single saved chat conversation and resets the history index
 */
function onClearAllHistory() {
  const props = PropertiesService.getUserProperties();
  const indexRaw = props.getProperty(THREADS_INDEX_KEY_);
  const index = indexRaw ? JSON.parse(indexRaw) : [];
  
  index.forEach(thread => props.deleteProperty("CHAT_" + thread.id));
  
  props.deleteProperty(THREADS_INDEX_KEY_);
  clearActiveThreadId_(); 
  clearPendingProposal_();

  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().updateCard(buildChatHistoryCard_()))
    .build();
}