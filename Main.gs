function onHomepage(e) {
  const prefs = getPrefs_();
  if (!prefs || !prefs.hasCompletedOnboarding) {
    // buildOnboardingIntroCard_ returns a Builder. We call .build() here.
    return buildOnboardingIntroCard_().build(); 
  }
  // buildHomeCard_ returns a Builder. We call .build() here.
  return buildHomeCard_(prefs).build();
}