/**
 * Menu "Website" for the Google Sheet "Website inhoud" (Dirk Vermoesen).
 * Install: see docs/setup.md. The GitHub token lives in Project settings → Script properties → GITHUB_TOKEN.
 */
var REPO = 'AlexanderBoucquey/aquarel-atelier';
var WORKFLOW = 'build.yml';
var TECHNIQUES = ['Aquarel', 'Tekening', 'Olieverf'];
var IMAGE_EXTENSIONS = /\.(jpe?g|png|webp|heic|heif|tiff?|avif|gif)$/i;
var HEADERS = {
  Werken: ['Bestand', 'ID', 'Titel NL', 'Titel EN', 'Techniek', 'Jaar', 'Afmetingen', 'Beschrijving NL', 'Beschrijving EN', 'Tonen', 'Uitgelicht'],
  Tentoonstellingen: ['Titel NL', 'Titel EN', 'Van', 'Tot', 'Plaats', 'Adres', 'Tekst NL', 'Tekst EN', 'Afbeelding', 'Link', 'Tonen', 'Banner'],
  Teksten: ['Key', 'NL', 'EN'],
};

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Website')
    .addItem("Nieuwe foto's ophalen", 'menuFetchPhotos')
    .addItem('Website publiceren', 'menuPublish')
    .addToUi();
}

function menuFetchPhotos() {
  var ui = SpreadsheetApp.getUi();
  try {
    var added = addNewPhotoRows_();
    ui.alert(added === 0
      ? "Geen nieuwe foto's gevonden."
      : added + " nieuwe foto('s) bovenaan toegevoegd. Vul gerust een titel of andere info in (alles is optioneel).");
  } catch (e) {
    ui.alert("Nieuwe foto's ophalen lukte niet: " + e.message);
  }
}

/** Publishing must keep working even when adding rows fails (e.g. a renamed column): the build reports the rest. */
function menuPublish() {
  var ui = SpreadsheetApp.getUi();
  var added = 0;
  var problem = '';
  try {
    added = addNewPhotoRows_();
  } catch (e) {
    problem = e.message;
  }
  var token = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  if (!token) {
    ui.alert('Publiceren is nog niet ingesteld. Laat het even weten aan Alexander.');
    return;
  }
  var response = UrlFetchApp.fetch('https://api.github.com/repos/' + REPO + '/actions/workflows/' + WORKFLOW + '/dispatches', {
    method: 'post',
    contentType: 'application/json',
    muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    payload: JSON.stringify({ ref: 'main' }),
  });
  if (response.getResponseCode() !== 204) {
    ui.alert('Publiceren lukte niet (code ' + response.getResponseCode() + '). Probeer het later opnieuw of laat het weten aan Alexander.');
    return;
  }
  var message = 'Website wordt bijgewerkt, klaar binnen ±2 minuten.';
  if (added) message += '\n\n' + added + " nieuwe foto('s) werden aan de lijst toegevoegd.";
  if (problem) message += "\n\nLet op: nieuwe foto's konden niet aan de lijst toegevoegd worden (" + problem + ').';
  ui.alert(message);
}

