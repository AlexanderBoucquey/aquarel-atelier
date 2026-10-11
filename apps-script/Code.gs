/**
 * Menu "Website" for the Google Sheet "Website inhoud" (Dirk Vermoesen).
 * Install: see docs/setup.md. The GitHub token lives in Project settings → Script properties → GITHUB_TOKEN.
 */
var REPO = 'AlexanderBoucquey/aquarel-atelier';
var WORKFLOW = 'build.yml';
var WORKS_FOLDER = 'Werken';
var TECHNIQUES = ['Aquarel', 'Tekening', 'Olieverf'];
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
  var added = addNewPhotoRows_();
  SpreadsheetApp.getUi().alert(added === 0
    ? "Geen nieuwe foto's gevonden."
    : added + " nieuwe foto('s) bovenaan toegevoegd. Vul gerust een titel of andere info in (alles is optioneel).");
}

function menuPublish() {
  var ui = SpreadsheetApp.getUi();
  var added = addNewPhotoRows_();
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
  if (response.getResponseCode() === 204) {
    ui.alert('Website wordt bijgewerkt, klaar binnen ±2 minuten.' + (added ? '\n\n' + added + " nieuwe foto('s) werden aan de lijst toegevoegd." : ''));
  } else {
    ui.alert('Publiceren lukte niet (code ' + response.getResponseCode() + '). Probeer het later opnieuw of laat het weten aan Alexander.');
  }
}

/** Adds a row at the top of "Werken" for every photo in the Werken folder that has no row yet. */
function addNewPhotoRows_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Werken');
  if (!sheet) throw new Error('Tabblad "Werken" niet gevonden.');
  var parent = DriveApp.getFileById(ss.getId()).getParents().next();
  var folders = parent.getFoldersByName(WORKS_FOLDER);
  if (!folders.hasNext()) throw new Error('Map "' + WORKS_FOLDER + '" niet gevonden naast deze Sheet.');
  var folder = folders.next();

  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function (h) {
    return String(h).trim().toLowerCase();
  });
  var col = function (name) {
    var i = headers.indexOf(name);
    if (i < 0) throw new Error('Kolom "' + name + '" ontbreekt in het tabblad Werken.');
    return i + 1;
  };
  var fileCol = col('bestand');
  var idCol = col('id');
  var tonenCol = col('tonen');
  var featuredCol = col('uitgelicht');
  var techniqueCol = col('techniek');

  var knownIds = {};
  var knownNames = {};
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, idCol, lastRow - 1, 1).getValues().forEach(function (r) {
      if (r[0]) knownIds[String(r[0]).trim()] = true;
    });
    sheet.getRange(2, fileCol, lastRow - 1, 1).getValues().forEach(function (r) {
      if (r[0]) knownNames[String(r[0]).trim().toLowerCase()] = true;
    });
  }

  var fresh = [];
  var files = folder.getFiles();
  while (files.hasNext()) {
    var f = files.next();
    var isImage = f.getMimeType().indexOf('image/') === 0 || /\.(jpe?g|png|webp|heic|heif|tiff?|avif|gif)$/i.test(f.getName());
    if (isImage && !knownIds[f.getId()] && !knownNames[f.getName().trim().toLowerCase()]) fresh.push(f);
  }
  if (fresh.length === 0) return 0;
  fresh.sort(function (a, b) {
    return b.getDateCreated() - a.getDateCreated();
  });

  sheet.insertRowsBefore(2, fresh.length);
  fresh.forEach(function (f, i) {
    var row = 2 + i;
    sheet.getRange(row, fileCol).setRichTextValue(SpreadsheetApp.newRichTextValue().setText(f.getName()).setLinkUrl(f.getUrl()).build());
    sheet.getRange(row, idCol).setValue(f.getId());
  });
  sheet.getRange(2, tonenCol, fresh.length, 1).insertCheckboxes().check();
  sheet.getRange(2, featuredCol, fresh.length, 1).insertCheckboxes().uncheck();
  sheet.getRange(2, techniqueCol, fresh.length, 1).setDataValidation(techniqueRule_());
  return fresh.length;
}

function techniqueRule_() {
  return SpreadsheetApp.newDataValidation().requireValueInList(TECHNIQUES, true).setAllowInvalid(true).build();
}

/** Run once from the Apps Script editor: creates the three tabs with their columns. Existing tabs are left alone. */
function setupSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(HEADERS).forEach(function (name) {
    if (ss.getSheetByName(name)) return;
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
