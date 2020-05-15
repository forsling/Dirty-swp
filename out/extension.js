"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fullSwpString = exports.swpString = exports.active = exports.DsDocs = exports.deactivate = exports.activate = void 0;
const vscode = require("vscode");
const types_1 = require("./types");
const filetasks_1 = require("./filetasks");
const ds = require("./display");
const fs = require("fs");
const swpString = "VSCODE/" + vscode.env.machineId;
exports.swpString = swpString;
let fullSwpString = swpString;
exports.fullSwpString = fullSwpString;
let DsDocs = {};
exports.DsDocs = DsDocs;
let swpStatusBar;
let active = true;
exports.active = active;
function activate(context) {
    let swpName = vscode.workspace.getConfiguration().get('dirtyswp.writeNameToSwp') || "";
    if (typeof swpName != 'undefined' && swpName) {
        exports.fullSwpString = fullSwpString = swpString + ":" + swpName;
    }
    exports.active = active = vscode.workspace.getConfiguration().get('dirtyswp.startActive') || true;
    let statusBarEnabled = vscode.workspace.getConfiguration().get('dirtyswp.showStatusBarItem');
    let openDocumentListener = vscode.workspace.onDidOpenTextDocument(e => {
        if (!active || e.uri.scheme != "file") {
            return;
        }
        //create DocumentInfo object and add it to documents
        let dsDoc = new types_1.DsDocument(e);
        DsDocs[e.uri.toString()] = dsDoc;
        //warn user if file is being edited somewhere else
        filetasks_1.checkSwp(dsDoc, (swp) => {
            ds.warn(dsDoc.basename, false, swp);
        }, () => { });
        console.log(DsDocs);
    });
    let closeDocumentListener = vscode.workspace.onDidCloseTextDocument(e => {
        if (!active || e.uri.scheme != "file") {
            return;
        }
        let doc = DsDocs[e.uri.toString()];
        //If there is a swap file that we created, remove it on document close
        doc.removeOwnSwp();
        delete DsDocs[e.uri.toString()];
        console.log(DsDocs);
    });
    let documentChangedListener = vscode.workspace.onDidChangeTextDocument(e => {
        if (!active || e.document.uri.scheme != "file") {
            return;
        }
        let test = e.document.uri.toString();
        let doc = DsDocs[e.document.uri.toString()];
        if (!doc.textDocument.isDirty) { //file has no unsaved changes
            doc.potentialUnsyncedChanges = false;
            if (doc.hasOurSwp && !doc.forceLock) {
                //if file is no longer dirty but still has our swp, then we can remove the .swp file (unless 'lock until close' is set)
                doc.removeOwnSwp();
            }
        }
        else if (!doc.hasOurSwp) { //file has unsaved changes but is not locked by us
            filetasks_1.checkSwp(doc, (swp) => {
                doc.potentialUnsyncedChanges = true;
                ds.warn(doc.basename, true, swp);
            }, () => {
                if (doc.potentialUnsyncedChanges) {
                    //even if the file is no longer in use by someone else, there may still be changes that have not been loaded (since file is dirty)
                    vscode.window.showWarningMessage(doc.basename + " is no longer being edited elsewhere but may have unsynced changes: Save may overwrite changes!", 'Open Dialog', 'Save As Dialog')
                        .then((choice) => ds.showDialog(choice));
                }
                else {
                    //if the file is not currently locked and has no potential unloaded changes, then we may lock the file for ourselves
                    try {
                        fs.writeFileSync(doc.swapPath, fullSwpString);
                        doc.hasOurSwp = true;
                    }
                    catch (err) {
                        vscode.window.showErrorMessage("Writing .swp failed: " + err);
                    }
                }
            });
        }
    });
    let confChangedListener = vscode.workspace.onDidChangeConfiguration((e) => {
        let statusbarAffected = e.affectsConfiguration('dirtyswp.showStatusBarItem');
        if (statusbarAffected) {
            statusBarEnabled = vscode.workspace.getConfiguration().get('dirtyswp.showStatusBarItem');
            if (statusBarEnabled) {
                swpStatusBar.show();
            }
            else {
                swpStatusBar.hide();
            }
        }
    });
    context.subscriptions.push(confChangedListener);
    //on startup, add any already opened documents
    addOpenDocuments();
    context.subscriptions.push(openDocumentListener);
    context.subscriptions.push(closeDocumentListener);
    context.subscriptions.push(documentChangedListener);
    context.subscriptions.push(vscode.commands.registerCommand('dirtyswp.start', () => {
        if (active) {
            vscode.window.showInformationMessage("Dirty.swp is already active");
            return;
        }
        vscode.window.showInformationMessage("Resuming .swp monitoring and locking");
        exports.active = active = true;
        addOpenDocuments(true);
    }));
    context.subscriptions.push(vscode.commands.registerCommand('dirtyswp.stop', () => {
        if (!active) {
            vscode.window.showInformationMessage("Dirty.swp is already paused");
            return;
        }
        vscode.window.showInformationMessage("Pausing .swp monitoring and locking.");
        deactivate();
    }));
    context.subscriptions.push(vscode.commands.registerCommand('dirtyswp.lockuntilclose', () => {
        if (typeof vscode.window.activeTextEditor === 'undefined') {
            return;
        }
        let name = vscode.window.activeTextEditor.document.uri.toString();
        let dsDoc = DsDocs[name];
        dsDoc.forceLock = true;
        filetasks_1.tryLockFile(dsDoc);
    }));
    context.subscriptions.push(vscode.commands.registerCommand('dirtyswp.listswp', ds.listSwp));
    swpStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1);
    context.subscriptions.push(swpStatusBar);
    swpStatusBar.text = ".swp";
    swpStatusBar.command = "dirtyswp.listswp";
    if (statusBarEnabled) {
        swpStatusBar.show();
    }
    context.subscriptions.push(swpStatusBar);
}
exports.activate = activate;
function addOpenDocuments(createSwpIfDirty = false) {
    vscode.workspace.textDocuments.forEach((openDocument) => {
        if (openDocument.uri.scheme != "file") {
            return;
        }
        let docinfo = new types_1.DsDocument(openDocument);
        DsDocs[docinfo.textDocument.uri.toString()] = docinfo;
        if (createSwpIfDirty && docinfo.textDocument.isDirty) {
            filetasks_1.tryLockFile(docinfo);
        }
        if (!docinfo.hasOurSwp) {
            filetasks_1.checkSwp(docinfo, (swp) => {
                ds.warn(docinfo.basename, false, swp);
            }, () => { });
        }
    });
}
// this method is called when your extension is deactivated
function deactivate() {
    for (let doc of Object.keys(DsDocs)) {
        DsDocs[doc].removeOwnSwp();
    }
    exports.DsDocs = DsDocs = {};
    exports.active = active = false;
}
exports.deactivate = deactivate;
//# sourceMappingURL=extension.js.map