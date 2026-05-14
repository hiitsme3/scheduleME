/******************************
 * Knowledge Bank (Storage)
 * Uses UserProperties so each user has their own saved prefs.
 ******************************/

const KB_KEY_ = "knowledgeBank";

/**
 * Returns the saved preferences object, or null if not set.
 */
function getPrefs_() {
  const raw = PropertiesService.getUserProperties().getProperty(KB_KEY_);
  return raw ? JSON.parse(raw) : null;
}

/**
 * Saves the preferences object.
 */
function savePrefs_(prefs) {
  PropertiesService.getUserProperties().setProperty(KB_KEY_, JSON.stringify(prefs));
}

/**
 * Deletes the saved preferences.
 */
function clearPrefs_() {
  PropertiesService.getUserProperties().deleteProperty(KB_KEY_);
}