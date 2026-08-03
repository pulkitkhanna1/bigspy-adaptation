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

// Paste your Groq API Key here if you wish to hardcode it:
const HARDCODED_API_KEY = 'GROQ_API_KEY_REMOVED';

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
      PropertiesService.getScriptProperties().setProperty('GROQ_API_KEY', key);
      ui.alert('Success', 'Groq API Key saved successfully!', ui.ButtonSet.OK);
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
    promoLink: headers.indexOf('promo link'),
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
    apiKey = PropertiesService.getScriptProperties().getProperty('GROQ_API_KEY');
  }
  
  if (!apiKey) {
    SpreadsheetApp.getUi().alert('Error: Groq API Key is not set. Please set the HARDCODED_API_KEY variable at the top of the Apps Script.');
    return;
  }
  
  let processedCount = 0;
  const maxRowsToProcess = 10; // Process in small batches of 10 to stay within token-per-minute limits
  
  // Loop through rows (skip header row 0)
  for (let i = 1; i < values.length; i++) {
    if (processedCount >= maxRowsToProcess) break;
    
    const rowNum = i + 1;
    const promoLinkVal = colIndex.promoLink !== -1 ? String(values[i][colIndex.promoLink]).trim() : '';
    let scriptVal = String(values[i][colIndex.script]).trim();
    const statusVal = colIndex.status !== -1 ? String(values[i][colIndex.status]).trim().toLowerCase() : '';
    const tropeVal = colIndex.powerStartTrope !== -1 ? String(values[i][colIndex.powerStartTrope]).trim() : '';
    
    // Determine if we need to process this row
    const needsTranscription = (!scriptVal || scriptVal.length <= 5) && promoLinkVal.startsWith('http') && (!statusVal || statusVal === 'pending' || statusVal === 'failed');
    const needsAnalysis = scriptVal.length > 5 && (!statusVal || statusVal === 'pending' || statusVal === 'failed') && !tropeVal;
    
    if (needsTranscription || needsAnalysis) {
      let success = true;
      
      // Step 1: Transcribe if script is empty and video link is available
      if (needsTranscription) {
        if (colIndex.status !== -1) {
          sheet.getRange(rowNum, colIndex.status + 1).setValue('Transcribing...');
          SpreadsheetApp.flush();
        }
        try {
          scriptVal = transcribeVideo(promoLinkVal, apiKey);
          if (colIndex.script !== -1) {
            sheet.getRange(rowNum, colIndex.script + 1).setValue(scriptVal);
            SpreadsheetApp.flush();
          }
        } catch (err) {
          success = false;
          Logger.log('Transcription Error row ' + rowNum + ': ' + err.toString());
          if (colIndex.status !== -1) sheet.getRange(rowNum, colIndex.status + 1).setValue('Failed');
          if (colIndex.errorMsg !== -1) sheet.getRange(rowNum, colIndex.errorMsg + 1).setValue('Transcription failed: ' + err.toString());
        }
      }
      
      // Step 2: Analyze script if script is now available
      if (success && scriptVal && scriptVal.length > 5) {
        if (colIndex.status !== -1) {
          sheet.getRange(rowNum, colIndex.status + 1).setValue('Analyzing...');
          SpreadsheetApp.flush();
        }
        try {
          const analysis = callGroqApi(scriptVal, apiKey);
          
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
          Logger.log('Analysis Error row ' + rowNum + ': ' + err.toString());
          if (colIndex.status !== -1) sheet.getRange(rowNum, colIndex.status + 1).setValue('Failed');
          if (colIndex.errorMsg !== -1) sheet.getRange(rowNum, colIndex.errorMsg + 1).setValue('Analysis failed: ' + err.toString());
        }
      }
      SpreadsheetApp.flush();
      Utilities.sleep(5000); // 5-second rate limiting spacer to distribute token usage evenly
    }
  }
  
  if (processedCount > 0) {
    console.log('Processed ' + processedCount + ' rows.');
  }
}

