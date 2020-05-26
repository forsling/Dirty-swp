"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.showDialog = exports.warn = exports.listSwp = void 0;
const vscode = require("vscode");
const fs = require("fs");
const core_1 = require("./core");
const extension_1 = require("./extension");
const listSwp = function () {
    let listItems = [];
    //Add lock until close action (if applicable)
    let activeEditor = vscode.window.activeTextEditor;
    if (activeEditor && activeEditor.document.uri.scheme == "file") {
        let currentDoc;
        let currentDocKey;
        if (typeof vscode.window.activeTextEditor != 'undefined') {
            currentDocKey = vscode.window.activeTextEditor.document.uri.toString();
        }
        else {
            currentDocKey = "";
        }
        currentDoc = core_1.DsDocs[currentDocKey];
        let showLockAction = true;
        if (typeof currentDoc === 'undefined' || !currentDoc || currentDoc.forceLock) {
            showLockAction = false;
        }
        else if (!currentDoc.hasOurSwp) {
            try {
                fs.statSync(currentDoc.swapPath);
                showLockAction = false;
            }
            catch (err) { }
        }
        if (showLockAction) {
            listItems.push({
                label: "Lock current file until close",
                action: () => {
                    vscode.commands.executeCommand("dirtyswp.lockuntilclose");
                }
            });
        }
    }
    //Add activate/deactivate action
    if (extension_1.active) {
        listItems.push({
            label: "Pause Dirty.swp (release all locks)",
            action: () => {
                vscode.commands.executeCommand("dirtyswp.stop");
            }
        });
    }
    else {
        listItems.push({
            label: "Start Dirty.swp",
            action: () => {
                vscode.commands.executeCommand("dirtyswp.start");
            }
        });
    }
    //Add all known locked files and their status
    Object.entries(core_1.DsDocs).forEach(entry => {
        let doc = entry[1];
        let description;
        if (doc.hasOurSwp) {
            description = doc.forceLock ? "Locked by you (until close)" : "Locked by you (dirty)";
        }
        else {
            if (hasSwpSync(doc)) {
                description = "WARNING: Locked by other party";
            }
            else if (doc.potentialUnsyncedChanges) {
                description = "WARNING: Potential unsynced changes";
            }
            else {
                return;
            }
        }
        listItems.push({
            "label": "File: " + doc.textDocument.fileName,
            "description": description,
            "id": doc.textDocument.uri,
            action: () => {
                vscode.window.showTextDocument(doc.textDocument);
            }
        });
    });
    vscode.window.showQuickPick(listItems).then((val) => {
        if (val && val.action) {
            val.action();
        }
    });
};
exports.listSwp = listSwp;
function hasSwpSync(dsDoc) {
    try {
        let stats = fs.statSync(dsDoc.swapPath);
        if (stats) {
            return true;
        }
    }
    catch (err) {
        return false;
    }
    return false;
}
const warn = function (dsDoc, editing, swp) {
    let now = Date.now();
    if (editing && dsDoc.lastEditWarning != null
        && now - dsDoc.lastEditWarning < extension_1.timeBetweenEditWarnings) {
        return;
    }
    let filename = dsDoc.basename;
    let user = "other party";
    if (swp && swp.swpType === "vscode") {
        if (swp.swpUser) {
            user = swp.swpUser.length <= 20
                ? swp.swpUser : swp.swpUser.substring(0, 20) + "..";
        }
        else {
            user = "unknown VS Code user";
        }
    }
    else if (swp && swp.swpType === "vim") {
        user = "a Vim user";
    }
    let part1 = "is in use by " + user;
    let part2 = " (.swp file exists)";
    if (editing) {
        part2 = ". If you save your now you may overwrite their changes.";
    }
    let message = `${filename} ${part1}${part2}`;
    if (editing) {
        vscode.window.showWarningMessage(message, 'Open Dialog', 'Save As Dialog')
            .then((choice) => showDialog(choice));
        dsDoc.lastEditWarning = Date.now();
    }
    else {
        vscode.window.showWarningMessage(message);
    }
};
exports.warn = warn;
const showDialog = function (choice) {
    if (typeof choice == 'undefined') {
        return;
    }
    if (choice == 'Open Dialog') {
        vscode.window.showOpenDialog({});
    }
    else if (choice == 'Save As Dialog') {
        vscode.window.showSaveDialog({});
    }
    else {
        console.log("Invalid dialog choice: " + choice);
    }
};
exports.showDialog = showDialog;
//# sourceMappingURL=display.js.map