// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

const swpString = "VSCODE/" + vscode.env.machineId;
let documents = {};
let swpStatusBar;
let active = true;

function DocumentInfo(document) {
    let self = this;
    let filePath = document.uri.fsPath;
    let folder = path.dirname(filePath);
    let basename = path.basename(filePath);

    this.document = document;
    this.basename = basename;
    this.swapPath = path.join(folder, "." + basename + ".swp");
    this.hasOurSwp = false;
    this.forceLock = false;

    //If the file has been in use by someone else while dirty,
    //then there may be unimported changes on disk that risk being overwritten
    this.potentialUnsyncedChanges = false;

    this.removeOwnSwp = function () {
        if (self.hasOurSwp) {
            fs.unlinkSync(self.swapPath);
            self.hasOurSwp = false;
            return true;
        } else {
            return false;
        }
    }
}

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    active = vscode.workspace.getConfiguration().get('dirtyswp.startActive');
    let statusBarEnabled = vscode.workspace.getConfiguration().get('dirtyswp.showStatusBarItem');

    let openDocumentListener = vscode.workspace.onDidOpenTextDocument(e => {
        if (!active || e.uri.scheme != "file") {
            return;
        }

        //create DocumentInfo object and add it to documents
        let docinfo = new DocumentInfo(e);
        documents[docinfo.document.uri] = docinfo;

        //warn user if file is being edited somewhere else
        hasSwp(docinfo, () => {
            vscode.window.showWarningMessage(docinfo.basename + " is in use somewhere else (.swp file exists)")
        })
        console.log(documents);
    })

    let closeDocumentListener = vscode.workspace.onDidCloseTextDocument(e => {
        if (!active || e.uri.scheme != "file") {
            return;
        }

        let doc = documents[e.uri];
        //If there is a swap file that we created, remove it on document close
        doc.removeOwnSwp();

        delete documents[e.uri];
        console.log(documents);
    })

    let documentChangedListener = vscode.workspace.onDidChangeTextDocument(e => {
        if (!active || e.document.uri.scheme != "file") {
            return;
        }

        let doc = documents[e.document.uri];
        if (!doc.document.isDirty) { //file has no unsaved changes
            doc.potentialUnsyncedChanges = false;
            if (doc.hasOurSwp && !doc.forceLock) {
                //if file is no longer dirty but still has our swp, then we can remove the .swp file (unless 'lock until close' is set)
                doc.removeOwnSwp();
            }
        }
        else if (!doc.hasOurSwp) { //file has unsaved changes but is not locked by us
            if (hasSwpSync(doc)) {
                // check first if it it really isn't our file
                fs.readFile(doc.swapPath, "utf-8", (err, data) => {
                    if (!err && data === swpString) {
                        //looks like it was our swp after all, perhaps from and old session
                        doc.hasOurSwp = true;
                        console.log("Reclaimed own swap at: " + doc.swapPath);
                    } else {
                        // if it is in use by someone else then there is a risk of overwriting someone elses changes
                        doc.potentialUnsyncedChanges = true;
                        vscode.window.showWarningMessage(doc.basename + " is in use someplace else: If you save your changes you may overwrite somebody elses!", 'Open Dialog', 'Save As Dialog')
                            .then((choice) => showDialog(choice));
                    }
                });

            } else if (doc.potentialUnsyncedChanges) {
                //even if the file is no longer in use by someone else, there may still be changes that have not been loaded (since file is dirty)
                vscode.window.showWarningMessage(doc.basename + " is no longer being edited elsewhere but may have unsynced changes: Save may overwrite changes!", 'Open Dialog', 'Save As Dialog')
                    .then((choice) => showDialog(choice));
            } else {
                //if the file is not currently locked and has no potential unloaded changes, then we may lock the file for ourselves
                try {
                    fs.writeFileSync(doc.swapPath, swpString);
                    doc.hasOurSwp = true;
                } catch (err) {
                    vscode.window.showErrorMessage("Writing .swp failed: " + err);
                }

            }
        }
    })

    let confChangedListener = vscode.workspace.onDidChangeConfiguration((e) => {
        let statusbarAffected = e.affectsConfiguration('dirtyswp.showStatusBarItem');
        if (statusbarAffected) {
            statusBarEnabled = vscode.workspace.getConfiguration().get('dirtyswp.showStatusBarItem');
            if (statusBarEnabled) {
                swpStatusBar.show();
            } else {
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
            return
        }
        vscode.window.showInformationMessage("Resuming .swp monitoring and locking");
        active = true;
        addOpenDocuments(true);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('dirtyswp.stop', () => {
        if (!active) {
            vscode.window.showInformationMessage("Dirty.swp is already paused");
            return
        }
        vscode.window.showInformationMessage("Pausing .swp monitoring and locking.");
        deactivate();
    }));

    context.subscriptions.push(vscode.commands.registerCommand('dirtyswp.lockuntilclose', () => {
        let name = vscode.window.activeTextEditor.document.uri;
        let docinfo = documents[name];
        docinfo.forceLock = true;
        tryLockFile(docinfo)
    }));

    context.subscriptions.push(vscode.commands.registerCommand('dirtyswp.listswp', () => {
        let listItems = [];

        //Add lock until close action (if applicable)
        let activeEditor = vscode.window.activeTextEditor;

        if (activeEditor && activeEditor.document.uri.scheme == "file") {
            let currentDocKey = vscode.window.activeTextEditor.document.uri;
            let currentDoc = documents[currentDocKey];

            let showLockAction = true;
            if (!currentDoc || currentDoc.forceLock) {
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
        Object.entries(documents).forEach(entry => {
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
                "label": "File: " + doc.document.fileName,
                "description": description,
                "id": doc.document.uri,
                action: () => {
                    vscode.window.showTextDocument(doc.document);
                }
            });
        })

        vscode.window.showQuickPick(listItems).then((val) => {
            if (val && val.action) {
                val.action();
            }
        })

    }));

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

// this method is called when your extension is deactivated
function deactivate() {
    for (let doc of Object.keys(documents)) {
        documents[doc].removeOwnSwp();
    }
    documents = {};
    active = false;
}
exports.deactivate = deactivate;

function hasSwp(DocInfo, hasSwpCallback, noSwpCallback) {
    fs.stat(DocInfo.swapPath, (err, stats) => {
        if (err) {
            if (err.code === 'ENOENT') {
                noSwpCallback();
            } else {
                vscode.window.showErrorMessage("Dirty .swp error: " + err.message)
            }
        } else {
            hasSwpCallback(stats);
        }
    })
}

function hasSwpSync(DocInfo) {
    let swpPath = DocInfo.swapPath;
    try {
        let stats = fs.statSync(swpPath);
        return stats;
    } catch (err) {
        return false;
    }
}

function tryLockFile(docinfo) {
    //if the file is locked by us then editing is fine and nothing else needs to be done
    if (docinfo.hasOurSwp) {
        return;
    } else {
        var swpContents = fs.readFileSync(docinfo.filePath, "utf-8");
        if (swpContents === "VSCODE/" + vscode.env.machineId) {
            docinfo.hasOurSwp = true; 
            return
        }
    }

    //if the file has a swp here then somebody else is editing it
    hasSwp(docinfo, () => {
        vscode.window.showWarningMessage(docinfo.basename + " is in use someplace else: If you save your changes you may overwrite somebody elses!", 'Open Dialog', 'Save As Dialog')
            .then((choice) => showDialog(choice));
    }, () => {
        //if there is no current swp but the file is dirty we should lock it for ourselves
        try {
            fs.writeFileSync(docinfo.swapPath, swpString);
            docinfo.hasOurSwp = true;
            console.log("Written swp: " + docinfo.swapPath);
            return true;
        } catch (err) {
            docinfo.hasOurSwp = false;
            console.log("Writing swp failed: " + docinfo.swapPath);
            return false;
        }
    }
    );
}

function addOpenDocuments(createSwpIfDirty = false) {
    vscode.workspace.textDocuments.forEach((openDocument) => {
        if (openDocument.uri.scheme != "file") {
            return
        }
        let docinfo = new DocumentInfo(openDocument)
        documents[docinfo.document.uri] = docinfo;
        if (createSwpIfDirty && docinfo.document.isDirty) {
            tryLockFile(docinfo);
        }

        if (!docinfo.hasOurSwp) {
            hasSwp(docinfo, () => {
                vscode.window.showWarningMessage(docinfo.basename + " is in use somewhere else (.swp file exists)");
            })
        }
    })
}

function showDialog(choice) {
    if (choice == 'Open Dialog') {
        vscode.window.showOpenDialog({});
    }
    else if (choice == 'Save As Dialog') {
        vscode.window.showSaveDialog({});
    }
}