// Calls Groq Llama-3.1 API with JSON output mode and auto-retry on 429 rate limits
function callGroqApi(scriptText, apiKey) {
  const url = 'https://api.groq.com/openai/v1/chat/completions';
  
  const systemInstruction = 
    "You are a script analysis engine. Analyze the short-form romance/drama script and return a raw JSON object with the following keys:\n" +
    "- 'show_name': Short name/title of the show or a fitting title\n" +
    "- 'power_start': The verbatim first few sentences of the script (hook, approx 30s-1min of video, up to the cut point of tension)\n" +
    "- 'power_start_trope': 3-7 words describing the opening trope (e.g., boss revealed in crisis, panicked plea for rescue)\n" +
    "- 'power_start_promise': 1-sentence promise of the hook to a scrolling viewer\n" +
    "- 'opening_conflict_type': One of: power_imbalance, physical_danger, secret_exposure, forbidden_desire, identity_threat, betrayal, moral_dilemma\n" +
    "- 'dominant_genre_tags': Array of 2-4 tags, selected from: secret_pregnancy, forbidden_romance, workplace_power, humiliation_redemption, identity_reveal, revenge_arc, rescue_romance, rich_poor_divide, medical_drama, forced_proximity, possessive_hero, damsel_in_peril\n" +
    "- 'core_promise': 1-sentence story promise / core driver.\n\n" +
    "Return ONLY the raw JSON object. Do not wrap in markdown tags like ```json. Do not include any other text.";

  const promptText = 
    "Analyze this short-form romance/drama video script.\n\nSCRIPT:\n" + scriptText;

  const payload = {
    model: 'llama-3.1-8b-instant',
    messages: [
      { role: 'system', content: systemInstruction },
      { role: 'user', content: promptText }
    ],
    response_format: {
      type: 'json_object'
    },
    temperature: 0.2
  };

  const options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'Authorization': 'Bearer ' + apiKey
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  let attempts = 0;
  const maxAttempts = 3;
  
  while (attempts < maxAttempts) {
    attempts++;
    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();
    
    if (responseCode === 200) {
      const json = JSON.parse(responseText);
      if (!json.choices || json.choices.length === 0 || !json.choices[0].message || !json.choices[0].message.content) {
        throw new Error('Invalid Groq API response payload: ' + responseText);
      }
      const rawText = json.choices[0].message.content.trim();
      return JSON.parse(rawText);
    }
    
    if (responseCode === 429) {
      if (attempts < maxAttempts) {
        console.log('Rate limit hit (429). Waiting 15 seconds before retry attempt ' + attempts + '...');
        Utilities.sleep(15000); // Sleep for 15 seconds to let the TPM window reset
        continue;
      } else {
        throw new Error('Rate limit exceeded (429) after ' + maxAttempts + ' attempts. Please try again in a minute.');
      }
    }
    
    throw new Error('API Error (HTTP ' + responseCode + '): ' + responseText);
  }
}

// Calls Groq Audio Transcription API with auto-retry on 429 rate limits
function transcribeVideo(videoUrl, apiKey) {
  const url = 'https://api.groq.com/openai/v1/audio/transcriptions';
  
  // 1. Download video file as blob
  const responseVideo = UrlFetchApp.fetch(videoUrl, { muteHttpExceptions: true });
  if (responseVideo.getResponseCode() !== 200) {
    throw new Error('Failed to download video from URL (HTTP ' + responseVideo.getResponseCode() + ')');
  }
  const videoBlob = responseVideo.getBlob();
  
  // 2. Build multi-part form payload
  const payload = {
    file: videoBlob,
    model: 'whisper-large-v3',
    response_format: 'json'
  };
  
  const options = {
    method: 'post',
    headers: {
      'Authorization': 'Bearer ' + apiKey
    },
    payload: payload,
    muteHttpExceptions: true
  };
  
  let attempts = 0;
  const maxAttempts = 3;
  
  while (attempts < maxAttempts) {
    attempts++;
    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();
    
    if (responseCode === 200) {
      const json = JSON.parse(responseText);
      if (!json.text) {
        throw new Error('Invalid transcription response payload: ' + responseText);
      }
      return json.text.trim();
    }
    
    if (responseCode === 429) {
      if (attempts < maxAttempts) {
        console.log('Transcription Rate limit hit (429). Waiting 15 seconds before retry attempt ' + attempts + '...');
        Utilities.sleep(15000); // Sleep for 15 seconds to let the rate limit reset
        continue;
      } else {
        throw new Error('Transcription Rate limit exceeded (429) after ' + maxAttempts + ' attempts.');
      }
    }
    
    throw new Error('Transcription API Error (HTTP ' + responseCode + '): ' + responseText);
  }
}
