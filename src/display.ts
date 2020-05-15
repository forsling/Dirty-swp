import * as vscode from 'vscode';
import * as fs from "fs";
import { swpFile, DsDocument } from "./types";
import { DsDocs, active } from './extension';

const listSwp = function() {
    let listItems = [];

    //Add lock until close action (if applicable)
    let activeEditor = vscode.window.activeTextEditor;

    if (activeEditor && activeEditor.document.uri.scheme == "file") {
        let currentDoc : DsDocument | null
        let currentDocKey: string;

        if (typeof vscode.window.activeTextEditor != 'undefined') {
            currentDocKey = vscode.window.activeTextEditor.document.uri.toString();
        } else {
            currentDocKey = "";
        }
        
        currentDoc = DsDocs[currentDocKey];

        let showLockAction = true;
        if (typeof currentDoc === 'undefined' || !currentDoc || currentDoc.forceLock) {
            showLockAction = false;
        } else if (!currentDoc.hasOurSwp) {
            try {
                fs.statSync(currentDoc.swapPath);
                showLockAction = false;
            } catch (err) { }
        }

        if (showLockAction) {
            listItems.push({
                label: "Lock current file until close",
                action: () => {
                    vscode.commands.executeCommand("dirtyswp.lockuntilclose");
                }
            })
        }
    }

    //Add activate/deactivate action
    if (active) {
        listItems.push({
            label: "Pause Dirty.swp (release all locks)",
            action: () => {
                vscode.commands.executeCommand("dirtyswp.stop");
            }
        })
    } else {
        listItems.push({
            label: "Start Dirty.swp",
            action: () => {
                vscode.commands.executeCommand("dirtyswp.start");
            }
        })
    }

    //Add all known locked files and their status
    Object.entries(DsDocs).forEach(entry => {
        let doc = entry[1];
        let description;
        if (doc.hasOurSwp) {
            description = doc.forceLock ? "Locked by you (until close)" : "Locked by you (dirty)";
        } else {
            if (hasSwpSync(doc)) {
                description = "WARNING: Locked by other party";
            } else if (doc.potentialUnsyncedChanges) {
                description = "WARNING: Potential unsynced changes";
            } else {
                return
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
    })

    vscode.window.showQuickPick(listItems).then((val) => {
        if (val && val.action) {
            val.action();
        }
    })
}

function hasSwpSync(dsDoc: DsDocument) {
    try {
        let stats = fs.statSync(dsDoc.swapPath);
        if (stats) {
            return true;
        }
    } catch (err) {
        return false;
    }
    return false;
}

const warn = function(filename: string, editing: boolean, swp: null | swpFile) {
    let user : false | string = false;
    if (swp && swp.vscodeSwp && swp.swpUser) {
        user = swp.swpUser;
    }

    let part1 = "is in use someplace else";
    if (user) {
        part1 = "is in use by " + user;
    }
    let part2 = " (.swp file exists)";
    if (editing) {
        part2 = ". If you save your changes you may overwrite ";
        if (user) {
            part2 += "theirs!";
        } else {
            part2 += "someone elses!";
        }
    }
    
    let message = `${filename} ${part1}${part2}`;
    if (editing) {
        vscode.window.showWarningMessage(message, 'Open Dialog', 'Save As Dialog').then((choice) => showDialog(choice));
    } else {
        vscode.window.showWarningMessage(message)
    }
}

const showDialog = function(choice: (string | undefined)) {
    if (typeof choice == 'undefined') {
        return;
    }
    if (choice == 'Open Dialog') {
        vscode.window.showOpenDialog({});
    } else if (choice == 'Save As Dialog') {
        vscode.window.showSaveDialog({});
    } else {
        console.log("Invalid dialog choice: " + choice);
    }
}

export { listSwp, warn, showDialog };