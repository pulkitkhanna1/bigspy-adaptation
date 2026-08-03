/**
 * BigSpy Adaptation Engine — Google Sheets Automation
 * 
 * Paste this script into your Google Sheet's Apps Script Editor (Extensions > Apps Script).
 * 
 * Instructions:
 * 1. Open your Google Sheet (https://docs.google.com/spreadsheets/d/1-heUjyrEZZO5zqFy8rWJkiieTk6SNkhMutMzdYwwTug/edit).
 * 2. Go to Extensions > Apps Script.
 * 3. Delete any default code and paste this entire script.
 * 4. Save (Ctrl+S or Cmd+S).
 * 5. Refresh your Google Sheet. You will see a new menu: "BigSpy Engine".
 * 6. Set your API Key via: BigSpy Engine > Set Gemini API Key.
 * 7. Click "Process Pending Rows" to run. The script will automatically add the new columns!
 */

// Paste your Gemini API Key here if you wish to hardcode it:
const HARDCODED_API_KEY = 'GEMINI_API_KEY_REMOVED';

// Custom menu on spreadsheet open
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('BigSpy Engine')
    .addItem('Process Pending Rows', 'processPendingRows')
    .addSeparator()
    .addItem('Set Gemini API Key', 'setApiKey')
    .addItem('Show Setup Guide', 'showSetupGuide')
    .addToUi();
}

// Configures and saves the API key in the ScriptProperties storage
function setApiKey() {
  const ui = SpreadsheetApp.getUi();
  const result = ui.prompt(
    'Set Gemini API Key',
    'Please enter your Google AI Studio (Gemini) API Key:',
    ui.ButtonSet.OK_CANCEL
  );
  
  if (result.getSelectedButton() === ui.Button.OK) {
    const key = result.getResponseText().trim();
    if (key) {
      PropertiesService.getScriptProperties().setProperty('GEMINI_API_KEY', key);
      ui.alert('Success', 'Gemini API Key saved successfully!', ui.ButtonSet.OK);
    } else {
      ui.alert('Error', 'API Key cannot be empty.', ui.ButtonSet.OK);
    }
  }
}

// Show setup details to the user
function showSetupGuide() {
  const ui = SpreadsheetApp.getUi();
  const message = [
    '=== Setup Guide ===',
    '1. Ensure your sheet has a column named exactly "Script" (case-insensitive).',
    '2. Running the tool:',
    '   - Go to BigSpy Engine > Process Pending Rows.',
    '   - The script will automatically check and create these columns at the end of Row 1:',
    '     * "Show" (output: show/story name)',
    '     * "Power Start" (output: opening hook verbatim)',
    '     * "Power Start Trope" (output: trope label)',
    '     * "Power Start Promise" (output: 1-sentence promise of the hook)',
    '     * "Conflict Type" (output: category of opening conflict)',
    '     * "Genre Tags" (output: comma-separated genre tags)',
    '     * "Core Promise" (output: 1-sentence core story promise)',
    '     * "Status" (tracking status of the analysis)',
    '     * "Error Message" (captures API or script issues)',
    '',
    '3. Setting up automation:',
    '   - Go to Extensions > Apps Script.',
    '   - Click on the Triggers icon (clock symbol on left panel).',
    '   - Click "+ Add Trigger".',
    '   - Choose "processPendingRows" as the function to run.',
    '   - Select "Time-driven" -> "Minutes timer" -> "Every minute" (or every 5/10 minutes).',
    '   - Save. Now, any row you add with a "Script" column will be auto-processed in the background!'
  ].join('\n');
  ui.alert('BigSpy Setup Instructions', message, ui.ButtonSet.OK);
}

