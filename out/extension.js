"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.timeBetweenEditWarnings = exports.active = exports.deactivate = exports.activate = void 0;
const vscode = require("vscode");
const ds = require("./display");
const core_1 = require("./core");
const timeBetweenEditWarnings = 4000;
exports.timeBetweenEditWarnings = timeBetweenEditWarnings;
let swpStatusBar;
let active = true;
exports.active = active;
function activate(context) {
    /**********************
    *  Handle settings
    ***********************/
    exports.active = active = vscode.workspace.getConfiguration().get('dirtyswp.startActive') || true;
    let statusBarEnabled = vscode.workspace.getConfiguration().get('dirtyswp.showStatusBarItem');
    /**********************
    *  Listeners
    ***********************/
    let activeEditorChangedListener = vscode.window.onDidChangeActiveTextEditor((e) => {
        let textDoc = e === null || e === void 0 ? void 0 : e.document;
        if (!active || typeof textDoc === "undefined" || textDoc.uri.scheme != "file") {
            return;
        }
        let dsDoc = core_1.DsDocs[textDoc.uri.toString()];
        if (typeof dsDoc !== 'undefined' && !dsDoc.hasOurSwp) {
            core_1.checkSwp(dsDoc, (swp) => {
                ds.warn(dsDoc, false, swp);
            }, () => { });
        }
    });
    context.subscriptions.push(activeEditorChangedListener);
    let openDocumentListener = vscode.workspace.onDidOpenTextDocument(e => {
        if (!active || e.uri.scheme != "file") {
            return;
        }
        //Create DocumentInfo object and add it to documents
        let dsDoc = new core_1.DsDocument(e);
        core_1.DsDocs[e.uri.toString()] = dsDoc;
        //Warn user if file is being edited somewhere else
        core_1.checkSwp(dsDoc, (swp) => {
            ds.warn(dsDoc, false, swp);
        }, () => { });
        console.log(core_1.DsDocs);
    });
    context.subscriptions.push(openDocumentListener);
    let closeDocumentListener = vscode.workspace.onDidCloseTextDocument(e => {
        if (!active || e.uri.scheme != "file") {
            return;
        }
        let doc = core_1.DsDocs[e.uri.toString()];
        //If there is a swap file that we created, remove it on document close
        doc.removeOwnSwp();
        delete core_1.DsDocs[e.uri.toString()];
        console.log(core_1.DsDocs);
    });
    context.subscriptions.push(closeDocumentListener);
    let documentChangedListener = vscode.workspace.onDidChangeTextDocument(e => {
        if (!active || e.document.uri.scheme != "file") {
            return;
        }
        let dsDoc = core_1.DsDocs[e.document.uri.toString()];
        if (!dsDoc.textDocument.isDirty) {
            dsDoc.potentialUnsyncedChanges = false;
            //If file is no longer dirty, but still has our swp, 
            //then we can remove the .swp file (unless 'lock until close' is set)
            if (dsDoc.hasOurSwp && !dsDoc.forceLock) {
                dsDoc.removeOwnSwp();
            }
        }
        else if (!dsDoc.hasOurSwp) {
            //File has unsaved changes but is not locked by us
            core_1.checkSwp(dsDoc, (swp) => {
                dsDoc.potentialUnsyncedChanges = true;
                ds.warn(dsDoc, true, swp);
            }, () => {
                if (dsDoc.potentialUnsyncedChanges) {
                    //Even if the file is no longer in use by someone else, there may still be changes that have not been loaded (since file is dirty)
                    vscode.window.showWarningMessage(dsDoc.basename + " is no longer being edited elsewhere but may have unsynced changes: Save may overwrite changes!", 'Open Dialog', 'Save As Dialog')
                        .then((choice) => ds.showDialog(choice));
                }
                else {
                    //If the file is not currently locked and has no potential unloaded changes,
                    //then we may lock the file for ourselves
                    core_1.lockFile(dsDoc);
                }
            });
        }
    });
    context.subscriptions.push(documentChangedListener);
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
    /**********************
    *  Register commands
    ***********************/
    let startCmd = vscode.commands.registerCommand('dirtyswp.start', () => {
        if (active) {
            vscode.window.showInformationMessage("Dirty.swp is already active");
            return;
        }
        vscode.window.showInformationMessage("Resuming .swp monitoring and locking");
        exports.active = active = true;
        addOpenDocuments(true);
    });
    context.subscriptions.push(startCmd);
    let stopCmd = vscode.commands.registerCommand('dirtyswp.stop', () => {
        if (!active) {
            vscode.window.showInformationMessage("Dirty.swp is already paused");
            return;
        }
        vscode.window.showInformationMessage("Pausing .swp monitoring and locking.");
        deactivate();
    });
    context.subscriptions.push(stopCmd);
    let lockCmd = vscode.commands.registerCommand('dirtyswp.lockuntilclose', () => {
        if (typeof vscode.window.activeTextEditor === 'undefined') {
            return;
        }
        let name = vscode.window.activeTextEditor.document.uri.toString();
        let dsDoc = core_1.DsDocs[name];
        dsDoc.forceLock = true;
        core_1.lockFile(dsDoc);
    });
    context.subscriptions.push(lockCmd);
    let listCmd = vscode.commands.registerCommand('dirtyswp.listswp', ds.listSwp);
    context.subscriptions.push(listCmd);
    /**********************
    *  Other stuff
    ***********************/
    //Add any documents open on start
    addOpenDocuments();
    //Create status bar
    swpStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1);
    swpStatusBar.text = ".swp";
    swpStatusBar.command = "dirtyswp.listswp";
    if (statusBarEnabled) {
        swpStatusBar.show();
    }
    context.subscriptions.push(swpStatusBar);
}
exports.activate = activate;
const addOpenDocuments = function (createSwpIfDirty = false) {
    vscode.workspace.textDocuments.forEach((openDocument) => {
        if (openDocument.uri.scheme != "file") {
            return;
        }
        let dsDoc = new core_1.DsDocument(openDocument);
        core_1.DsDocs[dsDoc.textDocument.uri.toString()] = dsDoc;
        if (createSwpIfDirty && dsDoc.textDocument.isDirty) {
            core_1.lockFile(dsDoc);
        }
        if (!dsDoc.hasOurSwp) {
            core_1.checkSwp(dsDoc, (swp) => {
                ds.warn(dsDoc, false, swp);
            }, () => { });
        }
    });
};
function deactivate() {
    for (let doc of Object.keys(core_1.DsDocs)) {
        core_1.DsDocs[doc].removeOwnSwp();
    }
    core_1.emptyDocs();
    exports.active = active = false;
}
exports.deactivate = deactivate;
//# sourceMappingURL=extension.js.map