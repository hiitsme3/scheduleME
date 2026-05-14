# ScheduleME!
## Scheduling AI Assistant

An AI-assisted Google Calendar Add-On that enables conversational scheduling, availability detection, and commitment suggestions directly inside the Google Workspace. This tool can analyze a user’s calendar and collect user preferences to make smart scheduling suggestions.

### Features

- Create calendar events through natural conversation 
- Analyze schedule availability and suggest event times
- Modify or reject proposed events before saving
- Build a personalized scheduling profile 
- Apply learned behavior and habits into future schedule suggestions

### Features

- **Frontend**: Google Workspace Add-on Card UI (Apps Script)
- **Backend**: Google Apps Script (JS)
- **Calendar Access**: Google Calendar API
- **AI**: Gemini API
- **Deployment**: Google Cloud Project + Apps Script


### Getting started

#### Prerequisites 
- Google Account
- (Preferable) Google Calendar pre-populated with events

#### Steps 
1. **Create a Google Cloud Project**
- Go to Google Cloud Console and create a new project
- Enable the Google Calendar API and Google Apps Script API

2. **Create an Apps Script Project**
- Go to the Apps Script environment and create a new project
- Replace the files with the repository's code
- Update appscript.json with the following if you are in a different time zone:
```bash
"timeZone": "America/Los_Angeles" 
```

3. Configure your Gemini API key in Apps Script [incoming step]

4. **Deploy the Add-on**
- Click Deploy > Test deployments 
- Select the Google Workspace Add-on
- Install for testing
- Open Google Calendar on the right sidebar and launch the add-on 
    -  If this is the first time deploying, you will need to grant permission for the add-on to access your data


## Run after editing

Note that Apps Script will have to manually reload any changes, so after any edit is made: 
1. Deploy the add-on as a test deployment
2. Uninstall and install for testing
3. Hit refresh in the add-on