// Helper to check for required columns and dynamically append them if missing
function ensureHeaders(sheet) {
  const lastCol = sheet.getLastColumn() || 1;
  const range = sheet.getRange(1, 1, 1, lastCol);
  const headers = range.getValues()[0].map(h => String(h).trim());
  const lowerHeaders = headers.map(h => h.toLowerCase());
  
  const requiredHeaders = [
    'Show', 'Power Start', 'Power Start Trope', 'Power Start Promise', 
    'Conflict Type', 'Genre Tags', 'Core Promise', 'Status', 'Error Message'
  ];
  
  let added = false;
  let currentLastCol = headers.length;
  
  requiredHeaders.forEach(req => {
    if (lowerHeaders.indexOf(req.toLowerCase()) === -1) {
      sheet.getRange(1, currentLastCol + 1).setValue(req);
      // Format the new header column to look nice
      sheet.getRange(1, currentLastCol + 1)
        .setBackground('#f3f4f6')
        .setFontWeight('bold')
        .setBorder(true, true, true, true, true, true);
      
      headers.push(req);
      lowerHeaders.push(req.toLowerCase());
      currentLastCol++;
      added = true;
    }
  });
  
  if (added) {
    SpreadsheetApp.flush();
  }
  return lowerHeaders;
}

// Core function to find pending rows and analyze them
function processPendingRows() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  
  // Ensure required headers exist (create them if missing)
  const headers = ensureHeaders(sheet);
  
  const range = sheet.getDataRange();
  const values = range.getValues();
  
  // Map column indices based on header names
  const colIndex = {
    id: headers.indexOf('id'),
    show: headers.indexOf('show'),
    script: headers.indexOf('script'),
    powerStart: headers.indexOf('power start'),
    powerStartTrope: headers.indexOf('power start trope'),
    powerStartPromise: headers.indexOf('power start promise'),
    conflictType: headers.indexOf('conflict type'),
    genreTags: headers.indexOf('genre tags'),
    corePromise: headers.indexOf('core promise'),
    status: headers.indexOf('status'),
    errorMsg: headers.indexOf('error message')
  };
  
  // Validate that required input column exists
  if (colIndex.script === -1) {
    SpreadsheetApp.getUi().alert('Error: Could not find a "Script" column. Please rename your script input column to "Script".');
    return;
  }
  
  // Fetch API Key
  let apiKey = HARDCODED_API_KEY;
  if (apiKey === 'YOUR_API_KEY_HERE' || !apiKey) {
    apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  }
  
  if (!apiKey) {
    SpreadsheetApp.getUi().alert('Error: Gemini API Key is not set. Please set the HARDCODED_API_KEY variable at the top of the Apps Script or use BigSpy Engine > Set Gemini API Key.');
    return;
  }
  
  let processedCount = 0;
  const maxRowsToProcess = 5; // Process in small batches of 5 to avoid Apps Script timeouts (6-min limit)
  
  // Loop through rows (skip header row 0)
  for (let i = 1; i < values.length; i++) {
    if (processedCount >= maxRowsToProcess) break;
    
    const rowNum = i + 1;
    const scriptVal = String(values[i][colIndex.script]).trim();
    const statusVal = colIndex.status !== -1 ? String(values[i][colIndex.status]).trim().toLowerCase() : '';
    const tropeVal = colIndex.powerStartTrope !== -1 ? String(values[i][colIndex.powerStartTrope]).trim() : '';
    
    // Check if script exists and is not yet processed (status is empty/Pending/Failed AND no trope yet)
    if (scriptVal.length > 5 && (!statusVal || statusVal === 'pending' || statusVal === 'failed') && !tropeVal) {
      if (colIndex.status !== -1) {
        sheet.getRange(rowNum, colIndex.status + 1).setValue('Processing...');
        SpreadsheetApp.flush();
      }
      
      try {
        const analysis = callGeminiApi(scriptVal, apiKey);
        
        // Write results to sheet
        if (colIndex.show !== -1) sheet.getRange(rowNum, colIndex.show + 1).setValue(analysis.show_name || '');
        if (colIndex.powerStart !== -1) sheet.getRange(rowNum, colIndex.powerStart + 1).setValue(analysis.power_start || '');
        if (colIndex.powerStartTrope !== -1) sheet.getRange(rowNum, colIndex.powerStartTrope + 1).setValue(analysis.power_start_trope || '');
        if (colIndex.powerStartPromise !== -1) sheet.getRange(rowNum, colIndex.powerStartPromise + 1).setValue(analysis.power_start_promise || '');
        if (colIndex.conflictType !== -1) sheet.getRange(rowNum, colIndex.conflictType + 1).setValue(analysis.opening_conflict_type || '');
        if (colIndex.genreTags !== -1) {
          const tags = Array.isArray(analysis.dominant_genre_tags) ? analysis.dominant_genre_tags.join(', ') : (analysis.dominant_genre_tags || '');
          sheet.getRange(rowNum, colIndex.genreTags + 1).setValue(tags);
        }
        if (colIndex.corePromise !== -1) sheet.getRange(rowNum, colIndex.corePromise + 1).setValue(analysis.core_promise || '');
        
        if (colIndex.status !== -1) sheet.getRange(rowNum, colIndex.status + 1).setValue('Processed');
        if (colIndex.errorMsg !== -1) sheet.getRange(rowNum, colIndex.errorMsg + 1).setValue('');
        
        processedCount++;
        
      } catch (err) {
        Logger.log('Error row ' + rowNum + ': ' + err.toString());
        if (colIndex.status !== -1) sheet.getRange(rowNum, colIndex.status + 1).setValue('Failed');
        if (colIndex.errorMsg !== -1) sheet.getRange(rowNum, colIndex.errorMsg + 1).setValue(err.toString());
      }
      SpreadsheetApp.flush();
      Utilities.sleep(1000); // 1-second rate limiting spacer
    }
  }
  
  if (processedCount > 0) {
    console.log('Processed ' + processedCount + ' rows.');
  }
}