function normalize_(name) {
  return String(name).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function sheetByName_(ss, name) {
  var wanted = normalize_(name);
  return ss.getSheets().filter(function (sheet) {
    return normalize_(sheet.getName()) === wanted;
  })[0] || null;
}

function folderByName_(parent, name) {
  var wanted = normalize_(name);
  var folders = parent.getFolders();
  while (folders.hasNext()) {
    var folder = folders.next();
    if (normalize_(folder.getName()) === wanted) return folder;
  }
  return null;
}

/** Same rule as isImageFile in scripts/lib/works.mjs: shortcuts and documents are never photos. */
function isImage_(file) {
  var mimeType = file.getMimeType() || '';
  if (mimeType.indexOf('image/') === 0) return true;
  if (mimeType && mimeType !== 'application/octet-stream') return false;
  return IMAGE_EXTENSIONS.test(file.getName());
}

/**
 * Adds a row at the top of "Werken" for every photo in the Werken folder that has no row yet. Only the Bestand or ID
 * column is required; other columns are filled in when present.
 */
function addNewPhotoRows_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = sheetByName_(ss, 'Werken');
  if (!sheet) throw new Error('tabblad "Werken" niet gevonden');
  var parent = DriveApp.getFileById(ss.getId()).getParents().next();
  var folder = folderByName_(parent, 'Werken');
  if (!folder) throw new Error('map "Werken" niet gevonden naast deze Sheet');

  var headers = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0].map(normalize_);
  var col = function (name) {
    return headers.indexOf(name) + 1; // 0 = column missing
  };
  var fileCol = col('bestand');
  var idCol = col('id');
  if (!fileCol && !idCol) throw new Error('kolommen "Bestand" en "ID" ontbreken in het tabblad Werken');

  // A photo is known when a row holds its ID, or — for rows without ID — its file name. Rows with an ID never
  // block another photo that happens to have the same name (e.g. two "image0.jpeg").
  var knownIds = {};
  var knownNames = {};
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    var ids = idCol ? sheet.getRange(2, idCol, lastRow - 1, 1).getValues() : [];
    var names = fileCol ? sheet.getRange(2, fileCol, lastRow - 1, 1).getValues() : [];
    for (var r = 0; r < lastRow - 1; r++) {
      var id = ids.length ? String(ids[r][0]).trim() : '';
      var name = names.length ? String(names[r][0]).trim().toLowerCase() : '';
      if (id) knownIds[id] = true;
      else if (name) knownNames[name] = true;
    }
  }

  var fresh = [];
  var files = folder.getFiles();
  while (files.hasNext()) {
    var f = files.next();
    if (isImage_(f) && !knownIds[f.getId()] && !knownNames[f.getName().trim().toLowerCase()]) fresh.push(f);
  }
  if (fresh.length === 0) return 0;
  fresh.sort(function (a, b) {
    return b.getDateCreated() - a.getDateCreated();
  });

  sheet.insertRowsBefore(2, fresh.length);
  fresh.forEach(function (f, i) {
    var row = 2 + i;
    if (fileCol) sheet.getRange(row, fileCol).setRichTextValue(SpreadsheetApp.newRichTextValue().setText(f.getName()).setLinkUrl(f.getUrl()).build());
    if (idCol) sheet.getRange(row, idCol).setValue(f.getId());
  });
  if (col('tonen')) sheet.getRange(2, col('tonen'), fresh.length, 1).insertCheckboxes().check();
  if (col('uitgelicht')) sheet.getRange(2, col('uitgelicht'), fresh.length, 1).insertCheckboxes().uncheck();
  if (col('techniek')) sheet.getRange(2, col('techniek'), fresh.length, 1).setDataValidation(techniqueRule_());
  return fresh.length;
}

function techniqueRule_() {
  return SpreadsheetApp.newDataValidation().requireValueInList(TECHNIQUES, true).setAllowInvalid(true).build();
}

/** Run once from the Apps Script editor: creates the three tabs with their columns. Existing tabs are left alone. */
function setupSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(HEADERS).forEach(function (name) {
    if (sheetByName_(ss, name)) return;
    var sheet = ss.insertSheet(name);
    var headers = HEADERS[name];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sheet.setFrozenRows(1);
    if (name === 'Werken') {
      sheet.hideColumns(headers.indexOf('ID') + 1);
      sheet.getRange(2, headers.indexOf('Techniek') + 1, 999, 1).setDataValidation(techniqueRule_());
    }
    if (name === 'Tentoonstellingen') {
      sheet.getRange(2, headers.indexOf('Tonen') + 1, 200, 1).insertCheckboxes().check();
      sheet.getRange(2, headers.indexOf('Banner') + 1, 200, 1).insertCheckboxes();
      sheet.getRange(2, headers.indexOf('Van') + 1, 200, 2).setNumberFormat('dd/mm/yyyy');
    }
    if (name === 'Teksten') {
      sheet.getRange(2, 1, 2, 1).setValues([['home_intro'], ['about']]);
    }
  });
  ['Blad1', 'Sheet1'].forEach(function (name) {
    var blank = ss.getSheetByName(name);
    if (blank && ss.getSheets().length > 1 && blank.getLastRow() === 0) ss.deleteSheet(blank);
  });
}