// Calls Gemini 2.0 Flash API with Structured JSON Schema output
function callGeminiApi(scriptText, apiKey) {
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + apiKey;
  
  const systemInstruction = 
    "Analyze the provided short-form romance/drama video script. Extract and categorize its tropes, core hooks, " +
    "and opening details according to the CRACK framework. Return a structured JSON response.";

  const promptText = 
    "Analyze this short-form romance/drama video script. Identify the Show / Story name if mentioned or suggest a fitting title.\n\n" +
    "SCRIPT:\n" + scriptText;

  const payload = {
    contents: [
      {
        parts: [
          { text: promptText }
        ]
      }
    ],
    systemInstruction: {
      parts: [
        { text: systemInstruction }
      ]
    },
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          show_name: { 
            type: 'STRING', 
            description: 'Name of the show or a short fitting title' 
          },
          power_start: { 
            type: 'STRING', 
            description: 'The exact verbatim opening hook / first few lines from script (approx 30s-1min of video, up to the cut point of tension)' 
          },
          power_start_trope: { 
            type: 'STRING', 
            description: 'A 3-7 word description of the opening trope (e.g. boss revealed in crisis, panicked plea for rescue)' 
          },
          power_start_promise: { 
            type: 'STRING', 
            description: 'One sentence outlining what promise the opening hook makes to a scrolling viewer' 
          },
          opening_conflict_type: { 
            type: 'STRING', 
            enum: ['power_imbalance', 'physical_danger', 'secret_exposure', 'forbidden_desire', 'identity_threat', 'betrayal', 'moral_dilemma'],
            description: 'The primary conflict type governing the opening hook'
          },
          dominant_genre_tags: { 
            type: 'ARRAY', 
            items: { type: 'STRING' },
            description: '2 to 4 genre tags, selected from: secret_pregnancy, forbidden_romance, workplace_power, humiliation_redemption, identity_reveal, revenge_arc, rescue_romance, rich_poor_divide, medical_drama, forced_proximity, possessive_hero, damsel_in_peril'
          },
          core_promise: { 
            type: 'STRING', 
            description: '1-sentence summary of the main story promise / core driver' 
          }
        },
        required: [
          'show_name', 'power_start', 'power_start_trope', 'power_start_promise', 
          'opening_conflict_type', 'dominant_genre_tags', 'core_promise'
        ]
      }
    }
  };

  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(url, options);
  const responseCode = response.getResponseCode();
  const responseText = response.getContentText();
  
  if (responseCode !== 200) {
    throw new Error('API Error (HTTP ' + responseCode + '): ' + responseText);
  }
  
  const json = JSON.parse(responseText);
  if (!json.candidates || json.candidates.length === 0 || !json.candidates[0].content || !json.candidates[0].content.parts[0].text) {
    throw new Error('Invalid Gemini API response payload: ' + responseText);
  }
  
  const rawText = json.candidates[0].content.parts[0].text;
  return JSON.parse(rawText);
}
